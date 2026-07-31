import { describe, expect, it } from 'vitest';
import { withViewportFitCover } from './viewport.mjs';

describe('viewport-fit=cover injection', () => {
  it('appends viewport-fit to an existing viewport meta', () => {
    const html = '<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head></html>';
    expect(withViewportFitCover(html)).toContain(
      '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />',
    );
  });

  it('leaves a viewport meta that already sets viewport-fit alone', () => {
    const html =
      '<html><head><meta name="viewport" content="width=device-width, viewport-fit=contain" /></head></html>';
    expect(withViewportFitCover(html)).toBe(html);
  });

  it('injects a viewport meta when the html has none', () => {
    const html = '<html><head></head><body></body></html>';
    const result = withViewportFitCover(html);
    expect(result.html).toBe(html);
    expect(result.tags).toEqual([
      {
        tag: 'meta',
        attrs: { name: 'viewport', content: 'width=device-width, initial-scale=1.0, viewport-fit=cover' },
        injectTo: 'head',
      },
    ]);
  });
});
