# @caperjs/plugin-3d

**Experimental** — `@pixi/3d` is in open beta; this package pins an exact version and the API
we expose may change until upstream stabilizes.

Official 3D for [Caper](https://github.com/anthonysapp/caper) games, built on Pixi's
[`@pixi/3d`](https://pixijs.com/3d). A `View3D` is a normal node on the 2D stage; lights,
models, and meshes live in a separate tree inside it. Interactive 2D UI you add **after** the
view draws on top and receives taps first.

## Install

```bash
npx caper add 3d
```

Then `npx caper doctor`. The command:

- Installs `@caperjs/plugin-3d`, `@pixi/3d` at the pin this package expects, and `pixi.js` only if
  yours is older than the version Caper pins; announces packages and the install command before running it.
- Adds `'3d'` to `plugins` in `caper.config.ts` (or prints the line if there is no `plugins` array).
- Creates `src/scenes/Sample3DScene.ts` when missing (never overwrites).
- On pnpm ≥ 10.16, may add `@pixi/3d` to `minimumReleaseAgeExclude` in `pnpm-workspace.yaml`.

### By hand

```bash
pnpm add @caperjs/plugin-3d @pixi/3d@0.1.0
```

Peers: `@caperjs/core` (requires `pixi.js@8.23.0`), `pixi.js`, `@pixi/3d@0.1.0` (exact). Add `'3d'`
to `plugins` in `caper.config.ts`. On **pnpm 11**, you may need
`minimumReleaseAgeExclude: ['@pixi/3d@0.1.0']` in `pnpm-workspace.yaml`; `caper add 3d` adds it when
needed.

## Use

```ts
// caper.config.ts
export default defineConfig({
  plugins: [
    '3d',
    // or, with options:
    // ['3d', { options: { quality: 'low' } }],
  ],
});
```

```ts
// any Scene
const view = this.add.view3d({
  camera: { position: [0, 1.5, 4], lookAt: [0, 0, 0] },
});
const hero = view.add.model({ asset: 'cesium-man', y: 0 });
view.add.light({ type: 'directional', intensity: 2, castShadow: true });
const cube = view.add.mesh({ geometry: 'box', color: 0xe85d5d, x: -1 });
hero.play('anim_0');
```

Put self-contained `.glb` files in your assets folder (AssetPack pass-through). v1 supports
**.glb only** — multi-file `.gltf` and `.hdr` are not tested.

## Entities

Declare a 3D game object the way you declare any Caper entity, on the `Entity3D` base class:

```ts
// src/entities/Car.ts
import { defineEntity } from '@caperjs/core';
import { Entity3D } from '@caperjs/plugin-3d';

export const entity = defineEntity({ id: 'car' });

export default class Car extends Entity3D<{ color?: number }> {
  added() {
    // this.add / this.make are the 3D factory, parented to the entity
    this.add.mesh({ geometry: 'box', color: this.props.color ?? 0xd9534f, scale: [2, 0.6, 1] });
  }
  update() {
    this.rotation.y += 0.02 * this.app.ticker.deltaTime;
  }
}
```

```ts
const car = view.add.entity('car', { color: 0x4a90d9, x: -2, y: 0.3 });
```

- `id`, props and the returned instance are typed from the class. Only ids whose class extends
  `Container3D` are accepted; `this.add.entity('car')` on a 2D container is a type error.
- `view.add.entity` applies the placement props (`position`, `rotation`, `scale`, `x` / `y` / `z`,
  `visible`, `lookAt`, `parent`); the rest are the entity's own, on `this.props`.
- Build parts in `added()`, not in the constructor: the entity's factory belongs to the view it is
  in. What it creates is freed with that view, and its models' clips follow `app.ticker`.
- `update()` runs every frame while the entity is in the scene, and stops with `app.pause()`.
- `view.make.entity` builds without parenting; `this.add.entity(...)` inside an entity nests one.

## Many meshes: share one material

`color` gives each mesh its own material for the life of the view; materials are never shared by
colour behind your back. For a spawner, make one material and pass it. The view frees it.

```ts
const red = view.make.material({ color: 0xd9534f, roughness: 0.6 });
for (let i = 0; i < 200; i++) view.add.mesh({ geometry: 'box', material: red, x: i });
```

`color` is shorthand for `baseColor`; every other key is a raw `Material3D` option. Writing to
`red` recolours every mesh that uses it. (`view.add.material` is the same function: a material has
no parent.) A `new Material3D(...)` you build yourself also works and stays yours to destroy.

## Portrait screens

Optional `camera.fitAspect` on props cameras (not a raw `Camera3D`) is the width/height ratio you
frame for (e.g. `16 / 9`). On a narrower view, vertical FOV grows so the same width stays in frame.

```ts
const view = this.add.view3d({
  camera: { position: [0, 1.5, 4], lookAt: [0, 0, 0], fitAspect: 16 / 9 },
});
```

## Quality

Plugin option `quality: 'auto' | 'low' | 'high'` (default `'auto'`):

| Value | Shadows | Resolution cap |
| --- | --- | --- |
| `high` | high | inherit |
| `low` | low | capped at 1 |
| `auto` | low on mobile, medium otherwise | cap 2 on mobile, inherit on desktop |

Per-view `shadowQuality` and `resolution` props override the global default.

## Interaction

`interactive` on the view (default `true`):

- `true` → `eventMode: 'static'`: 3D picking on; the view's rectangle captures taps, so put
  buttons and HUD **above** the view in the 2D tree.
- `false` → `eventMode: 'none'`: taps pass through to 2D behind the view; no 3D picking.

Do not use `'passive'`: it disables picking and still blocks taps to 2D behind the view.

## Boot cost

Opting in loads `@pixi/3d` in the **pre-renderer** phase, before the Pixi renderer is created.
That is required for 3D to work, but it means every app start pays roughly **~490 KB raw /
~155 KB gzip** even if no scene uses 3D. The import pulls both WebGL and WebGPU backend
chunks at boot. Apps without `'3d'` in `plugins` pay nothing.

## Teardown

Never destroy a loaded model or the view with `{ material: true }` (or blanket geometry flags
on glTF nodes): glTF materials are shared on the cached source and the next visit crashes every
frame. The plugin destroys only geometry and materials **it** created; models use
`{ children: true }` only.

Nodes made by a view's factory belong to that view: the built-in geometry, `color` materials and
`make.material` materials are freed when the view is destroyed, so do not keep such a node alive past its view. A raw
`geometry` or `material` you pass in stays yours to destroy.

## Types

No import needed in scenes: with `'3d'` in `plugins` and this package installed, regenerated
`src/types/caper-app.d.ts` includes `import type {} from '@caperjs/plugin-3d'` so
`this.add.view3d` typechecks. When AssetPack ships `.glb`/`.gltf` models, `caper-assets.d.ts`
defines `AssetModels`; `view.add.model({ asset: '…' })` only accepts known manifest names or a
loaded `Scene3DSource` (`asset: await Assets.load(url)`).

## Not in v1 yet

- **`caper add entity --3d`** — scaffold with `caper add entity`, then change the base class to
  `Entity3D`.

## License

MIT
