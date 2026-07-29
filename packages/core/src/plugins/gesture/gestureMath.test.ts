import { describe, expect, it } from 'vitest';

import { computeFrame, frameDelta } from './gestureMath';
import type { PointerSample } from './gestureMath';

describe('computeFrame', () => {
  it('returns a zero frame for no pointers', () => {
    expect(computeFrame([])).toEqual({ centerX: 0, centerY: 0, spread: 0 });
  });

  it('centers on the single pointer with zero spread', () => {
    const p: PointerSample[] = [{ id: 1, x: 10, y: 20 }];
    expect(computeFrame(p)).toEqual({ centerX: 10, centerY: 20, spread: 0 });
  });

  it('computes the centroid of two pointers', () => {
    const p: PointerSample[] = [
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 100, y: 0 },
    ];
    const frame = computeFrame(p);
    expect(frame.centerX).toBe(50);
    expect(frame.centerY).toBe(0);
  });

  it('spread is half the pair distance for two pointers', () => {
    const p: PointerSample[] = [
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 100, y: 0 },
    ];
    expect(computeFrame(p).spread).toBe(50);
  });

  it('generalises spread to 3+ pointers as the mean radial distance', () => {
    const p: PointerSample[] = [
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 100, y: 0 },
      { id: 3, x: 50, y: 100 },
    ];
    // centroid = (50, 33.33...)
    const frame = computeFrame(p);
    expect(frame.centerX).toBeCloseTo(50);
    expect(frame.centerY).toBeCloseTo(33.333, 2);
    expect(frame.spread).toBeGreaterThan(0);
  });
});

describe('frameDelta', () => {
  it('computes centroid translation', () => {
    const prev = { centerX: 0, centerY: 0, spread: 50 };
    const next = { centerX: 10, centerY: -5, spread: 50 };
    const delta = frameDelta(prev, next);
    expect(delta.dx).toBe(10);
    expect(delta.dy).toBe(-5);
    expect(delta.scale).toBe(1);
  });

  it('computes the spread ratio as scale', () => {
    const prev = { centerX: 0, centerY: 0, spread: 50 };
    const next = { centerX: 0, centerY: 0, spread: 100 };
    expect(frameDelta(prev, next).scale).toBe(2);
  });

  it('guards a near-zero previous spread by returning scale: 1', () => {
    const prev = { centerX: 0, centerY: 0, spread: 0 };
    const next = { centerX: 0, centerY: 0, spread: 100 };
    expect(frameDelta(prev, next).scale).toBe(1);
  });

  it('guards a previous spread just under the epsilon', () => {
    const prev = { centerX: 0, centerY: 0, spread: 0.005 };
    const next = { centerX: 0, centerY: 0, spread: 50 };
    expect(frameDelta(prev, next).scale).toBe(1);
  });
});
