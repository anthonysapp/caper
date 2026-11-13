import { Container3D, CubeGeometry, Material3D, View3D as PixiView3D } from '@pixi/3d';
import { Assets } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { getEntityCtor, getRegisteredEntityIds } from '@caperjs/core';
import { createFactory3D, registerFactory3DMethods, type Factory3D } from './factory3d';
import { Owned3D } from './owned';
import type { View3D } from './View3D';

vi.mock('@caperjs/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@caperjs/core')>()),
  getEntityCtor: vi.fn(),
  getRegisteredEntityIds: vi.fn(() => ['cube']),
}));

const BUILT_IN_KEYS = ['camera', 'container', 'entity', 'existing', 'light', 'material', 'mesh', 'model'];

function fakeCaperView(root: Container3D, owned: Owned3D): View3D {
  return { root, owned } as View3D;
}

function factory3D(root: Container3D, owned: Owned3D, parent: boolean, view: View3D): Factory3D {
  return createFactory3D(root, owned, parent, view);
}

describe('createFactory3D', () => {
  it('owns an explicit material that meshes can share while color meshes own separate materials', () => {
    const root = new Container3D();
    const owned = new Owned3D();
    const view = fakeCaperView(root, owned);
    const add = factory3D(root, owned, true, view);
    const material = add.material({ color: 0x123456 });
    expect(material.baseColor).toBe(0x123456);
    expect(add.mesh({ material }).material).toBe(material);
    expect(add.mesh({ material }).material).toBe(material);
    const one = add.mesh({ color: 0x123456 });
    const two = add.mesh({ color: 0x123456 });
    expect(one.material).not.toBe(two.material);
    root.destroy({ children: true });
    owned.destroy();
    expect(material.destroyed).toBe(true);
  });

  it('builds and places registered 3D entities without copying custom props onto the node', () => {
    class Cube extends Container3D {
      positionWhenAdded?: { x: number; y: number; z: number };
      constructor(readonly props?: unknown) {
        super();
        this.on('added', () => {
          this.positionWhenAdded = { x: this.x, y: this.y, z: this.z };
        });
      }
    }
    vi.mocked(getEntityCtor).mockReturnValue(Cube);
    const root = new Container3D();
    const owned = new Owned3D();
    const view = fakeCaperView(root, owned);
    const props = { position: [1, 2, 3], scale: 2, lookAt: [0, 0, 0], color: 0xff0000 };
    const add = factory3D(root, owned, true, view);
    const node = add.entity('cube' as never, props as never);
    expect(node).toBeInstanceOf(Cube);
    expect((node as Cube).props).toBe(props);
    expect(node.position).toMatchObject({ x: 1, y: 2, z: 3 });
    expect((node as Cube).positionWhenAdded).toEqual({ x: 1, y: 2, z: 3 });
    expect(node.scale.x).toBe(2);
    expect(node.parent).toBe(root);
    expect('color' in node).toBe(false);
    expect(factory3D(root, owned, false, view).entity('cube' as never, props as never).parent).toBeNull();
    root.destroy({ children: true });
    owned.destroy();
  });

  it('rejects non-3D and unknown entity ids before construction', () => {
    const construct = vi.fn();
    class Other { constructor() { construct(); } }
    vi.mocked(getEntityCtor).mockReturnValueOnce(Other).mockReturnValueOnce(undefined);
    const root = new Container3D();
    const owned = new Owned3D();
    const add = factory3D(root, owned, true, fakeCaperView(root, owned));
    expect(() => add.entity('other' as never)).toThrow(
      "Entity 'other' is not a 3D entity (its class does not extend Container3D). Use this.add.entity for 2D entities.",
    );
    expect(construct).not.toHaveBeenCalled();
    expect(() => add.entity('missing' as never)).toThrow("Unknown entity id 'missing'. Known: 'cube'");
    expect(getRegisteredEntityIds).toHaveBeenCalled();
  });
  it('parents add under root, leaves make detached, and respects a parent prop', () => {
    const pixiView = new PixiView3D();
    const owned = new Owned3D();
    const view = fakeCaperView(pixiView.root, owned);
    const add = factory3D(pixiView.root, owned, true, view);
    const make = factory3D(pixiView.root, owned, false, view);
    const nested = new Container3D();
    const added = add.container({ x: 2, y: 3, z: 4 });
    expect(added.parent).toBe(pixiView.root);
    expect(added.position).toMatchObject({ x: 2, y: 3, z: 4 });
    expect(make.container({ position: [5, 6, 7] }).parent).toBeNull();
    expect(add.container({ parent: nested }).parent).toBe(nested);
    expect(add.container({ position: [1, 2, 3] }).position).toMatchObject({ x: 1, y: 2, z: 3 });
    pixiView.destroy({ children: true });
  });

  it('owns only built-in geometry and default material', () => {
    const pixiView = new PixiView3D();
    const owned = new Owned3D();
    const view = fakeCaperView(pixiView.root, owned);
    const geometry = vi.spyOn(owned, 'geometry');
    const material = vi.spyOn(owned, 'material');
    const add = factory3D(pixiView.root, owned, true, view);
    const made = add.mesh({ geometry: 'box', color: 0xff0000 });
    expect(geometry).toHaveReturnedWith(made.geometry);
    expect(add.mesh({ geometry: 'box' }).geometry).toBe(made.geometry);
    expect(material).toHaveBeenCalledWith(made.material);
    const rawGeometry = new CubeGeometry();
    const rawMaterial = new Material3D();
    add.mesh({ geometry: rawGeometry, material: rawMaterial });
    expect(geometry).toHaveBeenCalledTimes(2);
    expect(material).toHaveBeenCalledTimes(2);
    pixiView.destroy({ children: true });
    owned.destroy();
    rawGeometry.destroy();
    rawMaterial.destroy();
  });

  it('parents an existing node on add and applies shorthand props to it', () => {
    const pixiView = new PixiView3D();
    const owned = new Owned3D();
    const view = fakeCaperView(pixiView.root, owned);
    const node = factory3D(pixiView.root, owned, true, view).existing(new Container3D(), {
      position: [1, 2, 3],
      scale: 2,
    });
    expect(node.parent).toBe(pixiView.root);
    expect(node.position).toMatchObject({ x: 1, y: 2, z: 3 });
    expect(node.scale.x).toBe(2);
    expect(factory3D(pixiView.root, owned, false, view).existing(new Container3D(), { label: 'loose' }).parent).toBeNull();
    pixiView.destroy({ children: true });
  });

  it('aims a default directional light down and rejects unknown geometry', () => {
    const pixiView = new PixiView3D();
    const owned = new Owned3D();
    const view = fakeCaperView(pixiView.root, owned);
    const add = factory3D(pixiView.root, owned, true, view);
    expect(add.light().rotation).toMatchObject({ x: -Math.PI / 4, y: Math.PI / 6, z: 0 });
    expect(() => add.mesh({ geometry: 'pyramid' as any })).toThrow(/box.*plane.*sphere/);
    pixiView.destroy({ children: true });
  });

  it('explains an unloaded model asset', () => {
    const pixiView = new PixiView3D();
    const owned = new Owned3D();
    const view = fakeCaperView(pixiView.root, owned);
    vi.spyOn(Assets, 'get').mockReturnValueOnce(undefined as any);
    expect(() => factory3D(pixiView.root, owned, true, view).model({ asset: 'missing' })).toThrow(
      /missing.*assets\.preload/,
    );
    pixiView.destroy({ children: true });
  });
});

