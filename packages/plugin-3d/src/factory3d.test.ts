import { Container3D, CubeGeometry, Material3D, View3D as PixiView3D } from '@pixi/3d';
import { Assets } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { createFactory3D } from './factory3d';
import { Owned3D } from './owned';

describe('createFactory3D', () => {
  it('parents add under root, leaves make detached, and respects a parent prop', () => {
    const view = new PixiView3D();
    const owned = new Owned3D();
    const add = createFactory3D(view, owned, true);
    const make = createFactory3D(view, owned, false);
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
    const add = createFactory3D(view, owned, true);
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
    const node = createFactory3D(view, owned, true).existing(new Container3D(), {
      position: [1, 2, 3],
      scale: 2,
    });
    expect(node.parent).toBe(view.root);
    expect(node.position).toMatchObject({ x: 1, y: 2, z: 3 });
    expect(node.scale.x).toBe(2);
    expect(createFactory3D(view, owned, false).existing(new Container3D(), { label: 'loose' }).parent).toBeNull();
    view.destroy({ children: true });
  });

  it('aims a default directional light down and rejects unknown geometry', () => {
    const view = new PixiView3D();
    const add = createFactory3D(view, new Owned3D(), true);
    expect(add.light().rotation).toMatchObject({ x: -Math.PI / 4, y: Math.PI / 6, z: 0 });
    expect(() => add.mesh({ geometry: 'pyramid' as any })).toThrow(/box.*plane.*sphere/);
    view.destroy({ children: true });
  });

  it('explains an unloaded model asset', () => {
    const view = new PixiView3D();
    vi.spyOn(Assets, 'get').mockReturnValueOnce(undefined as any);
    expect(() => createFactory3D(view, new Owned3D(), true).model({ asset: 'missing' })).toThrow(
      /missing.*assets\.preload/,
    );
    view.destroy({ children: true });
  });
});
