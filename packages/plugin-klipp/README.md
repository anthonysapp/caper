# @caperjs/plugin-klipp

**Experimental.** A directed camera for [Caper](https://github.com/anthonysapp/caper) 3D views:
named shots, blended cuts, shake and user orbit. Built on
[`@pmndrs/klipp`](https://github.com/pmndrs/klipp), which is itself early-stage and has had several
breaking releases. This package pins it **exactly** (`0.17.0`), and the API here may change with it.

Needs [`@caperjs/plugin-3d`](../plugin-3d).

## Install

```bash
npx caper add klipp
```

Then `npx caper doctor` (`klipp-plugin`, `klipp-engine`, `klipp-config` rows). The command sets up 3D
first when needed, installs packages, adds `'klipp'` after `'3d'` in `caper.config.ts`, and creates
`src/scenes/SampleCameraRigScene.ts` when missing.

### By hand

```bash
pnpm add @caperjs/plugin-klipp @pmndrs/klipp@0.17.0
```

Peers: `@caperjs/core`, `@caperjs/plugin-3d`, `pixi.js`, `@pixi/3d`, `@pmndrs/klipp@0.17.0` (exact).
List `'3d'` before `'klipp'` in `plugins`.

Two things to know before you install:

- **A React may appear in `node_modules`.** Klipp declares optional peers for its React and Three.js
  entry points. If your package manager can resolve `react`, it links one next to klipp (pnpm may add
  or bump a `react` entry in your lockfile). Nothing imports it: this package uses only klipp's
  renderer-free core, and no React or Three.js code reaches your bundle.
- **Bundle cost.** One lazy chunk of about 48 kB raw / 16 kB gzip (this wrapper plus the parts of klipp
  and its `math` dependency it uses), loaded only by apps that list `'klipp'`. Apps without it fetch nothing.

## Use

```ts
// caper.config.ts
export default defineConfig({
  plugins: ['3d', 'klipp'],
});
```

```ts
// any Scene
const view = this.add.view3d();
const hero = view.add.model({ asset: 'robot' });

const rig = view.add.cameraRig({ fitAspect: 16 / 9 });
rig.add.shot('follow', { priority: 10, follow: hero, offset: [0, 3, -8], damping: 0.5, lookAt: hero });
rig.add.shot('overview', { position: [0, 12, 14], lookAt: [0, 0, 0] });

rig.cut('overview', { blend: 1 });      // make it the live shot, blending over 1 s
rig.shake({ amplitude: 0.3, duration: 0.3 });
rig.orbit({ target: hero });            // drag to orbit, pinch or wheel to zoom; rig.orbit(false) turns it off
```

`view.add.cameraRig` is typed with no import once `'klipp'` is in `plugins`.

## API

| Call | What it does |
| --- | --- |
| `view.add.cameraRig({ fitAspect?, blend? })` | One rig per view. `fitAspect` is the width / height your shots are framed for: narrower screens get a taller field of view so the sides stay in frame. `blend` is the default blend time in seconds (1). |
| `rig.add.shot(name, props)` | A named shot. `follow` + `offset` + `damping`, **or** a fixed `position`. `lookAt` (defaults to the follow target), `priority` (highest is live), `fov`. Returns klipp's `VirtualCamera`. |
| `rig.cut(name, { blend? })` | Make a shot live. `blend: 0` is a hard cut. |
| `rig.shake({ amplitude?, duration? })` | Shake the picture. World units and seconds. |
| `rig.orbit({ target?, distance? })` | User orbit: drag to turn, two-finger pinch or wheel to zoom (pinch never orbits). `rig.orbit(false)` goes back to the previous shot. |
| `rig.dragging` | True during an orbit drag, a pinch, and briefly after release. |
| `rig.klipp` | The raw `Klipp` instance, for everything else. |

A target is a 3D node (tracked every frame) or a fixed `[x, y, z]`.

## Rules

- **The follow offset turns with the target, and glTF models face +Z.** "Behind and above" is
  `offset: [0, 3, -8]`.
- **Pause and time scale apply to everything**, shake included: the rig runs on `app.ticker`.
- **Give `fitAspect` to the rig**, not to the view's `camera` props. The rig owns the field of view.
- **Taps and drags.** With orbit on, check `rig.dragging` in a mesh's `pointertap` so a drag that ends
  on it is not a tap. 2D buttons above the view work as usual.
- **`orbit()` needs an interactive view** (the default). It throws on `interactive: false`.
- **You never call `update`, `resize` or `destroy`.** The view drives the rig and destroys it.
- **Import only `@pmndrs/klipp`** in your own code, never `/dom`, `/three` or `/react`.

Not included: spline dollies, sequences, gamepad, orthographic cameras. Use `rig.klipp`.
