# BreakpointPlugin

A responsive-query layer for caper: name the size ranges once in
`caper.config.ts`, ask about them anywhere with full intellisense, and get told
only when one actually flips.

Status: design approved 2026-07-27, not yet implemented.

## 1. Problem

Caper gives an app exactly one responsive primitive: `app.onResize`, carrying a
raw `Size`. Everything above that is hand-rolled, and every app rolls it the
same way:

```ts
const STACK_BREAKPOINT = 880;
const NARROW_BREAKPOINT = 520;
...
const columns = w < NARROW_BREAKPOINT ? 1 : w < STACK_BREAKPOINT ? 2 : 3;
```

Three gaps:

1. **No shared vocabulary.** Thresholds are per-file magic numbers, so "what is
   the tablet layout" has no single answer, and the same number reappears in
   three scenes by coincidence rather than by intent.
2. **Everything recomputes on every resize.** `onResize` fires continuously
   during a window drag. Work that should happen once per *layout mode change*
   happens once per frame instead, and there is no signal to hang it on.
3. **No non-width axes.** Portrait vs landscape and coarse vs fine pointer are
   frequently what "mobile vs tablet" actually means, and there is nowhere in
   the framework to express them.

Caper already solves this class of problem for scenes, popups, entities,
actions and locale keys: declare in `caper.config.ts`, get a typed id union
generated into `caper-app.d.ts`, consume with autocomplete. Breakpoints should
work the same way, and this plugin is not complete until they do.

## 2. Vocabulary

Three words carry the whole design. They are worth pinning down before any API
appears, because the wrong mental model here makes everything below look
arbitrary.

**Tier** — one rung of a single, ordered width ladder. Exactly one tier is
active at a time, and `bp.current` names it. Tiers are the device-scale
vocabulary: `mobile`, `tablet`, `desktop`, `wide`. Because they are ordered and
mutually exclusive, they can cascade — which is what makes `bp.value()` work.

**Mode** — a named true/false condition *you* invent, evaluated against the
current size. `stacked: { below: 880 }` reads as "define a condition called
`stacked`, true whenever the width is below 880." Nothing in the framework
knows what `stacked` means; the point is that several places can agree on the
name instead of each re-deriving `880`. Any number of modes can be true at
once, so they are unordered and cannot cascade.

**Axis** — a non-width dimension the plugin tracks for you: `orientation`
(`portrait` / `landscape`) and `pointer` (`coarse` / `fine`).

All three share one flat namespace, so anything you can ask about you can also
listen for:

```ts
bp.is('tablet')      // tier
bp.is('stacked')     // mode
bp.is('landscape')   // axis value

bp.when('stacked', fn)   // same namespace, same names
```

## 3. Scope

**In scope:** a first-party plugin registered by default, exposing a width tier
ladder, orientation and pointer axes, named modes, a cascading `value()`
resolver, and enter/leave signals; a top-level `breakpoints` key in
`caper.config.ts` with a `defineBreakpoints()` helper; and Vite-plugin codegen
so tier and mode names land in `AppTypeOverrides` and autocomplete everywhere.

**Out of scope:**

- Boundary hysteresis. Evaluation is a pure function of the context, and
  emit-on-flip already prevents signal thrash.
- Resize debouncing. `ResizerPlugin` already rAF-throttles.
- Per-scene plugin instances. One global ladder plus named modes covers it.
- Any change to `ResizerPlugin`'s sizing math.
- Build-time *value* validation of the ladder (see §9).

## 4. Placement and file layout

A separate plugin, not an addition to `ResizerPlugin`. The resizer's job is
canvas sizing math; breakpoints are a query-and-notify layer over the result.
Keeping them apart means the resizer stays one responsibility and the
breakpoint layer can be dropped from an app's plugin list.

New folder `packages/core/src/plugins/breakpoints/`, matching the multi-file
plugin idiom used by `audio/`, `focus/`, `input/`, and `actions/`:

| File | Contents |
| --- | --- |
| `types.ts` | Public types, default ladder, name resolution |
| `methods.ts` | `defineBreakpoints()` — mirrors `actions/methods.ts` |
| `evaluate.ts` | Pure `evaluate()` / `matchesMode()` — no DOM, no app |
| `BreakpointPlugin.ts` | Lifecycle, signals, wiring |
| `BreakpointPlugin.test.ts` | Spec, against the pure functions |
| `index.ts` | Re-exports |

