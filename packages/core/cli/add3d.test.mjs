import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { add3d } from './add3d.mjs';
import { addPluginToConfig, compareVersions, isPlainVersion, patchReleaseAgeExclude, readPluginConfig } from './addPlugin.mjs';

const read3dConfig = (text) => readPluginConfig(text, '3d');
const add3dToConfig = (text) => addPluginToConfig(text, '3d');

const dirs = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function app({ pm = 'pnpm', plugins = '[]', deps = {}, devDeps = {} } = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'caper-add3d-'));
  dirs.push(cwd);
  fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ dependencies: deps, devDependencies: devDeps }));
  fs.writeFileSync(path.join(cwd, 'caper.config.ts'), `export default defineConfig({ plugins: ${plugins} });\n`);
  if (pm === 'pnpm') fs.writeFileSync(path.join(cwd, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n');
  if (pm === 'yarn') fs.writeFileSync(path.join(cwd, 'yarn.lock'), '');
  if (pm === 'npm') fs.writeFileSync(path.join(cwd, 'package-lock.json'), '{}');
  return cwd;
}

function installed(cwd, name, info) {
  const dir = path.join(cwd, 'node_modules', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(info));
}

function deps({ pin = '0.1.0', pmVersion = '10.16.0', run = vi.fn(), log = vi.fn() } = {}) {
  const exec = vi.fn((cmd, args) => {
    if (cmd === 'npm') return JSON.stringify({ '@pixi/3d': pin, 'pixi.js': '8.23.0' });
    if (cmd === 'pnpm' && args[0] === '--version') return pmVersion;
    throw new Error(`unexpected command ${cmd}`);
  });
  return { run, log, exec };
}

const read = (cwd, rel) => fs.readFileSync(path.join(cwd, rel), 'utf-8');

// Test that package manager operations are announced before they can change the app.
describe('add3d', () => {
  it.each(['[]', "['audio']"])('sets up a fresh pnpm app with plugins: %s', async (plugins) => {
    const cwd = app({ plugins });
    const d = deps();
    const result = await add3d(cwd, {}, d);

    expect(d.run).toHaveBeenCalledTimes(1);
    expect(d.run).toHaveBeenCalledWith('pnpm', ['add', '@caperjs/plugin-3d', '@pixi/3d@0.1.0'], { cwd, shell: false });
    expect(result.installed).toEqual(['@caperjs/plugin-3d', '@pixi/3d@0.1.0']);
    expect(result.releaseAge).toBe('added');
    expect(read(cwd, 'pnpm-workspace.yaml')).toContain("minimumReleaseAgeExclude:\n  - '@pixi/3d@0.1.0'");
    expect(result.config).toBe('added');
    expect(read3dConfig(read(cwd, 'caper.config.ts'))).toBe('listed');
    expect(result.scene).toBe('created');
    expect(read(cwd, 'src/scenes/Sample3DScene.ts')).toContain("id: 'sample-3d'");
  });

  it('logs the exact install before calling run', async () => {
    const cwd = app();
    const events = [];
    const d = deps({
      log: (line) => events.push(['log', line]),
      run: (cmd, args) => events.push(['run', [cmd, ...args].join(' ')]),
    });
    await add3d(cwd, {}, d);
    const install = events.findIndex(([kind, line]) => kind === 'log' && line.includes('Installing '));
    const run = events.findIndex(([kind]) => kind === 'run');
    expect(install).toBeGreaterThanOrEqual(0);
    expect(install).toBeLessThan(run);
    expect(events[install][1]).toBe('Installing @caperjs/plugin-3d, @pixi/3d@0.1.0 (pnpm add @caperjs/plugin-3d @pixi/3d@0.1.0)');
  });

  it('is a no-op on a second run after dependencies were installed', async () => {
    const cwd = app();
    const d = deps();
    await add3d(cwd, {}, d);
    installed(cwd, '@caperjs/plugin-3d', { version: '0.7.7', peerDependencies: { '@pixi/3d': '0.1.0' } });
    installed(cwd, '@pixi/3d', { version: '0.1.0' });
    fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ dependencies: { '@caperjs/plugin-3d': '0.7.7', '@pixi/3d': '0.1.0' } }));
    const files = ['package.json', 'pnpm-lock.yaml', 'caper.config.ts', 'pnpm-workspace.yaml', 'src/scenes/Sample3DScene.ts'];
    const before = files.map((rel) => read(cwd, rel));
    d.run.mockClear();
    d.exec.mockClear();
    const result = await add3d(cwd, {}, d);
    expect(d.run).not.toHaveBeenCalled();
    expect(d.exec).not.toHaveBeenCalledWith('npm', expect.anything(), expect.anything());
    expect(files.map((rel) => read(cwd, rel))).toEqual(before);
    expect(result).toMatchObject({ installed: [], releaseAge: 'not-needed', config: 'present', scene: 'exists' });
  });

  it('takes the pin from an installed plugin without npm view', async () => {
    const cwd = app({ pm: 'npm', deps: { '@caperjs/plugin-3d': '0.7.7' } });
    installed(cwd, '@caperjs/plugin-3d', { version: '0.7.7', peerDependencies: { '@pixi/3d': '0.1.1' } });
    const d = deps();
    await add3d(cwd, {}, d);
    expect(d.run).toHaveBeenCalledWith('npm', ['install', '@pixi/3d@0.1.1'], { cwd, shell: false });
    expect(d.exec).not.toHaveBeenCalledWith('npm', expect.anything(), expect.anything());
  });

  it('adds pixi.js only when its installed version is behind core', async () => {
    const cwd = app();
    installed(cwd, 'pixi.js', { version: '8.22.0' });
    const d = deps();
    await add3d(cwd, {}, d);
    expect(d.run.mock.calls[0][1]).toContain('pixi.js@8.23.0');
  });

  it('reinstalls @pixi/3d when the installed version differs from the pin', async () => {
    const cwd = app({ deps: { '@caperjs/plugin-3d': '0.7.7', '@pixi/3d': '0.1.0' } });
    installed(cwd, '@caperjs/plugin-3d', { version: '0.7.7', peerDependencies: { '@pixi/3d': '0.1.0' } });
    installed(cwd, '@pixi/3d', { version: '0.0.9' });
    const d = deps();
    const result = await add3d(cwd, {}, d);
    expect(result.installed).toEqual(['@pixi/3d@0.1.0']);
    expect(d.run).toHaveBeenCalledWith('pnpm', ['add', '@pixi/3d@0.1.0'], { cwd, shell: false });
  });

  it.each(['npm', 'yarn'])('does not edit pnpm YAML with %s', async (pm) => {
    const cwd = app({ pm });
    const d = deps();
    const result = await add3d(cwd, {}, d);
    expect(fs.existsSync(path.join(cwd, 'pnpm-workspace.yaml'))).toBe(false);
    expect(result.releaseAge).toBe('not-needed');
  });

  it('does not edit pnpm YAML on pnpm 9', async () => {
    const cwd = app();
    const d = deps({ pmVersion: '9.15.0' });
    const result = await add3d(cwd, {}, d);
    expect(fs.existsSync(path.join(cwd, 'pnpm-workspace.yaml'))).toBe(false);
    expect(result.releaseAge).toBe('not-needed');
  });

  it.each(['0.1.0; rm -rf /', '0.1.0 --ignore-scripts'])('rejects an unsafe pin %s before installing', async (pin) => {
    const cwd = app();
    const d = deps({ pin });
    await expect(add3d(cwd, {}, d)).rejects.toThrow();
    expect(d.run).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(cwd, 'pnpm-workspace.yaml'))).toBe(false);
  });

  it('preserves an existing scene', async () => {
    const cwd = app();
    fs.mkdirSync(path.join(cwd, 'src/scenes'), { recursive: true });
    fs.writeFileSync(path.join(cwd, 'src/scenes/Sample3DScene.ts'), '// mine\n');
    const result = await add3d(cwd, {}, deps());
    expect(result.scene).toBe('exists');
    expect(read(cwd, 'src/scenes/Sample3DScene.ts')).toBe('// mine\n');
  });

  it('leaves a config without a plugins array untouched and gives a manual step', async () => {
    const cwd = app();
    const source = 'export default defineConfig({});\n';
    fs.writeFileSync(path.join(cwd, 'caper.config.ts'), source);
    const result = await add3d(cwd, {}, deps());
    expect(result.config).toBe('manual');
    expect(result.manualSteps).toContain("Add this line inside defineConfig({ ... }) in caper.config.ts:  plugins: ['3d'],");
    expect(read(cwd, 'caper.config.ts')).toBe(source);
  });

  it('leaves autoLoad: false in place and tells the user to remove it', async () => {
    const cwd = app({ plugins: "[['3d', { autoLoad: false }] ]" });
    const source = read(cwd, 'caper.config.ts');
    const result = await add3d(cwd, {}, deps());
    expect(result.config).toBe('present');
    expect(result.manualSteps).toContain("'3d' must load at startup. Remove autoLoad: false from its entry in caper.config.ts.");
    expect(read(cwd, 'caper.config.ts')).toBe(source);
  });

  it('leaves unsupported pnpm YAML shapes alone and provides the exact item', async () => {
    const cwd = app();
    const yaml = 'minimumReleaseAgeExclude: [foo]\n';
    fs.writeFileSync(path.join(cwd, 'pnpm-workspace.yaml'), yaml);
    const result = await add3d(cwd, {}, deps());
    expect(result.releaseAge).toBe('manual');
    expect(result.manualSteps.join('\n')).toContain("- '@pixi/3d@0.1.0'");
    expect(read(cwd, 'pnpm-workspace.yaml')).toBe(yaml);
  });

  it('gives the specified error when the pin cannot be found', async () => {
    const cwd = app();
    const d = deps();
    d.exec.mockImplementation(() => { throw new Error('offline'); });
    await expect(add3d(cwd, {}, d)).rejects.toThrow('Could not find out which @pixi/3d version @caperjs/plugin-3d needs.');
    expect(d.run).not.toHaveBeenCalled();
  });

  it('throws before any external command without package.json', async () => {
    const cwd = app();
    fs.rmSync(path.join(cwd, 'package.json'));
    const d = deps();
    await expect(add3d(cwd, {}, d)).rejects.toThrow('no package.json found in this directory.');
    expect(d.exec).not.toHaveBeenCalled();
    expect(d.run).not.toHaveBeenCalled();
  });
});

