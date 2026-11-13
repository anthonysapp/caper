import { describe, expect, it } from 'vitest';
import { assertRenderer3D } from './renderer';

describe('assertRenderer3D', () => {
  it('rejects no renderer and Canvas', () => {
    expect(() => assertRenderer3D(undefined)).toThrow(/^\[@caperjs\/plugin-3d\].*renderer/i);
    expect(() => assertRenderer3D({ name: 'canvas' })).toThrow(/^\[@caperjs\/plugin-3d\].*Canvas/);
  });
  it('rejects WebGL1', () => {
    expect(() => assertRenderer3D({ name: 'webgl', gl: {} })).toThrow(/^\[@caperjs\/plugin-3d\].*WebGL2/);
  });
  it('rejects a late import', () => {
    expect(() => assertRenderer3D({ name: 'webgpu' })).toThrow(/@pixi\/3d was loaded after the renderer was created/);
  });
  it('accepts WebGL2 and WebGPU with lighting', () => {
    expect(() => assertRenderer3D({ name: 'webgl', gl: { texImage3D() {} }, lighting3d: {} })).not.toThrow();
    expect(() => assertRenderer3D({ name: 'webgpu', lighting3d: {} })).not.toThrow();
  });
});
