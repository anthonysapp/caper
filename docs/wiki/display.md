# Display: Container, Scene & Entities
> Part of the Caper core wiki. Index: [Home](Home.md)

## Purpose

`packages/core/src/display/` is the base display-object layer Caper builds on top of Pixi's
`Container`. It defines the one class every visible thing in a Caper app ultimately extends
(`Container`), the two conventional specializations game code touches most
(`Scene`, `Entity`), a viewport/world scroll-and-zoom helper (`Camera`), the hook point for
scene-swap overlays (`SceneTransition`), and a handful of thin Pixi-class wrappers
(`AnimatedSprite`, `ParticleContainer`, `SpineAnimation`, `Svg`) that add Caper-flavored
conveniences to specific Pixi renderables. Two of those wrappers (`ParticleContainer`,
`SpineAnimation`) live in this folder but deliberately do **not** extend `Container` — see
Invariants & gotchas.

## Interface (what callers must know)

### Lifecycle hooks on `Container` (packages/core/src/display/Container.ts:37-58)

All hooks are no-ops by default ("meant to be overridden by subclasses" per the source
comments); nothing enforces that a subclass overrides them.

| Hook | Fired when | Notes |
|---|---|---|
| `added()` | Pixi's native `'added'` event — this instance was just attached to a parent (`Container.mjs:357`, `child.emit('added', this)`) | Wrapped by a private `_added` (Container.ts:203-212) that first wires auto-resize/auto-update, *then* calls the public `added()`. |
| `removed()` | Pixi's native `'removed'` event, mirror of `added()` | Wrapped by `_removed` (Container.ts:214-224), which tears down the same wiring first. |
| `childAdded(child)` / `childRemoved(child)` | Pixi's native `'childAdded'` / `'childRemoved'` events — **this** container gained/lost a direct child (`Container.mjs:356,405`) | Also forwarded to the static, app-wide `Container.onGlobalChildAdded` / `onGlobalChildRemoved` signals (Container.ts:81-90) — a tree-observation seam, see below. |
| `resize(size?)` | `app.onResize` signal, only if `ContainerConfig.autoResize` (default `true`) | Connected/disconnected in `_added`/`_removed` at the instance's configured `SignalOrder` priority. |
| `update(ticker?)` | `app.ticker`, only if `ContainerConfig.autoUpdate` (default **`false`** on `Container`) | Connected with priority `-999999` in `_added`. |
| `destroy(options?)` | Caller-initiated | Kills all gsap animations tagged with `this.animationContext` (`app.animation.killAll`), removes the ticker callback if `autoUpdate`, emits `onDestroy`, then `super.destroy()` — which cascades through the `WithSignals` mixin (disconnects all `signalConnections`) into Pixi's own destroy. |

### What subclassing each base gives you

- **`Container`** (packages/core/src/display/Container.ts:64) — the deep base. Extends
  `Animated(WithSignals(Factory()))`, so every instance gets: `this.add.*` / `this.make.*`
  factory constructors (Factory mixin, packages/core/src/mixins/factory/Factory.ts),
  `this.animate` / `shake` / `pulse` / `bob` / animation signals (Animated mixin,
  packages/core/src/mixins/animated.ts), `addSignalConnection` / `connectSignal` /
  `connectAction` with auto-disconnect on destroy (`WithSignals`, packages/core/src/mixins/signals.ts),
  an `app` getter (`Application.getInstance()`), an `animationContext` string for scoping
  gsap kills, and `addColoredBackground()`.
- **`Scene<Props>`** (Scene.ts:123) extends `Container`, forcing
  `{ autoResize: true, autoUpdate: true, priority: 'highest' }` in its `super()` call
  (Scene.ts:158). Adds `id`, `label`, `props` (typed via the generic), `assets`,
  `autoUnloadAssets`, and a named lifecycle (`initialize` / `enter` / `start` / `exit` /
  `onPause` / `onResume`) that is **not** driven by Pixi events at all — it's driven
  externally by `SceneManagerPlugin` (see Lifecycle & data flow). `animationContext`
  defaults to `` `__scene_${id}` `` if never set explicitly (Scene.ts:150-152).
- **`Entity<Props>`** (Entity.ts:42) extends `Container` and adds nothing but typed prop
  storage: `this.props` is assigned in the constructor. It is a *convention*, not a
  requirement — `this.add.entity(id, props)` works with any class taking a single options
  object, per the file's own doc comment.
