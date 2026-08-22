import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { caper } from '../index.mjs';
import { caperSolidPlugin } from './solid.mjs';

let tempDir = null;

afterEach(() => {
  if (tempDir && fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
  tempDir = null;
});

/**
 * A stand-in `@caperjs/solid` in a throwaway app root. Real node resolution, so
 * this exercises the same path a consumer app takes — `@caperjs/solid` is never
 * a sibling of `@caperjs/core` under pnpm, and resolving from the app root is
 * the whole point of the loader.
 */
function makeAppWithSolid() {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'caper-solid-'));
  const pkgDir = path.join(tempDir, 'node_modules/@caperjs/solid');
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'app' }), 'utf-8');
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({ name: '@caperjs/solid', exports: { './vite': { default: './vite.mjs' } } }),
    'utf-8',
  );
  fs.writeFileSync(
    path.join(pkgDir, 'vite.mjs'),
    "export function caperSolid(options) { return { name: 'stub-solid', options }; }\n",
    'utf-8',
  );
  return tempDir;
}

describe('caper({ solid })', () => {
  it('adds nothing when the flag is absent or false', () => {
    const withoutFlag = caper();
    const withFalse = caper({ solid: false });

    expect(withoutFlag.some((p) => p instanceof Promise)).toBe(false);
    expect(withFalse).toHaveLength(withoutFlag.length);
  });

  it('adds one lazily-resolved entry when the flag is on', () => {
    const plugins = caper({ solid: true });
    const pending = plugins.filter((p) => p instanceof Promise);

    expect(pending).toHaveLength(1);
    // Nothing is installed next to core, so this one rejects — swallow it here
    // and let the dedicated cases below assert the outcomes.
    pending[0].catch(() => {});
  });
});

describe('caperSolidPlugin', () => {
  it('calls the package factory with no options for `solid: true`', async () => {
    const plugin = await caperSolidPlugin(true, makeAppWithSolid());

    expect(plugin.name).toBe('stub-solid');
    expect(plugin.options).toBeUndefined();
  });

  it('forwards an options object, include and all', async () => {
    const plugin = await caperSolidPlugin({ include: ['src/**/*.tsx'] }, makeAppWithSolid());

    expect(plugin.options).toEqual({ include: ['src/**/*.tsx'] });
  });

  it('explains itself when the package is not installed', () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'caper-solid-'));
    // In a child process with `NODE_PATH` dropped: vitest exports pnpm's flat
    // virtual store on it, so every workspace package resolves from anywhere
    // and this miss could never happen in-process.
    const loader = pathToFileURL(path.resolve(process.cwd(), 'build/plugins/solid.mjs')).href;
    const script = `import { caperSolidPlugin } from ${JSON.stringify(loader)};
      caperSolidPlugin(true, ${JSON.stringify(tempDir)}).catch((e) => { console.log(e.message); });`;
    const { NODE_PATH, ...env } = process.env;

    const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf-8', env });

    expect(out).toContain('[caper] solid: true requires @caperjs/solid to be installed');
  });
});
