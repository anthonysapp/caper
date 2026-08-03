# Core: Application & Bootstrap

> Part of the Caper core wiki. Index: [Home](Home.md)

## Purpose

`packages/core/src/core/` is the module that turns a plain `caper.config.ts` object into a running PixiJS app. It owns the `Application` class (a subclass of Pixi's `Application` that adds a plugin registry, signal/function registries, pause semantics, and typed accessors for every built-in plugin), the `create()` entry point that the Vite runtime calls, the config resolver and plugin topological sort, and the `window.Caper` discovery/automation surface. Everything else in the framework — scenes, display, UI, plugins — reaches the app through this module's interface, so its ordering guarantees are the framework's ordering guarantees.

## Interface (what callers must know)

### Key exports

| Export | From | Notes |
| --- | --- | --- |
| `create(config, domElement?, speak?)` | `core/create.ts:145` | The only sanctioned boot path. Returns the app instance. |
| `Application` | `core/Application.ts:141` | Re-exported from `src/index.ts:7` (**not** from `core/index.ts` — see gotchas). |
| `IApplication`, `IApplicationOptions` | `core/interfaces/` | The caller-facing contract; `Application` is one implementation. |
| `AppConfig`, `PauseConfig` | `core/types.ts` | `AppConfig = WithRequiredProps<IApplicationOptions, 'id'>` — `id` is the only required field. |
| `defineConfig(config)` | `core/config.ts:38` | Identity function; exists purely for editor typing of `caper.config.ts`. |
| `generatePluginList`, `sortPluginsByRequires`, `PluginConfig` | `core/config.ts` | Config-list → import-list adapter, plus the dependency sort. |
| `coreSignalRegistry`, `coreFunctionRegistry` | `core/registries.ts` | Flat mutable objects plugins write into; surfaced as `app.signal` / `app.func`. |
| `installCaperGlobal`, `registerCaperApp`, `signalCaperReady`, `ICaperAutomation` | `core/globals.ts` | The automation/discovery seam consumed by `build/plugins/runtime.mjs`. |
| `isStorageCapable`, `IStorageCapability` | `core/interfaces/IStorageCapability.ts` | Duck-typed marker used by `store/Store.ts`. |
| `CaperPWA` | `core/create.ts:28` | Shape of the `Caper.pwa` facade injected by the Vite PWA snippet. |

### Config shape

`IApplicationOptions` (`core/interfaces/IApplicationOptions.ts:29`) extends Pixi's `ApplicationOptions` and adds framework fields: `id`, `application` (constructor override), `container`, `resizeToContainer`, `plugins`, `scenes` / `defaultScene` / `sceneTransition` / `defaultSceneLoadMethod`, `assets`, `actions`, `input`, `focus`, `splash`, `i18n`, `resizer`, `breakpoints`, `captions`, `data`, `gsap`, and feature switches `useStore` / `useSpine` / `useLayout` / `useVoiceover` / `useHash` / `useWasm` / `showStats` / `showSceneDebugMenu` / `automation`.

Defaults live in one place: `defaultApplicationOptions` at `core/Application.ts:80`. User config is folded in with `deepMerge(defaults, config)` at `core/Application.ts:693`.

Two config fields are **build-time only** and never reach the running app: `useWasm` (AST-parsed out of `caper.config.ts` by the Vite preset) and, in practice, anything the preset reads before `virtual:caper-config` is evaluated.

### Invariants and ordering constraints

- **Single instance.** `Application.initialize` throws `Application is already initialized` if `Application.instance` is set (`core/Application.ts:688`). `Application.instance` and `Application.containerElement` are static.
- **`create()` before anything.** Plugins resolve the app via `Application.getInstance()` (`plugins/Plugin.ts`), so no plugin may be constructed before `initialize()` assigns the singleton.
- **`initialize()` then `_postInitialize()`.** `create()` calls both. `initialize()` ends with the default scene loading; `_postInitialize()` runs each plugin's `postInitialize` and the cross-plugin wiring. Apps override `postInitialize()` (no `super` call needed); the framework half lives in `_postInitialize()` (`core/Application.ts:776`).
- **Plugin phase split.** During `initialize(options, app)` only plugins named in your `requires` are guaranteed live. During `postInitialize(app)` every plugin is live.
- **Resolution must be 1 or 2.** Anything else is coerced with a warning (`core/Application.ts:703`).
- **A DOM element is mandatory.** `initialize()` throws `No element found to append the view to.` when `el` is falsy (`core/Application.ts:729`).

### Error modes

| Condition | Behaviour | Site |
| --- | --- | --- |
| Second `initialize()` | throws | `core/Application.ts:688` |
| No container element | throws | `core/Application.ts:729` |
| DOM element string not found | container div is created for you | `core/create.ts:157` |
| `requires` names a plugin absent from `plugins[]` | throws, listing **all** missing deps + fix hint | `core/config.ts:77` |
| Plugin dependency cycle | throws with the cycle path | `core/config.ts:128` |
| Plugin throws in `initialize` | caught → `triggerViteError` overlay + `onPluginError` signal; boot continues | `core/Application.ts:986` |
| Plugin throws in `postInitialize` | same | `core/Application.ts:783` |
| Config lists an unknown plugin id | `Logger.warn`, entry dropped | `core/config.ts:22` |
| `getPlugin(id)` misses | returns `undefined`; warns only when `debug` is true | `core/Application.ts:762` |
| Uncaught error / rejection in dev | routed to the Vite error overlay | `core/create.ts:99` |

## Module map

| File | Responsibility | Key exports |
| --- | --- | --- |
| `core/Application.ts` (1155 lines) | The implementation: Pixi subclass, plugin registry (`_plugins` Map), boot sequence, lazy plugin accessors, pause/resume, stage assembly, resize fan-out. | `Application` |
| `core/create.ts` | Entry point + environment prep: document-ready, WebGL check, dev error handlers, container resolution, `Caper.pwa` typing, global `Caper` type declaration. | `create`, `createContainer`, `documentReady`, `CaperPWA`, `DEFAULT_GAME_CONTAINER_ID` |
| `core/config.ts` | Adapter from config plugin ids/tuples to a loadable import list, plus Kahn-sort by `requires`. | `defineConfig`, `generatePluginList`, `sortPluginsByRequires`, `PluginConfig` |
| `core/globals.ts` | `window.Caper` discovery (`apps`, `app`, `ready()`) and the automation facade (log ring buffer, `waitFor`, state getters). SSR-safe by construction. | `installCaperGlobal`, `registerCaperApp`, `signalCaperReady`, `ICaperAutomation`, `AutomationLogEntry` |
| `core/registries.ts` (7 lines) | Two empty objects that plugins populate — the indirection that lets `app.signal.onX` / `app.func.doX` exist without the app importing every plugin. | `coreSignalRegistry`, `coreFunctionRegistry` |
| `core/types.ts` | `AppConfig` (id-required options) and `PauseConfig`. | `AppConfig`, `PauseConfig` |
| `core/index.ts` | Barrel. Deliberately does **not** re-export `Application` (cycle avoidance). | — |
| `core/interfaces/IApplication.ts` | The caller-facing app contract, heavily doc-commented. | `IApplication` |
| `core/interfaces/IApplicationOptions.ts` | The config contract. | `IApplicationOptions` |
| `core/interfaces/ICoreSignals.ts` | Names + payload types of every signal a plugin may publish into the signal registry. | `ICoreSignals` |
| `core/interfaces/ICoreFunctions.ts` | Names + signatures of every function a plugin may publish into the function registry. | `ICoreFunctions` |
| `core/interfaces/IStorageCapability.ts` | Duck-typed `save`/`load` marker; the seam that replaced the old "storage adapter" type. | `IStorageCapability`, `isStorageCapable` |

## Bootstrap lifecycle

From `import("caper-runtime")` (injected into `index.html` by `build/plugins/runtime.mjs:25`) to the first rendered scene:

1. **Runtime module evaluates.** It installs `globalThis.Caper`, calls `installCaperGlobal()` (`build/plugins/runtime.mjs:65`) so drivers can `await Caper.ready()` before boot, then stamps `sceneList` / `pluginsList` / `popupList` / `entityList` / `uiList`, `APP_NAME`, `APP_VERSION`, `Caper.get()`, `Caper.__dev`, and `Caper.__runtimeManaged = true`.
2. **`bootstrap()` imports `virtual:caper-config`** and calls `create(config)` (`build/plugins/runtime.mjs:95`).
3. **`create()` prepares the environment** (`core/create.ts:150`): `documentReady()` → `checkWebGL()` → `sayHello()` → dev error handlers → resolve/creating the container element → `config.resizeTo = el` when `resizeToContainer` → layout defaults when `useLayout` → `config.container = el`.
4. **Instantiate.** `new (config.application || Application)()`; the constructor calls `bindAllMethods(this)` so every method is safe to pass as a callback.
5. **`initialize(config, el)`** (`core/Application.ts:687`): claim the singleton, `deepMerge` defaults, publish `onResize` into the signal registry, init `Logger`, clamp `resolution`.
6. **`boot()` → `preInitialize()`** (`core/Application.ts:929`): loads the always-early plugins in fixed order — `DevToolsPlugin` (dev only), `LayoutPlugin` (if `useLayout`), `GSAPPlugin`, `SpinePlugin` (if `useSpine`) — then, if `useStore`, constructs the `Store` and loads the built-in `data` (`DataAdapter`) plugin.
7. **`initAssets()`** (`core/Application.ts:1067`): awaits the manifest if it is a promise, defaults `basePath` to `./assets`, `Assets.init(opts)`, caches the resolved manifest.
8. **`super.init(config)`** — the real Pixi renderer/canvas creation. Stage is labelled `Stage`; `TextStyle.defaultTextStyle` / `defaultDropShadow` are applied; the canvas is appended to `el`.
9. **`registerDefaultPlugins()`** (`core/Application.ts:996`): iterates `plugins/defaults.ts` **in array order** — `lookup, webEvents, fullscreen, resizer, breakpoints, assets, scenes, actions, input, gesture, keyboard, focus, popups, audio, i18n, timers` — then optionally `stats`, and `voiceover` + `captions` when `useVoiceover`. Each gets `options = config[pluginId]` automatically.
10. **Dev tools attach** (`initializeDevTools`), and `onLoadRequiredComplete` is wired once to the overridable `requiredAssetsLoaded()` hook.
11. **`_setup()`** (`core/Application.ts:1116`): connects `webEvents.onResize` → `_resize` at priority `-1`, performs a first `_resize()`, then assembles the stage in z-order: splash (if `zOrder: 'bottom'`) → `SceneManager` view → splash (if `'top'`) → transition → popups view → focus view.
12. **App plugins resolve.** `generatePluginList(config.plugins)` (`core/config.ts:15`) looks each configured id up in `Caper.get('pluginsList')` and carries `requires`, `options`, `autoLoad` forward.
13. **`registerPlugins()`** (`core/Application.ts:1025`): `sortPluginsByRequires` topologically orders them (stable by config order for independent plugins), then loads each `autoLoad !== false` entry sequentially. `registerPlugin` calls `registerCoreFunctions()` + `registerCoreSignals()` **before** `initialize()`, so the registries are populated even if init later throws.
14. **`setup()`** — the overridable app hook (plugins registered, store live).
15. **`loadDefaultScene()`** → `scenes.loadDefaultScene()`. Canvas is focused; the container gets the `loaded` CSS class; `_isBooting = false`; `initialize()` resolves.
16. **`_postInitialize()`** (`core/Application.ts:776`): every plugin's `postInitialize` in registry insertion order (errors are caught and surfaced), then `_connectPwaSignals()`, then visibility wiring (`audio.suspend/restore`, `timers.pause/resumeAllTimers`), then the user's `postInitialize()`.
17. **Registration & readiness.** `create()` calls `registerCaperApp(instance)` (`core/create.ts:205`) and — only when `Caper.__runtimeManaged` is falsy — `signalCaperReady`. Under the Vite runtime, readiness is signalled instead *after* `src/main.ts`'s default export has run (`build/plugins/runtime.mjs:106`).

## Seams & extension points

- **Application subclass.** `config.application` (`IApplicationOptions:31`) swaps the concrete class without touching `create()`. Kitchen-sink's `KitchenSinkApplication` uses this. Override `setup()`, `postInitialize()`, `requiredAssetsLoaded()` — never `_postInitialize()`.
- **Plugin registry.** `plugins[]` in `caper.config.ts` (ids or `[id, { autoLoad, options }]` tuples). Discovery is done by the Vite plugin, which writes `Caper.pluginsList`; the app only resolves ids against it. This is the primary seam for third-party behaviour.
- **`requires` ordering.** `definePlugin({ id, requires })` feeds `sortPluginsByRequires`, so a plugin can declare "initialize after X" without the config author caring about array order.
- **Core registries.** A plugin's `getCoreSignals()` / `getCoreFunctions()` publish its members into `coreSignalRegistry` / `coreFunctionRegistry`, which become `app.signal.*` and `app.func.*`. Adding a name means adding it to `ICoreSignals` / `ICoreFunctions` — those interfaces are the registry's type surface.
- **Storage adapters.** Any plugin with `save`/`load` is storage-capable (`isStorageCapable`); `store/Store.ts:78` finds it via `getAdapter(id)`. No base class, no separate registration pipeline.
- **Automation facade.** `ICaperAutomation` is the driver-facing seam: `action`, `getContext`, `getState`, `registerStateGetter`, `notifyStateChanged`, `waitFor`, plus a 200-entry log fed by `onActionDispatched` / `onActionContextChanged` (`core/globals.ts:242`).
- **PWA facade.** `app.pwa` reads `globalThis.Caper.pwa` (`core/Application.ts:236`); `_connectPwaSignals()` *wraps* rather than replaces existing callbacks so the preset's default update banner survives.
- **Lazy factory slot.** `get make()` (`core/Application.ts:217`) resolves the factory table through `getDefaultFactoryMethods()` at first use, so `Application` never imports the whole `ui`/`display` graph. Do not convert this to a static import — it re-creates the barrel cycle fixed in commit 580fc080.

## Invariants & gotchas

- **SSR constraint on `globals.ts`.** Nothing in this file touches a browser global at module load; `isDevEnv()`, `automationEnvFlag()`, and `ensureCaperGlobal()` all defer their reads into function bodies, and every `import.meta.env` access is wrapped in `try/catch` (`core/globals.ts:63`, `:74`). This exists because `validateCaperConfig` in `build/plugins/caperConfig.mjs` `ssrLoadModule`s an app's config in plain Node. Keep new code in this file inside functions.
- **`Caper.__dev`, not `import.meta.env.DEV`.** Inside the *pre-built* lib, `import.meta.env` has already been compiled away, so dev-ness is passed in from the consumer app's Vite context (`build/plugins/runtime.mjs:113`). The direct `import.meta` read is only a fallback for source-linked consumers.
- **Automation gating.** The facade is built only when `isDevEnv() || config.automation === true || VITE_CAPER_AUTOMATION === 'true'` (`core/globals.ts:271`). In a production build with none of those, `app.automation` and `Caper.automation[id]` are `undefined` — feature-detect, never assume.
- **`Caper.ready()` resolves on *boot completion*, not registration.** `registerCaperApp` runs inside `create()`; `signalCaperReady` runs after `src/main.ts`. Only ids in `__readyApps` resolve immediately (`core/globals.ts:113`). `ready()` never rejects and has no timeout — a wrong id hangs.
- **`Application` is not exported from `core/index.ts`.** It comes from `src/index.ts:7` via `./core/Application` directly. Importing it through the `core` barrel will fail; this is deliberate cycle management.
- **`requires` can name a built-in plugin.** `sortPluginsByRequires` takes the set of already-registered ids (the default plugins) as a second argument, so `requires: ['audio']` is satisfied without `audio` needing to appear in `plugins[]` — only unregistered ids need to be config-listed.
- **`app.pause()` with no argument pauses everything.** `pause(config?)` merges your partial `PauseConfig` onto `defaultPauseConfig` (audio/animations/ticker/timers all `true`) when called bare, or onto an all-`false` base when you pass a config — so `app.pause({ pauseAudio: true })` pauses *only* audio. `onPause` / `onResume` are typed `Signal<(config: PauseConfig) => void>` and receive the merged config.
- **`views` is recomputed on every access**, not cached — the splash, transition, and captions views are created lazily, so a fresh read at each resize picks up anything built after the first `_resize()`.
- **`isActionActive(action)` delegates to live input state** (`this.input.isActionActive(action)`), so it reflects keys/buttons currently held, not just declared actions.
- **Multi-app is half-supported.** `Caper.apps` is a Map keyed by `config.id`, but `Application.instance`/`containerElement` are static and `initialize()` throws on a second app. Treat one page = one app.
- **Plugin failures do not abort boot.** They surface as a Vite overlay plus `onPluginError`. A silently degraded app in production is possible — connect `onPluginError` if that matters.
- **Config objects are mutated.** `create()` writes `resizeTo`, `layout`, and `container` onto the object you pass in.

## Recipes

### Add a new config option

1. Add the field to `IApplicationOptions` (`core/interfaces/IApplicationOptions.ts:29`) with a doc comment saying whether it is runtime or build-time only.
2. If it needs a default, add it to `defaultApplicationOptions` (`core/Application.ts:80`) — `deepMerge` handles nested objects.
3. Consume it. If the option configures a plugin, name the field exactly the plugin's id: `registerDefaultPlugins` → `loadPlugin(item, true)` passes `config[pluginId]` as that plugin's options automatically (`core/Application.ts:854`).
4. If it is a boot-shape switch (like `useSpine`), branch in `preInitialize()` and load the plugin dynamically there.
5. If the Vite preset must see it before the app runs, also teach `build/plugins/caperConfig.mjs` about it — runtime code cannot influence build config.

### Register a plugin

1. Create the class extending `Plugin` with a stable `id`, and annotate with `definePlugin({ id, requires })`; default-export the class so Vite discovery picks it up.
2. Add the id to `plugins[]` in the app's `caper.config.ts` — or `[id, { options, autoLoad: false }]` to pass options / defer loading.
3. Put option parsing and self-contained setup in `initialize`; put anything that reads another plugin in `postInitialize` (or list that plugin in `requires`).
4. To expose members app-wide, return their names from `getCoreSignals()` / `getCoreFunctions()` and declare them in `ICoreSignals` / `ICoreFunctions`.
5. Access it as `app.getPlugin<MyPlugin>('my-id')`. For a first-party plugin, add a lazy getter on `Application` following the `get audio()` pattern (`core/Application.ts:556`).

### Make a plugin storage-capable

1. Implement `save(key, data, ...rest)` and `load(key, ...rest)` on the plugin class — no base class or interface implementation is required, the guard is duck-typed (`core/interfaces/IStorageCapability.ts:20`).
2. Reach it via `app.store.getAdapter('my-id')`, or `app.store.save('my-id', key, data)`.

### Drive the app from a test / automation script

1. Ensure automation is on: dev server, `automation: true` in config, or `VITE_CAPER_AUTOMATION=true`.
2. From the driver: `const app = await Caper.ready()` (or `Caper.ready('my-app-id')`).
3. Use `Caper.automation[id]` — `action(name, data)`, `getContext()`, `waitFor(predicate, { timeoutMs })`, and the `log` ring buffer.
4. For game-specific state, call `registerStateGetter(fn)` from app code once, then `notifyStateChanged(state)` on each meaningful change so `waitFor` predicates re-run.

### Swap the Application class

1. Subclass `Application`, override `setup()` / `postInitialize()` / `requiredAssetsLoaded()`.
2. Set `application: MyApplication` in `caper.config.ts`; `create()` instantiates it instead (`core/create.ts:188`).
3. Do not call `super.postInitialize()` — framework wiring lives in `_postInitialize()` and always runs.
