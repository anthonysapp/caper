/**
 * Runs an actual production build of the fixture app through the preset.
 *
 * This exists because of a bug that got past every other layer: after the module
 * split, `internal/validate.mjs` called `loadManifestBundleNames` without
 * importing it. A missing import is a `ReferenceError` at *call* time, so
 * importing the module proves nothing — the isolated-import test passed, the
 * dev-server test passed (that code path only runs in a build), and the build
 * fingerprint "matched" because the failed build left the previous `dist` in
 * place.
 *
 * So: build for real, assert on the exit, and assert the build actually emitted
 * something. Anything a plugin only does in `buildStart`/`closeBundle` is covered
 * here and nowhere else.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'vite';
import { caper } from './index.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(here, '../test/fixtures/app');
const coreSrc = path.resolve(here, '../src');

let outDir;
let result;
let buildError;

beforeAll(async () => {
  outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'caper-prod-build-'));

  try {
    result = await build({
      configFile: false,
      root: fixtureRoot,
      logLevel: 'silent',
      plugins: [caper({ assets: false })],
      build: { outDir, emptyOutDir: true },
      resolve: { alias: { '@caperjs/core': coreSrc } },
    });
  } catch (error) {
    buildError = error;
  }
}, 180_000);

afterAll(() => {
  if (outDir) fs.rmSync(outDir, { recursive: true, force: true });
});

describe('production build', () => {
  it('completes without error', () => {
    // Surfaced rather than swallowed: a plugin's buildStart throwing is exactly
    // what this test is for.
    expect(buildError).toBeUndefined();
    expect(result).toBeDefined();
  });

  it('emits an index.html that loads the caper runtime', () => {
    const html = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
    expect(html).toContain('<script');
    expect(html).toMatch(/assets\/.*\.js/);
  });

  it('emits the runtime chunk with the bootstrap in it', () => {
    const assets = path.join(outDir, 'assets');
    const js = fs
      .readdirSync(assets)
      .filter((f) => f.endsWith('.js'))
      .map((f) => fs.readFileSync(path.join(assets, f), 'utf8'))
      .join('\n');
    expect(js).toContain('sceneList');
  });

  it('writes the generated app types', () => {
    // caperConfigPlugin's dts pass runs in buildStart — the half of the plugin
    // the dev-server test never reaches.
    expect(fs.existsSync(path.join(fixtureRoot, 'src/types/caper-app.d.ts'))).toBe(true);
  });
});
