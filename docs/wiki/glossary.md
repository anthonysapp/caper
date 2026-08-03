# Glossary

> Part of the Caper core wiki. Index: [Home](Home.md)

The ubiquitous language of `packages/core`. Grouped by area; use these terms exactly in code, docs, and discussion.

## Application & bootstrap

| Term | Meaning |
|---|---|
| **Core registry** | Two flat module-level maps (`coreSignalRegistry`, `coreFunctionRegistry`) plugins publish into; surfaced as `app.signal` and `app.func`/`app.exec`. |
| **Default plugin** | One of the 16 built-ins wired by `plugins/defaults.ts`, loaded in fixed array order, invisible to `requires`. |
| **`requires`** | A plugin's declared init-order dependencies; topologically sorts *config-declared* plugins only. |
| **ImportListItem** | `{ id, module, namedExport?, options?, autoLoad?, requires? }` — the loadable descriptor form of a plugin/scene entry; `module` may be a class, promise, or import thunk. |
| **Storage-capable** | Any plugin duck-typed with `save`/`load`; replaces the old separate "storage adapter" type. |
| **Automation facade** | `ICaperAutomation` at `Caper.automation[id]` (`action`/`getState`/`waitFor`/log); gated on dev env, `config.automation`, or `VITE_CAPER_AUTOMATION`. |
| **Runtime-managed** | `Caper.__runtimeManaged`: tells `create()` the Vite runtime module will signal readiness after `main.ts` runs. |

## Plugins

| Term | Meaning |
|---|---|
| **Plugin** | App-scoped capability object extending `Plugin<Options>`, keyed by `id`, with `initialize` → `postInitialize` → `destroy` lifecycle. |
| **`definePlugin`** | Build-time marker carrying `id`/`requires`/`active`/`dynamic` into discovery. |
| **Action** | A named command (`'jump'`, `'pause'`) dispatched via `app.action(id, data)` and consumed by signal listeners. |
| **Action context** | The single current string on ActionsPlugin (`'default'`, `'menu'`, …) gating which actions may dispatch. |
| **Action detail** | The `{ id, context, data }` payload emitted on the per-action signal and `onActionDispatched`. |
| **Control scheme** | Config map from physical inputs (keys, buttons, joystick directions) to action ids, per `down`/`up`/`joystick`. |
| **Controller** | The input device currently in use: `keyboard \| gamepad \| mouse \| touch`. |
| **Channel (audio)** | A named audio group (`music`, `sfx`, `voiceover`) owning its own volume/mute and instance buckets. |
| **Effective volume** | `instance × channel × master × muteFactor` — the one number written to a media instance. |
| **Tier / ladder (breakpoints)** | An ordered min-width breakpoint (`mobile: 0`) and the validated, sorted set of them. |
| **Mode (breakpoints)** | A named boolean condition evaluated against the breakpoint context; shares one namespace with tiers and axes. |
| **Frame (gesture)** | A `{ centerX, centerY, spread }` snapshot of tracked pointers; gestures are frame-to-frame deltas. |
| **Focus layer** | An ordered ring of focusables; only one layer is current at a time. |
| **Animation context (GSAP plugin)** | A plain `Set` of tweens/timelines grouped under a string key — *not* a `gsap.Context`. |

## Display & mixins

| Term | Meaning |
|---|---|
| **Container** | Caper's deep display base: Pixi `Container` + factory/animated/signals mixins + lifecycle (`added`/`removed`/`resize`/`update`) wiring. |
| **Scene** | Per-screen unit whose lifecycle (`initialize`/`enter`/`start`/`exit`/`onPause`/`onResume`) is driven by SceneManagerPlugin, not Pixi events. |
| **Entity** | Convention base for factory-discovered game objects; adds typed prop storage over `Container`. |
| **ContainerConfig** | `{ autoResize, autoUpdate, priority }`, passed once at construction to opt into resize/ticker wiring. |
| **SceneTransition** | Overlay class driven by SceneManagerPlugin around scene swaps. |
| **Camera** | World-space scroll/zoom controller; must be `update()`d manually per frame. |
| **animationContext (display)** | String tag scoping GSAP animations so they can be killed together on destroy. |
| **Mixin** | A function `(Base) => class extends Base { … }` adding one behavior to any base. |
| **Factory mixin** | `Factory()`: gives a class the `this.add`/`this.make` method tables. |
| **add vs make** | `add` constructs *and parents* a child; `make` constructs only. |
| **Factory method table** | `defaultFactoryMethods` in `mixins/factory/const.ts` — one entry per constructible type. |
| **FactorySchema** | A `{ build, applies, exclude }` spec that `buildFactoryMethod` turns into a full factory method. |
| **Registration slot** | `mixins/factory/defaults.ts`: a zero-import module decoupling table creation from consumption (the cycle defuser). |
| **Concrete import** | Importing a mixin's own file directly instead of the `mixins` barrel — mandatory inside display/ui/factory code. |
| **Entry-order guard test** | An `importOrder.*.test.ts` that pins which module is imported first, to catch cycle regressions. |

