# Signals, Store & Shared Types
> Part of the Caper core wiki. Index: [Home](Home.md)

## Purpose

Three small, low-level modules that everything else in `packages/core` depends on:

- **`src/signals/`** — Caper's event primitive. A thin wrapper around the `typed-signals`
  npm package (`Signal`, `SignalConnections`, `SignalConnection`, collectors) plus
  ordering and one-shot/n-shot connection helpers.
- **`src/store/`** — a façade (`Store`) that turns any plugin implementing
  `save`/`load` into a named "storage adapter" reachable off `app.store`.
- **`src/types/`** — ambient `.d.ts` modules: the app-augmentation seam
  (`AppTypeOverrides`), a GSAP ease-string augmentation, and a placeholder file
  regenerated per-consumer-app.

None of these modules import each other except that `store/Store.ts` imports
`Signal` from `signals/` to expose `onError`, and `types/framework.d.ts` /
`mixins/signals.ts` both reference `AppTypeOverrides` / `SignalConnections`
from elsewhere in `utils` and `signals`. The connective tissue that makes
signals *safe* (auto-disconnect on destroy) lives outside this folder, in
`src/mixins/signals.ts`.

## Signals — the signal model

**Interface.** `Signal<THandler>` (`packages/core/src/signals/Signal.ts:24`) extends
`typed-signals`'s `Signal` and adds:
- `connect(callback, order?)` (`Signal.ts:60`) — order is a named priority
  (`'highest' | 'higher' | 'high' | 'normal' | 'low' | 'lower' | 'lowest'`, mapped to
  integers in `signalPriorities`, `Signal.ts:12`) or a raw number. **Lower numeric
  priority runs first** — `'highest'` is `Number.MIN_SAFE_INTEGER`. Confirmed by
  `Signal.test.ts:33` (`'high'` fires before `'normal'` before `'low'`).
  Returns a `SignalConnection` (from `typed-signals`) with `.disconnect()`.
- `connectOnce(callback, order?)` (`Signal.ts:26`) — wraps the callback in a closure
  that disconnects itself after the first emit.
- `connectNTimes(callback, times, order?)` (`Signal.ts:39`) — same idea, counts
  emits and disconnects after `times`.
- Everything else (`emit`, `disconnect`, `disconnectAll`) is inherited unchanged
  from `typed-signals`.

`src/signals/index.ts` re-exports `Signal`, `SignalConnections`, the four
`Collector*` helpers, and the `SignalConnection`/`SignalOrder` types — this is
the only import path the rest of the framework uses (`from '../signals'`),
never `typed-signals` directly.

**Global vs per-object signals.** There is no central event bus. "Global"
signals are just public `Signal` instance properties on long-lived singletons:
`Application` (`onPause`, `onResume`, `onResize`, `onPluginError`,
`onPwaInstallAvailable`, `onPwaUpdateAvailable` — `core/Application.ts:164-192`),
and plugins like `SceneManagerPlugin` (`onSceneChangeStart`/`onSceneChangeComplete`),
`WebEventsPlugin`, `TimerPlugin`, `GSAPPlugin`, `KeyboardPlugin`,
`BreakpointPlugin`, `FullScreenPlugin`. "Per-object" signals live on display
objects and UI widgets: `Button` (`onClick`, `onDown`, `onUp`, …), `Toaster`
(`onToastAdded`/`onToastRemoved`), `FlexContainer.onLayoutComplete`,
`Input.onEnter`/`onChange`. Both flavors are the same `Signal` class — the
only distinction is who holds the reference and how long it lives.

