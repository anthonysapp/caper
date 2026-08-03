/**
 * Where the assetpack manifest is looked for.
 *
 * Everything else build-side resolves against vite's `root` (see
 * `internal/discovery.mjs`); this module used to resolve against `process.cwd()`
 * instead, so `vite --root elsewhere` and monorepo invocations from a parent
 * directory validated against a manifest that wasn't the project's — usually
 * none at all, which silently disabled bundle-reference validation.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadManifestBundleNames } from './manifest.mjs';
import { runBuildTimeValidation } from './validate.mjs';

let root;

/** Writes a manifest with the given bundle names under `root/public/assets`. */
function writeManifest(names, manifestUrl = 'assets.json') {
  const dir = path.join(root, 'public', 'assets');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, manifestUrl), JSON.stringify({ bundles: names.map((name) => ({ name })) }), 'utf8');
}

beforeEach(() => {
  // Deliberately not the working directory: that is the whole assertion.
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'caper-manifest-'));
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('loadManifestBundleNames', () => {
  it("reads the manifest under vite's root, not the working directory", () => {
    writeManifest(['menu', 'game']);
    expect(loadManifestBundleNames(root)).toEqual(new Set(['menu', 'game']));
  });

  it('honours a project-specific manifestUrl', () => {
    writeManifest(['menu'], 'manifest.json');
    expect(loadManifestBundleNames(root, 'manifest.json')).toEqual(new Set(['menu']));
    expect(loadManifestBundleNames(root)).toBeNull();
  });

  it('returns null when the project has no manifest yet', () => {
    expect(loadManifestBundleNames(root)).toBeNull();
  });
});

describe('runBuildTimeValidation bundle references', () => {
  const scene = (bundle) => ({ id: 'menu', assets: { preload: { bundles: [bundle] } } });
  const run = (extra) =>
    runBuildTimeValidation({
      configPath: path.join(root, 'caper.config.ts'),
      scenes: [scene('typo')],
      plugins: [],
      popups: [],
      entities: [],
      ...extra,
    });

  it('warns about a bundle the manifest does not have', () => {
    writeManifest(['menu'], 'manifest.json');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Regression: validation passed no root and no manifestUrl, so a project
    // with either got no bundle checking at all.
    run({ root, manifestUrl: 'manifest.json' });
    expect(warn.mock.calls.flat().join('\n')).toContain("bundle 'typo'");
  });

  it('stays quiet when the bundle exists', () => {
    writeManifest(['typo'], 'manifest.json');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    run({ root, manifestUrl: 'manifest.json' });
    expect(warn).not.toHaveBeenCalled();
  });
});