Splitting the pure evaluation out of the plugin mirrors how `_resizeInternal`
is split out of `ResizerPlugin`, and is what makes the behaviour testable
without a renderer.

Touched elsewhere:

| File | Change |
| --- | --- |
| `src/plugins/defaults.ts` | Register `{ id: 'breakpoints', module: BreakpointPlugin, namedExport: 'BreakpointPlugin' }` |
| `src/plugins/index.ts` | `export * from './breakpoints'` |
| `src/core/Application.ts` | Lazy `get breakpoints()`, same shape as `get resizer()` |
| `src/core/interfaces/IApplication.ts` | `breakpoints: IBreakpointPlugin` |
| `src/core/interfaces/IApplicationOptions.ts` | `breakpoints: BreakpointsConfig` |
| `src/core/interfaces/ICoreSignals.ts` | `onBreakpointChanged` |
| `config/vite.mjs` | Codegen — see §9 |

The plugin class carries a full example-led docblock in the style of
`LayoutPlugin`; that is caper's documentation surface for plugins.

## 5. Evaluation source and timing

**Source: the renderer size (`app.size`).** That is the post-scale logical size
scenes lay out in, so breakpoints agree with layout code by construction. Under
letterbox or `minWidth` scaling this deliberately differs from the browser
window — a scene asking "am I narrow" means narrow *in its own coordinate
space*.

**Timing:**

- `postInitialize` evaluates once against the current renderer size, so
  `bp.current` is valid before the first scene is constructed. (`Application`
  runs its first `_resize()` in `_setup`, after every plugin's
  `postInitialize`.)
- Then `app.onResize.connect(this._evaluate, 'highest')`. `app.onResize` is
  emitted by `Application._resize` *after* the resizer has computed the new
  size, and `'highest'` puts this ahead of every normal-priority listener — so
  a scene's own resize handler sees an already-correct `bp.current`.
- The pointer axis comes from a `matchMedia('(pointer: coarse)')` listener that
  re-evaluates on change (fires rarely — plugging in a mouse, docking a tablet).

**Documented hazard:** anything connected directly to
`app.webEvents.onResize` runs *ahead* of this plugin and will observe a stale
tier. The contract is: listen to `app.onResize` or `bp.onChange`, never
`webEvents.onResize`.

## 6. Types

```ts
/** Default ladder. Values are min-widths; the lowest must be 0. */
export const defaultBreakpoints = {
  mobile: 0,
  tablet: 768,
  desktop: 1024,
  wide: 1440,
} as const;

export type DefaultTierName = keyof typeof defaultBreakpoints;

/**
 * Ladder tier names. When the app declares its own set in `caper.config.ts`,
 * the generated `Breakpoints` override REPLACES the defaults rather than
 * adding to them — a config with `ultrawide` but no `mobile` must not
 * autocomplete `mobile`. Degrades to the defaults when no override is
 * generated.
 */
export type BreakpointTierName = AppTypeOverrides extends { Breakpoints: infer B }
  ? B & string
  : DefaultTierName;

/** Config-declared mode names. `never` when none are declared. */
export type BreakpointModeName = AppTypeOverrides extends { BreakpointModes: infer M }
  ? M & string
  : never;

/** Everything nameable: tiers, modes and axis values share one namespace (§2). */
export type BreakpointName = BreakpointTierName | BreakpointModeName | Orientation | Pointer;

/** Accepted at call sites: known names autocomplete, runtime-defined names still compile. */
export type BreakpointNameLike = BreakpointName | (string & {});

export type Pointer = 'coarse' | 'fine';
// `Orientation` ('portrait' | 'landscape') already exists in utils.

export interface BreakpointContext {
  width: number;
  height: number;
  /** width / height */
  aspect: number;
  tier: BreakpointNameLike;
  orientation: Orientation;
  pointer: Pointer;
}

/** The body of a mode: a condition object, or a predicate for anything else. */
export type BreakpointMode<N extends string = BreakpointNameLike> =
  | ((ctx: BreakpointContext) => boolean)
  | {
      /** the active tier is this one (or one of these) */
      tier?: N | N[];
      /** width >= this stop (tier name or raw px) */
      atLeast?: N | number;
      /** width < this stop (tier name or raw px) */
      below?: N | number;
      orientation?: Orientation;
      pointer?: Pointer;
      minHeight?: number;
      maxHeight?: number;
    };

export interface BreakpointChangeDetail {
  current: BreakpointNameLike;
  previous: BreakpointNameLike;
  /** names that became true this evaluation — tiers, modes, orientation, pointer */
  entered: string[];
  /** names that became false this evaluation */
  left: string[];
  size: Size;
}

/** The shape of the top-level `breakpoints` key in caper.config.ts. */
export type BreakpointsConfig<
  T extends Record<string, number> = Record<string, number>,
  M extends Record<string, BreakpointMode> = Record<string, BreakpointMode>,
> = { tiers: T; modes: M };
```