- **`Camera`** (Camera.ts:59) extends `Container` with `{ isRenderGroup: true }` only — so
  `autoUpdate` stays at `Container`'s default (`false`). It parents one child, `config.container`
  (the actual scrollable/zoomable world), and exposes `follow` / `pan` / `zoom` /
  `update()`. Because `autoUpdate` is off, **nothing calls `camera.update()` for you** —
  a scene must call it every frame itself.
- **`SceneTransition`** (SceneTransition.ts:15) extends `Container` with
  `{ autoResize: true, autoUpdate: false, priority: -9999 }`, wires `app.assets`'
  load-progress signals to `handleLoadStart/Progress/Complete` in its constructor, and
  exposes its own `initialize` / `enter` / `exit` lifecycle — driven by `SceneManagerPlugin`
  during a scene swap, independently of the two scenes' own `enter`/`exit`.
- **`ParticleContainer`** (ParticleContainer.ts:36) extends **`PIXI.ParticleContainer`
  directly**, not Caper `Container`. It hand-duplicates a smaller version of the same
  pattern (its own `onDestroy` signal, `app` getter, `added`/`removed` wiring, ticker
  auto-update) but has none of `Factory`/`Animated`/`WithSignals` — no `this.add`,
  `this.make`, `this.animate`, or `addSignalConnection`.
- **`SpineAnimation<ANames>`** (SpineAnimation.ts:30) extends `WithSignals(Factory())`
  directly — skips `Animated` and skips `Container` entirely, so it has no
  `resize`/`update`/`animationContext`/`onDestroy`/auto-resize/auto-update config. It gets
  only `this.add`/`this.make` and signal connections, plus its own Spine-specific
  animation-state signals (`onAnimationStart`, `onAnimationComplete`, etc.) driven by a
  Spine `AnimationStateListener`.
- **`AnimatedSprite`** (AnimatedSprite.ts:15) extends `PIXI.AnimatedSprite` directly. Adds a
  named-animation registry (`Map<string, Texture[]>` built from a Caper-style `animations`
  config prop plus a texture-prefix/zero-pad naming convention), reverse-animation
  variants, and lifecycle signals (`onAnimationStart/Stop/Loop/Complete/FrameChange`).
- **`Svg`** (Svg.ts:3) extends `PIXI.Graphics`. Nine lines: builds/looks up a
  `GraphicsContext` and centers the pivot on `getLocalBounds()`.

## Module map

| File | Responsibility | Key exports |
|---|---|---|
| `Container.ts` | Deep base for all Caper display objects: mixin composition, lifecycle wiring, colored background helper | `Container`, `IContainer`, `ContainerConfig`, `ContainerConfigKeys`, `BackgroundConfig` |
| `Scene.ts` | Per-screen unit with an externally-driven lifecycle and asset/props contract | `Scene`, `IScene`, `SceneConfig`, `SceneAssets`, `ScenePlugins`, `SceneDebug`, `SceneListItem` |
| `Entity.ts` | Convention base for factory-discovered entities (typed props only) | `Entity` |
| `Camera.ts` | World-scroll/zoom controller + pointer/keyboard drag controller | `Camera`, `ICamera`, `CameraController` |
| `SceneTransition.ts` | Base class for scene-swap overlay animations, driven by `SceneManagerPlugin` | `SceneTransition`, `ISceneTransition` |
| `AnimatedSprite.ts` | Named-animation-set sprite (Pixi `AnimatedSprite` + registry/signals) | `AnimatedSprite` |
| `ParticleContainer.ts` | Perf-oriented sibling to `Container` for large sprite batches | `ParticleContainer`, `IParticleContainer`, `ParticleContainerConfig` |
| `SpineAnimation.ts` | Spine skeletal-animation wrapper with Caper factory/signals | `SpineAnimation`, `ISpineAnimation` |
| `Svg.ts` | Pivot-centered `Graphics` wrapper for SVG-derived contexts | `Svg` |
| `index.ts` | Barrel re-export of the whole subsystem | `export *` of all of the above |

## Lifecycle & data flow

**Scene lifecycle is not internal to this subsystem — it's driven by
`packages/core/src/plugins/SceneManagerPlugin.ts`.** `Scene` only defines the hook names
and their default no-op bodies; the plugin's task queue calls them in order:

