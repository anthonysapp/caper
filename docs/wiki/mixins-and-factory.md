# Mixins & the Factory (this.add / this.make)

> Part of the Caper core wiki. Index: [Home](Home.md)

## Purpose

`packages/core/src/mixins/` supplies the small set of TypeScript mixin
functions that every Caper display/UI class is assembled from, plus the
factory module that gives every one of those classes its `this.add.*` /
`this.make.*` API. A mixin here is a function `(Base) => class extends Base
{...}` — a stackable behavior module, not a class of its own. `display/Container`
is built as `Animated(WithSignals(Factory()))` (`packages/core/src/display/Container.ts:64`),
and UI classes like `Button`/`UICanvas` layer `Focusable`/`Interactive` on top
of `Container` the same way.

The subsystem has two halves:

- **Behavior mixins** (`animated.ts`, `focus.ts`, `interaction.ts`,
  `signals.ts`) — each adds one orthogonal capability (GSAP tweening, DOM
  focus/accessibility, Pixi event→Signal bridging, signal-connection
  lifecycle) to whatever class extends it.
- **The factory** (`factory/`) — a mixin (`Factory()`) that gives a class
  `add`/`make` methods for every display and UI type Caper ships, driven by
  a single method table (`factory/const.ts`) and a schema helper
  (`factory/schema.ts`) that collapses the construction boilerplate.

