# Plugins: Contract & Lifecycle

> Part of the Caper core wiki. Index: [Home](Home.md)

## Purpose

A **plugin** is Caper's unit of long-lived, app-scoped capability. Everything the
framework does that is not "draw a display object" lives in a plugin: asset loading,
scene routing, input, audio, popups, i18n, timers, resize, game data. There is exactly
one plugin type — the Phase 1 fork merged the old "storage adapter" concept into this
same contract, so `@caperjs/plugin-firebase` registers through the identical pipeline
as the built-in `assets` plugin.

The plugin layer is a **seam** in two directions:

- **Down**, plugins wrap third-party libraries (Pixi `Assets`, GSAP, `@pixi/layout`,
  `stats.js`, `@pixi/devtools`) so the rest of the framework never imports them
  directly.
- **Up**, plugins publish their API through three surfaces the app can reach:
  a named accessor (`app.assets`), the core function registry (`app.func.loadAssets`),
  and the core signal registry (`app.signals.onLoadComplete`).

Catalog of the single-file built-ins: [plugins-catalog.md](plugins-catalog.md).
Directory-based subsystems (actions, audio, breakpoints, captions, focus, gesture,
input, spine): [plugins-subsystems.md](plugins-subsystems.md).

## The plugin contract

### Interface

`IPlugin<O>` is declared at `packages/core/src/plugins/Plugin.ts:53`; the concrete
base class `Plugin<O>` at `packages/core/src/plugins/Plugin.ts:116`.

| Member | Contract |
| --- | --- |
| `id: string` | Registry key. Must match the id used in `caper.config.ts` / `defaults.ts`. |
| `options: O` | Read-only getter over `protected _options`. The base class **never** populates it — each plugin merges its own defaults inside `initialize`. |
| `app` | `Application.getInstance()` (`Plugin.ts:131`). A singleton lookup, not an injected reference — safe to call from any method, including before the `app` argument arrives. |
| `initialize(options, app)` | Bootstrap hook. May be sync or async; the framework awaits it. |
| `postInitialize(app)` | Cross-plugin wiring hook, after **every** plugin finished `initialize`. |
| `destroy()` | Teardown. Base impl disconnects tracked signal connections (`Plugin.ts:135`). |
| `addSignalConnection(...c)` / `clearSignalConnections()` | Connection tracking so `destroy` can unwind (`Plugin.ts:157`). |
| `registerCoreFunctions()` / `registerCoreSignals()` | Called *by the framework* during registration; they read the protected `getCoreFunctions()` / `getCoreSignals()` name lists and copy the matching instance members into the registries (`Plugin.ts:171-199`). |

The base constructor takes the id as its only argument and calls `bindAllMethods(this)`
(`Plugin.ts:127`). That walk stops at the class carrying the
`__caper_method_binding_root` static marker (`Plugin.ts:117`, honoured at
`packages/core/src/utils/bind.ts:47`), so every prototype method from the leaf class
down to `Plugin` is `this`-bound and can be passed straight to
`signal.connect` / `addEventListener`.

### Ordering guarantees

Bootstrap runs in `Application.initialize` (`packages/core/src/core/Application.ts:686`).
Ordered phases:

1. `boot()` → `preInitialize()` (`Application.ts:927`) loads the **pre-render** plugins,
   in this fixed order: `DevToolsPlugin` (dev only), `LayoutPlugin` (if
   `config.useLayout`), `GSAPPlugin` (always), `SpinePlugin` (if `config.useSpine`).
   These run *before* the Pixi renderer exists.
2. Pixi `init()`, canvas appended to the container element.
3. `registerDefaultPlugins()` (`Application.ts:996`) walks `defaultPlugins` in array
   order, then conditionally adds `stats`, `voiceover`, `captions`.
4. `_setup()`, which registers the `Store` and the `data` plugin
   (`Application.ts:960`) when `config.useStore`.
5. `generatePluginList(config.plugins)` (`packages/core/src/core/config.ts:15`) resolves
   the app's declared plugin ids against the Vite-discovered `pluginsList`.
6. `registerPlugins()` (`Application.ts:1025`) topologically sorts that list by
   `requires` and initializes each entry whose `autoLoad !== false`.
7. `_postInitialize()` (`Application.ts:776`) iterates `_plugins` in **insertion order**
   and awaits each `postInitialize`, then wires PWA signals and the
   visibility → audio/timer bridge, then calls the user's `postInitialize()`.

Guarantees you can rely on:

- **`requires` is honoured only inside step 6.** `sortPluginsByRequires`
  (`core/config.ts:62`) is Kahn's algorithm with original-index tie-breaking, so
  independent plugins keep their `caper.config.ts` order. Default plugins are *not*
  sorted — their order is the literal array in `defaults.ts`.