1. `_createCurrentScene` — constructs the `Scene` subclass, then assigns `id`, `props`
   (from the pending `loadScene(id, props)` call), `assets`, `autoUnloadAssets`, and
   `label` directly onto the instance (SceneManagerPlugin.ts:379-416) — all **before**
   the scene is added to the display tree.
2. Preload assets — `_loadCurrentScene` awaits `app.assets.loadSceneAssets(currentScene)`
   for anything in `scene.assets.preload`.
3. The scene is added to the stage (Pixi's native `'added'` event fires → `Container`'s
   `_added` wires auto-resize/auto-update, since `Scene`'s constructor forced both `true`).
4. `initialize()` is called explicitly by the plugin's queue (`_initializeCurrentScene`) —
   build the display tree here.
5. `enter()` — the plugin awaits the returned promise/tween before continuing.
6. `start()` — begin gameplay loops, timers, signal subscriptions.
7. `update(ticker)` / `resize(size)` fire per-frame / per-viewport-change via the
   auto-update/auto-resize wiring from step 3 — no explicit driving needed.
8. `onPause(config)` / `onResume(config)` — forwarded from `app.onPause`/`app.onResume`,
   connected once in `SceneManagerPlugin.initialize()` (SceneManagerPlugin.ts:182-183),
   not per-scene.
9. On a scene swap: `_exitLastScene` awaits the old scene's `exit()`, then
   `_destroyLastScene` removes it from the view and calls `destroy()`
   (SceneManagerPlugin.ts:432-448). If a transition is configured
   (`app.config.sceneTransition`, SceneManagerPlugin.ts:167-168), its own
   `initialize`/`enter`/`exit` are interleaved with the two scenes'.

**Resize/update propagation through the tree is opt-in per instance, not cascaded.**
`Container` does not walk its own children to call `resize`/`update` on them — each
`Container` (or `Scene`) independently subscribes to `app.onResize` / `app.ticker` in its
own `_added`, keyed off Pixi's native per-instance `added` event. A `Container` built with
default config (`autoResize: true, autoUpdate: false`) will re-layout on resize but will
never tick unless a subclass passes `autoUpdate: true` or the container is a `Scene`.
Pixi's render loop still walks the whole scene graph regardless — this is only about the
*hook calls*, not rendering.

**Camera is a manual-update exception.** Its config only sets `isRenderGroup: true`, so
`autoUpdate` stays `false` — nothing calls `camera.update()` automatically. A scene that
owns a `Camera` must call `camera.update()` from its own `update()` override, typically
alongside a `CameraController` (Camera.ts:280) translating pointer drag / arrow keys /
`+`/`-` into `camera.pan()` / `camera.zoom()` calls.

**Global tree observation seam.** `Container.onGlobalChildAdded` /
`onGlobalChildRemoved` (static signals, Container.ts:81-90) fire for every `Container`
subclass instance's child add/remove across the whole app — a way for framework tooling
(automation bridge, devtools) to observe the tree without recursively walking it.

## Seams & extension points

- **`I*` interfaces** (`IContainer`, `IScene`, `ICamera`, `IParticleContainer`,
  `ISceneTransition`, `ISpineAnimation`) are the documented caller contract, kept separate
  from the concrete class so call sites can type against the interface rather than the
  Pixi-heavy implementation.
- **`ContainerConfig`** (`{ autoResize, autoUpdate, priority }`, Container.ts:15-23) is the
  seam for opting an instance in/out of the `app.onResize` / `app.ticker` wiring. It's
  passed once to `super()` in the constructor — not reconfigurable afterward.
- **`animationContext`** (Container.ts:71-77, overridden in Scene.ts:150-155) is the seam
  for gsap animation scoping: tag a tween with a context id (or rely on the container's
  own default) and `destroy()` kills every animation in that context via
  `app.animation.killAll(this.animationContext)` — no manual tween bookkeeping needed.
- **`Factory()`'s `extensions` parameter** (packages/core/src/mixins/factory/Factory.ts:15-16)
  is the seam for adding custom `this.add.*` / `this.make.*` methods per class. Extensions
  are merged into a **copy** of the shared default table (`Object.assign({}, getDefaultFactoryMethods(), extensions)`)
  so one class's extensions can't leak into another `Factory()` consumer.
- **`SceneTransition`** is itself an extension point: subclass it, wire it up via
  `app.config.sceneTransition`, and `SceneManagerPlugin` will call your `initialize` /
  `enter` / `exit` around every scene swap. Its constructor connects `handleLoadStart`
  / `handleLoadProgress` / `handleLoadComplete` to `app.assets`' matching signals, so
  `progress` tracks asset loading automatically.
- **`addColoredBackground()`** (Container.ts:115-153) is a convenience seam for any
  `Container`/`Scene` that needs a full-bleed background sprite with optional
  auto-resize, without hand-building one via `this.add.sprite`.

## Invariants & gotchas

- **Always call `super.destroy()`** when overriding `destroy()` on `Scene`,
  `SceneTransition`, or `SpineAnimation` — skipping it leaks ticker callbacks, signal
  connections, and/or gsap animations. All three explicitly document this; it is the most
  likely way to introduce a memory leak in a subclass.
- **`ParticleContainer` and `SpineAnimation` are not `Container` subclasses**, despite
  living in this folder and looking similar. Don't assume `instanceof Container` for
  either. `SpineAnimation` in particular has no `resize`, `update`, `animationContext`,
  `onDestroy`, or auto-resize/auto-update config at all.
- **Default `autoUpdate` differs between the two "container" classes**: `Container`
  defaults `autoUpdate: false` (Container.ts:23) but `ParticleContainer` defaults it to
  `true` (ParticleContainer.ts:18) — an easy asymmetry to miss if you assume they behave
  the same by default.
- `Container.resize()` / `update()` are no-ops with a doc-comment asking subclasses to
  override them, but nothing enforces it — a `Scene` that forgets to override `resize()`
  silently does nothing on viewport change.
- `SpineAnimation` reads a global `window.Spine` runtime (SpineAnimation.ts:81) rather than
  an imported module — it assumes something else (a plugin) has already put `Spine` on
  `window` before this class is constructed.

## Recipes

**Create a new Scene**
```ts
import { defineScene, Scene } from '@caperjs/core';

export const scene = defineScene({ id: 'menu', assets: { preload: { bundles: ['ui'] } } });

export default class MenuScene extends Scene {
  initialize() { this.add.text({ text: 'Play', anchor: 0.5 }); }
  start() { /* begin gameplay loop */ }
  resize(size) { /* re-layout */ }
  destroy() { super.destroy(); }
}
```
Prefer `caper add scene` to scaffold this. Discovery is automatic via the Vite plugin
walking `src/scenes/`; `defineScene` (or standalone `export const id`/`assets`) gives it a
stable id.

**Create a reusable Entity**
```ts
import { defineEntity, Entity } from '@caperjs/core';

type ActorProps = { color?: number; x?: number; y?: number };
export const entity = defineEntity({ id: 'actor' });

export default class Actor extends Entity<ActorProps> {
  added() {
    this.x = this.props.x ?? 0;
    this.y = this.props.y ?? 0;
    this.add.graphics().circle(0, 0, 50).fill(this.props.color ?? 0xffffff);
  }
}
```
Call it from a scene with `this.add.entity('actor', { color: 0xff0000, x: 50, y: 100 })`.

**Custom scene transition**
```ts
import { SceneTransition } from '@caperjs/core';

export class WipeTransition extends SceneTransition {
  async enter() { /* animate overlay in, resolve when done */ }
  async exit() { /* animate overlay out, resolve when done */ }
}
```
Register it as `app.config.sceneTransition`; `SceneManagerPlugin` instantiates and drives
it automatically around every scene swap.

**Wire a Camera into a Scene**
```ts
initialize() {
  const world = this.make.container();
  this.camera = this.add.existing(new Camera({ container: world, worldWidth: 4000, worldHeight: 2000 }));
  this.controller = new CameraController(this.camera, this.camera);
}
update(ticker) { this.camera.update(); }
destroy() { this.controller.destroy(); super.destroy(); }
```
`Camera.update()` is never called automatically — drive it from the owning `Scene`'s own
`update()`.

**Opt a Container into per-frame ticking**
```ts
class Meter extends Container {
  constructor() { super({ autoUpdate: true, autoResize: true, priority: 'highest' }); }
  update(ticker) { /* runs every frame while attached to the stage */ }
}
```
`ContainerConfig` is set once at construction; there is no supported way to flip
`autoUpdate`/`autoResize` on an already-constructed instance.
