// @vitest-environment node
// (happy-dom's URL resolves `new URL('../', import.meta.url)` wrongly, which breaks the template lookup.)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { create, injectPluginsIntoConfig, interactiveError } from './create.mjs';

describe('injectPluginsIntoConfig', () => {
  it('inserts plugins into an empty array', () => {
    const configContents = `export default {\n  plugins: [],\n};\n`;
    const pluginConfigs = [`['rollbar', { autoLoad: false }]`];

    const result = injectPluginsIntoConfig(configContents, pluginConfigs);

    expect(result).toContain(`plugins: [\n    ['rollbar', { autoLoad: false }]\n  ]`);
  });

  it('appends plugins alongside an existing non-empty array', () => {
    const configContents = `export default {\n  plugins: [['existing', { autoLoad: false }]],\n};\n`;
    const pluginConfigs = [`['rollbar', { autoLoad: false }]`];

    const result = injectPluginsIntoConfig(configContents, pluginConfigs);

    expect(result).toContain(`['existing', { autoLoad: false }]`);
    expect(result).toContain(`['rollbar', { autoLoad: false }]`);
    // both entries should end up inside a single well-formed array
    expect(result).toMatch(/plugins: \[[\s\S]*existing[\s\S]*rollbar[\s\S]*\]/);
  });

  it('appends plugins alongside an existing multiline array', () => {
    const configContents = `export default {\n  plugins: [\n    ['existing', { autoLoad: false }],\n  ],\n};\n`;
    const pluginConfigs = [`['rollbar', { autoLoad: false }]`, `['rive', { autoLoad: false }]`];

    const result = injectPluginsIntoConfig(configContents, pluginConfigs);

    expect(result).toContain(`['existing', { autoLoad: false }]`);
    expect(result).toContain(`['rollbar', { autoLoad: false }]`);
    expect(result).toContain(`['rive', { autoLoad: false }]`);
  });
});

// Without a terminal the first prompt used to crash with ERR_TTY_INIT_FAILED and a stack trace.
describe('interactiveError', () => {
  it('is null when both ends are a terminal', () => {
    expect(interactiveError({ isTTY: true }, { isTTY: true })).toBeNull();
  });

  it.each([
    [{ isTTY: false }, { isTTY: true }],
    [{ isTTY: true }, { isTTY: false }],
    [{}, {}],
  ])('explains itself when stdin or stdout is not a terminal', (stdin, stdout) => {
    expect(interactiveError(stdin, stdout)).toMatch(/needs a terminal/);
  });
});

// Vitest has no terminal: any prompt in these runs would throw ERR_TTY_INIT_FAILED.
describe('create --yes', () => {
  const dirs = [];
  const tmp = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'caper-create-yes-'));
    dirs.push(dir);
    return dir;
  };

  afterEach(() => {
    vi.restoreAllMocks();
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('scaffolds the default template with no prompts, no plugins and a name from the folder', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const cwd = path.join(tmp(), 'my-game');
    await create(cwd, 'npm', { yes: true, install: false });

    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8'));
    expect(pkg.name).toBe('mygame');
    expect(Object.keys(pkg.dependencies).filter((dep) => dep.startsWith('@caperjs/plugin-'))).toEqual([]);
    expect(fs.existsSync(path.join(cwd, 'caper.config.ts'))).toBe(true);
    expect(fs.readFileSync(path.join(cwd, 'caper.config.ts'), 'utf-8')).toContain('MyGame');
  });

  it('refuses a folder that already has files instead of writing into it', async () => {
    const cwd = tmp();
    fs.writeFileSync(path.join(cwd, 'keep.txt'), 'mine');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });

    await expect(create(cwd, 'npm', { yes: true, install: false })).rejects.toThrow('exit');
    expect(exit).toHaveBeenCalledWith(1);
    expect(error.mock.calls.flat().join('\n')).toMatch(/not empty/);
    expect(fs.readdirSync(cwd)).toEqual(['keep.txt']);
  });
});
