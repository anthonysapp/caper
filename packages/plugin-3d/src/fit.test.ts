import { describe, expect, it } from 'vitest';
import { fitFov } from './fit';

const horizontal = (fov: number, aspect: number) =>
  (2 * Math.atan(Math.tan((fov * Math.PI) / 360) * aspect) * 180) / Math.PI;

describe('fitFov', () => {
  it('keeps the vertical field of view when no reference aspect is given', () => {
    expect(fitFov(60, 0.5)).toBe(60);
    expect(fitFov(60, 2)).toBe(60);
  });

  it('keeps the vertical field of view on screens at least as wide as the reference', () => {
    expect(fitFov(60, 16 / 9, 16 / 9)).toBe(60);
    expect(fitFov(60, 21 / 9, 16 / 9)).toBe(60);
  });

  it('widens the vertical field of view on narrower screens so the reference width stays in frame', () => {
    const fov = fitFov(60, 600 / 1100, 16 / 9);
    expect(fov).toBeGreaterThan(60);
    expect(fov).toBeLessThan(180);
    expect(horizontal(fov, 600 / 1100)).toBeCloseTo(horizontal(60, 16 / 9), 6);
  });

  it('ignores a size that is not ready yet', () => {
    expect(fitFov(60, 0, 16 / 9)).toBe(60);
    expect(fitFov(60, Number.NaN, 16 / 9)).toBe(60);
  });
});
