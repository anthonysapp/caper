export type Quality3D = 'auto' | 'low' | 'high';

export function resolveQuality(
  quality: Quality3D,
  device: { isMobile: boolean; resolution: number },
): { shadowQuality: 'low' | 'medium' | 'high'; resolution: number | 'inherit' } {
  if (quality === 'high') return { shadowQuality: 'high', resolution: 'inherit' };
  if (quality === 'low') return { shadowQuality: 'low', resolution: Math.min(device.resolution, 1) };
  return device.isMobile
    ? { shadowQuality: 'low', resolution: Math.min(device.resolution, 2) }
    : { shadowQuality: 'medium', resolution: 'inherit' };
}