- **Missing dependency = hard failure.** If `B.requires = ['A']` and `A` is not in the
  active list, bootstrap throws with every missing pair listed at once
  (`core/config.ts:77-85`). The config file stays the single source of truth; nothing
  is auto-registered.
- **Cycles = hard failure**, with the cycle path printed (`core/config.ts:124-132`).
- **`postInitialize` sees every plugin.** `app.getPlugin(id)` is safe there regardless
  of `requires`.
- **A throwing plugin does not abort bootstrap.** `registerPlugin` and
  `_postInitialize` both catch, forward to `triggerViteError` (dev overlay), and emit
  `app.onPluginError` with `{ id, phase, error }` (`Application.ts:986`, `:788`).

### Registration

Three registration paths converge on `Application.loadPlugin`
(`Application.ts:843`) → `registerPlugin` (`Application.ts:976`):

```
ImportListItem { id, module, namedExport?, options?, autoLoad? }
   → getDynamicModuleFromImportListItem()   utils/framework.ts:22
   → new Ctor(listItem.id)                  (id forced to match if the class disagrees)
   → registerPlugin(instance, options)
        ├─ warn + re-initialize if id already in _plugins   (no double-register)
        ├─ plugin.registerCoreFunctions()
        ├─ plugin.registerCoreSignals()
        ├─ _plugins.set(id, plugin)
        └─ await plugin.initialize(options, app)
```

`module` may be a class, a promise, or a `() => import(...)` thunk;
`namedExport` picks the export, otherwise `default` is used
(`utils/framework.ts:28-42`).

**Where options come from.** For default plugins `loadPlugin(item, isDefault = true)`
falls back to `this.config[plugin.id]` (`Application.ts:851`). That is why
`caper.config.ts` keys like `resizer`, `i18n`, `assets`, `input`, `focus`,
`breakpoints`, `gesture`, `actions`, `data`, `gsap` reach their plugins with no extra
wiring — the key *is* the plugin id. For app plugins the options come from the tuple
form: `plugins: ['leaderboard', ['analytics', { options: {...}, autoLoad: false }]]`
(`core/config.ts:7`, `:25-33`).

**Discovery.** The Vite plugin at `packages/core/build/plugins/lists.mjs:147` scans the
project, reads each plugin file's `definePlugin({ id, requires, active, dynamic })`
annotation (`packages/core/src/utils/define.ts:106`), and emits the virtual module
`virtual:caper-plugins`. The runtime plugin publishes it as
`globalThis.Caper.pluginsList` (`build/plugins/runtime.mjs:75`), which
`generatePluginList` reads via `Caper.get('pluginsList')`. An id in
`config.plugins` with no discovered match is skipped with a
`Logger.warn` — not an error.

### How `app.<name>` accessors appear

`_plugins` is a plain `Map<string, IPlugin>` (`Application.ts:194`). Nothing is added
to `Application` automatically. The friendly accessors are **hand-written lazy getters**
on `Application` that memoize a `getPlugin` lookup:

```ts
public get assets(): IAssetsPlugin {
  if (!this._assetManager) this._assetManager = this.getPlugin<IAssetsPlugin>('assets');
  return this._assetManager;
}
```

Current set (`Application.ts:355-615`): `i18n`, `resizer`, `breakpoints`,
`actionsPlugin`, `input`, `animation` (GSAP), `lookup`, `assets`, `scenes`,
`webEvents`, `keyboard`, `focus`, `popups`, `timers`, `audio`, `voiceover`,
`captions`, `fullScreen`, `data`. A third-party plugin gets **no** accessor —
callers use `app.getPlugin<T>('id')` (and augment `AppTypeOverrides['Plugins']` for
the id to typecheck).

The two registries are the id-free alternative. `Plugin.registerCoreFunctions`
copies each named method onto `coreFunctionRegistry` and
`registerCoreSignals` each named signal onto `coreSignalRegistry`
(`packages/core/src/core/registries.ts`). They surface as `app.func` / `app.exec`
and `app.signal` / `app.signals` (`Application.ts:625-639`), typed by
`ICoreFunctions` (`core/interfaces/ICoreFunctions.ts`) and `ICoreSignals`.
Registration happens **before** `initialize`, so registry entries exist even if a
plugin's `initialize` throws.

### DataAdapter's role

`DataAdapter` (`packages/core/src/plugins/DataAdapter.ts:86`) is the one plugin that is
also a *storage-ish* adapter, and it is documented here because it explains the merged
contract. It is a regular `Plugin` registered under id `data`, loaded by `_setup()`
only when `config.useStore` is true, and reached via `app.data`
(`Application.ts:920`). Its API (`get`/`set`/`increment`/`concat`/`append`/`snapshot`/
`clear` + `onDataChange`) is deliberately richer than a generic save/load capability,
which is the stated reason it is *not* modelled as `IStorageCapability`
(`DataAdapter.ts:80-85`). Persistence is opt-in per key
(`backupKeys`) or blanket (`backupAll`), written to `localStorage` under
`` `${namespace}-${key}` `` where `namespace` defaults to `app.appName`.

