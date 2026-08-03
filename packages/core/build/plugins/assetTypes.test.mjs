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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assetTypesPlugin } from './assetTypes.mjs';
import { env, logger } from '../internal/util.mjs';

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
