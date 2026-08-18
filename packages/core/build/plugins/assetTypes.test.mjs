/**
 * `vite-plugin-asset-types` outside of a full build.
 *
 * Its `closeBundle` pass only runs when a PWA is in play, which is exactly why
 * two bugs lived there unseen: the branch read a module-level `env` it never
 * imported, and the detection that would have flipped the branch on inspected
 * the *unresolved* plugin array, where `caper()`'s own plugins are still nested.
 * Both are call-time failures, so importing the module proves nothing — the
 * hooks have to actually run.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveConfig } from 'vite';
import { assetTypesPlugin } from './assetTypes.mjs';
import { caper } from '../index.mjs';
import { env, logger } from '../internal/util.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(here, '../../test/fixtures/app');

let root;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'caper-asset-types-'));
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

/** Runs the config hooks the way vite does, with an already-flat plugin list. */
function withPlugins(plugin, plugins) {
  const config = { plugins, root, publicDir: path.join(root, 'public') };
  plugin.config?.(config);
  plugin.configResolved(config);
}

describe('closeBundle', () => {
  it('runs a final generation pass when a service worker will precache the output', async () => {
    // The branch is production-only; a dev NODE_ENV would make this vacuous.
    expect(env).not.toBe('development');
    const plugin = assetTypesPlugin();
    withPlugins(plugin, [{ name: 'vite-plugin-pwa' }]);
    // Regression: `env` was read here without being imported, so the very pass
    // this branch exists for threw a ReferenceError instead.
    await expect(plugin.closeBundle()).resolves.toBeUndefined();
  });

  it('does nothing when no service worker is involved', async () => {
    const plugin = assetTypesPlugin();
    const info = vi.spyOn(logger, 'info').mockImplementation(() => {});
    withPlugins(plugin, [{ name: 'some-other-plugin' }]);
    await plugin.closeBundle();
    expect(info).not.toHaveBeenCalled();
  });
});

/** Resolves a real vite config for the fixture, as `plugins: [caper()]` would. */
async function resolvePreset(options) {
  return resolveConfig(
    { configFile: false, root: fixtureRoot, logLevel: 'silent', plugins: [caper(options)] },
    'build',
  );
}

describe('pwa detection', () => {
  it("finds vite-plugin-pwa through caper()'s nested plugin array", async () => {
    const info = vi.spyOn(logger, 'info').mockImplementation(() => {});
    vi.spyOn(logger, 'warn').mockImplementation(() => {});
    // Regression: detection ran against the *unresolved* plugins, where
    // `caper()` is still one nested array, so the check never matched and the
    // post-bundle pass silently never ran.
    const resolved = await resolvePreset({ pwa: {} });
    const plugin = resolved.plugins.find((p) => p.name === 'vite-plugin-asset-types');
    await plugin.closeBundle();
    expect(info.mock.calls.flat().join('\n')).toContain('PWA enabled');
  });

  it('stays off when the project asks for no pwa', async () => {
    const info = vi.spyOn(logger, 'info').mockImplementation(() => {});
    const resolved = await resolvePreset({});
    const plugin = resolved.plugins.find((p) => p.name === 'vite-plugin-asset-types');
    await plugin.closeBundle();
    expect(info.mock.calls.flat().join('\n')).not.toContain('PWA enabled');
  });
});

/** Writes a manifest plus its sheet pages into the temp root, then generates. */
async function generateFrom(manifest, pages) {
  const assetsDir = path.join(root, 'public', 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });
  fs.writeFileSync(path.join(assetsDir, 'assets.json'), JSON.stringify(manifest));
  for (const [name, body] of Object.entries(pages)) {
    fs.writeFileSync(path.join(assetsDir, name), JSON.stringify(body));
  }
  vi.spyOn(logger, 'info').mockImplementation(() => {});
  const plugin = assetTypesPlugin();
  withPlugins(plugin, []);
  await plugin.buildStart();
  return fs.readFileSync(path.join(root, 'src', 'types', 'caper-assets.d.ts'), 'utf8');
}

/** One tps bundle whose manifest entry names only page 0, as AssetPack emits. */
const multipackManifest = {
  bundles: [
    {
      name: 'screens',
      assets: [{ alias: ['screens'], src: ['screens-0.png.json'], data: { tags: { tps: true } } }],
    },
  ],
};

describe('tps frames', () => {
  it('follows the multipack chain instead of typing page 0 alone', async () => {
    // Regression: a sheet too big for one page is split, but only page 0 reaches
    // the manifest — so every frame the packer pushed onto a later page was
    // missing from the union, and which frames those were changed whenever
    // unrelated art shifted the packing. PixiJS loads them via the same field.
    const types = await generateFrom(multipackManifest, {
      'screens-0.png.json': {
        frames: { 'thumbs/on-page-0': {} },
        meta: { related_multi_packs: ['screens-1.png.json', 'screens-2.png.json'] },
      },
      'screens-1.png.json': { frames: { 'thumbs/on-page-1': {} } },
      'screens-2.png.json': { frames: { 'thumbs/on-page-2': {} } },
    });

    for (const frame of ['thumbs/on-page-0', 'thumbs/on-page-1', 'thumbs/on-page-2']) {
      expect(types).toContain(`'${frame}'`);
    }
    // …and narrowed by bundle, not just in the flat union.
    expect(types).toMatch(/screens: '[^\n]*thumbs\/on-page-2/);
  });

  it('walks pages a later page links, and survives a cycle', async () => {
    const types = await generateFrom(multipackManifest, {
      'screens-0.png.json': {
        frames: { 'thumbs/first': {} },
        meta: { related_multi_packs: ['screens-1.png.json'] },
      },
      // page 1 links onward AND back to page 0 — a naive walk would not return.
      'screens-1.png.json': {
        frames: { 'thumbs/second': {} },
        meta: { related_multi_packs: ['screens-2.png.json', 'screens-0.png.json'] },
      },
      'screens-2.png.json': { frames: { 'thumbs/third': {} } },
    });

    for (const frame of ['thumbs/first', 'thumbs/second', 'thumbs/third']) {
      expect(types).toContain(`'${frame}'`);
    }
  });

  it('keeps the frames it did read when a linked page is missing', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const types = await generateFrom(multipackManifest, {
      'screens-0.png.json': {
        frames: { 'thumbs/present': {} },
        meta: { related_multi_packs: ['screens-9.png.json'] },
      },
    });

    expect(types).toContain("'thumbs/present'");
    expect(warn.mock.calls.flat().join('\n')).toContain('screens-9.png.json');
  });
});
