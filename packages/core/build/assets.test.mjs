import { describe, expect, it } from 'vitest';
import { resolvePixiPipesConfig } from './assetpack.mjs';
import { caper } from './index.mjs';

const names = (options) =>
  caper(options)
    .flat()
    .map((plugin) => plugin.name);

describe('assets option', () => {
  it('keeps caper defaults when overriding one section', () => {
    const config = resolvePixiPipesConfig({
      audio: { outputs: [{ formats: ['.mp3'], recompress: true }] },
    });
    expect(config.audio.outputs).toHaveLength(1);
    expect(config.resolutions).toEqual({ high: 2, default: 1, low: 0.5 });
    expect(config.texturePacker.nameStyle).toBe('relative');
    expect(config.compression.webp.alphaQuality).toBe(100);
  });

  it('merges into a nested section rather than replacing it', () => {
    const config = resolvePixiPipesConfig({ compression: { png: false } });
    expect(config.compression.png).toBe(false);
    // The sibling formats survive — this is the whole reason the merge is deep.
    expect(config.compression.webp.quality).toBe(92);
    expect(config.compression.jpg).toBe(true);
  });

  it('replaces resolutions outright, since it is a set of tiers', () => {
    // Merging here would put caper's `high: 2` back and render 1x art at half
    // size — the exact regression the kitchen-sink fingerprint caught.
    const config = resolvePixiPipesConfig({ resolutions: { default: 1, low: 0.5 } });
    expect(config.resolutions).toEqual({ default: 1, low: 0.5 });
    expect(config.resolutions.high).toBeUndefined();
  });

  it('replaces arrays wholesale instead of merging by index', () => {
    const config = resolvePixiPipesConfig({
      audio: { outputs: [{ formats: ['.ogg'] }] },
    });
    expect(config.audio.outputs).toEqual([{ formats: ['.ogg'] }]);
  });

  it('honours an explicit cacheBust over the production default', () => {
    expect(resolvePixiPipesConfig({}, { cacheBust: true }).cacheBust).toBe(true);
    expect(resolvePixiPipesConfig({}, { cacheBust: false }).cacheBust).toBe(false);
  });

  it("takes production-ness from vite's resolved config, not NODE_ENV", () => {
    // Depending on NODE_ENV shipped a build with no cache-busting hashes and
    // dev-effort compression, because nothing guarantees vite sets it.
    const saved = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'development';
      const prod = resolvePixiPipesConfig({}, { isProduction: true });
      expect(prod.cacheBust).toBe(true);
      expect(prod.compression.webp.effort).toBe(6);

      process.env.NODE_ENV = 'production';
      const dev = resolvePixiPipesConfig({}, { isProduction: false });
      expect(dev.cacheBust).toBe(false);
      expect(dev.compression.webp.effort).toBe(0);
    } finally {
      process.env.NODE_ENV = saved;
    }
  });

  it('falls back to NODE_ENV when vite is not the caller', () => {
    const saved = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'development';
      expect(resolvePixiPipesConfig({}).compression.webp.effort).toBe(0);
      process.env.NODE_ENV = 'production';
      expect(resolvePixiPipesConfig({}).compression.webp.effort).toBe(6);
    } finally {
      process.env.NODE_ENV = saved;
    }
  });
});

describe('caper() plugin list', () => {
  it('starts with the defaults hook', () => {
    expect(names()[0]).toBe('caper:defaults');
  });

  it('includes the asset plugins by default', () => {
    expect(names()).toContain('vite-plugin-assetpack');
    expect(names()).toContain('vite-plugin-asset-types');
  });

  it('omits both asset plugins when assets is false', () => {
    const list = names({ assets: false });
    expect(list).not.toContain('vite-plugin-assetpack');
    expect(list).not.toContain('vite-plugin-asset-types');
    // ...and keeps everything else.
    expect(list).toContain('vite-plugin-caper-runtime');
    expect(list).toContain('vite-plugin-scenes');
  });

  it('keeps a stable plugin order', () => {
    expect(names()).toEqual([
      'caper:defaults',
      'caper:dedupe',
      'vite-plugin-caper-runtime',
      'vite-plugin-static-copy:serve',
      'vite-plugin-static-copy:build',
      'vite-plugin-plugins',
      'vite-plugin-scenes',
      'vite-plugin-popups',
      'vite-plugin-entities',
      'vite-plugin-uis',
      'vite-plugin-assetpack',
      'vite-plugin-asset-types',
      'caper:prune-png-fallbacks',
      'vite-plugin-caper-config',
      'vite-plugin-caper-dev-helper',
    ]);
  });
});
