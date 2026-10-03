import { describe, expect, it } from 'vitest';
import { resolveOrientation } from './orientation';

describe('resolveOrientation', () => {
  it('is null when unset', () => {
    expect(resolveOrientation(undefined)).toBeNull();
    expect(resolveOrientation(null)).toBeNull();
  });

  it.each(['portrait', 'landscape'] as const)('expands the %s shorthand with the default overlay', (lock) => {
    expect(resolveOrientation(lock)).toEqual({ lock, overlay: {} });
  });

  it('keeps the object form, defaulting the overlay', () => {
    expect(resolveOrientation({ lock: 'landscape' })).toEqual({ lock: 'landscape', overlay: {} });
  });

  it('passes overlay options and false through', () => {
    const overlay = { text: 'Hold your phone upright to play' };
    expect(resolveOrientation({ lock: 'portrait', overlay })).toEqual({ lock: 'portrait', overlay });
    expect(resolveOrientation({ lock: 'portrait', overlay: false })).toEqual({ lock: 'portrait', overlay: false });
  });

  it.each(['any', 'Portrait', 1, true, {}, { lock: 'any' }, { overlay: false }, { lock: 'portrait', overlay: 'off' }])(
    'throws on %o',
    (value) => {
      expect(() => resolveOrientation(value)).toThrow(/orientation/);
    },
  );
});