describe('patchReleaseAgeExclude', () => {
  it('appends a missing block', () => {
    expect(patchReleaseAgeExclude('packages:\n  - apps/*\n', '@pixi/3d@0.1.0')).toEqual({
      text: "packages:\n  - apps/*\nminimumReleaseAgeExclude:\n  - '@pixi/3d@0.1.0'\n",
      changed: true,
    });
  });
  it('adds to an existing block with the existing indentation', () => {
    expect(patchReleaseAgeExclude('minimumReleaseAgeExclude:\n    - foo\nother: true\n', '@pixi/3d@0.1.0')).toEqual({
      text: "minimumReleaseAgeExclude:\n    - foo\n    - '@pixi/3d@0.1.0'\nother: true\n",
      changed: true,
    });
  });
  it('finds an already listed quoted or unquoted spec', () => {
    expect(patchReleaseAgeExclude("minimumReleaseAgeExclude:\n  - '@pixi/3d@0.1.0'\n", '@pixi/3d@0.1.0').changed).toBe(false);
    expect(patchReleaseAgeExclude('minimumReleaseAgeExclude:\n  - @pixi/3d@0.1.0\n', '@pixi/3d@0.1.0').changed).toBe(false);
  });
  it('leaves flow and anchored shapes to manual editing', () => {
    expect(patchReleaseAgeExclude('minimumReleaseAgeExclude: [foo]\n', '@pixi/3d@0.1.0')).toBeNull();
    expect(patchReleaseAgeExclude('minimumReleaseAgeExclude: &list\n  - foo\n', '@pixi/3d@0.1.0')).toBeNull();
  });
});

