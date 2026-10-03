import { describe, expect, it } from 'vitest';
import { caperConfigSchema } from './schema.mjs';

describe('caperConfigSchema orientation', () => {
  it('accepts no orientation', () => {
    expect(caperConfigSchema.safeParse({ id: 'game' }).success).toBe(true);
  });

  it.each(['portrait', 'landscape'])('accepts %s', (orientation) => {
    expect(caperConfigSchema.safeParse({ orientation }).success).toBe(true);
  });

  it.each(['any', 'Portrait', 'sensorLandscape', 1, true])('rejects %s with a clear message', (orientation) => {
    const result = caperConfigSchema.safeParse({ orientation });
    expect(result.success).toBe(false);
    const issue = result.error.issues[0];
    expect(issue.path).toEqual(['orientation']);
    expect(issue.message).toBe("orientation must be 'portrait' or 'landscape'");
  });
});

describe('caperConfigSchema orientationOverlay', () => {
  it.each([false, {}, { text: 'Turn it', background: '#123', color: '#fff', fontFamily: 'serif', className: 'rotate' }, { element: () => ({}) }])(
    'accepts %o',
    (orientationOverlay) => {
      expect(caperConfigSchema.safeParse({ orientation: 'portrait', orientationOverlay }).success).toBe(true);
    },
  );

  it.each([true, 'off', { text: 1 }, { colour: '#fff' }, { element: 'div' }])('rejects %o', (orientationOverlay) => {
    expect(caperConfigSchema.safeParse({ orientationOverlay }).success).toBe(false);
  });
});
