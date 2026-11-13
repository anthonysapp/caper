import { Camera3D, Container3D } from '@pixi/3d';
import { describe, expect, it, vi } from 'vitest';
import { fitFov, type View3DPart, type View3D } from '@caperjs/plugin-3d';
import { CameraRig } from './CameraRig';

function fixture(width = 1600, height = 900, interactive = true) {
  const root = new Container3D();
  const camera = new Camera3D();
  root.addChild(camera);
  camera.position.set(0, 2, 10);
  camera.lookAt({ x: 0, y: 0, z: 0 });
  camera.fov = 55;
  camera.near = 0.2;
  camera.far = 500;
  const parts: View3DPart[] = [];
  const view = {
    root, camera, eventMode: interactive ? 'static' : 'none',
    on: vi.fn(), off: vi.fn(),
    own(part: View3DPart) { parts.push(part); part.resize?.({ width, height }); return part; },
  } as unknown as View3D;
  const tick = (rig: CameraRig, ms = 16) => rig.update({ deltaMS: ms } as any);
  return { root, camera, view, parts, tick };
}

const position = (camera: Camera3D) => [camera.position.x, camera.position.y, camera.position.z];
const distance = (camera: Camera3D, target: [number, number, number]) =>
  Math.hypot(camera.position.x - target[0], camera.position.y - target[1], camera.position.z - target[2]);

