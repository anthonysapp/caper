import { Material3D, CubeGeometry, Container3D } from '@pixi/3d';
import { Container, Point } from 'pixi.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  app: {
    renderer: { name: 'webgpu', lighting3d: {}, resolution: 3 },
    size: { width: 800, height: 600 },
    ticker: { add: vi.fn(), remove: vi.fn() },
    onResize: { connect: vi.fn(() => ({ disconnect: vi.fn() })), disconnect: vi.fn() },
    getPlugin: vi.fn(() => ({ options: { quality: 'auto' } })),
  },
}));

vi.mock('@caperjs/core', () => ({
  Application: { getInstance: () => h.app },
  isMobile: false,
  bindAllMethods: () => undefined,
  WithSignals: (Base: any) =>
    class extends Base {
      signalConnections = { disconnectAll: vi.fn() };
      addSignalConnection() {}
      destroy(options?: unknown) {
        this.signalConnections.disconnectAll();
        super.destroy(options);
      }
    },
  WithLifecycle: (Base: any) =>
    class extends Base {
      onDestroy = { emit: vi.fn() };
      get app() {
        return h.app;
      }
      _initLifecycle() {}
      destroy(options?: unknown) {
        h.app.ticker.remove(this.update, this);
        this.onDestroy.emit();
        super.destroy(options);
      }
    },
}));

import { View3D } from './View3D';

beforeEach(() => {
  h.app.renderer = { name: 'webgpu', lighting3d: {}, resolution: 3 };
  h.app.getPlugin.mockReturnValue({ options: { quality: 'auto' } });
  vi.clearAllMocks();
});

