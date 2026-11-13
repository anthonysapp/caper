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

const hero = view.add.model({ asset: 'cesium-man', y: 0 });
view.add.light({ type: 'directional', intensity: 2, castShadow: true });
view.add.mesh({ geometry: 'box', color: 0xe85d5d });
hero.play('anim_0');
```

`View3D` (`packages/plugin-3d/src/View3D.ts`) subclasses Pixi's `View3D` with Caper lifecycle and
signals. **It is the raw view** — `root`, `camera`, `worldToScreen`, `environment`, etc. are the
upstream members, not a wrapper handle.

| Surface | Role |
| --- | --- |
| `this.add.view3d(props)` / `this.make.view3d(props)` | Full-screen or fixed-size view on the 2D stage (`FactoryMethodOverrides.view3d`). |
| `view.add.*` / `view.make.*` | `Factory3D` (`packages/plugin-3d/src/factory3d.ts`): `container`, `mesh`, `model`, `light`, `camera`, `existing`. |
| `Model` (`packages/plugin-3d/src/Model.ts`) | `play(name, opts?)`, `stop()` on loaded glTF clips; players driven from `View3D.update`. |
| `view.root` | Escape hatch to the full `@pixi/3d` scene graph. |

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
| `src/View3D.ts` | Subclass, screen offset, `interactive` → `eventMode`, `Owned3D` tick + destroy. |
| `src/factory3d.ts` | Builds `Container3D`, `Mesh3D`, `Model`, lights, cameras; shorthand props (`packages/plugin-3d/src/props.ts`). |
| `src/Model.ts` | Animation API; `autoUpdate: false`, updated from view. |
| `src/owned.ts` | Tracks factory-created geometry/materials and players; safe destroy. |
| `src/quality.ts` | `auto` / `low` / `high` → shadow and resolution defaults. |
| `src/fit.ts` | `fitFov(fov, aspect, fitAspect?)` for portrait-safe framing on props cameras. |
| `src/renderer.ts` | `assertRenderer3D` — Canvas, WebGL1, late `@pixi/3d` load. |
| `src/index.ts` | Public exports; the factory type augmentation lives in `Plugin3D.ts`. |
| `package.json` `caper.phase` | `"pre-renderer"` for discovery (`packages/core/build/internal/discovery.mjs`). |

Kitchen-sink reference: `apps/kitchen-sink/src/scenes/display/View3DScene.ts`, assets in
`apps/kitchen-sink/assets/models{m}/`.

## Seams & extension points

- **Pre-renderer phase** (`definePlugin({ phase: 'pre-renderer' })` or npm `caper.phase`) — only
  supported way to load `@pixi/3d` before `Application.init`. Documented in
  [plugins-architecture.md](plugins-architecture.md).
- **`registerFactoryMethods`** — this plugin contributes `view3d`; other plugins could add more
  pre-renderer factories without core changes ([mixins-and-factory.md](mixins-and-factory.md)).
- **Raw API** — every wrapped node exposes the underlying `@pixi/3d` instance; materials, passes,
  and custom geometry stay upstream-shaped.
- **`Owned3D`** — seam for “who destroys what”: only resources created by the factory are
  destroyed after the view's node tree is torn down.
- **Deferred:** `Entity3D` + `view.add.entity`. It needs two core changes first (2D `add.entity` must
  refuse 3D ids; the entity registry lookup must be public). Design: `plan/pixi3d.md`
  ("Phase 4 design (as built)").

## Invariants & gotchas

- **Spawning many meshes: pass one shared `material`.** `color` gives each mesh its own material
  for the life of the view (kitchen-sink recolours one cube without affecting others). For a
  spawner, build one `Material3D` and pass `material`; destroy it when the scene ends.
  ```ts
  const red = new Material3D({ baseColor: 0xd9534f });
  for (let i = 0; i < 200; i++) view.add.mesh({ geometry: 'box', material: red, x: i });
  // on scene destroy: red.destroy();
  ```

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
  (`box` / `plane` / `sphere`, shared by all its meshes so they can batch) and every material its
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
  off, taps reach 2D below). **`'passive'` is a trap:** picking is off and taps still do not pass
  through. Put interactive HUD **after** the view in the display list so 2D on top wins taps.
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
- **Built-in plane orientation.** Factory `geometry: 'plane'` lies in **XY** (upstream default).
  Rotate **-π/2 on X** for a floor; size with `scale` or raw width/height (unit plane is 1×1).
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
model.play('idle');
```

Preload the bundle in the scene's `assets` like any other bundle. Asset name is the manifest alias
(without path), e.g. `cesium-man` for `assets/models{m}/cesium-man.glb`.

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

Mesh picking uses Pixi pointer events on 3D nodes; events bubble view → stage.

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
