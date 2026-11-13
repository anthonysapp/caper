import { Application } from '@caperjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Entity3D } from './Entity3D';
import { View3D } from './View3D';
import { registerFactory3DMethods } from './factory3d';

const app = {
  renderer: { name: 'webgpu', lighting3d: {}, resolution: 2 },
  size: { width: 800, height: 600 },
  ticker: { add: vi.fn(), remove: vi.fn(), deltaTime: 1 },
  onResize: { connect: vi.fn(), disconnect: vi.fn() },
  getPlugin: vi.fn(() => ({ options: { quality: 'auto' } })),
};

beforeEach(() => {
  Application.instance = app as any;
  vi.clearAllMocks();
});

describe('Entity3D', () => {
  it('enables picking only when a pointer listener is added', () => {
    const passive = new Entity3D();
    expect(passive.eventMode).toBe('passive');
    passive.on('added', () => undefined);
    expect(passive.eventMode).toBe('passive');
    passive.on('pointertap', () => undefined);
    expect(passive.eventMode).toBe('static');
    const once = new Entity3D();
    once.once('pointerdown', () => undefined);
    expect(once.eventMode).toBe('static');
    const global = new Entity3D();
    global.on('globalpointermovecapture', () => undefined);
    expect(global.eventMode).toBe('static');
    const menu = new Entity3D();
    menu.on('contextmenu', () => undefined);
    expect(menu.eventMode).toBe('static');
    const disabled = new Entity3D();
    disabled.eventMode = 'none';
    disabled.on('pointertap', () => undefined);
    expect(disabled.eventMode).toBe('none');
  });

  it('explains why factories are unavailable before parenting', () => {
    const entity = new Entity3D();
    expect(() => entity.add).toThrow(
      'This Entity3D is not in a View3D yet. Build its parts in added(), after view.add.entity(...) or view.add.existing(entity).',
    );
  });

  it('builds parts in added and frees their resources and ticker listener with the view', () => {
    class Cube extends Entity3D {
      added = vi.fn(() => { this.mesh = this.add.mesh(); });
      mesh: ReturnType<Entity3D['add']['mesh']>;
      update = vi.fn();
    }
    const view = new View3D();
    const cube = new Cube();
    view.add.existing(cube);
    expect(cube.added).toHaveBeenCalledTimes(1);
    expect(cube.mesh.parent).toBe(cube);
    expect(app.ticker.add).toHaveBeenCalledWith(cube.update, cube, expect.any(Number));
    const material = cube.mesh.material;
    view.destroy();
    expect(cube.destroyed).toBe(true);
    expect(material.destroyed).toBe(true);
    expect(app.ticker.remove).toHaveBeenCalledWith(cube.update, cube);
  });

  it('passes its containing view to registered add and make methods', () => {
    const method = vi.fn((view: View3D, value: string) => ({ view, value }));
    const dispose = registerFactory3DMethods({ probe: method });
    try {
      const view = new View3D();
      const entity = new Entity3D();
      view.add.existing(entity);
      const add = entity.add as typeof entity.add & { probe(value: string): unknown };
      const make = entity.make as typeof entity.make & { probe(value: string): unknown };
      expect(add.probe('add')).toEqual({ view, value: 'add' });
      expect(make.probe('make')).toEqual({ view, value: 'make' });
      expect(method).toHaveBeenNthCalledWith(1, view, 'add');
      expect(method).toHaveBeenNthCalledWith(2, view, 'make');
      view.destroy();
    } finally {
      dispose();
    }
  });
});
