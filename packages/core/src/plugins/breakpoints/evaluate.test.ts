import { describe, expect, it } from 'vitest';

import { defaultBreakpoints } from './types';
import { normalizeTiers, resolveTier } from './evaluate';

describe('normalizeTiers', () => {
  it('sorts by stop regardless of key order', () => {
    const ladder = normalizeTiers({ desktop: 1024, mobile: 0, tablet: 768 });
    expect(ladder.names).toEqual(['mobile', 'tablet', 'desktop']);
    expect(ladder.stops).toEqual([0, 768, 1024]);
    expect(ladder.byName.tablet).toBe(768);
  });

  it('throws on an empty ladder', () => {
    expect(() => normalizeTiers({})).toThrow(/at least one tier/i);
  });

  it('throws when the lowest tier does not start at 0', () => {
    expect(() => normalizeTiers({ small: 320, large: 1024 })).toThrow(/must start at 0/i);
  });

  it('throws on duplicate stops', () => {
    expect(() => normalizeTiers({ a: 0, b: 768, c: 768 })).toThrow(/same stop/i);
  });

  it('throws on a negative or non-finite stop', () => {
    expect(() => normalizeTiers({ a: 0, b: -1 })).toThrow(/invalid stop/i);
    expect(() => normalizeTiers({ a: 0, b: Number.NaN })).toThrow(/invalid stop/i);
  });
});

describe('resolveTier', () => {
  const ladder = normalizeTiers({ ...defaultBreakpoints });

  it('resolves each boundary exactly', () => {
    expect(resolveTier(ladder, 0)).toBe('mobile');
    expect(resolveTier(ladder, 767)).toBe('mobile');
    expect(resolveTier(ladder, 768)).toBe('tablet');
    expect(resolveTier(ladder, 1023)).toBe('tablet');
    expect(resolveTier(ladder, 1024)).toBe('desktop');
    expect(resolveTier(ladder, 1439)).toBe('desktop');
    expect(resolveTier(ladder, 1440)).toBe('wide');
    expect(resolveTier(ladder, 99999)).toBe('wide');
  });

  it('clamps below the lowest stop to the lowest tier', () => {
    expect(resolveTier(ladder, -50)).toBe('mobile');
  });

  it('works with a custom ladder', () => {
    const custom = normalizeTiers({ tiny: 0, huge: 2200 });
    expect(resolveTier(custom, 2199)).toBe('tiny');
    expect(resolveTier(custom, 2200)).toBe('huge');
  });
});
