import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { addKlipp } from './addKlipp.mjs';

const dirs = [];
afterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

function app({ plugins = "['3d']", deps = { '@caperjs/plugin-3d': '0.7.7', '@pixi/3d': '0.1.0' } } = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'caper-add-klipp-'));
  dirs.push(cwd);
  fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ dependencies: deps }));
  fs.writeFileSync(path.join(cwd, 'caper.config.ts'), `export default defineConfig({ plugins: ${plugins} });\n`);
  fs.writeFileSync(path.join(cwd, 'package-lock.json'), '{}');
  installed(cwd, '@caperjs/plugin-3d', { version: '0.7.7', peerDependencies: { '@pixi/3d': '0.1.0' } });
  installed(cwd, '@pixi/3d', { version: '0.1.0' });
  return cwd;
}

function installed(cwd, name, info) {
  const dir = path.join(cwd, 'node_modules', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(info));
}

function deps(pin = '0.17.0') {
  const events = [];
  return {
    events,
    run: vi.fn((cmd, args) => events.push(['run', [cmd, ...args].join(' ')])),
    log: vi.fn((line) => events.push(['log', line])),
    exec: vi.fn((cmd) => {
      if (cmd === 'npm') return JSON.stringify({ '@pmndrs/klipp': pin, '@pixi/3d': '0.1.0' });
      if (cmd === 'pnpm') return '10.16.0';
      throw new Error(`unexpected ${cmd}`);
    }),
  };
}

const read = (cwd, rel) => fs.readFileSync(path.join(cwd, rel), 'utf-8');

