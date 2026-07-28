import { describe, expect, it } from 'vitest';

import { defaultBreakpoints } from './types';
import type { BreakpointContext, BreakpointMode } from './types';
import { activeNames, buildContext, diffNames, matchesMode, normalizeTiers, resolveTier, resolveStop } from './evaluate';

const ladder = normalizeTiers({ ...defaultBreakpoints });

function ctx(overrides: Partial<BreakpointContext> = {}): BreakpointContext {
  return {
    width: 800,
    height: 600,
    aspect: 800 / 600,
    tier: 'tablet',
    orientation: 'landscape',
    pointer: 'fine',
    ...overrides,
  };
}

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

describe('resolveStop', () => {
  it('passes numbers through', () => {
    expect(resolveStop(ladder, 880)).toBe(880);
  });

  it('resolves a tier name to its stop', () => {
    expect(resolveStop(ladder, 'tablet')).toBe(768);
  });

  it('returns undefined for an unknown name', () => {
    expect(resolveStop(ladder, 'nope')).toBeUndefined();
  });
});

describe('matchesMode', () => {
  it('matches an empty condition', () => {
    expect(matchesMode(ctx(), {}, ladder)).toBe(true);
  });

  it('matches a single tier', () => {
    expect(matchesMode(ctx({ tier: 'tablet' }), { tier: 'tablet' }, ladder)).toBe(true);
    expect(matchesMode(ctx({ tier: 'mobile' }), { tier: 'tablet' }, ladder)).toBe(false);
  });

  it('matches tier membership in an array', () => {
    const mode = { tier: ['mobile', 'tablet'] };
    expect(matchesMode(ctx({ tier: 'mobile' }), mode, ladder)).toBe(true);
    expect(matchesMode(ctx({ tier: 'tablet' }), mode, ladder)).toBe(true);
    expect(matchesMode(ctx({ tier: 'desktop' }), mode, ladder)).toBe(false);
  });

  it('resolves atLeast/below by tier name identically to the raw stop', () => {
    const byName = matchesMode(ctx({ width: 768 }), { atLeast: 'tablet' }, ladder);
    const byPx = matchesMode(ctx({ width: 768 }), { atLeast: 768 }, ladder);
    expect(byName).toBe(true);
    expect(byPx).toBe(byName);

    expect(matchesMode(ctx({ width: 767 }), { atLeast: 'tablet' }, ladder)).toBe(false);
    expect(matchesMode(ctx({ width: 767 }), { below: 'tablet' }, ladder)).toBe(true);
    expect(matchesMode(ctx({ width: 768 }), { below: 'tablet' }, ladder)).toBe(false);
  });

  it('is false when a stop name is unknown', () => {
    expect(matchesMode(ctx(), { atLeast: 'nope' }, ladder)).toBe(false);
    expect(matchesMode(ctx(), { below: 'nope' }, ladder)).toBe(false);
  });

  it('ANDs every key', () => {
    const mode = { atLeast: 'tablet' as const, orientation: 'landscape' as const };
    expect(matchesMode(ctx({ width: 900, orientation: 'landscape' }), mode, ladder)).toBe(true);
    expect(matchesMode(ctx({ width: 900, orientation: 'portrait' }), mode, ladder)).toBe(false);
    expect(matchesMode(ctx({ width: 400, orientation: 'landscape' }), mode, ladder)).toBe(false);
  });

  it('matches the pointer and height keys', () => {
    expect(matchesMode(ctx({ pointer: 'coarse' }), { pointer: 'coarse' }, ladder)).toBe(true);
    expect(matchesMode(ctx({ pointer: 'fine' }), { pointer: 'coarse' }, ladder)).toBe(false);
    expect(matchesMode(ctx({ height: 600 }), { minHeight: 600 }, ladder)).toBe(true);
    expect(matchesMode(ctx({ height: 599 }), { minHeight: 600 }, ladder)).toBe(false);
    expect(matchesMode(ctx({ height: 600 }), { maxHeight: 600 }, ladder)).toBe(true);
    expect(matchesMode(ctx({ height: 601 }), { maxHeight: 600 }, ladder)).toBe(false);
  });

  it('supports a predicate', () => {
    expect(matchesMode(ctx({ width: 800, height: 600 }), (c) => c.aspect > 1, ladder)).toBe(true);
    expect(matchesMode(ctx(), () => false, ladder)).toBe(false);
  });

  it('treats a throwing predicate as false', () => {
    const boom = () => {
      throw new Error('boom');
    };
    expect(matchesMode(ctx(), boom, ladder, 'boom')).toBe(false);
  });
});

describe('buildContext', () => {
  it('derives tier, orientation and aspect', () => {
    const c = buildContext({ width: 1000, height: 500 }, ladder, 'fine');
    expect(c.tier).toBe('tablet');
    expect(c.orientation).toBe('landscape');
    expect(c.aspect).toBe(2);
    expect(c.pointer).toBe('fine');
  });

  it('treats equal width and height as portrait', () => {
    expect(buildContext({ width: 600, height: 600 }, ladder, 'fine').orientation).toBe('portrait');
  });

  it('survives a zero size without dividing by zero', () => {
    const c = buildContext({ width: 0, height: 0 }, ladder, 'fine');
    expect(c.tier).toBe('mobile');
    expect(c.orientation).toBe('portrait');
    expect(c.aspect).toBe(0);
  });
});

describe('activeNames', () => {
  const modes = new Map<string, BreakpointMode>([
    ['stacked', { below: 880 }],
    ['roomy', { atLeast: 'desktop' }],
  ]);

  it('collects tier, axes and matching modes into one set', () => {
    const c = buildContext({ width: 800, height: 600 }, ladder, 'coarse');
    expect(activeNames(c, modes, ladder)).toEqual(new Set(['tablet', 'landscape', 'coarse', 'stacked']));
  });

  it('drops modes that stop matching', () => {
    const c = buildContext({ width: 1200, height: 600 }, ladder, 'fine');
    expect(activeNames(c, modes, ladder)).toEqual(new Set(['desktop', 'landscape', 'fine', 'roomy']));
  });
});

describe('diffNames', () => {
  it('reports an empty diff when nothing changed', () => {
    const a = new Set(['tablet', 'landscape']);
    expect(diffNames(a, new Set(['tablet', 'landscape']))).toEqual({ entered: [], left: [] });
  });

  it('reports a tier change', () => {
    const d = diffNames(new Set(['tablet']), new Set(['desktop']));
    expect(d.entered).toEqual(['desktop']);
    expect(d.left).toEqual(['tablet']);
  });

  it('reports an orientation change', () => {
    const d = diffNames(new Set(['tablet', 'portrait']), new Set(['tablet', 'landscape']));
    expect(d.entered).toEqual(['landscape']);
    expect(d.left).toEqual(['portrait']);
  });

  it('reports a mode flip independently of the tier', () => {
    const d = diffNames(new Set(['tablet', 'stacked']), new Set(['tablet']));
    expect(d.entered).toEqual([]);
    expect(d.left).toEqual(['stacked']);
  });
});
