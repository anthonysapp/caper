import { Container3D, CubeGeometry, Material3D, View3D as PixiView3D } from '@pixi/3d';
import { Assets } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { getEntityCtor, getRegisteredEntityIds } from '@caperjs/core';
import { createFactory3D } from './factory3d';
import { Owned3D } from './owned';

vi.mock('@caperjs/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@caperjs/core')>()),
  getEntityCtor: vi.fn(),
  getRegisteredEntityIds: vi.fn(() => ['cube']),
}));

describe('createFactory3D', () => {
  it('owns an explicit material that meshes can share while color meshes own separate materials', () => {
    const root = new Container3D();
    const owned = new Owned3D();
    const add = createFactory3D(root, owned, true);
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
    const props = { position: [1, 2, 3], scale: 2, lookAt: [0, 0, 0], color: 0xff0000 };
    const add = createFactory3D(root, owned, true);
    const node = add.entity('cube' as never, props as never);
    expect(node).toBeInstanceOf(Cube);
    expect((node as Cube).props).toBe(props);
    expect(node.position).toMatchObject({ x: 1, y: 2, z: 3 });
    expect((node as Cube).positionWhenAdded).toEqual({ x: 1, y: 2, z: 3 });
    expect(node.scale.x).toBe(2);
    expect(node.parent).toBe(root);
    expect('color' in node).toBe(false);
    expect(createFactory3D(root, owned, false).entity('cube' as never, props as never).parent).toBeNull();
    root.destroy({ children: true });
    owned.destroy();
  });

  it('rejects non-3D and unknown entity ids before construction', () => {
    const construct = vi.fn();
    class Other { constructor() { construct(); } }
    vi.mocked(getEntityCtor).mockReturnValueOnce(Other).mockReturnValueOnce(undefined);
    const add = createFactory3D(new Container3D(), new Owned3D(), true);
    expect(() => add.entity('other' as never)).toThrow(
      "Entity 'other' is not a 3D entity (its class does not extend Container3D). Use this.add.entity for 2D entities.",
    );
    expect(construct).not.toHaveBeenCalled();
    expect(() => add.entity('missing' as never)).toThrow("Unknown entity id 'missing'. Known: 'cube'");
    expect(getRegisteredEntityIds).toHaveBeenCalled();
  });
  it('parents add under root, leaves make detached, and respects a parent prop', () => {
    const view = new PixiView3D();
    const owned = new Owned3D();
    const add = createFactory3D(view.root, owned, true);
    const make = createFactory3D(view.root, owned, false);
    const nested = new Container3D();
    const added = add.container({ x: 2, y: 3, z: 4 });
    expect(added.parent).toBe(view.root);
    expect(added.position).toMatchObject({ x: 2, y: 3, z: 4 });
    expect(make.container({ position: [5, 6, 7] }).parent).toBeNull();
    expect(add.container({ parent: nested }).parent).toBe(nested);
    expect(add.container({ position: [1, 2, 3] }).position).toMatchObject({ x: 1, y: 2, z: 3 });
    view.destroy({ children: true });
  });

  it('owns only built-in geometry and default material', () => {
    const view = new PixiView3D();
    const owned = new Owned3D();
    const geometry = vi.spyOn(owned, 'geometry');
    const material = vi.spyOn(owned, 'material');
    const add = createFactory3D(view.root, owned, true);
    const made = add.mesh({ geometry: 'box', color: 0xff0000 });
    expect(geometry).toHaveReturnedWith(made.geometry);
    expect(add.mesh({ geometry: 'box' }).geometry).toBe(made.geometry);
    expect(material).toHaveBeenCalledWith(made.material);
    const rawGeometry = new CubeGeometry();
    const rawMaterial = new Material3D();
    add.mesh({ geometry: rawGeometry, material: rawMaterial });
    expect(geometry).toHaveBeenCalledTimes(2);
    expect(material).toHaveBeenCalledTimes(2);
    view.destroy({ children: true });
    owned.destroy();
    rawGeometry.destroy();
    rawMaterial.destroy();
  });

  it('parents an existing node on add and applies shorthand props to it', () => {
    const view = new PixiView3D();
    const owned = new Owned3D();
    const node = createFactory3D(view.root, owned, true).existing(new Container3D(), {
      position: [1, 2, 3],
      scale: 2,
    });
    expect(node.parent).toBe(view.root);
    expect(node.position).toMatchObject({ x: 1, y: 2, z: 3 });
    expect(node.scale.x).toBe(2);
    expect(createFactory3D(view.root, owned, false).existing(new Container3D(), { label: 'loose' }).parent).toBeNull();
    view.destroy({ children: true });
  });

  it('aims a default directional light down and rejects unknown geometry', () => {
    const view = new PixiView3D();
    const add = createFactory3D(view.root, new Owned3D(), true);
    expect(add.light().rotation).toMatchObject({ x: -Math.PI / 4, y: Math.PI / 6, z: 0 });
    expect(() => add.mesh({ geometry: 'pyramid' as any })).toThrow(/box.*plane.*sphere/);
    view.destroy({ children: true });
  });

  it('explains an unloaded model asset', () => {
    const view = new PixiView3D();
    vi.spyOn(Assets, 'get').mockReturnValueOnce(undefined as any);
    expect(() => createFactory3D(view.root, new Owned3D(), true).model({ asset: 'missing' })).toThrow(
      /missing.*assets\.preload/,
    );
    view.destroy({ children: true });
  });
});
