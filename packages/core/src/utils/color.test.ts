import { describe, expect, it } from 'vitest';
import { Color } from './color';

describe('Color.rgbToHexString', () => {
  it('rounds fractional rgb components to a valid 2-digit hex pair', () => {
    expect(Color.rgbToHexString(127.5)).toBe('80');
    expect(Color.rgbToHexString(0.4)).toBe('00');
    expect(Color.rgbToHexString(254.9)).toBe('ff');
  });

  it('produces a valid 6-digit hex string from fractional rgb components', () => {
    const hex = Color.rgbToFullHexString(127.5, 0.4, 254.9);
    expect(hex).toMatch(/^[0-9a-f]{6}$/);
    expect(hex).toBe('8000ff');
  });
});
