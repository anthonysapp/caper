import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { discoverLocalPlugins, discoverNpmPlugins, findTypeScriptFiles } from './discovery.mjs';

describe('findTypeScriptFiles', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'caper-discovery-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('finds .ts and .tsx files but not .t or non-TS files', async () => {
    fs.writeFileSync(path.join(dir, 'Foo.tsx'), '');
    fs.writeFileSync(path.join(dir, 'Bar.ts'), '');
    fs.writeFileSync(path.join(dir, 'Baz.t'), '');
    fs.writeFileSync(path.join(dir, 'readme.md'), '');

    const files = await findTypeScriptFiles(dir);

    expect(files).toContain(path.join(dir, 'Foo.tsx'));
    expect(files).toContain(path.join(dir, 'Bar.ts'));
    expect(files).not.toContain(path.join(dir, 'Baz.t'));
    expect(files).not.toContain(path.join(dir, 'readme.md'));
  });
});

describe('discoverNpmPlugins', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'caper-discovery-npm-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reads caper.phase and caper.requires from installed package.json', () => {
    const pkgName = '@caperjs/plugin-foo';
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({
        dependencies: { [pkgName]: '1.0.0' },
      }),
    );
    fs.mkdirSync(path.join(dir, 'node_modules', pkgName), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'node_modules', pkgName, 'package.json'),
      JSON.stringify({
        name: pkgName,
        caper: { phase: 'pre-renderer', requires: ['firebase', 1, null] },
      }),
    );

    const [plugin] = discoverNpmPlugins(dir);

    expect(plugin.id).toBe('foo');
    expect(plugin.phase).toBe('pre-renderer');
    expect(plugin.requires).toEqual(['firebase']);
    expect(plugin.hasTypes).toBe(false);
  });

  it('defaults phase and requires when caper is absent', () => {
    const pkgName = '@caperjs/plugin-bar';
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({
        dependencies: { [pkgName]: '1.0.0' },
      }),
    );
    fs.mkdirSync(path.join(dir, 'node_modules', pkgName), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'node_modules', pkgName, 'package.json'),
      JSON.stringify({ name: pkgName }),
    );

    const [plugin] = discoverNpmPlugins(dir);

    expect(plugin.phase).toBeUndefined();
    expect(plugin.requires).toEqual([]);
    expect(plugin.hasTypes).toBe(false);
  });

  it('does not throw when the installed package is missing', () => {
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({
        dependencies: { '@caperjs/plugin-missing': '1.0.0' },
      }),
    );

    expect(() => discoverNpmPlugins(dir)).not.toThrow();
    const [plugin] = discoverNpmPlugins(dir);
    expect(plugin.phase).toBeUndefined();
    expect(plugin.requires).toEqual([]);
    expect(plugin.hasTypes).toBe(false);
  });

  it.each([
    [{ types: './index.d.ts' }, true],
    [{ typings: './index.d.ts' }, true],
    [{ exports: { '.': { types: './index.d.ts' } } }, true],
    [{ exports: { '.': { default: './index.js' } } }, false],
  ])('detects installed package type declarations in %j', (fields, expected) => {
    const pkgName = '@caperjs/plugin-typed';
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { [pkgName]: '1.0.0' } }));
    fs.mkdirSync(path.join(dir, 'node_modules', pkgName), { recursive: true });
    fs.writeFileSync(path.join(dir, 'node_modules', pkgName, 'package.json'), JSON.stringify({ name: pkgName, ...fields }));

    expect(discoverNpmPlugins(dir)[0].hasTypes).toBe(expected);
  });
});

describe('discoverLocalPlugins', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'caper-discovery-local-'));
    fs.mkdirSync(path.join(dir, 'src', 'plugins'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reads phase from definePlugin({ id, phase: "pre-renderer" })', async () => {
    const file = path.join(dir, 'src', 'plugins', 'ThreeD.ts');
    fs.writeFileSync(
      file,
      `export const plugin = definePlugin({ id: 'three-d', phase: 'pre-renderer' });
export default class ThreeDPlugin {}
`,
    );

    const plugins = await discoverLocalPlugins(null, dir);

    expect(plugins).toHaveLength(1);
    expect(plugins[0].id).toBe('three-d');
    expect(plugins[0].phase).toBe('pre-renderer');
  });
});