describe('registerFactory3DMethods', () => {
  it('exposes a registered method on later add and make factories with view first then args', () => {
    const root = new Container3D();
    const owned = new Owned3D();
    const caperView = fakeCaperView(root, owned);
    const earlier = factory3D(root, owned, true, caperView);
    const method = vi.fn((view: View3D, value: number) => ({ view, value }));
    const dispose = registerFactory3DMethods({ probe: method });
    try {
      expect(Object.keys(earlier)).not.toContain('probe');
      const add = factory3D(root, owned, true, caperView);
      const make = factory3D(root, owned, false, caperView);
      expect(Object.keys(add)).toContain('probe');
      expect(Object.keys(make)).toContain('probe');
      const fromAdd = (add as Factory3D & { probe(value: number): { view: View3D; value: number } }).probe(7);
      const fromMake = (make as Factory3D & { probe(value: number): { view: View3D; value: number } }).probe(9);
      expect(method).toHaveBeenCalledWith(caperView, 7);
      expect(method).toHaveBeenCalledWith(caperView, 9);
      expect(fromAdd).toEqual({ view: caperView, value: 7 });
      expect(fromMake).toEqual({ view: caperView, value: 9 });
      dispose();
      expect((add as Factory3D & { probe(value: number): unknown }).probe(10)).toEqual({ view: caperView, value: 10 });
      expect(Object.keys(factory3D(root, owned, true, caperView))).not.toContain('probe');
    } finally {
      dispose();
    }
  });

  it('rejects built-in mesh collisions with the spec message and registers nothing from that call', () => {
    const meshCollision =
      '[caper] registerFactory3DMethods: "mesh" is a built-in 3D factory method and cannot be replaced. Pick another name.';
    const ok = () => ({});
    expect(() => registerFactory3DMethods({ ok, mesh: ok } as never)).toThrow(meshCollision);
    const root = new Container3D();
    const owned = new Owned3D();
    const add = factory3D(root, owned, true, fakeCaperView(root, owned));
    expect(Object.keys(add)).not.toContain('ok');
    expect(Object.keys(add).sort()).toEqual([...BUILT_IN_KEYS].sort());
  });

  it('names both functions on collision and treats the same function twice as a no-op', () => {
    function a() { return 'first'; }
    function b() { return 'second'; }
    const disposeA = registerFactory3DMethods({ probe: a });
    try {
      expect(() => registerFactory3DMethods({ probe: b })).toThrow(
        '[caper] registerFactory3DMethods: "probe" is already registered (by function "a"); cannot register function "b" under the same name.',
      );
      const root = new Container3D();
      const owned = new Owned3D();
      const view = fakeCaperView(root, owned);
      const keysBefore = Object.keys(factory3D(root, owned, true, view)).sort();
      const duplicateA = registerFactory3DMethods({ probe: a });
      try {
        expect(Object.keys(factory3D(root, owned, true, view)).sort()).toEqual(keysBefore);
        const add = factory3D(root, owned, true, view) as Factory3D & { probe(): string };
        expect(add.probe()).toBe('first');
      } finally {
        duplicateA();
      }
    } finally {
      disposeA();
    }
  });

  it('rejects non-function methods', () => {
    expect(() => registerFactory3DMethods({ widget: 1 as never })).toThrow(
      '[caper] registerFactory3DMethods: "widget" must be a function.',
    );
  });

  it('disposes only its own names, is idempotent, and keeps a later registration under a former name', () => {
    const widget = () => ({ kind: 'widget' } as never);
    const replacement = () => ({ kind: 'replacement' } as never);
    const other = () => ({ kind: 'other' } as never);
    const first = registerFactory3DMethods({ widget });
    const second = registerFactory3DMethods({ widget, other } as never);
    try {
      first();
      first();
      const root = new Container3D();
      const owned = new Owned3D();
      const view = fakeCaperView(root, owned);
      const factories = factory3D(root, owned, true, view) as Factory3D & {
        widget(): unknown;
        other(): unknown;
      };
      expect(factories.widget).toBeUndefined();
      expect(factories.other()).toEqual({ kind: 'other' });
      const third = registerFactory3DMethods({ widget: replacement });
      try {
        first();
        const later = factory3D(root, owned, true, view) as Factory3D & { widget(): unknown };
        expect(later.widget()).toEqual({ kind: 'replacement' });
      } finally {
        third();
      }
    } finally {
      second();
    }
  });

  it('exposes only built-in keys when nothing is registered', () => {
    const root = new Container3D();
    const owned = new Owned3D();
    const view = fakeCaperView(root, owned);
    expect(Object.keys(factory3D(root, owned, true, view)).sort()).toEqual([...BUILT_IN_KEYS].sort());
    expect(Object.keys(factory3D(root, owned, false, view)).sort()).toEqual([...BUILT_IN_KEYS].sort());
  });
});