**Lifecycle-aware connections (the signals mixin).** `src/mixins/signals.ts`
defines `WithSignals<TBase>` — a mixin, not part of this task's file scope but
essential context. It adds a `signalConnections: SignalConnections` bag and
three identical-behavior methods (`addSignalConnection`, `connectSignal`,
`connectAction` — all just push into the same bag; the three names exist for
call-site readability, not different behavior) plus an overridden `destroy()`
that calls `signalConnections.disconnectAll()` before `super.destroy()`.
`display/Container.ts:64` applies it (`Animated(WithSignals(Factory()))`), so
**every Caper `Container`/`Entity`/`Scene` gets automatic connection cleanup for
free on destroy** — e.g. `Container.ts:148,205` wires `app.onResize` this way.
UI widgets (`Button`, `Toast`, `Toaster`, `Input`, `UICanvas`, `FlexContainer`,
`SpineAnimation`) and some plugin-side controllers (`KeyboardControls`,
`VirtualControls`) apply the same mixin. **`Plugin` (`plugins/Plugin.ts:157`)
does *not* use this mixin** — it hand-rolls an equivalent
`addSignalConnection`/`clearSignalConnections` pair backed by its own
`_signalConnections` field, disconnected during the plugin's own destroy phase.
Same pattern, two independent implementations — see Seams below.

## Store — adapters over the plugin registry

**Interface.** `IStore` / `Store` (`packages/core/src/store/Store.ts`) is a
thin façade over `Application`'s plugin registry — **it owns no adapter map of
its own**. A "storage adapter" is nothing more than a `Plugin` instance whose
shape matches `IStorageCapability` (`save(key, data, ...): Promise<T> | T` and
`load(key, ...): Promise<T | undefined> | T | undefined`,
`core/interfaces/IStorageCapability.ts`), checked with the duck-typed guard
`isStorageCapable()` (same file). Any plugin registered on the app that happens
to expose both methods is automatically storage-capable — there is no
registration step specific to storage.

- `getAdapter<T>(adapterId)` (`Store.ts:78`) — looks up `app.getPlugin(id)`,
  throws `'... not found'` if missing, throws `'... is not storage-capable'` if
  it lacks `save`/`load`.
- `hasAdapter(adapterId)` (`Store.ts:89`) — same lookup, boolean, never throws.
- `save(adapterId, key, data, awaitSave?)` (`Store.ts:110`) — `adapterId` can be
  a single id, an array of ids, a `{ adapterId, awaitSave }` config object, an
  array of those, or the literal `'*'` (checked only at `keys[0]`,
  `Store.ts:129`) to fan out to *every* storage-capable plugin currently
  registered (`allAdapterIds()`, `Store.ts:97`, which reaches into
  `app._plugins` via a documented cast since that map is protected on
  `Application`). Per-entry `awaitSave` overrides the call-level default.
  Awaited saves push the resolved value into the result array; fire-and-forget
  saves push the *pending promise* itself (already `.catch`-guarded) so a
  rejection is never an unhandled rejection — it's routed to `onError` instead.
- `load(adapterId, key)` (`Store.ts:179`) — single adapter only, always awaited,
  rethrows on failure (after routing to `onError`).
- `onError: Signal<(detail: StoreErrorDetail) => void>` (`Store.ts:50`) —
  `{ adapterId, operation: 'save' | 'load', key, error }`. Every failure path
  logs via `Logger.error` (`Store.ts:67`) *and* emits this signal — callers can
  observe failures without try/catch on every `save`/`load` call.

**Lifecycle.** `initialize(app)` (`Store.ts:57`) just captures the `app`
reference — no adapters are constructed or tracked here. `destroy()`
(`Store.ts:62`) disconnects `onError`'s listeners; adapter plugins themselves
are destroyed by `Application`'s own plugin lifecycle, not by `Store`.

## Shared types — `src/types/`