The factory module is also the site of a real import-cycle hazard (see
below) that a recent commit (`580fc080`, "defuse mixins-factory/ui barrel
import cycle") redesigned around. That redesign — concrete imports, a lazy
registration slot, and six entry-order guard tests — is the part of this
subsystem most likely to regress silently if a future change reaches for
convenience over the pattern already in place.

## Interface (what callers must know)

Every class built with the `Factory()` mixin (in practice: `Container` and
everything that extends it — Scene, entities, UI widgets) exposes two
parallel method tables with an identical method surface, defined by
`interface IFactory` in `packages/core/src/mixins/factory/Factory.ts:10`:

- **`this.add.<method>(props?)`** — construct **and** parent: the new
  instance is added as a child of `this` via `instance.addChild(obj)`
  (`packages/core/src/mixins/factory/methods.ts:14`).
- **`this.make.<method>(props?)`** — construct **only**: same constructor,
  same prop resolution, no auto-parent. Use it when the caller needs the
  instance before attaching it, or must hand it to something else first
  (e.g. `UICanvas.addElement`).

Both tables are produced from the same method map by
`createFactoryMethods(methods, instance, addToStage)`
(`packages/core/src/mixins/factory/methods.ts:3`) — `addToStage` is the only
difference between `add` and `make`.

The method map itself — one entry per display/UI type — is
`defaultFactoryMethods` in `packages/core/src/mixins/factory/const.ts:75`.
Current entries: `existing`, `container`, `particleContainer`, `texture`,
`sprite`, `tilingSprite`, `animatedSprite`, `graphics`, `svg`, `text`,
`htmlText`, `bitmapText`, `button`, `flexContainer`, `uiCanvas`, `spine`,
`spineAnimation`, `toaster`, `entity`, `ui`. Two are worth calling out
specifically because they aren't classes at all:

- **`this.add.entity(id, props)`** / **`this.make.entity(id, props)`** —
  look up a build-time-discovered entity constructor by string id
  (`packages/core/src/mixins/factory/registry.ts`) and construct it. Throws
  at runtime if `id` isn't registered.
- **`this.add.ui(id, props)`** — the same pattern against the UI registry
  (`packages/core/src/mixins/factory/ui-registry.ts`).
- **`this.add.existing(view)`** — parent an already-built node instead of
  constructing one; still runs the position/scale/pivot resolvers if
  `props` is passed.

Callers never construct `Factory()` themselves in app code — it's already
baked into `Container`. What callers *do* need to know: prop objects passed
to `add`/`make` accept the type's own config plus common cross-cutting keys
(`position`/`x`/`y`, `scale`/`scaleX`/`scaleY`, `pivot`, `anchor` where
applicable) applied uniformly after construction, and any other keys are
set directly on the instance via `resolveUnknownKeys`
(`packages/core/src/mixins/factory/utils.ts:9`) — i.e. unknown props are a
passthrough to instance properties (`alpha`, `visible`, `label`,
`eventMode`, etc.), not silently dropped.

## Module map

| File | Responsibility | Key exports |
|---|---|---|
| `mixins/index.ts` | Barrel re-exporting all mixins **for external/app consumption only** — see the cycle section for why internal Caper code must not import through it. | re-exports of all modules below |
| `mixins/animated.ts` | GSAP-backed tween/timeline helpers (`animate`, `animateSequence`, `shake`, `pulse`, `bob`) plus three Signals for tween lifecycle. | `Animated`, `IAnimated`, `GSAPAnimationConfigExtended` |
| `mixins/focus.ts` | DOM-focus / accessibility bridge: wires Pixi's `accessible*` fields and pointer events into `onFocus`/`onFocusIn`/`onFocusOut`/`onBlur` Signals, delegates active-focus tracking to `Application.getInstance().focus`. | `Focusable`, `IFocusable` (type re-exported from `../plugins`) |
| `mixins/interaction.ts` | Lazily maps arbitrary Pixi `FederatedEvent` names to per-event-name `Signal`s via `onInteraction(eventName)`. | `Interactive`, `IInteractive`, `InteractionSignal` |
| `mixins/signals.ts` | Gives a class a `signalConnections: SignalConnections` bag and `addSignalConnection`/`connectSignal`/`connectAction`, auto-disconnected in `destroy()`. | `WithSignals`, `ISignalContainer` |
| `mixins/factory/Factory.ts` | The mixin itself: builds per-instance `add`/`make` tables from the (lazily-read) default method table plus any per-class `extensions`. | `Factory`, `IFactory` |
| `mixins/factory/const.ts` | The `defaultFactoryMethods` table — one entry per display/UI type. Imports every concrete display/ui class (the "table" side of the cycle). Pushes the table into `defaults.ts` at module-evaluation time. | `defaultFactoryMethods` |
| `mixins/factory/defaults.ts` | The import-free registration slot that breaks the cycle — see below. Zero imports, by design. | `setDefaultFactoryMethods`, `getDefaultFactoryMethods` |
| `mixins/factory/methods.ts` | Turns a method map into the actual `add`/`make` callable table, injecting the `addChild` side effect. | `createFactoryMethods` |
| `mixins/factory/schema.ts` | `buildFactoryMethod({build, applies, exclude})` — the helper most `const.ts` entries are built from; centralizes the position/scale/pivot/anchor-then-unknown-keys pipeline. | `buildFactoryMethod`, `FactorySchema`, `FactoryApply` |
| `mixins/factory/props.ts` | Prop-shape interfaces for every factory method (`SpriteProps`, `TextProps`, `ContainerProps`, etc.) — the types that drive `this.add.sprite({...})` autocomplete. | `*Props` interfaces |
| `mixins/factory/utils.ts` | Prop resolvers shared by hand-written methods and `buildFactoryMethod`: `resolvePosition`, `resolveScale`, `resolvePivot`, `resolveAnchor`, `resolveUnknownKeys`, `resolveTexture`, `getErrorTexture`. | resolver functions |
| `mixins/factory/registry.ts` | Lazy runtime lookup for `this.add.entity(id)`, backed by `globalThis.Caper.get('entityList')` (populated by Vite discovery). Static-import entities only; dynamic (code-split) entities are skipped. | `getEntityCtor`, `getRegisteredEntityIds`, `_resetEntityRegistry` (test-only) |
| `mixins/factory/ui-registry.ts` | Same pattern as `registry.ts`, for `this.add.ui(id)` against `globalThis.Caper.get('uiList')`. | `getUICtor`, `getRegisteredUIIds`, `_resetUIRegistry` (test-only) |
| `mixins/factory/index.ts` | Barrel for the `factory/` subdirectory only (not `mixins/` as a whole). | re-exports of the files above |
| `mixins/factory/Factory.test.ts` | Verifies per-class `extensions` don't leak into the shared default table. | — |
| `mixins/factory/registry.test.ts` | Verifies entity-registry lazy population, inactive/dynamic filtering, caching. | — |
| `importOrder.*.test.ts` (6 files, package root) | Entry-order guard tests — see next section. | — |

## The import-cycle hazard

**Why the cycle existed.** `factory/const.ts` builds `defaultFactoryMethods`
by importing *every* concrete display and UI class (`Sprite` construction
needs `resolveTexture`, `button:` needs the real `Button` class, `uiCanvas:`
needs the real `UICanvas`, and so on) — see the imports at
`packages/core/src/mixins/factory/const.ts:1-18`. Meanwhile every one of
those display/UI classes is *built from* `Factory()` — e.g.
`packages/core/src/display/Container.ts:64`:
`class Container extends Animated(WithSignals(Factory()))`. So the two
sides need each other: the table needs the classes to build itself, and the
classes need the table (at construct time) to get their `add`/`make`
methods. That is a cycle by construction, not an accident — the question is
only whether module evaluation can survive it.

Before the fix, `Factory()` would have pulled the table in via a static
top-level import, which — depending on which module a test or app happened
to import *first* — could put the JS engine mid-way through evaluating
`const.ts` (or a display/ui class) when the cycle looped back around and
asked for a binding that hadn't been assigned yet. In ESM/CJS interop that
surfaces as `undefined` where a class or function was expected, and the
concrete failure mode the code comments and tests still name is a class
body throwing "Class extends value undefined" — e.g. `Toast extends
WithSignals(Container)` running while `Container` was still mid-evaluation
because the entry point happened to be `ui/Toast` (see
`packages/core/src/importOrder.toastFirst.test.ts:3-6`). Going through
either side's **barrel** (`mixins/index.ts` or a `display`/`ui` barrel)
made this worse because barrels re-export everything, widening the surface
that can be mid-evaluation at the wrong moment — see
`packages/core/src/importOrder.uiFirst.test.ts:3-10` for the fullest
explanation in-repo.

**How the current design avoids it — three complementary defenses:**

1. **Concrete imports, never the barrel, on the "spoke" side.** Every
   display/UI class imports mixins from their concrete files —
   `import { Factory } from '../mixins/factory/Factory'`,
   `import { WithSignals } from '../mixins/signals'`,
   `import { Focusable } from '../mixins/focus'` — never
   `from '../mixins'` (confirmed across `Container.ts`, `Button.ts`,
   `UICanvas.ts`, `FlexContainer.ts`, `Toast.ts`, `Toaster.ts`,
   `SpineAnimation.ts`, `Input.ts`). This keeps each edge of the graph as
   narrow as possible — you only depend on the one function you use, not on
   everything the barrel would eagerly re-export alongside it.
2. **A lazy, import-free registration slot** — `mixins/factory/defaults.ts`.
   This module has **zero imports**, by explicit design (see its file
   header comment). `const.ts` calls `setDefaultFactoryMethods(defaultFactoryMethods)`
   as its last line (`packages/core/src/mixins/factory/const.ts:370`) the
   moment the table finishes evaluating. `Factory()` never imports
   `const.ts` — it only imports `getDefaultFactoryMethods` from `defaults.ts`,
   and calls it **inside the constructor**
   (`packages/core/src/mixins/factory/Factory.ts:26`), not at module-eval
   time. That turns a *static* (eager, evaluation-order-sensitive) edge from
   `Factory` back to the table into a *dynamic* (deferred to first
   instantiation) one — by the time any `new Container()` actually runs,
   the whole module graph has finished loading and the table is guaranteed
   to be registered. The only remaining type-level coupling is
   `import type { defaultFactoryMethods } from './const'` in
   `Factory.ts:6` — erased at compile time, so it adds no runtime edge.
3. **Six entry-order guard tests** at the package root
   (`importOrder.containerFirst`, `.displayFirst`, `.mixinsFirst`,
   `.sceneFirst`, `.toastFirst`, `.uiFirst`). Each file makes a *different*
   module the first thing imported (raw `display/Container`, the `display`
   barrel, `mixins` barrel, `display/Scene`, `ui/Toast`, and a `ui/*`
   module respectively) because Vitest gives each test file its own fresh
   module registry — the bug is evaluation-*order*-dependent, so no single
   test file can prove both orderings safe; each file pins one entry point
   permanently. If a future change reintroduces an eager static edge
   between the factory table and any display/ui class, at least one of
   these six files will fail with the resurrected "Class extends value
   undefined" / "Factory is not a function" class of error.

**What a future contributor must NOT do:**

- Do not add a top-level (module-scope) import from `factory/Factory.ts` or
  `factory/defaults.ts` back to `factory/const.ts`, or to any concrete
  display/UI class. If `Factory()` ever needs another piece of data from
  the table at *module* evaluation time (not construct time), it has to go
  through the same lazy-slot pattern as `defaults.ts`, not a direct import.
- Do not have a display/UI class import a mixin via the `mixins` barrel
  (`from '../mixins'`) instead of the concrete file. The barrel is for
  external consumers of `@caperjs/core`, not for internal display/ui
  modules — see the barrel-widens-the-cycle explanation above.
- Do not delete or "consolidate" the six `importOrder.*.test.ts` files into
  one file — collapsing them defeats their purpose, since Vitest's
  per-file fresh module registry is exactly what lets each one pin a
  distinct evaluation order.
- Do not make `mixins/factory/defaults.ts` import anything. Its entire
  value is being import-free; even a type-only import back into `const.ts`
  would need to stay type-only and would still be worth a second thought.

## Seams & extension points

- **Adding a new default factory method** — the seam is `const.ts`'s
  `defaultFactoryMethods` object. Add an entry there, and (unless it's one
  of the five hand-written bespoke shapes) build it with
  `buildFactoryMethod({build, applies, exclude})` from `schema.ts` rather
  than writing the position/scale/pivot/anchor/unknown-keys plumbing by
  hand. Add a matching `*Props` interface to `props.ts` for the DX/type
  surface at the call site.
- **Per-instance/per-subclass factory extensions** — `Factory<T>(extensions?)`
  takes a `Partial<T>` of extra methods, merged into a **copy** of the
  shared default table per class (`packages/core/src/mixins/factory/Factory.ts:26`,
  `Object.assign({}, getDefaultFactoryMethods(), extensions)`). This is the
  seam for a subclass that wants an extra `add.myThing()` without mutating
  the global table — `Factory.test.ts` is the executable spec for "no
  leakage" here.
- **New behavior mixin** — follow the `(Base) => class extends Base
  implements ISomething {...} as unknown as TBase & Constructor<ISomething>`
  shape used by all four mixins in this directory (see `animated.ts:74`,
  `focus.ts:16`, `interaction.ts:25`, `signals.ts:18`). Export the mixin
  function and its interface, add it to `mixins/index.ts`'s barrel for
  external consumption, and have any internal display/ui class that uses it
  import the concrete file, not the barrel (see cycle section).
- **Entity/UI runtime registries** (`registry.ts` / `ui-registry.ts`) — the
  seam for wiring a new build-time discovery source is
  `globalThis.Caper.get('entityList' | 'uiList')`; the registry modules
  themselves don't know or care how that global gets populated (that's the
  Vite plugin's job, outside this subsystem).

## Invariants & gotchas

- **`getDefaultFactoryMethods()` throws if called before `const.ts` has
  evaluated** (`packages/core/src/mixins/factory/defaults.ts:20-27`). This
  can only actually happen if some code deep-imports a display/ui class
  without ever pulling in `@caperjs/core`'s factory module — the error
  message says exactly that. It is not reachable from normal app code that
  imports `@caperjs/core` first.
- **`add` vs `make` is a per-call choice, not a per-class one** — both
  tables exist simultaneously on every `Factory()`-built instance; picking
  the wrong one silently either double-parents (rare) or leaves an orphan
  node the caller must remember to `addChild` themselves.
- **Dynamic (code-split) entities/UI are invisible to `this.add.entity` /
  `this.add.ui`.** Both registries only register entries whose `module` is
  a constructor (has a `.prototype`); arrow-function dynamic loaders are
  silently skipped, by design (`registry.ts:38-42`). There is no async
  factory variant — a project needing code-split entities must fall back to
  `this.add.existing(new Foo(...))` with a manual `import()`.
- **`Factory()`'s `extensions` parameter is mutated internally** — `Factory.ts:26`
  reassigns the `extensions` parameter binding itself
  (`extensions = Object.assign({}, ...)`) rather than declaring a new
  `const`. It's contained to the constructor's local scope so it isn't a
  functional bug, but a reviewer skimming the diff may misread it as
  mutating the caller's object.
- **Props objects are widely typed as `any` internally.** `resolveUnknownKeys`,
  `createFactoryMethods`, and most resolver functions in `utils.ts` take
  `any`/`entity: any`. The type safety callers see (`this.add.sprite({...})`
  autocompleting `SpriteProps`) is a compile-time-only guarantee from
  `props.ts` + `buildFactoryMethod`'s generics; nothing stops a runtime
  caller from passing garbage through `add.existing` or `resolveUnknownKeys`.
- **`Focusable` and `Interactive` both unconditionally set
  `this.eventMode = 'static'`** in their constructors
  (`focus.ts:40`, `interaction.ts:32`). Stacking both mixins on one class is
  fine (idempotent), but a class that needs a different `eventMode` after
  construction must set it *after* `super()`, not rely on a prop passed
  in.

## Recipes

**Add a new factory method (e.g. `this.add.myWidget(...)`):**

1. Add a `MyWidgetProps` interface to `packages/core/src/mixins/factory/props.ts`.
2. Add an entry to `defaultFactoryMethods` in `packages/core/src/mixins/factory/const.ts`,
   using `buildFactoryMethod({ build, applies, exclude })` unless the shape
   doesn't fit `(props?) => instance` (see the five bespoke entries —
   `existing`, `texture`, `svg`, `toaster`, `entity`/`ui` — for when
   hand-writing is justified).