## Default plugins

`packages/core/src/plugins/defaults.ts:20` is an ordered `ImportList`. Registration is
sequential and awaited, so this array **is** the initialization order:

| # | id | Class | Note |
| --- | --- | --- | --- |
| 1 | `lookup` | `LookupPlugin` | Must be first — it subscribes to global container add/remove before anything builds a display tree. |
| 2 | `webEvents` | `WebEventsPlugin` | DOM event source for resize / visibility / orientation. |
| 3 | `fullscreen` | `FullScreenPlugin` | |
| 4 | `resizer` | `ResizerPlugin` | Consumes `webEvents.onResize` (wired in `Application._setup`, `Application.ts:1118`). |
| 5 | `breakpoints` | `BreakpointPlugin` | Needs `resizer` size. |
| 6 | `assets` | `AssetsPlugin` | |
| 7 | `scenes` | `SceneManagerPlugin` | Needs `assets`. |
| 8 | `actions` | `ActionsPlugin` | |
| 9 | `input` | `InputPlugin` | |
| 10 | `gesture` | `GesturePlugin` | |
| 11 | `keyboard` | `KeyboardPlugin` | |
| 12 | `focus` | `FocusManagerPlugin` | |
| 13 | `popups` | `PopupManagerPlugin` | `initialize` reaches into `app.scenes` and `app.keyboard` — both already live. |
| 14 | `audio` | `AudioManagerPlugin` | |
| 15 | `i18n` | `i18nPlugin` | |
| 16 | `timers` | `TimerPlugin` | |

Registered outside that array:

- `DevToolsPlugin` — `preInitialize`, dev builds only (`Application.ts:931`).
- `LayoutPlugin` — `preInitialize`, when `config.useLayout` (`Application.ts:941`).
- `GSAPPlugin` — `preInitialize`, unconditional (`Application.ts:948`).
- `SpinePlugin` — `preInitialize`, when `config.useSpine`.
- `data` — `_setup`, when `config.useStore` (`Application.ts:964`).
- `stats` — after defaults, when `config.showStats === true` or dev and not explicitly
  `false` (`Application.ts:1000`).
- `voiceover` + `captions` — after defaults, when `config.useVoiceover`.

Note the id-casing split: default plugins use lowercase ids (`assets`, `scenes`), the
`preInitialize` trio use class-name ids (`DevToolsPlugin`, `LayoutPlugin`,
`GSAPPlugin`, `SpinePlugin`), and `stats` is registered under `stats` even though the
class hardcodes `id = 'StatsPlugin'` (the framework overwrites it —
`Application.ts:849`).

## Seams & extension points

**A local project plugin** (`src/plugins/MyPlugin.ts`):

1. Default-export a class extending `Plugin`.
2. Export `definePlugin({ id, requires?, active?, dynamic? })` so discovery records the
   canonical id and dependency edges.
3. Add the id to `plugins: []` in `caper.config.ts`.

**An external package** (`@caperjs/plugin-*`) is the same contract, plus:
`pixi.js` / `gsap` / `@pixi/sound` stay **peer** dependencies, and npm packages are
always dynamically imported (static import is local-only —
`build/plugins/lists.mjs:156`).

**The four hook points a plugin can use:**

| Seam | Use it for |
| --- | --- |
| `initialize(options, app)` | Own state, option merge, DOM listeners, third-party `registerPlugin` calls. Only touch plugins listed in `requires`. |
| `postInitialize(app)` | Cross-plugin wiring, ticker subscriptions, anything needing the renderer. |
| `getCoreFunctions()` / `getCoreSignals()` | Publish to `app.func` / `app.signals`. Names must also be declared in `ICoreFunctions` / `ICoreSignals` to typecheck. |
| `requires` | Force ordering relative to other *config-declared* plugins. |

**Scene-scoped plugins.** A scene's `defineScene({ plugins: ['physics'] })` entry makes
`SceneManagerPlugin.loadScene` load that plugin on demand before the scene mounts
(`SceneManagerPlugin.ts:246-253`). Pair it with `[id, { autoLoad: false }]` in
`caper.config.ts` to keep it out of bootstrap.

## Invariants & gotchas

- **`options` is not populated for you.** `Plugin` never assigns `_options`. A plugin
  that forgets `this._options = { ...defaults, ...options }` in `initialize` reads
  `undefined`. Compare `ResizerPlugin.ts:78` (correct) with plugins that ignore the
  argument entirely.