describe('View3D', () => {
  it('pins a 2D node through its parent, with a world offset and visibility changes', () => {
    const view = new View3D();
    const parent = new Container();
    const node = parent.addChild(new Container());
    const toLocal = vi.spyOn(parent, 'toLocal').mockImplementation((_p, _from, out) => { out!.set(12, 34); return out!; });
    const project = vi.spyOn(view, 'worldToScreen').mockImplementation((point, out) => {
      expect(point).toMatchObject({ x: 1, y: 3, z: 3 });
      (out as Point).set(50, 60);
      return out!;
    });
    view.pin(node, [1, 2, 3], { offset: [0, 1, 0] });
    view.update();
    expect(toLocal).toHaveBeenCalledWith(expect.objectContaining({ x: 50, y: 60 }), undefined, node.position);
    expect(node.position).toMatchObject({ x: 12, y: 34 });
    project.mockReturnValueOnce(null);
    view.update();
    expect(node.visible).toBe(false);
    view.update();
    expect(node.visible).toBe(true);
    view.destroy();
    parent.destroy({ children: true });
  });

  it('replaces pins, unpins without moving the node, and drops destroyed targets and nodes', () => {
    const view = new View3D();
    const node = new Container();
    vi.spyOn(view, 'worldToScreen').mockImplementation((point, out) => {
      (out as Point).set(point.x * 10, point.y * 10);
      return out!;
    });
    const oldUnpin = view.pin(node, [1, 1, 0]);
    const unpin = view.pin(node, [2, 3, 0]);
    oldUnpin();
    view.update();
    expect(node.position).toMatchObject({ x: 20, y: 30 });
    unpin();
    view.update();
    expect(node.position).toMatchObject({ x: 20, y: 30 });
    const target = view.add.container({ x: 4 });
    view.pin(node, target);
    view.update();
    expect(node.position.x).toBe(40);
    target.destroy();
    view.update();
    expect((view as any).pins.size).toBe(0);
    view.pin(node, [5, 0, 0]);
    node.destroy();
    view.update();
    expect((view as any).pins.size).toBe(0);
    view.destroy();
  });

  it('shows a node again when its pin ends while it was hidden behind the camera', () => {
    const view = new View3D();
    const node = new Container();
    vi.spyOn(view, 'worldToScreen').mockReturnValue(null);
    const unpin = view.pin(node, [0, 0, 0]);
    view.update();
    expect(node.visible).toBe(false);
    unpin();
    expect(node.visible).toBe(true);
    const target = new Container3D();
    view.pin(node, target);
    view.update();
    expect(node.visible).toBe(false);
    target.destroy();
    view.update();
    expect(node.visible).toBe(true);
    view.destroy();
    node.destroy();
  });

  it('clears pins on destroy without destroying 2D nodes', () => {
    const view = new View3D();
    const node = new Container();
    view.pin(node, [0, 0, 0]);
    view.destroy();
    expect(node.destroyed).toBe(false);
    expect((view as any).pins.size).toBe(0);
    node.destroy();
  });

  it('adds default fill, respects null, and positions the default camera', () => {
    const view = new View3D();
    expect(view.environment).toMatchObject({ skyColor: 0xbcd4f0, groundColor: 0x6b6250, intensity: 0.7 });
    expect(view.camera.position).toMatchObject({ x: 0, y: 1.5, z: 4 });
    view.destroy();
    const unlit = new View3D({ environment: null });
    expect(unlit.environment).toBeNull();
    unlit.destroy();
  });

  it('turns picking off and offsets a full-screen view on resize', () => {
    const view = new View3D({ interactive: false });
    expect(view.eventMode).toBe('none');
    view.resize();
    expect(view.position).toMatchObject({ x: -400, y: -300 });
    view.destroy();
    const fixed = new View3D({ width: 320 });
    fixed.resize();
    expect(fixed.position).toMatchObject({ x: 0, y: 0 });
    fixed.destroy();
  });

  it('protects caller resources while destroying factory resources, regardless of destroy options', () => {
    for (const options of [true, { material: true }]) {
      const view = new View3D();
      const rawMaterial = new Material3D();
      const rawGeometry = new CubeGeometry();
      view.add.mesh({ geometry: rawGeometry, material: rawMaterial });
      const made = view.add.mesh({ geometry: 'box' });
      const madeMaterial = made.material;
      const rawGeometryDestroy = vi.spyOn(rawGeometry, 'destroy');
      const madeGeometryDestroy = vi.spyOn(made.geometry, 'destroy');
      view.destroy(options as any);
      expect(rawMaterial.destroyed).toBe(false);
      expect(madeMaterial.destroyed).toBe(true);
      expect(rawGeometryDestroy).not.toHaveBeenCalled();
      expect(madeGeometryDestroy).toHaveBeenCalledTimes(1);
      rawMaterial.destroy();
      rawGeometry.destroy();
    }
  });

  it('updates owned players from app ticker and rejects missing renderer integration', () => {
    const view = new View3D();
    const player = { destroyed: false, update: vi.fn() };
    view.owned.player(player);
    view.update();
    expect(player.update).toHaveBeenCalledWith(h.app.ticker);
    view.destroy();
    h.app.renderer = { name: 'webgpu', lighting3d: undefined as any, resolution: 3 };
    expect(() => new View3D()).toThrow(/@pixi\/3d was loaded after the renderer was created/);
  });

  it('widens the camera on a portrait screen only when fitAspect is set', () => {
    h.app.size = { width: 1600, height: 900 };
    const fixed = new View3D({ camera: { fov: 50 } });
    const fitted = new View3D({ camera: { fov: 50, fitAspect: 16 / 9 } });
    expect(fitted.camera.fov).toBe(50);
    h.app.size = { width: 600, height: 1100 };
    fixed.resize();
    fitted.resize();
    expect(fixed.camera.fov).toBe(50);
    expect(fitted.camera.fov).toBeGreaterThan(100);
    h.app.size = { width: 800, height: 600 };
    fixed.destroy();
    fitted.destroy();
  });

  it('resizes owned parts immediately with the screen or fixed view size and on later layout', () => {
    const screen = new View3D();
    const screenResize = vi.fn();
    const screenPart = { resize: screenResize, destroy: vi.fn() };
    expect(screen.own(screenPart)).toBe(screenPart);
    expect(screenResize).toHaveBeenCalledExactlyOnceWith({ width: 800, height: 600 });
    screen.resize();
    screen.added();
    expect(screenResize).toHaveBeenCalledTimes(3);
    expect(screenResize).toHaveBeenLastCalledWith({ width: 800, height: 600 });
    screen.destroy();

    const fixed = new View3D({ width: 320, height: 240 });
    const fixedResize = vi.fn();
    fixed.own({ resize: fixedResize, destroy: vi.fn() });
    expect(fixedResize).toHaveBeenCalledExactlyOnceWith({ width: 320, height: 240 });
    fixed.resize();
    expect(fixedResize).toHaveBeenLastCalledWith({ width: 320, height: 240 });
    fixed.destroy();
  });

  it('updates owned parts after model players with the application ticker', () => {
    const view = new View3D();
    const order: string[] = [];
    view.owned.player({ destroyed: false, update: () => { order.push('player'); } });
    const update = vi.fn(() => { order.push('part'); });
    view.own({ update, destroy: vi.fn() });
    view.update();
    expect(update).toHaveBeenCalledExactlyOnceWith(h.app.ticker);
    expect(order).toEqual(['player', 'part']);
    view.destroy();
  });

  it('destroys parts once while the view tree is still usable', () => {
    const view = new View3D();
    const destroy = vi.fn(() => { expect(view.destroyed).toBe(false); });
    view.own({ destroy });
    view.destroy();
    view.destroy();
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