describe('read3dConfig', () => {
  it('only recognizes a 3d entry inside the plugins array', () => {
    expect(read3dConfig("const other = '3d'; export default defineConfig({ plugins: ['audio'] });")).toBe('not-listed');
    expect(read3dConfig("const example = \"plugins: ['3d']\"; export default defineConfig({ plugins: ['audio'] });")).toBe('not-listed');
    expect(read3dConfig("export default defineConfig({ plugins: ['3d'] });")).toBe('listed');
  });
  it('ignores commented out entries', () => {
    expect(read3dConfig("plugins: [// '3d'\n 'audio']")).toBe('not-listed');
    expect(read3dConfig("plugins: [/* '3d' */ 'audio']")).toBe('not-listed');
  });
  it('recognizes tuple autoLoad: false', () => {
    expect(read3dConfig("plugins: [['3d', { autoLoad: false }]]")).toBe('auto-load-false');
    expect(read3dConfig("plugins: [['3d', { autoLoad: true }]]")).toBe('listed');
  });
  it('reports a missing plugins array', () => {
    expect(read3dConfig('export default defineConfig({});')).toBe('no-plugins-array');
  });
});

describe('add3dToConfig', () => {
  const wrap = (plugins) => `export default defineConfig({\n  plugins: ${plugins},\n});\n`;

  it('fills an empty array', () => {
    expect(add3dToConfig(wrap('[]'))).toBe(wrap("['3d']"));
  });

  it('appends to a single-line array, with or without a trailing comma', () => {
    expect(add3dToConfig(wrap("['audio', ['rive', { autoLoad: false }]]"))).toBe(
      wrap("['audio', ['rive', { autoLoad: false }], '3d']"),
    );
    expect(read3dConfig(add3dToConfig(wrap("['audio',]")))).toBe('listed');
  });

  it('appends to a multi-line array and keeps its indentation', () => {
    expect(add3dToConfig(wrap("[\n    'audio',\n    'firebase',\n  ]"))).toBe(
      wrap("[\n    'audio',\n    'firebase',\n    '3d',\n  ]"),
    );
    expect(add3dToConfig(wrap("[\n    'audio',\n    'firebase'\n  ]"))).toBe(
      wrap("[\n    'audio',\n    'firebase',\n    '3d',\n  ]"),
    );
  });

  it('is not fooled by a bracket inside a comment or a string', () => {
    const source = wrap("[\n    'audio', // keep ] marker\n    ['x', { label: ']' }], /* ] */\n  ]");
    const patched = add3dToConfig(source);
    expect(patched).toBe(wrap("[\n    'audio', // keep ] marker\n    ['x', { label: ']' }], /* ] */\n    '3d',\n  ]"));
    expect(read3dConfig(patched)).toBe('listed');
  });

  it('returns null when there is no plugins array', () => {
    expect(add3dToConfig('export default defineConfig({ id: "x" });')).toBeNull();
  });
});