- **`framework.d.ts`** — the augmentation seam. Declares module augmentations
  for `AppTypeOverrides` (`App`, `Data`, `Contexts`, `Actions`, `ActionMap`,
  `Scenes`, `Plugins`) and `AssetTypeOverrides` (`Texture`, `TPSFrames`,
  `SpriteSheet`, `SpineData`, `Audio`, `FontFamily`, `BitmapFontFamily`,
  `Bundles`) against **two** module specifiers: the internal `'../utils/types'`
  and the public `'@caperjs/core'`. This is how consumer apps get strong
  typing for their own scene ids, plugin ids, and action names — every
  generic surface in this task's files (`Store`'s `AppPlugins`,
  `mixins/signals.ts` untouched by this) that reads `AppTypeOverrides[...]`
  resolves through whichever app-level `.d.ts` re-declares these interfaces.
- **`gsap.d.ts`** — augments `gsap/gsap-core`'s `TweenVars.ease` to also accept
  `AppTypeOverrides['CustomEases']`, so apps can register custom GSAP eases
  with type safety. Doc comment (`gsap.d.ts:9-19`) shows the expected consumer
  augmentation pattern.
- **`caper-app.d.ts`** — a **generated placeholder**
  (`/* caper.config.ts not found, skipping augmentation. */`). In a real app
  this file is regenerated by the CLI/vite tooling once `caper.config.ts`
  exists, presumably to inject concrete literal types (scene names, plugin
  ids) rather than the loose `string` fallback seen in `framework.d.ts`. In
  the framework source tree itself it stays an empty stub — do not hand-edit it.

**Consumers.** `AppTypeOverrides` (defined in `src/utils/types.ts`, outside
this task's scope) is read by `store/Store.ts` (`AppPlugins` type alias,
`Store.ts:14`), by `mixins/signals.ts` indirectly through `ISignalContainer`
callers, and broadly across `core/`, `plugins/`, `ui/` for typed scene/plugin
ids and action contexts.

## Module map

| File | Responsibility | Key exports |
|---|---|---|
| `signals/Signal.ts` | Signal class: typed pub/sub with priority ordering, once/n-times connect | `Signal`, `SignalOrder` |
| `signals/index.ts` | Public re-export surface for the signals module | `Signal`, `SignalConnections`, `Collector*`, `SignalConnection`, `SignalOrder` |
| `signals/Signal.test.ts` | Behavioral spec for ordering, once/n-times, disconnectAll | — |
| `store/Store.ts` | Façade routing save/load through plugin-registry-discovered storage adapters | `IStore`, `Store`, `StoreErrorDetail` |
| `store/index.ts` | Re-export barrel | `*` from `./Store` |
| `store/Store.test.ts` | Behavioral spec for adapter lookup, fan-out, error routing | — |
| `types/framework.d.ts` | App-augmentation seam for `AppTypeOverrides`/`AssetTypeOverrides` | (ambient module augmentation, no runtime export) |
| `types/gsap.d.ts` | Augments GSAP's `TweenVars.ease` with custom app eases | (ambient module augmentation) |
| `types/caper-app.d.ts` | Generated per-app augmentation stub (empty outside a real app) | (none — placeholder) |

## Seams & extension points

- **Storage adapter seam.** Any plugin that implements `save`/`load` is
  automatically an adapter — no registration call, no interface to `extends`.
  See `isStorageCapable()` (`core/interfaces/IStorageCapability.ts`). This is
  the seam to use when adding a new persistence backend (localStorage,
  Firebase, IndexedDB): write a plugin, not a `Store` subclass.
  `plugin-firebase` is the reference implementation.
- **Type augmentation seam.** `AppTypeOverrides`/`AssetTypeOverrides` are empty
  interfaces in `src/utils/types.ts` designed to be re-declared via
  `declare module` in a consuming app (see `types/framework.d.ts` for the
  pattern). This is how `Store.getAdapter`'s `AppPlugins` parameter becomes a
  literal union of real plugin ids in an app, instead of `string`.
  `caper-app.d.ts` is where the CLI writes the generated version of this.
- **Signal lifecycle seam.** `WithSignals` (`src/mixins/signals.ts`, outside
  this folder) is the sanctioned way to get auto-cleanup on `destroy()`. Any
  new mixin or plugin-like base class that holds `Signal` connections should
  either compose `WithSignals` or replicate its `disconnectAll()`-on-destroy
  contract — `Plugin` does the latter independently (`plugins/Plugin.ts:157`).
