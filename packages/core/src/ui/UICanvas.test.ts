import { describe, expect, it, vi } from 'vitest';

// UICanvas transitively imports Application → Pixi display graph. Stub it — the
// pure padding helper needs none of it.
vi.mock('../core/Application', () => ({
  Application: { getInstance: () => ({}) },
}));

import { computeEffectivePadding } from './UICanvas';

const zero = { top: 0, right: 0, bottom: 0, left: 0 };

describe('computeEffectivePadding', () => {
  it('adds the safe area to the configured padding', () => {
    expect(
      computeEffectivePadding({ top: 10, right: 10, bottom: 10, left: 10 }, { ...zero, top: 44, bottom: 34 }),
    ).toEqual({ top: 54, right: 10, bottom: 44, left: 10 });
  });

  it('returns the configured padding when there is no safe area', () => {
    expect(computeEffectivePadding({ top: 10, right: 20, bottom: 30, left: 40 }, zero)).toEqual({
      top: 10,
      right: 20,
      bottom: 30,
      left: 40,
    });
  });

  it('does not compound when applied repeatedly to the same base padding', () => {
    const base = { top: 10, right: 10, bottom: 10, left: 10 };
    const safeArea = { ...zero, top: 44 };
    computeEffectivePadding(base, safeArea);
    expect(computeEffectivePadding(base, safeArea).top).toBe(54);
  });
});