**Modes are built out of tiers, not just numbers.** `tier`, `atLeast` and
`below` all accept tier names, and the `N` parameter on `BreakpointMode` is what
makes them autocomplete inside `defineBreakpoints` — the same trick
`defineActions(contexts, …)` uses to cross-type actions against contexts.

```ts
modes: {
  stacked:   { below: 'desktop' },                        // range, by tier name
  compact:   { below: 880 },                              // range, by raw px
  handheld:  { tier: ['mobile', 'tablet'] },              // exact tier membership
  roomy:     { atLeast: 'desktop', orientation: 'landscape' },
}
```

`tier` exists so exact membership doesn't have to be spelled as
`{ atLeast: 'tablet', below: 'desktop' }` — that form names a rung the author
didn't care about, and silently changes meaning the moment a tier is inserted
between the two. `tier` binds to the names actually intended.

The ladder is the vocabulary; raw pixels stay available for the genuinely
one-off threshold, but a mode that names tiers keeps working when the ladder is
re-tuned.

## 7. Read API

```ts
const bp = app.breakpoints;

bp.current                       // 'tablet' — the active tier
bp.size / bp.width / bp.height
bp.orientation                   // 'portrait' | 'landscape'
bp.pointer                       // 'coarse' | 'fine'

bp.is('tablet')                  // tier, mode, or axis value — one namespace
bp.atLeast('tablet')             // width >= 768
bp.below('tablet')               // width <  768
bp.between('tablet', 'wide')     // width >= 768 && width < 1440
bp.matches({ atLeast: 'desktop', orientation: 'landscape' })  // keys AND-ed
```

`atLeast` and `below` are exact complements — `atLeast(n) === !below(n)` for
every `n` — so there is no gap, no overlap, and no off-by-one question about
whether `below('tablet')` includes tablet. Both accept a tier name or a raw
number, making `bp.below(880)` a legal one-liner for a threshold not worth
naming.

`between(a, b)` is `atLeast(a) && below(b)`; the upper bound is exclusive.

`is(name)` resolves in order: tiers, then modes, then axis values. An
unrecognised name returns `false` and logs a dev-only warning via `Logger`.

`matches(mode)` takes a mode body inline, without naming it — the escape hatch
for a one-off condition that isn't worth a config entry.

### `value()` — the cascading resolver

```ts
// Replaces: w < 520 ? 1 : w < 880 ? 2 : 3
const columns = bp.value({ mobile: 1, tablet: 2, desktop: 3 });
```

Semantics, mobile-first: take the entry for the current tier; if absent, walk
*down* the ladder to the nearest defined tier below; if there is none, use the
lowest defined entry. A non-empty map therefore never yields `undefined`, and
partial maps are the normal case — `bp.value({ mobile: 1, desktop: 3 })` gives
`1` at tablet and `3` at wide.

The map is keyed on tiers only, typed as
`Partial<Record<BreakpointTierName, T>>`, so a typo is a compile error and
autocomplete lists the app's own tiers. Modes are unordered and cannot cascade,
so the split unions in §6 exclude them by construction — this is the reason the
codegen emits tiers and modes as two overrides rather than one.

## 8. Configuration

Two levels, matching the two kinds of "custom" that come up.

### Tiers and modes, at config time

`caper.config.ts`, mirroring the existing `contexts` / `actions` / `dataSchema`
pattern — a named export consumed by a top-level config key:

```ts
import { defineBreakpoints, defineConfig } from '@caper-engine/core';

export const breakpoints = defineBreakpoints({
  tiers: {
    mobile: 0,
    tablet: 768,
    desktop: 1024,
    wide: 1440,
    ultrawide: 2200,
  },
  modes: {
    stacked: { below: 880 },
    squat: (ctx) => ctx.height < ctx.width * 0.6,
  },
});

export default defineConfig({
  id: 'MyApp',
  breakpoints,
  // ...
});
```

```ts
// plugins/breakpoints/methods.ts — mirrors actions/methods.ts
export function defineBreakpoints<
  const T extends Record<string, number>,
  const M extends Record<string, BreakpointMode<keyof T & string>> = {},
>(config: { tiers: T; modes?: M }): { tiers: T; modes: M };
```

`modes` is always present on the return type (defaulting to `{}`) so the
generated `keyof` union never resolves against `undefined`. The default must be
`{}` and not `Record<string, never>`: `keyof {}` is `never`, but
`keyof Record<string, never>` is `string | number`, which would collapse the
generated union to plain `string` and silently disable autocomplete for any app
that declares tiers without modes.

**Runtime wiring is free.** `Application.registerPlugins` sources a default
plugin's options from `this.config[plugin.id]` (`Application.ts:780`), so a
plugin with id `breakpoints` receives the top-level `breakpoints` key
automatically — exactly how `resizer: { minWidth: 500 }` reaches
`ResizerPlugin` today. No special-casing.

The `tiers` map **replaces** the default ladder wholesale rather than merging,
so an app can rename tiers without inheriting stops it never asked for. Omit
the key entirely to get the defaults.

### Modes, at runtime

For conditions discovered inside a scene, or dependent on runtime state:

```ts
bp.define('stacked', { below: 880 });                       // condition object
bp.define('squat', (ctx) => ctx.height < ctx.width * 0.6);  // predicate
bp.undefine('stacked');
```

Runtime-defined names cannot appear in the generated union — that is what the
`(string & {})` arm of `BreakpointNameLike` is for. Anything an app wants
type-checked belongs in `caper.config.ts`.

Modes do **not** participate in `current`, which stays a single-valued tier —
several modes may be true at once, and collapsing them into one "current" would
be a lie.

`define` evaluates immediately and emits `enter` if the mode already matches, so
registration order relative to layout code does not matter. Re-defining an
existing name overwrites it and re-evaluates. `undefine` emits `leave` if it was
matching.

## 9. Listening

```ts
bp.onChange                       // Signal<(d: BreakpointChangeDetail) => void>
bp.onEnter('mobile', fn)          // → SignalConnection
bp.onLeave('mobile', fn)          // → SignalConnection
bp.when('mobile', fn)             // runs NOW if matching, then on every enter
```

`onChange` fires **only when something actually flipped** — a tier change, an
orientation or pointer change, or any mode toggling. That is the core value
over `onResize`, which fires on every pixel of a window drag. A resize that
stays inside the same tier emits nothing.

`onEnter` / `onLeave` / `when` accept any name in the flat namespace from §2.
All return a `SignalConnection`, so a scene gets teardown for free:

```ts
this.addSignalConnection(app.breakpoints.when('stacked', this.relayout));
```

`when` is the ergonomic default for layout code — "do this now, and again
whenever we become stacked" is almost always what a scene means, and it removes
the standard bug of forgetting the initial call.

Internally these are lazily-created per-name `Signal` instances held in a `Map`,
disconnected in `destroy()`.

`onBreakpointChanged` is exposed through `getCoreSignals()` so
`app.signals.onBreakpointChanged` works, matching the framework idiom.

## 10. Codegen — typed names

`generateTypes()` in `packages/core/config/vite.mjs` already parses
`caper.config.ts` with oxc and re-emits `typeof` pointers for `actions`,
`contexts` and the data schema. Breakpoints follow that path exactly, which
means **no AST value extraction** — full fidelity, and spreads or computed
members can never desync the union from the runtime object.

Changes, all inside `generateTypes`:

1. Alongside the existing `hasActions` / `hasContexts` detection, find the
   exported declaration whose init is a `defineBreakpoints(...)` call and
   capture its identifier as `breakpointsName`. (Detect by callee, as
   `defineData` does — more robust than matching on the variable name.)
2. If found, push `breakpointsName` into `configParts` so the existing
   `import type { … } from '<relativeConfigPath>'` line picks it up.