- **Overriding `destroy()` without `super.destroy()` leaks every tracked signal
  connection.** Several built-ins do exactly this; see the catalog. `SceneManagerPlugin`
  overrides it to a no-op (`SceneManagerPlugin.ts:142`).
- **`getCoreFunctions` is a protected *method*, not a getter.** Spelling it
  `get coreFunctions()` silently registers nothing —
  `LookupPlugin.ts:100` has this bug, which is why `app.func.getChildAtPath` is
  undefined while `app.lookup.getChildAtPath` works.
- **Registry entries are last-writer-wins and global.** Two plugins exporting the same
  core-function name silently overwrite each other; the registries are module-level
  singletons (`core/registries.ts`), so two `Application`s in one page share them.
- **Config key collisions.** Default-plugin options are `config[id]`. `config.scenes`
  is the *scene import list*, and it is handed to `SceneManagerPlugin.initialize` as
  its options object. That plugin ignores the argument and reads `app.config` directly,
  so it works — but any new plugin whose id collides with a non-option config key will
  get garbage.
- **`app` is a singleton lookup, not an injection.** `Plugin.app` calls
  `Application.getInstance()`, which warns and returns `undefined` before an app
  exists. Never touch `this.app` from a constructor.
- **Unit-testing a plugin requires stubbing two modules.** Importing any plugin pulls
  `../core` → `Application` → the Pixi display graph. Every test in this folder starts
  with `vi.mock('../core', ...)` and `vi.mock('../core/Application', ...)` — see
  `packages/core/src/plugins/Plugin.test.ts:4-10`.
- **`index.ts` is not the full export surface.** `packages/core/src/plugins/index.ts`
  omits `DevToolsPlugin`, `LayoutPlugin`, `StatsPlugin`, `GSAPPlugin`, `captions/`
  and `spine/`; those are imported by concrete path where needed (deliberate — the
  barrel-cycle defusal from commit `580fc08`).
- **Re-registering an existing id does not replace the instance.** `registerPlugin`
  warns and re-runs `initialize` on the *existing* plugin (`Application.ts:977-980`).

## Recipes

### Write a new plugin

```ts
// src/plugins/LeaderboardPlugin.ts
import { definePlugin, IApplication, Plugin, Signal } from '@caperjs/core';

export const plugin = definePlugin({ id: 'leaderboard', requires: ['firebase'] });

export interface LeaderboardOptions { endpoint: string; pageSize: number }
const defaults: LeaderboardOptions = { endpoint: '/scores', pageSize: 10 };

export default class LeaderboardPlugin extends Plugin<LeaderboardOptions> {
  public readonly id = 'leaderboard';
  public onScoresLoaded = new Signal<(scores: number[]) => void>();

  async initialize(options: Partial<LeaderboardOptions>, _app: IApplication) {
    this._options = { ...defaults, ...options };     // required — base class won't
  }

  async postInitialize(app: IApplication) {
    this.addSignalConnection(                        // tracked → auto-disconnected
      app.scenes.onSceneChangeComplete.connect(this.refresh),
    );
  }

  destroy() { super.destroy(); }                     // always call super

  protected getCoreSignals(): string[] { return ['onScoresLoaded']; }
}
```

Then in `caper.config.ts`:

```ts
plugins: ['firebase', ['leaderboard', { options: { pageSize: 25 } }]],
```

Checklist: default-export the class · `id` matches `definePlugin` · merge options
yourself · call `super.destroy()` · declare any published core function/signal name in
`ICoreFunctions` / `ICoreSignals` · augment `AppTypeOverrides['Plugins']` so
`app.getPlugin('leaderboard')` typechecks.

### Override or disable a default plugin

There is no "unregister" API. The available levers, weakest to strongest:

- **Configure it.** Pass options under the plugin's id in `caper.config.ts`
  (`resizer: { letterbox: true }`).
- **Feature-flag it off.** Only some are flagged: `useLayout`, `useSpine`,
  `useVoiceover`, `useStore`, `showStats`, `showSceneDebugMenu`. The 16 entries in
  `defaults.ts` have no off switch.
- **Replace the instance.** Register your own class under the *same id* before the
  default would load. In practice that means overriding
  `Application.registerDefaultPlugins()` in your app subclass and calling
  `loadPlugin({ id: 'popups', module: MyPopupManager, namedExport: '...' })` first —
  `registerPlugin` then warns and skips the built-in when it reaches the same id.
- **Subclass it.** Extend the built-in class, keep the id, and register the subclass
  via the same override. Cleanest option when you only want to change one method.
- **Defer an app plugin.** `['heavy', { autoLoad: false }]` keeps it out of bootstrap;
  load it later with `app.loadPlugin(app.getUnloadedPlugin('heavy')!)` or by listing it
  in a scene's `plugins` array.
