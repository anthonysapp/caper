# `@caperjs/solid` — declarative composition for Caper (design doc)

Status: **draft for review** · 2026-08-21
Evidence: working prototype in `apps/kitchen-sink/src/prototypes/solid-jsx/` (throwaway, uncommitted) + research note `research/pixi-react-declarative-caper.md`.

## What this is

An optional SolidJS view layer for Caper: any `Container` subclass may declare its
members by returning JSX from a `compose()` method. Solid's universal renderer
(`createRenderer` from `solid-js/universal` — a documented API, unlike React's
reconciler) mounts that tree into the container **once**; signals do every update
after that, fine-grained, no VDOM, no re-render.

The mental model, one sentence: **`compose()` declares what exists, signals say
when state changed, `update()` moves things every frame.**

```tsx
class HealthBar extends ComposableContainer {
  private health = createSignal(100);
  damage(n: number) { this.health[1]((hp) => Math.max(0, hp - n)); }
  compose() {
    const hp = this.health[0];
    return (
      <container>
        <graphics draw={BAR_BG} />
        <graphics draw={BAR_FILL} scale={{ x: hp() / 100, y: 1 }} />
        <text text={`${hp()} HP`} anchor={0.5} x={W / 2} y={H / 2} />
      </container>
    );
  }
}
```

## What it genuinely solves (and doesn't)

Solves — each one a whole category of today's UI boilerplate:

1. **State→view plumbing.** `text={purse()}` replaces signal-handler-find-node-set-value-cleanup chains.
2. **Dynamic child management.** `<For>`/`<Show>` replace hand-tracked child arrays and their leak/ordering bugs.
3. **Disposal correctness.** Solid's ownership tree tears down children and subscriptions on unmount.
4. **Legible, statically-analyzable structure** — one expression per screen; pays off for agents and a future editor.

Does **not** solve: gameplay simulation, animation feel, physics, perf. `update()`
code neither shrinks nor changes. This is a UI-and-composition win only, and the
API is deliberately additive — imperative Caper is unchanged and always available.

## The contract (proven in the prototype)

- **Mount-once:** `compose()` runs the first time the container hits the stage
  (`added()`); the Solid root is disposed in `destroy()`. Re-adding does not remount.
- **Coexistence:** `initialize()`, `added()`, `update()`, `this.add.*` all keep
  working. Rule: never imperatively remove/reparent children JSX created.
- **Nesting:** a composed tree can contain classes with their own `compose()`;
  Pixi's `added` event chains the mounts. Verified: scene → HealthBar.
- **Lifecycle for free:** a JSX-mounted Caper object with `autoUpdate: true` ticks
  with zero bridge code, because Caper wires lifecycle off Pixi's `added` event.
  Verified: `Orbiter` (imperative `update()`, circular motion) mounted via JSX.
- **Instance-field signals** bridge the two worlds: imperative methods write them,
  `compose()` reads them (`bar.damage(15)` → readout updates).
- **Frame logic in components:** `useTick(fn)` + refs = `update()` for function
  components. Per-frame signals are legal but are the seasoning, not the meal.
- **Each `compose()` is its own Solid root.** Signals cross roots fine; Solid
  *context* does not cross the class boundary — pass props or instance fields.

## Performance evidence

Stress section: N graphics dots, each with one per-frame reactive binding
(`y` derived from a shared time signal). Headless Chromium (SwiftShader,
no vsync — floor numbers, not real hardware): **100 dots ≈ 70 fps,
500 ≈ 62–70, 2000 ≈ 50–58**. Conclusion: event-rate UI binding is free;
hundreds of per-frame bindings are fine; bulk per-frame motion still belongs
in `update()` loops. Re-measure on real hardware before quoting numbers.

## Package shape

`packages/plugin-solid` → npm `@caperjs/solid`. **Core stays Solid-free.**

Exports:
- The universal-renderer runtime (the 12 functions `babel-preset-solid`'s
  universal mode imports: `render, effect, memo, createComponent, createElement,
  createTextNode, insertNode, insert, spread, setProp, mergeProps, use`).
- `Composable(Base)` mixin (matching core's mixin idiom) plus prebuilt
  `ComposableContainer` / `ComposableScene`.
- `asComponent(Ctor, defaults?)` — lift any display class into JSX. Constructs
  once (untracked), applies reactive props via `spread`. Must pass `skipChildren`
  when no JSX children are given, or Solid's children pass wipes the class's own.
- `useTick(fn)` — `app.ticker.add` + `onCleanup`.
- Catalog: `container, sprite, text, graphics` (raw Pixi) + `flexContainer`
  (Caper). Grow deliberately; `asComponent` covers the long tail.
- `jsx.d.ts` shipping the `CaperJSX` namespace types.

Build integration: `caper({ solid: true })` in the vite preset adds
`vite-plugin-solid` (`generate: 'universal'`, `moduleName: '@caperjs/solid'`,
`hot: false`, include `**/*.tsx`). Peer deps: `solid-js ^1.9`, `pixi.js`,
`@caperjs/core`.

Constraints to document:
- Scene files in `src/scenes/` are parsed by discovery with `jsx: false` — the
  scene's `compose()` returns `SceneView(this)` from a sibling `.tsx`. (Or:
  teach `build/internal/ast.mjs` to parse JSX — revisit.)
