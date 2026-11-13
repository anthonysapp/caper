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
  camera: { position: [0, 1.5, 4], lookAt: [0, 0, 0] },
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
- **Deferred:** `Entity3D` + `view.add.entity` needs build-side 3D entity discovery (phase 4).
  A field-of-view aspect policy is not shipped — scenes adjust
  `camera.fov` in `resize`.

## Invariants & gotchas

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
  A spawner that makes many meshes should pass one raw `material` (the caller's to destroy) instead
  of `color`, or each mesh's material lives until the view goes.
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
- **pnpm 11 `minimumReleaseAgeExclude`.** Fresh `@pixi/3d@0.1.0` may require
  `minimumReleaseAgeExclude: ['@pixi/3d@0.1.0']` in `pnpm-workspace.yaml`; document in app README when
  installing by hand.
- **`lookAt` vs `rotation`.** After `camera.lookAt`, orientation is quaternion-driven; setting
  `rotation` afterward may fight the look-at. Prefer `lookAt` in props or use the raw camera API
  consistently.
- **Built-in plane orientation.** Factory `geometry: 'plane'` lies in **XY** (upstream default).
  Rotate **-π/2 on X** for a floor; size with `scale` or raw width/height (unit plane is 1×1).
- **Ambient vs environment.** Upstream `AmbientLight` intensity is divided by π (0.2 is barely
  visible). Default fill uses a hemisphere **`environment`**, not an ambient light; `environment: null`
  turns fill off.
- **Canvas / WebGL1.** Unsupported; guard throws instead of a blank view.
- **Typed model names / `caper add 3d`.** Phase 4: `AssetModels` union in `assetTypes.mjs`, CLI
  `caper add 3d`, doctor rows. Until then, model `asset` is an untyped string (manifest aliases
  still work).

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

### Adjust FOV on resize (until aspect policy ships)

```ts
resize() {
  super.resize();
  const view = this.myView;
  if (!view) return;
  const aspect = this.app.screen.width / this.app.screen.height;
  view.camera.fov = aspect < 1 ? 55 : 45; // example: portrait vs landscape
}
```

### Opt in today

Run `pnpm add @caperjs/plugin-3d @pixi/3d@0.1.0`, add `'3d'` to `plugins`, and import the
package once for types. `caper add 3d` is deferred to phase 4.

## Related pages

- [Plugins: Contract & Lifecycle](plugins-architecture.md) — pre-renderer phase and factory registration.
- [Mixins & the Factory](mixins-and-factory.md) — `registerFactoryMethods`, `buildFactoryMethod`.
- [Build: Vite Preset & Asset Pipeline](build-pipeline.md) — AssetPack pass-through for `.glb`.
- [plugins-catalog.md](plugins-catalog.md) — built-in plugins (3D is first-party, not in core).
