# @caperjs/solid

A declarative [SolidJS](https://www.solidjs.com/) view layer for Caper. Any
`Container` subclass may declare its members by returning JSX from a `compose()`
method; Solid's universal renderer mounts that tree into the container **once**,
and signals do every update after that — fine-grained, no VDOM, no re-render.
It is purely additive: imperative Caper (`this.add.*`, `added()`, `update()`)
keeps working exactly as before.

## Install

```sh
pnpm add @caperjs/solid solid-js
```

## tsconfig contract

Three settings, and all three are required:

```jsonc
{
  "compilerOptions": {
    // Leave the JSX alone — vite-plugin-solid does the real compilation.
    "jsx": "preserve",
    // Names the *type* lookup root for JSX. Nothing called `CaperJSX.h` ever
    // runs; it exists because a transitive `@types/react` shadows any global
    // `JSX` namespace, and `jsxImportSource` only applies in `react-jsx` mode.
    "jsxFactory": "CaperJSX.h",
    // Ships that `CaperJSX` namespace: the intrinsic elements and their props.
    "types": ["@caperjs/core/client", "@caperjs/solid/jsx"]
  }
}
```

`caper doctor` checks all three whenever the app depends on `@caperjs/solid`,
and prints the exact keys that are missing. It reads the app's own
`tsconfig.json` — settings inherited through `extends` are not followed, so keep
these three in the app's file.

## Compose

```tsx
import { ComposableContainer, type Composes } from '@caperjs/solid';
import { createSignal } from 'solid-js';

export class HealthBar extends ComposableContainer implements Composes {
  private health = createSignal(100);

  /** Imperative API — an ordinary method that happens to write a signal. */
  public damage(amount: number) {
    this.health[1]((hp) => Math.max(0, hp - amount));
  }

  public compose() {
    const hp = this.health[0];
    return (
      <container>
        <graphics draw={BAR_BG} />
        <graphics draw={BAR_FILL} scale={{ x: hp() / 100, y: 1 }} />
        <text text={`${hp()} HP`} anchor={0.5} x={WIDTH / 2} y={HEIGHT / 2} />
      </container>
    );
  }
}
```

`compose()` runs the first time the container hits the stage, and the Solid root
is disposed in `destroy()`. Re-adding does not remount. The rule of thumb:
**`compose()` declares what exists, signals say when state changed, `update()`
moves things every frame.**

Intrinsic elements are `container`, `sprite`, `text`, `graphics` and
`flexContainer`. For anything else, `asComponent(Ctor, defaults?)` lifts an
existing display class into JSX — it constructs the instance once and applies
props reactively:

```tsx
const Orbiter$ = asComponent(Orbiter);
<Orbiter$ x={40} y={80} ref={(el: Orbiter) => (this.orbiter = el)} />;
```

`useTick(fn)` runs `fn` every frame for the lifetime of the owning component —
`update()` for function components.

## Animation

`animated(source, opts?)` returns a **gliding** accessor: it reads like any other
signal, but eases toward its source instead of snapping to it. The binding stays
declarative — nothing in the view knows an animation is running.

```tsx
const width = animated(() => hp() / 100); // opts: { duration, ease }
<graphics draw={BAR_FILL} scale={{ x: width(), y: 1 }} />;
```

`<AnimatedShow>` is `<Show>` that holds its children on stage until the exit
animation finishes, so popups and panels can leave gracefully:

```tsx
<AnimatedShow when={open} exit={{ pixi: { alpha: 0, y: 20 }, duration: 0.3 }}>
  <container>…</container>
</AnimatedShow>
```

`enter` / `exit` are plain GSAP vars; target properties live in a `pixi: {...}`
block, which is GSAP's PixiPlugin — caper's `GSAPPlugin` registers it at app
bootstrap, so inside a running app there is nothing to wire up. Both APIs must be
called inside a reactive owner (a component body or a `compose()`).

One-shot effects (shake, pulse) stay imperative through a ref: every Caper
container carries the `Animated` mixin already.

## Authoring rules

Six rules. The first is the mental model; the rest are the edges that bite.

1. **Signals for event-rate state, `update()` for per-frame bulk motion.**
   `text={purse()}` on a value that changes when the player does something is
   free. Hundreds of per-frame bindings are fine too, but moving a crowd of
   objects every frame still belongs in an imperative `update()` — or in
   `useTick(fn)` + a `ref` when the code lives in a function component. Per-frame
   signals are the seasoning, not the meal.

2. **`draw` functions must be stable references.** Solid batches an element's
   dynamic props into one `!==`-guarded effect, so an inline
   `draw={dot(3, color)}` allocates a fresh closure on every change of *any* prop
   in that batch and forces a full `clear()` + redraw. Hoist the factory result
   to a module constant (or a `createMemo`) and pass the same function every
   time.

3. **Never imperatively remove or reparent a child JSX created.** Solid owns
   those nodes and will try to move or dispose them later. Imperative work
   alongside a composed tree is fine — `initialize()`, `this.add.*`, `update()`
   all keep working, and `compose()` appends rather than taking over — it just
   must not reach into the declarative half.

4. **Each `compose()` is its own reactive root.** Signals cross roots fine, so
   instance fields are the bridge between a class's imperative API and its view.
   Solid **context** does not cross the class boundary — pass props or read an
   instance field instead.

5. **`text` elements default to `eventMode: 'none'`.** A hit-testable but
   non-interactive label sitting over a button would otherwise swallow the tap.
   Attaching an `on*` prop flips the element to `'static'` automatically, and an
   explicit `eventMode` prop overrides the default.

6. **One-shot effects stay imperative.** Shake, pulse and friends are a `ref`
   away: a Caper container mounted from JSX still carries the `Animated` mixin,
   so `bar.shake()` works unchanged. Reserve `animated()` / `<AnimatedShow>` for
   motion that is a function of state.

## Testing your components

Vitest resolves `solid-js` to its **server** build by default, where signals set
once and never update again. Force the reactive build in your app's
`vitest.config.ts` (this package's own config does the same):

```ts
export default defineConfig({
  // Externalized deps are resolved by node, so the conditions only take effect
  // once solid is inlined — both halves are needed.
  resolve: { conditions: ['development', 'browser'] },
  test: { server: { deps: { inline: [/solid-js/] } } },
});
```

## Build wiring

One flag in the app's vite config:

```ts
import { caper } from '@caperjs/core/vite';

export default defineConfig({
  plugins: [caper({ solid: true })],
});
```

The preset resolves `@caperjs/solid/vite` from the **app's** `node_modules`, so
the app needs `@caperjs/solid` and `solid-js` installed; `vite-plugin-solid`
comes with this package and never has to be installed by hand. Pass an object to
narrow what gets compiled as JSX: `caper({ solid: { include: ['src/ui/**/*.tsx'] } })`
(default `['**/*.tsx']`).

Outside the preset — a bare vite config, or a vitest config that has to compile
JSX — use the plugin directly:

```ts
import { caperSolid } from '@caperjs/solid/vite';

export default defineConfig({ plugins: [caperSolid()] });
```