## UI

| Term | Meaning |
|---|---|
| **UICanvasEdge** | One of nine named screen regions (`'top left'` … `'center'`) a child docks to. |
| **addElement / removeElement** | The only sanctioned way to parent/unparent a direct `UICanvas` child (joins the flex flow). |
| **bindElement / unbindElement** | Attaches a free-floating element that tracks an anchor's laid-out box every frame. |
| **computedLayout** | The Yoga-computed `{ left, top, width, height }` written onto `node.layout` after each pass. |
| **autoLayoutChildren** | Auto-marks child text nodes `isLeaf` so Yoga can measure intrinsic size. |
| **focusOverlay (Input)** | A zoomed clone of the input rendered on `app.stage` while focused (mobile/touch). |

## Signals & store

| Term | Meaning |
|---|---|
| **Signal** | Typed pub/sub primitive wrapping `typed-signals`, with named priority ordering and once/N-times helpers. |
| **SignalConnection(s)** | A live subscription handle, and a bag of them for bulk disconnect. |
| **WithSignals mixin** | Gives a class a connection bag auto-`disconnectAll()`ed on `destroy()`; `Plugin` implements the same contract separately. |
| **Fan-out save** | `store.save('*', key, data)` — saves to every currently storage-capable plugin. |
| **AppTypeOverrides** | Empty interface re-declared per app (via generated `caper-app.d.ts`) yielding literal-typed scene/plugin/action ids. |

## Build & CLI

| Term | Meaning |
|---|---|
| **Preset** | `caper(options)` — the sixteen-plugin array an app spreads into Vite `plugins:`. |
| **Discovery** | The build-time AST scan finding `define*` markers by convention under `src/`. |
| **`define*` marker** | `defineScene`/`defineEntity`/`definePopup`/`defineUI`/`definePlugin` — typed identity functions with zero runtime cost that discovery keys on. |
| **Descriptor** | A discovery record `{ id, name, active, importPath, module }` for one scene/plugin/popup/entity/UI. |
| **List plugin** | A Vite plugin emitting one `virtual:caper-*` module from descriptors. |
| **Dynamic sentinel** | A descriptor `module` whose `toString()` renders `() => import('…')`; marks lazy-loaded entries. |
| **SSR stub** | The temporary, non-clobbering `document`/`window` shim installed around `ssrLoadModule` of `caper.config.ts`. |
| **Gap-filling** | `fillMissing`: the preset contributes only Vite config keys the project left unset. |
| **Prune** | Deleting fallback png twins from a prod `dist` and rewriting `assets.json` to match. |
| **AssetPack folder tags** | `{m}`/`{tps}`/`{fix}`/`{wf}` directory suffixes driving the asset pipeline. |
| **Template dialect** | The placeholder token set a scaffolder substitutes (`__APPLICATION_NAME__`/`~NAME~` for apps vs `~pluginName~` for plugins — two unrelated schemes). |
| **Peer surface** | The `peerDependencies` a consumer's lockfile must satisfy (pixi.js, @pixi/sound, gsap, vite, workbox-window). |

## Utils

| Term | Meaning |
|---|---|
| **`bindAllMethods` / `__caper_method_binding_root`** | Auto-binds instance methods; the static marker stops the prototype walk before foreign bases (e.g. Pixi classes). |
| **CaperEvent** | Enum of `CustomEvent` names dispatched during asset loading, consumed outside the app (loading screens, automation). |
