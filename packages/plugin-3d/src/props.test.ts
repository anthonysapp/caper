import { describe, expect, it } from 'vitest';
import { resolveNodeOptions, toVec3 } from './props';

describe('3D props', () => {
  it('converts tuples and leaves objects and numbers alone', () => {
    const position = { x: 4, y: 5, z: 6 };
    expect(toVec3([1, 2, 3])).toEqual({ x: 1, y: 2, z: 3 });
    expect(toVec3(position)).toBe(position);
    expect(resolveNodeOptions({ position: [1, 2, 3], rotation: [4, 5, 6], scale: [2, 3, 4] })).toEqual({
      position: { x: 1, y: 2, z: 3 },
      rotation: { x: 4, y: 5, z: 6 },
      scale: { x: 2, y: 3, z: 4 },
    });
    expect(resolveNodeOptions({ position, scale: 2 }).position).toBe(position);
    expect(resolveNodeOptions({ scale: 2 }).scale).toBe(2);
  });

  it('removes Caper-only keys and keeps raw unknown keys', () => {
    expect(resolveNodeOptions({ lookAt: [0, 0, 0], label: 'node', custom: 7 } as any)).toEqual({
      label: 'node',
      custom: 7,
    });
  });
});