describe('CameraRig', () => {
  it('keeps the no-shot camera state and copies fixed-shot lens and quaternion', () => {
    const { view, camera, tick } = fixture();
    const before = position(camera);
    const q = [camera.quaternion.x, camera.quaternion.y, camera.quaternion.z, camera.quaternion.w];
    const rig = new CameraRig(view);
    tick(rig);
    expect(position(camera)).toEqual(before);
    expect([camera.quaternion.x, camera.quaternion.y, camera.quaternion.z, camera.quaternion.w]).toEqual(q);
    rig.add.shot('fixed', { position: [2, 3, 4] });
    tick(rig);
    expect(position(camera)).toEqual([2, 3, 4]);
    expect([camera.quaternion.x, camera.quaternion.y, camera.quaternion.z, camera.quaternion.w]).toEqual(q);
    expect([camera.fov, camera.near, camera.far]).toEqual([55, 0.2, 500]);
    rig.destroy();
  });

  it('follows world transforms with a target-frame offset and looks at the target', () => {
    const { view, root, camera, tick } = fixture();
    const parent = new Container3D();
    const target = new Container3D();
    root.addChild(parent);
    parent.addChild(target);
    parent.position.set(3, 0, 0);
    parent.rotation.y = Math.PI / 2;
    const rig = new CameraRig(view);
    rig.add.shot('follow', { follow: target, offset: [0, 0, -4], lookAt: target });
    tick(rig);
    expect(camera.position.x).toBeCloseTo(-1, 4);
    expect(camera.position.z).toBeCloseTo(0, 4);
    expect(camera.quaternion.w).not.toBe(1);
    parent.position.x = 5;
    tick(rig);
    expect(camera.position.x).toBeCloseTo(1, 4);
    target.destroy();
    expect(() => tick(rig)).not.toThrow();
    expect((rig as any).targets.size).toBe(0);
    rig.destroy();
  });

  it('supports fixed targets and fits the lens on update and immediately on resize', () => {
    const { view, camera, tick } = fixture(420, 800);
    const rig = new CameraRig(view, { fitAspect: 16 / 9 });
    rig.add.shot('fixed', { position: [0, 0, 8], lookAt: [1, 0, 0], fov: 50 });
    tick(rig);
    expect(camera.fov).toBeCloseTo(fitFov(50, 420 / 800, 16 / 9));
    rig.resize({ width: 1600, height: 900 });
    expect(camera.fov).toBe(50);
    rig.resize({ width: 420, height: 800 });
    expect(camera.fov).toBeCloseTo(fitFov(50, 420 / 800, 16 / 9));
    rig.destroy();
  });

  it('validates shots, cuts both ways, and completes zero and timed blends', () => {
    const { view, camera, tick } = fixture();
    const rig = new CameraRig(view);
    expect(() => new CameraRig(view)).toThrow('CameraRig: this view already has a camera rig.');
    expect(() => rig.add.shot('bad', {})).toThrow();
    expect(() => rig.add.shot('bad', { follow: [0, 0, 0], position: [0, 0, 0] })).toThrow();
    rig.add.shot('a', { position: [0, 0, 0], priority: 10 });
    rig.add.shot('b', { position: [10, 0, 0] });
    expect(() => rig.add.shot('a', { position: [0, 0, 0] })).toThrow("CameraRig: a shot named 'a' already exists.");
    expect(() => rig.cut('missing')).toThrow("CameraRig: no shot named 'missing'. Shots: 'a', 'b'.");
    tick(rig);
    rig.cut('b', { blend: 0 });
    tick(rig);
    expect(camera.position.x).toBe(10);
    expect(rig.klipp.isBlending).toBe(false);
    rig.cut('a', { blend: 1 });
    tick(rig, 500);
    expect(rig.klipp.isBlending).toBe(true);
    tick(rig, 510);
    expect(camera.position.x).toBeCloseTo(0);
    rig.destroy();
  });

  it('uses deltaMS for damped movement and rig time for a paused shake', () => {
    const a = fixture();
    const b = fixture();
    const targetA = new Container3D();
    const targetB = new Container3D();
    a.root.addChild(targetA);
    b.root.addChild(targetB);
    const rigA = new CameraRig(a.view);
    const rigB = new CameraRig(b.view);
    rigA.add.shot('follow', { follow: targetA, damping: 0.5 });
    rigB.add.shot('follow', { follow: targetB, damping: 0.5 });
    a.tick(rigA);
    b.tick(rigB);
    targetA.position.x = targetB.position.x = 10;
    a.tick(rigA, 100);
    b.tick(rigB, 50);
    expect(a.camera.position.x).toBeGreaterThan(b.camera.position.x);

    vi.useFakeTimers();
    try {
      const fixed = fixture();
      const rig = new CameraRig(fixed.view);
      rig.add.shot('base', { position: [0, 0, 0] });
      fixed.tick(rig);
      rig.shake({ amplitude: 0.3, duration: 0.3 });
      vi.setSystemTime(100_000);
      fixed.tick(rig, 90);
      expect(distance(fixed.camera, [0, 0, 0])).toBeGreaterThan(0);
      vi.setSystemTime(200_000);
      fixed.tick(rig, 90);
      expect(distance(fixed.camera, [0, 0, 0])).toBeGreaterThan(0);
      fixed.tick(rig, 200);
      expect(distance(fixed.camera, [0, 0, 0])).toBeCloseTo(0, 5);
      rig.destroy();
    } finally { vi.useRealTimers(); }
    rigA.destroy();
    rigB.destroy();
  });

  it('orbits from the current direction, handles drag and wheel, and returns to the previous shot', () => {
    const f = fixture();
    const rig = new CameraRig(f.view);
    rig.add.shot('base', { position: [0, 2, 10], lookAt: [0, 0, 0] });
    f.tick(rig);
    const before = position(f.camera);
    rig.orbit();
    f.tick(rig, 1100);
    expect(position(f.camera)[0]).toBeCloseTo(before[0], 3);
    expect(position(f.camera)[1]).toBeCloseTo(before[1], 3);
    expect(position(f.camera)[2]).toBeCloseTo(before[2], 3);
    const handlers = Object.fromEntries((f.view.on as any).mock.calls);
    handlers.pointerdown({ pointerId: 1, global: { x: 0, y: 0 } });
    handlers.globalpointermove({ pointerId: 1, global: { x: 100, y: 0 } });
    f.tick(rig);
    expect(position(f.camera)[0]).not.toBeCloseTo(before[0], 3);
    expect(distance(f.camera, [0, 0, 0])).toBeCloseTo(Math.hypot(...before), 3);
    handlers.wheel({ deltaY: 400 });
    f.tick(rig);
    expect(distance(f.camera, [0, 0, 0])).toBeGreaterThan(Math.hypot(...before));
    rig.orbit(false);
    expect(f.view.off).toHaveBeenCalledTimes(6);
    f.tick(rig, 1100);
    expect(position(f.camera)).toEqual(before);
    rig.orbit();
    expect(() => rig.cut('orbit')).toThrow("CameraRig: 'orbit' is the user-orbit shot. Turn it on with rig.orbit().");
    rig.cut('base');
    expect(f.view.off).toHaveBeenCalledTimes(12);
    rig.destroy();
  });

  it('rejects noninteractive orbit and cameras outside the root, then tears down repeatedly', () => {
    const notInteractive = fixture(800, 600, false);
    const rig = new CameraRig(notInteractive.view);
    expect(() => rig.orbit()).toThrow('CameraRig: orbit() needs pointer input, but this view was created with interactive: false. Create it with this.add.view3d({ interactive: true }).');
    rig.destroy();
    const wrong = fixture();
    wrong.root.removeChild(wrong.camera);
    expect(() => new CameraRig(wrong.view)).toThrow(/direct child/);
    for (let i = 0; i < 5; i++) {
      const f = fixture();
      const next = new CameraRig(f.view);
      next.add.shot('base', { position: [0, 0, 0] });
      next.orbit();
      next.destroy();
      next.destroy();
      expect(f.view.off).toHaveBeenCalledTimes(6);
      expect(next.klipp.mode).toBe('disabled');
    }
  });
});