describe('addKlipp', () => {
  it('installs klipp in an app with 3D and announces the command before running it', async () => {
    const cwd = app();
    const d = deps();
    const result = await addKlipp(cwd, {}, d);
    expect(result.installed).toEqual(['@caperjs/plugin-klipp', '@pmndrs/klipp@0.17.0']);
    expect(d.events.findIndex(([type, line]) => type === 'log' && line.includes('Installing '))).toBeLessThan(d.events.findIndex(([type]) => type === 'run'));
    // npm saves `^` even for an explicit version, so the pinned engine gets its own exact install.
    expect(d.run).toHaveBeenCalledWith('npm', ['install', '@caperjs/plugin-klipp'], { cwd, shell: false });
    expect(d.run).toHaveBeenCalledWith('npm', ['install', '--save-exact', '@pmndrs/klipp@0.17.0'], { cwd, shell: false });
    expect(read(cwd, 'caper.config.ts')).toContain("['3d', 'klipp']");
    expect(read(cwd, 'src/scenes/SampleCameraRigScene.ts')).toContain("id: 'sample-camera-rig'");
  });

  it('sets up 3D before klipp when needed', async () => {
    const cwd = app({ plugins: '[]', deps: {} });
    const d = deps();
    const result = await addKlipp(cwd, {}, d);
    // npm: each step is a ranged install of the plugin, then an exact install of its pinned engine.
    expect(d.run.mock.calls.map((call) => call[1][1])).toEqual(['@caperjs/plugin-3d', '--save-exact', '@caperjs/plugin-klipp', '--save-exact']);
    const installs = d.events.filter(([type, line]) => type === 'log' && line.includes('Installing '));
    const runs = d.events.filter(([type]) => type === 'run');
    expect(installs).toHaveLength(2);
    expect(d.events.indexOf(installs[0])).toBeLessThan(d.events.indexOf(runs[0]));
    expect(d.events.indexOf(installs[1])).toBeGreaterThan(d.events.indexOf(runs[1]));
    expect(d.events.indexOf(installs[1])).toBeLessThan(d.events.indexOf(runs[2]));
    expect(read(cwd, 'caper.config.ts')).toContain("['3d', 'klipp']");
    expect(read(cwd, 'src/scenes/Sample3DScene.ts')).toContain("id: 'sample-3d'");
    expect(result.add3d).toBeTruthy();
  });

  it('is a no-op on a second run', async () => {
    const cwd = app({ plugins: "['3d', 'klipp']", deps: { '@caperjs/plugin-3d': '0.7.7', '@pixi/3d': '0.1.0', '@caperjs/plugin-klipp': '0.7.7', '@pmndrs/klipp': '0.17.0' } });
    installed(cwd, '@caperjs/plugin-klipp', { version: '0.7.7', peerDependencies: { '@pmndrs/klipp': '0.17.0' } });
    installed(cwd, '@pmndrs/klipp', { version: '0.17.0' });
    fs.mkdirSync(path.join(cwd, 'src/scenes'), { recursive: true });
    fs.writeFileSync(path.join(cwd, 'src/scenes/SampleCameraRigScene.ts'), '// existing\n');
    const before = read(cwd, 'caper.config.ts');
    const d = deps();
    const result = await addKlipp(cwd, {}, d);
    expect(d.run).not.toHaveBeenCalled();
    expect(d.exec).not.toHaveBeenCalledWith('npm', expect.anything(), expect.anything());
    expect(read(cwd, 'caper.config.ts')).toBe(before);
    expect(result).toMatchObject({ installed: [], config: 'present', scene: 'exists' });
  });

  it('takes the installed plugin pin and reinstalls a different engine version', async () => {
    const cwd = app({ deps: { '@caperjs/plugin-3d': '0.7.7', '@pixi/3d': '0.1.0', '@caperjs/plugin-klipp': '0.7.7', '@pmndrs/klipp': '0.16.0' } });
    installed(cwd, '@caperjs/plugin-klipp', { version: '0.7.7', peerDependencies: { '@pmndrs/klipp': '0.17.0' } });
    installed(cwd, '@pmndrs/klipp', { version: '0.16.0' });
    const d = deps();
    const result = await addKlipp(cwd, {}, d);
    expect(result.installed).toEqual(['@pmndrs/klipp@0.17.0']);
    expect(d.exec).not.toHaveBeenCalledWith('npm', expect.anything(), expect.anything());
  });

  it('rejects a non-plain pin before any install', async () => {
    const cwd = app();
    const d = deps('0.17.0 --ignore-scripts');
    await expect(addKlipp(cwd, {}, d)).rejects.toThrow('Could not use @pmndrs/klipp version. Expected a version like 1.2.3.');
    expect(d.run).not.toHaveBeenCalled();
  });

  it('adds the pnpm release-age exception for the pinned klipp spec', async () => {
    const cwd = app();
    fs.rmSync(path.join(cwd, 'package-lock.json'));
    fs.writeFileSync(path.join(cwd, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n');
    const d = deps();
    const result = await addKlipp(cwd, {}, d);
    expect(result.releaseAge).toBe('added');
    expect(read(cwd, 'pnpm-workspace.yaml')).toContain("- '@pmndrs/klipp@0.17.0'");
    expect(d.run).toHaveBeenCalledWith('pnpm', ['add', '@caperjs/plugin-klipp', '@pmndrs/klipp@0.17.0'], { cwd, shell: false });
  });

  it.each(["['klipp', '3d']", "['klipp']"])('stops before installing or writing when plugins is %s', async (plugins) => {
    const cwd = app({ plugins });
    const before = read(cwd, 'caper.config.ts');
    const d = deps();
    await expect(addKlipp(cwd, {}, d)).rejects.toThrow("'klipp' is in plugins without '3d' before it.");
    expect(read(cwd, 'caper.config.ts')).toBe(before);
    expect(d.run).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(cwd, 'src'))).toBe(false);
  });

  it("runs the 3D step when '3d' has autoLoad: false, so its warning is reported", async () => {
    const cwd = app({ plugins: "[['3d', { autoLoad: false }]]" });
    const result = await addKlipp(cwd, {}, deps());
    expect(result.add3d.manualSteps.join('\n')).toMatch(/Remove autoLoad: false/);
  });

  it('runs the 3D step when 3D is declared and listed but its engine is not installed at the pin', async () => {
    const cwd = app();
    installed(cwd, '@pixi/3d', { version: '0.0.9' });
    const d = deps();
    const result = await addKlipp(cwd, {}, d);
    expect(result.add3d.installed).toEqual(['@pixi/3d@0.1.0']);
    // One exact install for 3D's engine, then klipp's ranged and exact installs.
    expect(d.events.filter(([kind]) => kind === 'run')).toHaveLength(3);
  });

  it('leaves a config without plugins and an existing scene untouched', async () => {
    const cwd = app();
    fs.writeFileSync(path.join(cwd, 'caper.config.ts'), 'export default defineConfig({});\n');
    fs.mkdirSync(path.join(cwd, 'src/scenes'), { recursive: true });
    fs.writeFileSync(path.join(cwd, 'src/scenes/SampleCameraRigScene.ts'), '// mine\n');
    const result = await addKlipp(cwd, {}, deps());
    expect(result).toMatchObject({ config: 'manual', scene: 'exists' });
    expect(read(cwd, 'src/scenes/SampleCameraRigScene.ts')).toBe('// mine\n');
  });

  it('does not write through a symlinked scenes folder or config', async () => {
    const cwd = app();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'caper-klipp-outside-'));
    dirs.push(outside);
    fs.mkdirSync(path.join(cwd, 'src'));
    fs.symlinkSync(outside, path.join(cwd, 'src/scenes'));
    const real = path.join(outside, 'config.ts');
    fs.renameSync(path.join(cwd, 'caper.config.ts'), real);
    fs.symlinkSync(real, path.join(cwd, 'caper.config.ts'));
    const result = await addKlipp(cwd, {}, deps());
    expect(result).toMatchObject({ config: 'manual', scene: 'skipped' });
    expect(fs.readdirSync(outside)).toEqual(['config.ts']);
  });

  it('does not create scenes through a symlinked src folder', async () => {
    const cwd = app();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'caper-klipp-src-'));
    dirs.push(outside);
    fs.symlinkSync(outside, path.join(cwd, 'src'));

    const result = await addKlipp(cwd, {}, deps());

    expect(result.scene).toBe('skipped');
    expect(fs.readdirSync(outside)).toEqual([]);
  });

  it('gives a plain error when the pin is unknown', async () => {
    const cwd = app();
    const d = deps();
    d.exec.mockImplementation(() => { throw new Error('offline'); });
    await expect(addKlipp(cwd, {}, d)).rejects.toThrow('Could not find out which @pmndrs/klipp version @caperjs/plugin-klipp needs.');
    expect(d.run).not.toHaveBeenCalled();
  });

  it('requires package.json before any external command', async () => {
    const cwd = app();
    fs.rmSync(path.join(cwd, 'package.json'));
    const d = deps();
    await expect(addKlipp(cwd, {}, d)).rejects.toThrow('no package.json found in this directory.');
    expect(d.exec).not.toHaveBeenCalled();
    expect(d.run).not.toHaveBeenCalled();
  });
});
