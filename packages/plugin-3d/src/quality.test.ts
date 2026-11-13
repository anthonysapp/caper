import { describe, expect, it } from 'vitest';
import { resolveQuality } from './quality';

describe('resolveQuality', () => {
  it('uses high shadows and inherited resolution for high', () => {
    expect(resolveQuality('high', { isMobile: true, resolution: 3 })).toEqual({
      shadowQuality: 'high',
      resolution: 'inherit',
    });
  });
  it('caps low quality at one on any device', () => {
    expect(resolveQuality('low', { isMobile: false, resolution: 3 })).toEqual({ shadowQuality: 'low', resolution: 1 });
    expect(resolveQuality('low', { isMobile: true, resolution: 0.75 })).toEqual({
      shadowQuality: 'low',
      resolution: 0.75,
    });
  });
  it('uses a mobile cap of two and medium desktop shadows', () => {
    expect(resolveQuality('auto', { isMobile: true, resolution: 3 })).toEqual({ shadowQuality: 'low', resolution: 2 });
    expect(resolveQuality('auto', { isMobile: true, resolution: 1.5 })).toEqual({
      shadowQuality: 'low',
      resolution: 1.5,
    });
    expect(resolveQuality('auto', { isMobile: false, resolution: 3 })).toEqual({
      shadowQuality: 'medium',
      resolution: 'inherit',
    });
  });
});