3. Emit, conditionally:

   ```ts
   // Breakpoints
   type AppBreakpoints = keyof (typeof breakpoints)['tiers'] & string;
   type AppBreakpointModes = keyof (typeof breakpoints)['modes'] & string;
   ```

4. Add `Breakpoints: AppBreakpoints;` and `BreakpointModes: AppBreakpointModes;`
   to the `AppTypeOverrides` block, again only when found — their absence is
   what makes `BreakpointTierName` fall back to the default ladder and
   `BreakpointModeName` to `never` in §6.

Two overrides rather than one because tiers and modes are not interchangeable:
`value()` cascades down the ladder and must accept tiers only, while `is()` /
`when()` take either. Both are string-literal unions, matching the shape already
used for `Scenes`, `Plugins`, `Popups` and `Entities`.

**Build-time warning:** `runBuildTimeValidation` gains one check — if the config
object has a `breakpoints` key but no `defineBreakpoints()` export was found,
warn that breakpoint names will not be type-checked. That is the one silent-DX
cliff this design can produce, and it is exactly the class of typo that function
already exists to catch.

**Not done at build time:** validating ladder *values* (a `0` stop, uniqueness).
The codegen sees the AST, not evaluated values, so coverage would be partial —
literal ladders checked, computed ones silently skipped. Partial validation that
looks total is worse than none, so this stays a runtime throw (§11).

## 11. Error handling

- **Invalid ladder** (empty, no `0` stop, duplicate values): throws at
  `initialize`, naming the offending config key. Boot failure beats a silently
  wrong ladder, which is far more expensive to debug.
- **Unknown name** in `is` / `atLeast` / `below` / `between` / `onEnter`:
  returns `false` (or a connection that never fires) and logs a dev-only
  `Logger.warn`. Names may legitimately be `define`d later, so throwing is wrong
  here.
- **Throwing predicate** in a mode: caught, treated as `false`, logged once per
  name per session so a resize drag cannot flood the console.
- **No `matchMedia`** (non-browser or old environment): `pointer` falls back to
  `'fine'`; everything else works.
- **Zero-size renderer** (pre-first-resize): evaluates against `{0, 0}`,
  yielding the lowest tier and `portrait`. Real values arrive on first resize.

## 12. Testing

`BreakpointPlugin.test.ts`, vitest, against the pure functions in `evaluate.ts`
— no app, no renderer, no DOM:

1. **Tier resolution** — each stop and each boundary exactly
   (767/768/1023/1024); custom ladders; unsorted key order.
2. **`atLeast`/`below` complementarity** — `atLeast(n) === !below(n)` across a
   sweep of widths and every named stop.
3. **`between`** — inclusive lower, exclusive upper.
4. **`value()` cascade** — exact hit, falls down, falls to lowest when nothing
   below, single-entry map, empty map returns `undefined`.
5. **`matches()`** — each key alone, keys AND-ed, predicate form, throwing
   predicate treated as `false`. Explicitly: `tier` in both single and array
   form, and `atLeast`/`below` given a tier name resolving identically to that
   tier's stop as a raw number.
6. **Diffing** — `entered`/`left` correct across a tier change, an orientation
   change, a mode flip, and a no-op resize inside one tier (which must produce
   an empty diff).
7. **Ladder validation** — each invalid shape throws.

Plugin-level wiring (signal priority, `postInitialize` evaluation) gets one
integration test on the existing `Plugin.test.ts` harness, asserting that a
`'normal'`-priority `app.onResize` listener observes the updated `bp.current`.

Codegen gets a manual check: add a `defineBreakpoints` block to
`apps/kitchen-sink/caper.config.ts`, run the dev server, and confirm the emitted
`caper-app.d.ts` carries both `Breakpoints` and `BreakpointModes`, that
`bp.is('…')` autocompletes the kitchen-sink tier *and* mode names, and that
`bp.value({ … })` rejects a mode name as a key.

## 13. Rollout

Additive and inert: the default ladder costs one evaluation per resize and
nothing else until something queries it. No existing app changes behaviour.

The plugin ships complete when `apps/kitchen-sink` demonstrates it — a scene
that declares tiers and modes in config, uses `bp.value()` for a column count,
and `bp.when()` for a stacked/side-by-side switch. That doubles as the codegen
check in §12 and as caper's worked example for the feature.
