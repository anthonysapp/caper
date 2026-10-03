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
    expect(issue.message).toBe("orientation must be 'portrait', 'landscape', or { lock: 'portrait' | 'landscape', overlay? }");
  });
});

describe('caperConfigSchema orientation object form', () => {
  it.each([
    { lock: 'portrait' },
    { lock: 'landscape', overlay: false },
    { lock: 'portrait', overlay: {} },
    { lock: 'portrait', overlay: { text: 'Turn it', background: '#123', color: '#fff', fontFamily: 'serif', className: 'rotate' } },
    { lock: 'portrait', overlay: { element: () => ({}) } },
  ])('accepts %o', (orientation) => {
    expect(caperConfigSchema.safeParse({ orientation }).success).toBe(true);
  });

  it('requires lock', () => {
    const result = caperConfigSchema.safeParse({ orientation: { overlay: false } });
    expect(result.success).toBe(false);
    expect(result.error.issues.map((i) => i.message).join(' ')).toMatch(/lock/);
  });

  it.each([{ lock: 'any' }, { lock: 'portrait', overlay: true }, { lock: 'portrait', overlay: { text: 1 } }, { lock: 'portrait', overlay: { colour: '#fff' } }, { lock: 'portrait', overlay: { element: 'div' } }, { lock: 'portrait', extra: 1 }])(
    'rejects %o',
    (orientation) => {
      expect(caperConfigSchema.safeParse({ orientation }).success).toBe(false);
    },
  );
});