describe('versions', () => {
  it('accepts only plain versions', () => {
    expect(isPlainVersion('8.23.0')).toBe(true);
    expect(isPlainVersion('0.1.0-beta.3')).toBe(true);
    for (const bad of ['-1.0.0', '1.0', '1.0.0 --ignore-scripts', 'npm:evil@1.0.0', '1.0.0\u001b[31m', 7, null]) {
      expect(isPlainVersion(bad)).toBe(false);
    }
  });

  it('orders a prerelease before its release', () => {
    expect(compareVersions('8.23.0-rc.1', '8.23.0')).toBe(-1);
    expect(compareVersions('8.23.0', '8.22.9')).toBe(1);
    expect(compareVersions('8.23.0', '8.23.0')).toBe(0);
  });
});

describe('add3d file safety', () => {
  it('does not write the sample scene through a symlinked scenes folder', async () => {
    const cwd = app({ plugins: "['3d']", deps: { '@caperjs/plugin-3d': '1.0.0', '@pixi/3d': '0.1.0' } });
    installed(cwd, '@caperjs/plugin-3d', { version: '1.0.0', peerDependencies: { '@pixi/3d': '0.1.0' } });
    installed(cwd, '@pixi/3d', { version: '0.1.0' });
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'caper-add3d-outside-'));
    dirs.push(outside);
    fs.mkdirSync(path.join(cwd, 'src'));
    fs.symlinkSync(outside, path.join(cwd, 'src/scenes'));

    const result = await add3d(cwd, {}, deps());

    expect(result.scene).toBe('skipped');
    expect(fs.readdirSync(outside)).toEqual([]);
    expect(result.manualSteps.join('\n')).toMatch(/src\/scenes/);
  });

  it('does not rewrite a symlinked caper.config.ts', async () => {
    const cwd = app({ deps: { '@caperjs/plugin-3d': '1.0.0', '@pixi/3d': '0.1.0' } });
    installed(cwd, '@caperjs/plugin-3d', { version: '1.0.0', peerDependencies: { '@pixi/3d': '0.1.0' } });
    installed(cwd, '@pixi/3d', { version: '0.1.0' });
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'caper-add3d-outside-'));
    dirs.push(outside);
    const real = path.join(outside, 'caper.config.ts');
    fs.renameSync(path.join(cwd, 'caper.config.ts'), real);
    fs.symlinkSync(real, path.join(cwd, 'caper.config.ts'));
    const before = fs.readFileSync(real, 'utf-8');

    const result = await add3d(cwd, {}, deps());

    expect(result.config).toBe('manual');
    expect(fs.readFileSync(real, 'utf-8')).toBe(before);
  });
});
