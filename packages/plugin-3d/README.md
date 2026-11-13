# @caperjs/plugin-3d

**Experimental** — `@pixi/3d` is in open beta; this package pins an exact version and the API
we expose may change until upstream stabilizes.

Official 3D for [Caper](https://github.com/anthonysapp/caper) games, built on Pixi's
[`@pixi/3d`](https://pixijs.com/3d). A `View3D` is a normal node on the 2D stage; lights,
models, and meshes live in a separate tree inside it. Interactive 2D UI you add **after** the
view draws on top and receives taps first.

## Install

```bash
pnpm add @caperjs/plugin-3d @pixi/3d@0.1.0
```

Peers: `@caperjs/core` (requires `pixi.js@8.23.0`), `pixi.js`, `@pixi/3d@0.1.0` (exact).

On **pnpm 11**, the workspace may add `minimumReleaseAgeExclude: ['@pixi/3d@0.1.0']` to
`pnpm-workspace.yaml` because the package is newer than the default release-age policy.
`caper add 3d` should do the same when that command lands.

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

Nodes made by a view's factory belong to that view: the built-in geometry and `color` materials
are freed when the view is destroyed, so do not keep such a node alive past its view. A raw
`geometry` or `material` you pass in stays yours to destroy.

## Types

Import the package somewhere in the app (or list `@caperjs/plugin-3d` in `tsconfig`
`types`) so its `FactoryMethodOverrides` augmentation makes `this.add.view3d` typecheck.

## Not in v1 yet

- **`Entity3D` / `view.add.entity(id)`** — deferred until build-side discovery can tell 3D
  entities from 2D.
- **Field-of-view aspect policy** — set `view.camera.fov` in `resize` for now.

## License

MIT