3. If `MyWidget` is a new concrete class, import it at the top of `const.ts`
   the same way every other type is imported there — this file is the one
   place in the codebase that's *supposed* to import every display/ui
   class.
4. Do not touch `Factory.ts` or `defaults.ts` — the new entry reaches
   `Factory()` automatically through the existing registration slot.
5. Verify: run the six `importOrder.*.test.ts` files
   (`pnpm --filter caper vitest run importOrder`) — they'll catch it if the
   new import accidentally creates a fresh eager edge back into `Factory`.

**Use the signals mixin (`WithSignals`) in a custom class:**

```ts
import { Container } from '@caperjs/core'; // or '../display/Container' internally
import { WithSignals } from '../mixins/signals'; // concrete import, not the barrel

class MyThing extends WithSignals(Container) {
  wireUp() {
    this.connectSignal(someSignal.connect(() => { /* ... */ }));
  }
}
```

`destroy()` on the mixed-in class automatically calls
`signalConnections.disconnectAll()` before calling through to `super.destroy()`
(`packages/core/src/mixins/signals.ts:44-47`) — you don't need to
disconnect connections yourself in an overridden `destroy`, just make sure
you call `super.destroy(options)`.

**Stack multiple mixins on one class:**

Compose them as nested calls, innermost-applied-first, matching
`Container`'s own definition
(`class Container extends Animated(WithSignals(Factory()))`,
`packages/core/src/display/Container.ts:64`). For an interactive,
focusable UI element (the `Button`/`UICanvas` pattern), that becomes
something like `Focusable(Interactive(WithSignals(Factory())))` — check the
concrete class you're modeling after for the exact order, since mixins that
touch the same lifecycle hook (e.g. both `Focusable` and `Interactive`
override `destroy`) rely on `super.destroy()` chains firing in the order
they're nested.
