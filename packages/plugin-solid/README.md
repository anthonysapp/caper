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

`caper({ solid: true })` in the vite preset arrives in a later release. Until
then, add `vite-plugin-solid` yourself — see the config in
[plan/solid-compose-design.md](../../plan/solid-compose-design.md)
(`generate: 'universal'`, `moduleName: '@caperjs/solid'`, `hot: false`, and an
`include` covering `**/*.tsx`).
