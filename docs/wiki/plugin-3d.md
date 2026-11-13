# 3D (`@caperjs/plugin-3d`)

> **Navigation aid.** `path:line` references mean "near here"; refresh them when you touch the code.
> Package is **experimental** while `@pixi/3d` remains in beta (exact pin `0.1.0`).

## Purpose

Let a Caper game drop a lit 3D scene into an existing 2D game without relearning Pixi: one plugin
id in `plugins: [...]`, `this.add.view3d`, a 3D factory on the view (`view.add.model`, …),
scene pause/resize/time scale that match 2D, and `.glb` assets through the normal manifest.

`@pixi/3d` must register renderer extensions **before** `app.init`. Caper's normal plugin phase
runs too late (see [plugins-architecture.md](plugins-architecture.md#ordering-guarantees)), so
this package is a **pre-renderer** plugin: importing it statically loads `@pixi/3d` before the renderer, and `initialize`
registers `this.add.view3d` via `registerFactoryMethods`. Opt-in only — games without `'3d'` pay
no bytes and no behavior change.

Consumer-facing summary: `packages/plugin-3d/README.md`. Before writing `@pixi/3d` code, load the
`pixijs-3d` skill: the upstream API is new and differs from Three.js and from the old `pixi3d` package.

## Interface

### Config

```ts
// caper.config.ts
plugins: ['3d'],
// or
plugins: [['3d', { options: { quality: 'auto' } }]],
```

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `quality` | `'auto' \| 'low' \| 'high'` | `'auto'` | Default shadow tier and resolution cap for new views (`packages/plugin-3d/src/quality.ts`). |

Pre-renderer rules (same as any `phase: 'pre-renderer'` plugin): cannot use `autoLoad: false`,
cannot be listed on a scene's `plugins`, cannot `require` a normal-phase-only plugin. Validation
lives in `packages/core/src/core/config.ts` (`getPreRendererPlugins`).

### Plugin

- **Id:** `3d`
- **Accessor:** `app.getPlugin<Plugin3D>('3d')`.
- **Class:** `Plugin3D` (`packages/plugin-3d/src/Plugin3D.ts`) — package import loads `@pixi/3d`; `initialize`:
  `registerFactoryMethods({ view3d })`; `postInitialize`: `assertRenderer3D(renderer)` for Canvas /
  WebGL1 / late-load.

### View and 3D factory

```ts
const view = this.add.view3d({
  environment: { skyColor: 0xbcd4f0, groundColor: 0x6b6250, intensity: 0.7 }, // default fill; null disables
  camera: { position: [0, 1.5, 4], lookAt: [0, 0, 0], fitAspect: 16 / 9 },
  interactive: true,                  // 3D picking + full-rect hit target
  // width / height omitted → full screen, auto-placed for Caper scene origin
});

const hero = view.add.model({ asset: 'robot', y: 0 });
view.add.light({ type: 'directional', intensity: 2, castShadow: true });
view.add.mesh({ geometry: 'box', color: 0xe85d5d });
hero.play('Walking');
```

`View3D` (`packages/plugin-3d/src/View3D.ts`) subclasses Pixi's `View3D` with Caper lifecycle and
signals. **It is the raw view** — `root`, `camera`, `worldToScreen`, `environment`, etc. are the
upstream members, not a wrapper handle.

| Surface | Role |
| --- | --- |
| `this.add.view3d(props)` / `this.make.view3d(props)` | Full-screen or fixed-size view on the 2D stage (`FactoryMethodOverrides.view3d`). |
| `view.add.*` / `view.make.*` | `Factory3D` (`packages/plugin-3d/src/factory3d.ts`): `container`, `mesh`, `model`, `light`, `camera`, `existing`, `entity`, `material`. |
| `view.add.entity(id, props)` | Builds a discovered entity whose class extends `Container3D` (usually `Entity3D`). `id` is typed as `Entity3DId`, props and return type come from the class. Placement keys (`position`, `rotation`, `scale`, `x`/`y`/`z`, `visible`, `lookAt`, `parent`) are applied to the node before it is parented; every other prop is the entity's own. |
| `Entity3D` (`packages/plugin-3d/src/Entity3D.ts`) | `Container3D` + Caper lifecycle (`added` / `removed` / `update`, update on by default) + signals + its own `add` / `make` (same `Factory3D`, parented to the entity, resources owned by the view it is in). The first `on` / `once` pointer listener sets `eventMode: 'static'` when the entity is still `'passive'`, so `entity.on('pointertap', …)` hears taps on the entity and its passive parts (`e.target3D` is the hit node). `onpointertap = …` and `addListener` do not; set `eventMode` yourself. |
| `view.pin(node2d, target3d, { offset? })` | Keeps a 2D `Container` over a `Container3D` or a fixed `[x, y, z]`; `offset` is world units. Updated each frame after models and add-on parts. Hides the node when the point is behind the camera; returns unpin; pins end when the view, node, or target is destroyed. The view sets the node's `position` and `visible`. |
| `view.make.material(props)` | A `Material3D` owned by the view (freed with it) to pass to many meshes. `color` is shorthand for `baseColor`; every other key (`roughness`, `metallic`, ...) is a raw `Material3DOptions` key. `view.add.mesh({ color, roughness, metallic })` takes the same three for the mesh's own material, and ignores them when `material` is given. `add.material` is the same function: a material has no parent. |
| `Model` (`packages/plugin-3d/src/Model.ts`) | `play(name, opts?)` replaces what is playing and restarts the clip from the start; options do not stick between calls (`loop`, `animationSpeed`, `weight`, `onComplete`, `onLoop`, `fade` seconds on the game clock, `layer: true` to blend without stopping others). Replaced clips do not run `onComplete`. `stop()` stops everything and cancels a fade. Players driven from `View3D.update`. |
| `view.root` | Escape hatch to the full `@pixi/3d` scene graph. |
| `registerFactory3DMethods(methods)` + `Factory3DOverrides` | Add-on packages add methods to every 3D factory (`view.add.cameraRig`). See Seams. |
| `view.own(part)` + `View3DPart` | Add-on lifecycle: the view updates the part each frame, tells it about resizes, destroys it with itself. |
| `fitFov(fov, aspect, fitAspect?)` | The portrait-framing maths, exported for add-ons that write the camera's `fov` themselves. |

**Screen cover.** With no `width` / `height`, Pixi `autoResize` tracks `app.screen` and the view
positions itself at **`-app.size / 2`** on `added` and `resize` so a scene-centred origin still
fills the canvas. With explicit `width` / `height`, the scene places the node like any other
display object.

**`interactive`.** `true` → `eventMode: 'static'` (picking on). `false` → `'none'` (see Gotchas).

**Portrait framing.** On `camera: { … }` props (not when passing a raw `Camera3D`), optional
`fitAspect` is the width/height ratio the scene is framed for (e.g. `16 / 9`). When the view is
narrower than that, vertical field of view grows so the same horizontal span stays in frame; at
or above the ratio, `fov` is unchanged. Omit `fitAspect` for fixed `fov`, same as before.
`fitFov()` in `src/fit.ts`; applied in the constructor, `added`, and `resize`.

**Types.** With `'3d'` in `plugins` and `@caperjs/plugin-3d` installed, build regeneration adds
`import type {} from '@caperjs/plugin-3d'` to `src/types/caper-app.d.ts` when the package ships a
`types` entry, so `this.add.view3d` typechecks with no scene import. Model manifest names become
`AssetModels` in `caper-assets.d.ts` when at least one `.glb`/`.gltf` is packed; `Model3DProps.asset`
is then `ModelAsset | Scene3DSource`, and unknown alias strings fail typecheck. Load by hand with
`asset: await Assets.load(url)` as `Scene3DSource`.

### Quality (per plugin and per view)

Pure function in `packages/plugin-3d/src/quality.ts`: maps `quality` + mobile detection to default
`shadowQuality` / `resolution` on the view unless props override.

## Module map

| File | Responsibility |
| --- | --- |
| `src/Plugin3D.ts` | Pre-renderer `initialize` / `postInitialize`, factory registration, renderer guard. |
| `src/View3D.ts` | Subclass, screen offset, `interactive` → `eventMode`, `Owned3D` tick + destroy, add-on parts (`own`), 2D `pin` tracking after parts each frame. |
| `src/factory3d.ts` | Holds the add-on method table (`registerFactory3DMethods`, `Factory3DOverrides`) and merges it into each factory it builds. Builds `Container3D`, `Mesh3D`, `Model`, lights, cameras, view-owned materials, and registry entities; built-in `box` / `plane` / `sphere` / `cylinder` geometry, mesh `color` / `roughness` / `metallic` on the mesh material, and the `Entity3DId` types (`packages/plugin-3d/src/props.ts`). `createFactory3D(root, owned, parent, view)` serves both a view (`root` = `view.root`) and an entity (`root` = the entity). |
| `src/Entity3D.ts` | Base class for 3D entities; `on` / `once` opt into `eventMode: 'static'` for pointer events. Finds its view's tracker through `ownedByView` when `add` / `make` are first used. |
| `src/Model.ts` | Replace-and-restart `play`, cross-fade, optional layering; `autoUpdate: false`, updated from view. |
| `src/owned.ts` | Tracks factory-created geometry/materials and players; safe destroy. `ownedByView` (package-internal `WeakMap`) maps a view to its tracker. |
| `src/quality.ts` | `auto` / `low` / `high` → shadow and resolution defaults. |
| `src/fit.ts` | `fitFov(fov, aspect, fitAspect?)` for portrait-safe framing on props cameras. |
| `src/renderer.ts` | `assertRenderer3D` — Canvas, WebGL1, late `@pixi/3d` load. |
| `src/index.ts` | Public exports; the factory type augmentation lives in `Plugin3D.ts`. |
| `package.json` `caper.phase` | `"pre-renderer"` for discovery (`packages/core/build/internal/discovery.mjs`). |

Kitchen-sink reference: `apps/kitchen-sink/src/scenes/display/View3DScene.ts`, the 3D entity
`apps/kitchen-sink/src/entities/SpinCube.ts`, assets in
`apps/kitchen-sink/assets/models{m}/`.

## Seams & extension points

- **Pre-renderer phase** (`definePlugin({ phase: 'pre-renderer' })` or npm `caper.phase`) — only
  supported way to load `@pixi/3d` before `Application.init`. Documented in
  [plugins-architecture.md](plugins-architecture.md).
- **`registerFactoryMethods`** — this plugin contributes `view3d`; other plugins could add more
  pre-renderer factories without core changes ([mixins-and-factory.md](mixins-and-factory.md)).
- **`registerFactory3DMethods(methods): () => void`** (`packages/plugin-3d/src/factory3d.ts`) — the mirror of
  core's `registerFactoryMethods`, one level down. An add-on package adds methods to **every** 3D factory:
  `view.add.<name>`, `view.make.<name>`, and an `Entity3D`'s `this.add` / `this.make`. Interface facts:
  - **The method gets the view first**, then the call-site arguments: `(view, ...args)`. From an entity's
    factory it is the view the entity is in.
  - **`add` and `make` are the same function** for a registered method. Parenting is a node idea; a rig or
    a physics world has no parent.
  - **Timing.** A factory reads the table when it is built (a view in its constructor, an entity on first
    `add` / `make` use). Register in a plugin's `initialize`. The disposer does not strip methods from
    factories already built.
  - **Collisions throw.** A built-in name throws. A name already registered with a different function
    throws and names both functions. The same function again is a no-op. A call that throws registers
    nothing. The disposer removes only what its call added.
  - **Types** come from augmenting the empty `Factory3DOverrides` interface with the call-site shape
    (`declare module '@caperjs/plugin-3d'`). `Factory3D` extends it. `Factory3DMethods` is the registered
    shape (view first).
- **`view.own(part)`** (`packages/plugin-3d/src/View3D.ts`) — the one lifecycle hook for add-ons.
  `View3DPart` is `{ update?(ticker), resize?(size), destroy() }`. `update` runs after model clips on
  `app.ticker` while the view is on the stage, so pause and `ticker.speed` apply. `resize` is called once
  when owned (with the view's size) and on every view resize, after the view's own `fitAspect`. `destroy`
  runs first in `view.destroy()`, while the camera and nodes are still alive. First user:
  [plugin-klipp.md](plugin-klipp.md).
- **Raw API** — every wrapped node exposes the underlying `@pixi/3d` instance; materials, passes,
  and custom geometry stay upstream-shaped.
- **`Owned3D`** — seam for “who destroys what”: only resources created by the factory are
  destroyed after the view's node tree is torn down.
- **Entities** — `defineEntity` + a default-exported class that extends `Entity3D` (or any `Container3D`).
  Discovery is the ordinary entity discovery; the 2D / 3D split is a type (`EntityId` in core keeps Pixi
  `Container` classes, `Entity3DId` here keeps `Container3D` classes) and a runtime `instanceof` check in each
  factory. Core's part is in [mixins-and-factory.md](mixins-and-factory.md). Design: `plan/pixi3d.md`
  ("3D entities and materials (as built)").

## Invariants & gotchas

- **Spawning many meshes: make one material and pass it.** `color` gives each mesh its own material
  for the life of the view (kitchen-sink recolours one cube without affecting others). Materials are
  never shared by colour behind your back. For a spawner, use `view.make.material`; the view frees it.
  ```ts
  const red = view.make.material({ color: 0xd9534f });
  for (let i = 0; i < 200; i++) view.add.mesh({ geometry: 'box', material: red, x: i });
  ```
  Writing to `red` recolours every mesh that uses it. A `new Material3D(...)` you build yourself still
  works and stays yours to destroy.
- **Build an `Entity3D`'s parts in `added()`, not in the constructor.** `this.add` / `this.make` belong to
  the view the entity is in, so they throw (plain message) until it has been added to one. `view.add.entity`
  and `view.add.existing(entity)` both do that before `added()` runs. An entity added under a detached
  `Container3D` gets `added()` while it still has no view. As in 2D, `added()` runs on every
  reparent: an entity that gets moved should build its parts once (guard it).
- **`Entity3D.update` runs every frame** from `app.ticker` while the entity has a parent, so it stops with
  `app.pause()` like model clips. There is no `resize` wiring on an entity.
- **3D entities are static imports**, like all entities, so an app with one loads `@caperjs/plugin-3d`
  from its main graph. `this.add.entity('<3d id>')` on a 2D container is a type error and a runtime error;
  so is `view.add.entity('<2d id>')`.

- **Import order / silent blank view.** `@pixi/3d` must load before the renderer is created. If it
  loads late, `renderer.lighting3d` is missing, the view draws **nothing**, and there is **no error**
  (glTF load can still succeed). The plugin throws in `postInitialize` and `View3D`'s constructor
  when it can detect the mistake; treat a blank full-screen view as “3d not in `plugins` or loaded
  too late.”
- **Never `material: true` on models / the view tree.** glTF sources share materials in the Assets
  cache. Destroying them breaks the next scene visit (`Cannot read properties of null` in the material
  system). The plugin destroys models with `{ children: true }` only and limits resource flags to
  factory-owned resources.
- **Factory-made nodes belong to their view.** Each view keeps one geometry per built-in kind
  (`box` / `plane` / `sphere` / `cylinder`, shared by all its meshes so they can batch) and every material its
  factory made, and frees them when the view is destroyed. A node from `view.make.*` that is still
  alive after its view is gone holds dead resources: destroy it with the view, or do not keep it.
  See the shared-material bullet above for many meshes.
- **View origin vs scene centre.** Pixi `View3D` with `autoResize` sizes from local (0,0). Caper
  scenes use screen centre as origin, so an untouched view only covers the bottom-right quadrant.
  Auto full-screen views offset by `-size/2`; fixed-size views must be positioned by the scene.
- **`sharedTicker: false`.** `@pixi/3d` model players default to `Ticker.shared`, not `app.ticker`,
  so `app.pause()` would not stop clips. The plugin sets `autoUpdate: false` and drives every player
  from `View3D.update` → `app.ticker`, so pause, `ticker.speed`, and `app.ticker.stop()` match 2D.
- **`eventMode`: `static`, `none`, `passive`.** Default / `interactive: true` is `'static'` (3D
  picking; the view's bounds block taps to 2D behind it). `interactive: false` is `'none'` (picking
  off, taps reach 2D below). **`'passive'` on the view is a trap:** picking is off and taps still do not pass
  through. Put interactive HUD **after** the view in the display list so 2D on top wins taps.
- **3D nodes default to `'passive'`, and a passive ancestor does not hear its children.** Events bubble
  like 2D, but upstream skips every ancestor that is not `'static'` / `'dynamic'`
  (`EventBoundary3D._emit3DChain`). A `'static'` ancestor also makes its passive mesh descendants
  pickable, with that ancestor as the target, so a static group blocks picking of what is behind it.
  That is why `Entity3D` is not static by default: its first `on` / `once` pointer listener makes it
  `'static'` (only from `'passive'`; `'none'` stays). From then on the whole entity is the tap target and
  `e.target3D` says which node was hit. `onpointertap = fn` and `addListener` do not opt in: set
  `eventMode = 'static'` yourself.
- **`Model.play` replaces (not layers by default).** Unlike 0.7, `play` stops other playing clips unless
  `layer: true`. Options reset each call; a replaced clip does not call its old `onComplete`. `fade`
  only applies when something is being replaced (not with `layer`, not when nothing is playing). A
  `layer` call during a fade leaves that fade running.
  Upstream has no mixer: a fade is two clips whose `weight` the model ramps on the view's clock.
- **`view.pin` owns `visible`.** It hides the 2D node when the 3D point is behind the camera, and shows
  it again when the pin ends (unpin, or the target is destroyed). A node
  moved later in the same frame may trail by one frame.
- **An opaque or fogged full-screen view covers 2D added before it.** That is display order, not a bug:
  kitchen-sink's `BaseScene` adds its header first, so a scene with `fog` or a `clearColor` re-adds it
  after the view (`this.add.existing(this.titleContainer)`).
- **`.glb` only (v1).** AssetPack pass-through works for self-contained `.glb`. Multi-file `.gltf`
  (external `.bin`/textures) and `.hdr` are untested; production hashing can 404 external refs.
- **Boot cost.** Pre-renderer import adds ~490 KB raw / **~155 KB gzip** on every start for opted-in
  apps, even with zero 3D scenes. Chunks include **both** WebGL and WebGPU backend inits at boot.
  It cannot load per scene without recreating the renderer.
- **pnpm release-age holdback.** On pnpm ≥ 10.16, `npx caper add 3d` adds
  `'@pixi/3d@<pin>'` to `minimumReleaseAgeExclude` in `pnpm-workspace.yaml` when needed and explains why.
  Manual installs may still need that line by hand.
- **`lookAt` vs `rotation`.** After `camera.lookAt`, orientation is quaternion-driven; setting
  `rotation` afterward may fight the look-at. Prefer `lookAt` in props or use the raw camera API
  consistently.
- **Built-in geometry.** `box`, `plane`, `sphere`, and `cylinder` are unit-sized upstream defaults
  (sphere radius 0.5, cylinder radius 0.5 and height 1). Factory `geometry: 'plane'` lies in **XY**.
  Rotate **-π/2 on X** for a floor; size with `scale` or raw width/height.
- **Ambient vs environment.** Upstream `AmbientLight` intensity is divided by π (0.2 is barely
  visible). Default fill uses a hemisphere **`environment`**, not an ambient light; `environment: null`
  turns fill off.
- **Canvas / WebGL1.** Unsupported; guard throws instead of a blank view.
- **Typed model names.** With models in the manifest, `asset` on `view.add.model` must be a known
  bundle alias or a loaded `Scene3DSource`. Opt in with `npx caper add 3d`, then `npx caper doctor`
  for `3d-plugin`, `3d-engine`, `3d-pixi`, and `3d-config` rows.

## Recipes

### Add a lit model

```ts
const view = this.add.view3d({
  camera: { position: [0, 1.5, 4], lookAt: [0, 0, 0] },
});
const model = view.add.model({ asset: 'my-model', y: 0 });
view.add.light({ type: 'directional', intensity: 2, castShadow: true });
model.play('Idle');
```

Preload the bundle in the scene's `assets` like any other bundle. Asset name is the manifest alias
(without path), e.g. `robot` for `assets/models{m}/robot.glb`.

### Play, replace and cross-fade clips

```ts
model.play('Walking');
model.play('Wave', { loop: false, onComplete: () => model.play('Walking') });
model.play('Wave', { loop: false, fade: 0.2, onComplete: () => model.play('Walking') });
```

### Define a 3D entity

Scaffold with `npx caper add entity <Name> --3d` (`--3d` before or after the name), or by hand:

```ts
// src/entities/Car.ts
import { defineEntity } from '@caperjs/core';
import { Entity3D } from '@caperjs/plugin-3d';

export const entity = defineEntity({ id: 'car' });

export default class Car extends Entity3D<{ color?: number }> {
  added() {
    this.add.mesh({ geometry: 'box', color: this.props.color ?? 0xd9534f, scale: [2, 0.6, 1] });
  }
  update() {
    this.rotation.y += 0.02 * this.app.ticker.deltaTime;
  }
}

// any scene with a view
const car = view.add.entity('car', { color: 0x4a90d9, x: -2, y: 0.3 });   // typed: id, props, instance
```

`view.make.entity` builds without parenting. Inside an entity, `this.add.entity('wheel')` nests another one.

### Many meshes, one material

```ts
const red = view.make.material({ color: 0xd9534f, roughness: 0.6 });
for (let i = 0; i < 200; i++) view.add.mesh({ geometry: 'box', material: red, x: i });
```

The view destroys `red` with itself. Inside an `Entity3D` use `this.make.material(...)`.

### Add a method to the 3D factory from an add-on

```ts
// my add-on package
import { Plugin } from '@caperjs/core';
import { registerFactory3DMethods } from '@caperjs/plugin-3d';
import type { View3D, View3DPart } from '@caperjs/plugin-3d';

class Wind implements View3DPart {
  constructor(view: View3D, public strength = 1) {
    view.own(this);                       // update / resize / destroy now come from the view
  }
  update(ticker) { /* ticker.deltaMS, every frame the view runs */ }
  destroy() {}
}

declare module '@caperjs/plugin-3d' {
  interface Factory3DOverrides { wind: (strength?: number) => Wind }   // call-site shape
}

const wind = (view: View3D, strength?: number) => new Wind(view, strength);   // one stable function

export default class WindPlugin extends Plugin {
  id = 'wind';
  initialize() {
    this.addDisposer(registerFactory3DMethods({ wind }));
  }
}
```

Declare `"caper": { "requires": ["3d"] }` in the add-on's `package.json`. A game then writes
`view.add.wind(2)`. Keep the registered function a module-level constant so a re-run `initialize` is a no-op.

### Pickable mesh

```ts
const view = this.add.view3d({ interactive: true });
const cube = view.add.mesh({
  geometry: 'box',
  color: 0xe85d5d,
  eventMode: 'static',
});
cube.on('pointertap', () => { /* ... */ });
```

3D pointer events bubble toward the stage like 2D, skipping ancestors that are not interactive;
`'static'` meshes (or a `'static'` parent) receive picks.

```ts
const robot = view.add.entity('robot', { clip: 'Walking' });
robot.on('pointertap', (e) => { /* e.target3D is the part hit */ });
```

### Pin a 2D label to a 3D point

```ts
const nameTag = this.add.container();
// ... label chrome ...
view.pin(nameTag, robot, { offset: [0, 2, 0] });
```

### 2D UI over the view

```ts
const view = this.add.view3d({ interactive: true });
// ... 3D content ...
const hud = this.add.button({ /* ... */ }); // added after view → on top, wins taps
```

### Fixed-size view (panel, picture-in-picture)

```ts
const view = this.make.view3d({ width: 400, height: 300 });
view.position.set(-200, -150); // scene-centred layout: place explicitly
this.add.existing(view);
```

No auto `-size/2` offset when width/height are set.

### Reach the raw `@pixi/3d` API

```ts
const view = this.add.view3d({});
view.root.addChild(/* any Container3D */);
view.camera.fov = 50;
```

### Frame for portrait (`fitAspect`)

```ts
const view = this.add.view3d({
  camera: { position: [0, 1.5, 4], lookAt: [0, 0, 0], fitAspect: 16 / 9 },
});
// On a tall phone, fov adjusts on resize so landscape framing width stays in view.
```

### Opt in

Run `npx caper add 3d`, then `npx caper doctor`. The command is idempotent: detects the package
manager, pins `@pixi/3d` and upgrades `pixi.js` only when below the floor, announces packages and
the install command before running it, adds `'3d'` to `caper.config.ts` (or prints the line if there
is no `plugins` array), writes `src/scenes/Sample3DScene.ts` when missing, and prints next steps
including the `pixijs-3d` skill install command.

## Related pages

- [Plugins: Contract & Lifecycle](plugins-architecture.md) — pre-renderer phase and factory registration.
- [Mixins & the Factory](mixins-and-factory.md) — `registerFactoryMethods`, `buildFactoryMethod`.
- [Build: Vite Preset & Asset Pipeline](build-pipeline.md) — AssetPack pass-through for `.glb`.
- [plugins-catalog.md](plugins-catalog.md) — built-in plugins (3D is first-party, not in core).
- [Camera rig (`@caperjs/plugin-klipp`)](plugin-klipp.md) — the first add-on built on the two seams above.
