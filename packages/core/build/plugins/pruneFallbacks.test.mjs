import { describe, expect, it } from 'vitest';
import { caper } from '../index.mjs';
import { planPngPrune } from './pruneFallbacks.mjs';

const names = (options) =>
  caper(options)
    .flat()
    .map((plugin) => plugin.name);

/** A manifest entry with both formats, as production emits them (own hash each). */
const bothFormats = () => ({
  bundles: [
    {
      assets: [
        { alias: ['sheet'], src: ['sheet-aaa@2x.webp.json', 'sheet-bbb@2x.png.json'] },
        { alias: ['icon'], src: ['icon-ccc.webp', 'icon-ddd.png'] },
      ],
    },
  ],
});

describe('planPngPrune', () => {
  it('drops the png srcs and the sheets they name', () => {
    const manifest = bothFormats();
    const doomed = planPngPrune(manifest, (rel) =>
      rel === 'sheet-bbb@2x.png.json' ? JSON.stringify({ meta: { image: 'sheet-eee@2x.png' } }) : null,
    );

    expect(doomed).toContain('sheet-eee@2x.png');
    expect(doomed).toContain('sheet-bbb@2x.png.json');
    expect(doomed).toContain('icon-ddd.png');
    expect(doomed).not.toContain('icon-ccc.webp');
  });

  it('rewrites the manifest so nothing points at a deleted file', () => {
    const manifest = bothFormats();
    planPngPrune(manifest, () => null);
    expect(manifest.bundles[0].assets[0].src).toEqual(['sheet-aaa@2x.webp.json']);
    expect(manifest.bundles[0].assets[1].src).toEqual(['icon-ccc.webp']);
  });

  it('follows multipack pages, which are not manifest entries of their own', () => {
    const manifest = {
      bundles: [{ assets: [{ src: ['game-a-0.webp.json', 'game-b-0.png.json'] }] }],
    };
    const sheets = {
      'game-b-0.png.json': { meta: { image: 'game-c-0.png', related_multi_packs: ['game-d-1.png.json'] } },
      'game-d-1.png.json': { meta: { image: 'game-e-1.png', related_multi_packs: ['game-b-0.png.json'] } },
    };

    // The sibling pages reference each other; without cycle tracking this hangs.
    const doomed = planPngPrune(manifest, (rel) => (sheets[rel] ? JSON.stringify(sheets[rel]) : null));
    expect(doomed).toContain('game-c-0.png');
    expect(doomed).toContain('game-e-1.png');
    expect(doomed).toContain('game-d-1.png.json');
  });

  it('drops the pages a spine atlas names', () => {
    const manifest = {
      bundles: [{ assets: [{ src: ['boy-aaa.webp.atlas', 'boy-bbb.png.atlas'] }] }],
    };
    const atlas = ['boy-ccc.png', 'size: 1024,1024', 'format: RGBA8888', 'head', '  rotate: false'].join('\n');

    const doomed = planPngPrune(manifest, (rel) => (rel === 'boy-bbb.png.atlas' ? atlas : null));
    expect(doomed).toContain('boy-ccc.png');
    expect(doomed).toContain('boy-bbb.png.atlas');
    expect(manifest.bundles[0].assets[0].src).toEqual(['boy-aaa.webp.atlas']);
  });

  it('keeps a png that is the only copy', () => {
    // A `{nc}` image has no webp twin — deleting it would break the game.
    const manifest = { bundles: [{ assets: [{ src: ['font-aaa.png'] }] }] };
    const doomed = planPngPrune(manifest, () => null);
    expect(doomed).toEqual([]);
    expect(manifest.bundles[0].assets[0].src).toEqual(['font-aaa.png']);
  });

  it('tolerates a manifest with no bundles', () => {
    expect(planPngPrune({}, () => null)).toEqual([]);
  });
});

describe('pngFallback option', () => {
  it('prunes by default', () => {
    expect(names()).toContain('caper:prune-png-fallbacks');
  });

  it('keeps the fallback when asked', () => {
    expect(names({ assets: { pngFallback: true } })).not.toContain('caper:prune-png-fallbacks');
  });

  it('is irrelevant when the asset pipeline is off', () => {
    expect(names({ assets: false })).not.toContain('caper:prune-png-fallbacks');
  });
});