- tsconfig needs `"jsx": "preserve"` + `"jsxFactory": "CaperJSX.h"`. The factory
  name is a **type-lookup root only** (vite-plugin-solid does the real compile);
  it exists because transitive `@types/react` shadows any global `JSX` namespace,
  and `jsxImportSource` only works in `react-jsx` mode. `caper doctor` should
  check both settings when solid is enabled.

## Animation (GSAP, already a peer dep)

Vocabulary rule (Anthony, 2026-08-22): this surface uses **animate/animated**,
matching core's `Animated` mixin — the word "tween" appears nowhere in the API.

Three layers, adopted in this order:

1. **`animated(source, opts?)`** — a gliding signal. Wraps a numeric accessor;
   the returned accessor follows it smoothly (GSAP `quickTo` retargeting under
   the hood). `scale={{ x: animatedHp() / 100 }}` and the bar glides on damage.
   Ships in v1.
2. **`<AnimatedShow when enter exit>`** — enter/exit for conditional UI (popups,
   panels, toasts). Holds the node mounted until the exit animation completes,
   then unmounts. Ships in v1.
3. **Auto-animated element props** (`animate={{...}}` making plain prop changes
   glide) — deliberately deferred; maximal magic, revisit only if 1+2 leave a gap.

One-shot effects (shake, pulse) stay imperative via refs — every Caper container
in JSX still carries the `Animated` mixin, so `bar.shake()` already works.

## Sharp edges found (productize these)

1. **Text swallows sibling clicks** (plain Pixi gotcha): a hit-testable,
   non-interactive `Text` over a button aborts hit-testing. The renderer should
   default `text` elements to `eventMode: 'none'` unless event props are present.
2. **FlexContainer measures too early**: Solid inserts a node *then* sets props;
   `@pixi/layout` caches the empty-text size (throttled 100ms intrinsic pass +
   caper runs layout with `autoUpdate: false`) and scales the child to ~0. The
   prototype's renderer drives the re-measure pass directly; the real fix may be
   a seam in core's `FlexContainer` (it currently assumes children are fully
   configured before parenting). Decide before shipping.
3. **Animating Pixi objects goes through GSAP's PixiPlugin**, which core's
   `GSAPPlugin` already registers at bootstrap (`GSAPPlugin.ts:397-399`):
   target properties live in a `pixi: {...}` vars block and `scale`/`position`
   ObservablePoints Just Work. `AnimatedShow` uses this (an earlier proxy
   workaround was deleted once Anthony pointed at PixiPlugin). `animated()`
   is unaffected — it eases a plain number feeding a signal, no Pixi target.
   (Also at absorb time: `Composable.ts`'s declaration-merging trick trips
   `no-unsafe-declaration-merging` — the packaged version needs a lint-clean
   typing, e.g. an interface the mixin owns.)
4. **`draw` functions must be stable references.** Solid batches an element's
   dynamic props into one `!==`-guarded effect; an inline `draw={dot(3)}` in a
   per-frame-reactive element allocates a fresh closure every frame and forces a
   full redraw of every such node. Authoring rule for docs + skill; consider a
   lint.

## Open questions (for Anthony)

1. Package name: `@caperjs/solid`? (Assumed above.)
2. Should `compose()` eventually live on core `Container` behind a registration
   seam (core stays dependency-free, `@caperjs/solid` plugs in the mounter), or
   is the subclass/mixin (`ComposableContainer`) good enough long-term?
3. First real consumer: migrate one kitchen-sink UI screen (or a bankshot popup)
   to `compose()` as the acceptance test?
4. Real-hardware stress numbers: worth capturing before committing to guidance?

## Relation to the visual editor

An editor edits **data**, not JSX. The serializable "blueprint" tree idea remains
the editor's foundation; it can share prop shapes with the JSX catalog so the two
converge instead of competing. Out of scope here.

## Prototype disposition

When this doc is approved: absorb the renderer/`Composable`/`asComponent` into
`packages/plugin-solid` (with tests: mount-once, dispose, nesting, asComponent
skipChildren, text eventMode default, flex re-measure), then delete
`apps/kitchen-sink/src/prototypes/solid-jsx/` and rewrite the demo scene as a
real consumer of the package. If rejected: delete the prototype folder, the vite
config block, the tsconfig keys, and the two deps; keep this doc as the record.
