import { Material3D, CubeGeometry } from '@pixi/3d';
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
});
