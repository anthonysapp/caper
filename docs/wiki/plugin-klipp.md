# Camera rig (`@caperjs/plugin-klipp`)

> **Navigation aid.** `path:line` references mean "near here"; refresh them when you touch the code.
> Package is **experimental**: `@pmndrs/klipp` is early-stage and pinned exactly to `0.17.0`.

## Purpose

`@caperjs/plugin-3d` gives a camera you place by hand. This add-on gives a directed one: named shots
(follow the hero, a fixed overview), blended cuts between them, shake, and user orbit. It is a thin,
deep wrapper over [`@pmndrs/klipp`](https://github.com/pmndrs/klipp)'s renderer-free core, hooked
into the 3D plugin through its two add-on seams (`registerFactory3DMethods`, `view.own`; see
[plugin-3d.md](plugin-3d.md#seams--extension-points)). Opt-in: games without `'klipp'` fetch none of it.

Consumer summary: `packages/plugin-klipp/README.md`. Design record: `plan/klipp-camera.md`
("K1 and K2 design (as built)"), spike findings: `plan/klipp-spike.md`.

## Interface

### Config

```ts
// caper.config.ts
plugins: ['3d', 'klipp'],
```

- **Id:** `klipp`. Normal phase. `requires: ['3d']`, declared in the package's `"caper"` field.
- **Class:** `PluginKlipp` (`packages/plugin-klipp/src/PluginKlipp.ts`). `initialize` does one thing:
  `registerFactory3DMethods({ cameraRig })`. No options.
- **Peers:** `@caperjs/core`, `@caperjs/plugin-3d`, `pixi.js`, `@pixi/3d`, `@pmndrs/klipp@0.17.0` (exact).

### `CameraRig`

```ts
const view = this.add.view3d();
const hero = view.add.model({ asset: 'robot' });

const rig = view.add.cameraRig({ fitAspect: 16 / 9 });
rig.add.shot('follow', { priority: 10, follow: hero, offset: [0, 3, -8], damping: 0.5, lookAt: hero });
rig.add.shot('overview', { position: [0, 12, 14], lookAt: [0, 0, 0] });
rig.cut('overview', { blend: 1 });      // make it the live shot, blending over 1 s
rig.shake({ amplitude: 0.3, duration: 0.3 });
rig.orbit({ target: hero });            // user orbit from pointer events; rig.orbit(false) turns it off
```

| Member | Role |
| --- | --- |
| `view.add.cameraRig(props?)` | One rig per view (a second throws). `props.fitAspect`: the width / height the shots are framed for. `props.blend`: default blend seconds (1). `view.make.cameraRig` is the same function: a rig has no parent. |
| `rig.add.shot(name, props)` | Adds a named shot and returns klipp's `VirtualCamera`. Exactly one of `follow` (with `offset`, `damping`) or `position`. `lookAt` defaults to the follow target. `priority` (default 0): the highest one is live. `fov` defaults to the view camera's fov when the rig was made. |
| `rig.cut(name, { blend? })` | Makes that shot live by lifting its priority above the others. `blend` in seconds, `0` is a hard cut. Turns user orbit off. |
| `rig.shake({ amplitude?, duration? })` | Shakes the live picture. World units (0.3) and seconds (0.3). Runs on the game clock. |
| `rig.orbit({ target?, distance? })` / `rig.orbit(false)` | User orbit: one finger drag to turn, wheel to zoom, two fingers pinch to zoom (pinch never orbits; lifting one finger continues as a one-finger orbit with no jump). Starts from where the camera is. Off returns to the shot that was live before. |
| `rig.dragging` | True from the moment an orbit drag passes 6 px, during a pinch, and briefly after release so a following `pointertap` can be ignored. Tap handlers check it. |
| `rig.klipp` | The raw `Klipp` instance: everything else upstream offers. |
| `update` / `resize` / `destroy` | Lifecycle. The view calls them (`view.own`). Games never do. |

A target (`follow`, `lookAt`, `orbit.target`) is a `Container3D` (tracked every frame from its world
transform) or a fixed `[x, y, z]`.

There is no `rig.make.shot`: a shot outside the rig cannot be cut to. For that, build a raw
`VirtualCamera` and `rig.klipp.add(...)` it.

**Errors (plain messages):** `cut` to an unknown shot (lists the shots), a duplicate shot name, a shot
with both or neither of `follow` / `position`, a second rig on one view, `orbit()` on a view created
with `interactive: false`, a view camera that is not a direct child of `view.root`.

## Module map

| File | Responsibility |
| --- | --- |
| `src/CameraRig.ts` | The deep module. Every runtime import from `@pmndrs/klipp` is here: the `Klipp` subclass and its `write` hook, shots, targets, the impulse field and game clock, orbit axes. |
| `src/drag.ts` | Pointer gesture arbitration on the view (press, 6 px threshold, one-finger drag, two-finger pinch zoom, wheel, microtask release). No klipp import. |
| `src/PluginKlipp.ts` | Plugin `klipp`; registers `cameraRig`; the `Factory3DOverrides` augmentation. |
| `src/index.ts` | Public exports. |
| `package.json` `caper.requires` | `["3d"]`, read by discovery (`packages/core/build/internal/discovery.mjs`). |

Kitchen-sink reference: `apps/kitchen-sink/src/scenes/display/CameraRigScene.ts` (id `camera-rig`).

## How it works

- **Pose.** A private `Klipp` subclass overrides `write()`. Klipp calls it only when the shot changed.
  Position `[x, y, z]` and quaternion `[x, y, z, w]` go onto `view.camera`; `fov` (vertical degrees),
  `near`, `far` copy 1:1. Same axes as `@pixi/3d`, no flip.
- **Clock.** `update(ticker)` uses `ticker.deltaMS / 1000`. Pixi already applies `ticker.speed` to
  `deltaMS`: never multiply by speed again. The rig adds each `dt` to its own clock.
- **Shake.** The rig owns an `ImpulseField` and passes its own clock as klipp's `now` argument, both when
  an impulse starts and when it is sampled. Klipp's default is the wall clock, which ignores pause.
- **Field of view.** Klipp writes `fov` every time the lens changes, which would undo the view's own
  `fitAspect`. So the rig applies `fitFov` itself, in `write()` and at once in `resize()`.
- **Targets.** One `TargetPose` per tracked node, refreshed from
  `node.getGlobalTransform().decompose()` every frame before `klipp.update`.
- **Cut.** Klipp picks the live shot by priority. `cut` sets `klipp.defaultBlend`, then gives the shot
  a priority one above the rest.
- **Orbit.** One internal shot named `orbit` (`OrbitFollowBody`, world-space binding). The name is taken:
  a game shot called `orbit` is a duplicate, and `cut('orbit')` throws (use `rig.orbit()`). Input comes only
  from Pixi federated events on the view (`pointerdown`, `globalpointermove`, `pointerup`,
  `pointerupoutside`, `pointercancel`, `wheel`): one-finger drag after 6 px, two-finger pinch for zoom
  (pinch never applies orbit), wheel for zoom. Never klipp's `/dom` entry. One exception: Pixi v8 does
  not forward the browser's `pointercancel` (a touch the system took over), so the rig also listens for
  that one event on the canvas; without it a cancelled press would stay down.
- **Teardown.** `Klipp` has no `destroy`. The rig removes its listeners, sets `mode = 'disabled'`,
  and removes every shot.

## Invariants & gotchas

- **Upstream churn is fenced in one file.** The three touch points most likely to break on a klipp
  upgrade (the protected `write` hook, the input axes, the impulse `now` argument) are all in
  `CameraRig.ts`. An upgrade is a change to that file and the pin. 0.18 adds `KlippControls`, the
  likely replacement for the orbit body.
- **Import only `@pmndrs/klipp`.** Never `/dom`, `/three`, `/react`: they pull Three.js or React.
- **Follow offset turns with the target, and models face +Z.** "Behind and above" is
  `offset: [0, 3, -8]`, not `+8`. A fixed `[x, y, z]` follow target has no rotation, so its offset is
  in world space.
- **Give `fitAspect` to the rig, not to the view's camera.** While a rig drives the camera, the view's
  `camera.fitAspect` is overwritten. Passing both fits twice at rig creation (the rig reads the already
  fitted `fov` as its base).
- **Taps vs drags.** With orbit on, a drag that ends on a pickable mesh still fires its `pointertap`.
  Guard handlers: `if (rig.dragging) return;`. 2D UI added after the view is unaffected.
- **Pinch tracks two pointers.** A third finger is ignored. If one of the two tracked fingers lifts
  while a third is still down, the rig sees one finger and orbits.
- **Orbit needs an interactive view.** `interactive: false` views get no pointer events; `orbit()` throws.
- **The camera must stay under `view.root`.** The rig writes the camera's local transform as a world pose.
- **Update order.** The rig updates from the view's `update`, after model clips. A scene that moves a
  followed node in its own `update` is seen the same frame or the next, depending on ticker order;
  with any damping this is invisible.
- **A shot that is not live may be a frame or two stale.** Klipp updates standby shots round-robin. A
  blend hides it. Set `shot.standbyUpdate = 'always'` if you read a standby shot's `state`.
- **Bundle.** One lazy chunk, about 48 kB raw / 16 kB gzip in the kitchen-sink production build (wrapper,
  klipp and `math` as used). No Three.js or React. Fetched only when `'klipp'` is in `plugins`.
- **Not built:** spline dollies, sequences, gamepad, orthographic cameras. Reach them
  through `rig.klipp`.
- **Install side effect.** Klipp's optional `react` peer makes pnpm link a React into `node_modules`
  if one is resolvable. Nothing imports it. This repo pins that with an override in `pnpm-workspace.yaml`.

## Recipes

### Opt in

Run `npx caper add klipp`, then `npx caper doctor`. The command sets up 3D first when needed, installs
`@caperjs/plugin-klipp` and the pinned `@pmndrs/klipp` (pin from the plugin's peer), adds `'klipp'` after
`'3d'` in `caper.config.ts` (or prints the line to add when there is no `plugins` array; when `'klipp'`
is already listed without `'3d'` before it, it stops with a plain message before installing anything), writes `src/scenes/SampleCameraRigScene.ts` (`sample-camera-rig`) when missing,
and prints next steps. Doctor rows when the app depends on `@caperjs/plugin-klipp` or lists `'klipp'`:
`klipp-plugin`, `klipp-engine`, `klipp-config`.

### Follow the hero, cut to an overview

```ts
const rig = view.add.cameraRig({ fitAspect: 16 / 9 });
rig.add.shot('follow', { priority: 10, follow: hero, offset: [0, 3, -8], damping: 0.5 });
rig.add.shot('overview', { position: [0, 12, 14], lookAt: [0, 0, 0] });
button.onClick.connect(() => rig.cut('overview', { blend: 1 }));
```

### Shake on impact

```ts
rig.shake({ amplitude: 0.4, duration: 0.25 });   // freezes with app.pause(), slows with ticker.speed
```

### Let the player orbit, keep taps working

```ts
rig.orbit({ target: hero });
cube.on('pointertap', () => {
  if (rig.dragging) return;        // the drag ended on the cube: not a tap
  /* ... */
});
// later
rig.orbit(false);                  // back to the shot that was live
```

### Reach raw klipp

```ts
import { FollowBody } from '@pmndrs/klipp';
const shot = rig.add.shot('chase', { follow: car, offset: [0, 2, -6] });
(shot.body as FollowBody).bindingMode = 'worldSpace';   // offset no longer turns with the car
rig.klipp.addEventListener('blendFinished', (e) => { /* ... */ });
```

### Upgrade the klipp pin

Change the exact version in `packages/plugin-klipp/package.json` (peer and dev), the kitchen-sink
dependency and the README. `caper add klipp` reads the pin from the plugin's peer, not a hardcoded CLI
version. Re-read `CameraRig.ts` against the new `.d.ts` (`write`, `InputAxis`,
`ImpulseField.generate` / `ImpulseListenerNoise.update`). Run the package tests, then the `camera-rig`
scene.

## Related pages

- [3D (`@caperjs/plugin-3d`)](plugin-3d.md) — the view, the 3D factory and the two add-on seams.
- [Plugins: Contract & Lifecycle](plugins-architecture.md) — `requires`, phases.
- [plugins-catalog.md](plugins-catalog.md)