- **Priority ordering.** `signalPriorities` (`Signal.ts:12`) is a closed map;
  extending it (e.g. adding a priority between `'high'` and `'highest'`) means
  editing `Signal.ts` directly, or callers can already pass a raw number to
  `connect()` to land anywhere in the existing range.

## Invariants & gotchas

- **Every `Signal.connect()` return value is a liability until disconnected.**
  `Signal` has no automatic cleanup by itself — connections leak for the life
  of the `Signal` unless something calls `.disconnect()` or
  `disconnectAll()`. The framework's answer is `WithSignals`/`Plugin`'s own
  connection bag: always route long-lived connections through
  `this.addSignalConnection(...)` (or `connectSignal`/`connectAction`) inside a
  `Container`/`Entity`/`Scene`/`Plugin` rather than storing the raw
  `SignalConnection` yourself, so destroy-time cleanup is automatic.
- **Manual `Signal` instances outside a `WithSignals`/`Plugin` host are not
  auto-cleaned.** A bare `new Signal()` held by a plain object (not extending
  `Container` or `Plugin`) must be disconnected by hand — nothing in this
  folder does it for you.
- **`connect()`'s ordering direction is inverted from intuition**: lower
  priority number (i.e. `'highest'`) fires *first*, not last. Easy to get
  backwards when reasoning about "highest priority."
- **`Store.save('*', ...)` only checks `keys[0]`** (`Store.ts:129`) — a `'*'`
  anywhere but the first array slot is treated as a literal (probably
  nonexistent) adapter id, not a wildcard.
- **`Store.save`'s fire-and-forget branch returns pending promises, not
  values**, mixed in the same result array as resolved values from awaited
  entries. Callers that mix awaited and fire-and-forget adapters in one call
  get a heterogeneous array — resolve or `Promise.allSettled` before reading
  results if that matters.
- **`caper-app.d.ts` is generated.** Editing it inside `packages/core/src` has
  no effect on real apps — this stub is what ships when `caper.config.ts`
  isn't found (e.g. when building the framework itself).

## Recipes

**Add a global signal** (e.g. to `Application` or a plugin):
1. Declare `public readonly onSomething = new Signal<(payload: T) => void>();`
   on the class (see `core/Application.ts:164` for style — most are `public`,
   some `public readonly`).
2. Emit it at the point of state change: `this.onSomething.emit(payload)`.
3. If the emitting class extends `WithSignals`/`Plugin`, no extra cleanup is
   needed — its own `disconnectAll()` on destroy only clears connections *it*
   made via `addSignalConnection`, not listeners *other* code attaches to
   *this* new signal. Document in a JSDoc comment when the signal fires, since
   there's no central registry to discover it from.
4. Consumers connect via `someObject.onSomething.connect(handler, 'normal')`
   and, if they're a `Container`/`Plugin`, wrap it in
   `this.addSignalConnection(...)` for automatic cleanup.

**Create a custom storage adapter:**
1. Write a plugin (extend the base `Plugin` class from `plugins/Plugin.ts`)
   that implements `async save(key: string, data: any): Promise<T>` and
   `async load(key: string): Promise<T | undefined>` — matching
   `IStorageCapability`. See `plugin-firebase` for a real example.
2. Register it in the app's plugin config as usual — no separate "storage
   adapter" registration exists since the Phase 1 merge described in the repo
   `CLAUDE.md`.
3. Use it via `app.store.save('myPluginId', key, data)`,
   `app.store.load('myPluginId', key)`, or `app.store.save('*', key, data)` to
   fan out to it alongside every other storage-capable plugin.
4. Listen for failures on `app.store.onError` rather than wrapping every call
   in try/catch, if centralized error handling/UI-toast-on-failure is desired.
