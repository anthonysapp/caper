import { describe, expect, it } from 'vitest';
import { isStorageCapable } from './IStorageCapability';

describe('isStorageCapable', () => {
  it('accepts objects with save + load functions', () => {
    expect(isStorageCapable({ save() {}, load() {} })).toBe(true);
  });

  it('rejects objects missing save', () => {
    expect(isStorageCapable({ load() {} })).toBe(false);
  });

  it('rejects objects missing load', () => {
    expect(isStorageCapable({ save() {} })).toBe(false);
  });

  it('rejects non-function save/load', () => {
    expect(isStorageCapable({ save: true, load: true })).toBe(false);
  });

  it('rejects null / undefined / primitives', () => {
    expect(isStorageCapable(null)).toBe(false);
    expect(isStorageCapable(undefined)).toBe(false);
    expect(isStorageCapable('x')).toBe(false);
    expect(isStorageCapable(42)).toBe(false);
  });
});
