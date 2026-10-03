import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readConfigOrientation } from './buildFlags.mjs';

let tempDir = null;

afterEach(() => {
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  tempDir = null;
});

function appWithConfig(source) {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'caper-flags-'));
  if (source !== undefined) fs.writeFileSync(path.join(tempDir, 'caper.config.ts'), source, 'utf-8');
  return tempDir;
}

const config = (body) => `import { defineConfig } from '@caperjs/core';\n\nexport default defineConfig({\n  id: 'game',\n${body}\n});\n`;

describe('readConfigOrientation', () => {
  it('is undefined when there is no caper.config.ts', () => {
    expect(readConfigOrientation(appWithConfig())).toBeUndefined();
  });

  it('is undefined when orientation is not set', () => {
    expect(readConfigOrientation(appWithConfig(config('')))).toBeUndefined();
  });

  it.each(['portrait', 'landscape'])('reads %s', (orientation) => {
    expect(readConfigOrientation(appWithConfig(config(`  orientation: '${orientation}',`)))).toBe(orientation);
  });

  it('reads a named defineConfig export too', () => {
    const dir = appWithConfig(`import { defineConfig } from '@caperjs/core';\nexport const config = defineConfig({ orientation: 'landscape' });\nexport default config;\n`);
    expect(readConfigOrientation(dir)).toBe('landscape');
  });

  it.each(['portrait', 'landscape'])('reads lock %s from the object form, ignoring overlay', (lock) => {
    const dir = appWithConfig(config(`  orientation: { lock: '${lock}', overlay: { element: () => document.createElement('div') } },`));
    expect(readConfigOrientation(dir)).toBe(lock);
  });

  it('throws when the object form has a non-literal lock', () => {
    expect(() => readConfigOrientation(appWithConfig(`const o = 'portrait';\n${config('  orientation: { lock: o },')}`))).toThrow(/string literal/);
  });

  it('throws when the object form has no lock', () => {
    expect(() => readConfigOrientation(appWithConfig(config('  orientation: { overlay: false },')))).toThrow(/lock/);
  });

  it('throws on a value it cannot use', () => {
    expect(() => readConfigOrientation(appWithConfig(config(`  orientation: 'any',`)))).toThrow(/portrait.*landscape/);
  });

  it('throws when orientation is not a string literal', () => {
    expect(() => readConfigOrientation(appWithConfig(`const o = 'portrait';\n${config('  orientation: o,')}`))).toThrow(/string literal/);
  });

  it('throws when the file does not parse', () => {
    expect(() => readConfigOrientation(appWithConfig('export default defineConfig({ orientation: '))).toThrow();
  });
});
