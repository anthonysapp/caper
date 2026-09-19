/**
 * `caper native init` — Tauri v2 scaffolding for a Caper app.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  appSlug,
  commandsFor,
  defaultIdentifier,
  defaultPort,
  initNative,
  isValidIdentifier,
  packageManagerFor,
  parsePort,
  patchPackageScripts,
  patchTauriConfig,
} from './native.mjs';

let tempDir = null;

afterEach(() => {
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  tempDir = null;
});

function makeTempDir() {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'caper-native-'));
  return tempDir;
}

describe('appSlug', () => {
  it('strips a scope, lowercases, and collapses non-alnum runs to a hyphen', () => {
    expect(appSlug('@acme/My Game')).toBe('my-game');
  });

  it('trims leading/trailing hyphens', () => {
    expect(appSlug('--Weird--Name--')).toBe('weird-name');
  });

  it('handles an unscoped name', () => {
    expect(appSlug('SuperGame')).toBe('supergame');
  });

  it('collapses runs of punctuation to a single hyphen', () => {
    expect(appSlug('foo___bar...baz')).toBe('foo-bar-baz');
  });
});

describe('defaultIdentifier', () => {
  it('builds a hyphen-free dev.caper.<slug> identifier (valid as an Android package name too)', () => {
    expect(defaultIdentifier('my-game')).toBe('dev.caper.mygame');
  });

  it('always matches the reverse-DNS shape', () => {
    expect(isValidIdentifier(defaultIdentifier('my-game'))).toBe(true);
    expect(isValidIdentifier(defaultIdentifier('3d-shooter'))).toBe(true);
    expect(isValidIdentifier(defaultIdentifier(''))).toBe(true);
  });
});

describe('isValidIdentifier', () => {
  it('accepts a well-formed reverse-DNS identifier', () => {
    expect(isValidIdentifier('dev.caper.my-game')).toBe(true);
    expect(isValidIdentifier('com.example.app')).toBe(true);
  });

  it('rejects the tauri placeholder', () => {
    expect(isValidIdentifier('com.tauri.dev')).toBe(false);
  });

  it('rejects malformed shapes', () => {
    expect(isValidIdentifier('not-an-identifier')).toBe(false);
    expect(isValidIdentifier('dev.')).toBe(false);
    expect(isValidIdentifier('.dev.caper')).toBe(false);
    expect(isValidIdentifier('Dev.Caper.App')).toBe(false);
    expect(isValidIdentifier('')).toBe(false);
  });
});

describe('defaultPort', () => {
  it('is stable for the same slug', () => {
    expect(defaultPort('my-game')).toBe(defaultPort('my-game'));
  });

  it('is always within 3100-3999', () => {
    for (const slug of ['a', 'my-game', 'zzzzzzzzzz', 'kitchen-sink', '']) {
      const port = defaultPort(slug);
      expect(port).toBeGreaterThanOrEqual(3100);
      expect(port).toBeLessThanOrEqual(3999);
      expect(port).not.toBe(3000);
    }
  });

  it('differs for different slugs (not a constant)', () => {
    const ports = new Set(['a', 'b', 'c', 'd', 'e'].map(defaultPort));
    expect(ports.size).toBeGreaterThan(1);
  });
});

describe('parsePort', () => {
  it('accepts an integer in range', () => {
    expect(parsePort('3123')).toBe(3123);
    expect(parsePort('1024')).toBe(1024);
    expect(parsePort('65535')).toBe(65535);
  });

  it('rejects out-of-range and non-integer values', () => {
    expect(() => parsePort('1023')).toThrow();
    expect(() => parsePort('65536')).toThrow();
    expect(() => parsePort('abc')).toThrow();
    expect(() => parsePort('3123.5')).toThrow();
    expect(() => parsePort('')).toThrow();
  });
});

describe('packageManagerFor', () => {
  it('detects pnpm from pnpm-lock.yaml', () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), '', 'utf-8');
    expect(packageManagerFor(dir)).toBe('pnpm');
  });

  it('detects yarn from yarn.lock', () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, 'yarn.lock'), '', 'utf-8');
    expect(packageManagerFor(dir)).toBe('yarn');
  });

  it('detects bun from bun.lockb', () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, 'bun.lockb'), '', 'utf-8');
    expect(packageManagerFor(dir)).toBe('bun');
  });

  it('detects npm from package-lock.json', () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, 'package-lock.json'), '', 'utf-8');
    expect(packageManagerFor(dir)).toBe('npm');
  });

  it('walks up parent directories to find a monorepo root lockfile', () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), '', 'utf-8');
    const appDir = path.join(dir, 'apps', 'kitchen-sink');
    fs.mkdirSync(appDir, { recursive: true });
    expect(packageManagerFor(appDir)).toBe('pnpm');
  });

  it('defaults to npm when no lockfile is found', () => {
    const dir = makeTempDir();
    expect(packageManagerFor(dir)).toBe('npm');
  });
});

describe('commandsFor', () => {
  it('builds pnpm commands', () => {
    const { dev, build, addDev } = commandsFor('pnpm', 3123);
    expect(dev).toEqual({ cmd: 'pnpm', args: ['vite', '--port', '3123'] });
    expect(build).toEqual({ cmd: 'pnpm', args: ['vite', 'build'] });
    expect(addDev('@tauri-apps/cli@^2')).toEqual({ cmd: 'pnpm', args: ['add', '-D', '@tauri-apps/cli@^2'] });
  });

  it('builds yarn commands', () => {
    const { dev, build, addDev } = commandsFor('yarn', 3123);
    expect(dev).toEqual({ cmd: 'yarn', args: ['vite', '--port', '3123'] });
    expect(build).toEqual({ cmd: 'yarn', args: ['vite', 'build'] });
    expect(addDev('@tauri-apps/cli@^2')).toEqual({ cmd: 'yarn', args: ['add', '-D', '@tauri-apps/cli@^2'] });
  });

  it('builds bun commands', () => {
    const { dev, build, addDev } = commandsFor('bun', 3123);
    expect(dev).toEqual({ cmd: 'bunx', args: ['vite', '--port', '3123'] });
    expect(build).toEqual({ cmd: 'bunx', args: ['vite', 'build'] });
    expect(addDev('@tauri-apps/cli@^2')).toEqual({ cmd: 'bun', args: ['add', '-D', '@tauri-apps/cli@^2'] });
  });

  it('builds npm commands', () => {
    const { dev, build, addDev } = commandsFor('npm', 3123);
    expect(dev).toEqual({ cmd: 'npx', args: ['vite', '--port', '3123'] });
    expect(build).toEqual({ cmd: 'npx', args: ['vite', 'build'] });
    expect(addDev('@tauri-apps/cli@^2')).toEqual({ cmd: 'npm', args: ['install', '-D', '@tauri-apps/cli@^2'] });
  });
});

describe('patchTauriConfig', () => {
  const conf = {
    identifier: 'com.tauri.dev',
    build: {
      frontendDist: '../dist',
      devUrl: 'http://localhost:3123',
      beforeDevCommand: 'pnpm vite --port 3123',
      beforeBuildCommand: 'pnpm vite build',
    },
    app: {
      windows: [{ title: 'old title', width: 800, height: 600, resizable: true }],
      security: { csp: null },
      withGlobalTauri: true,
    },
    bundle: { active: true, targets: ['app'] },
  };

  it('sets identifier and window 0 title/width/height', () => {
    const patched = patchTauriConfig(conf, { identifier: 'dev.caper.my-game', title: 'My Game' });

    expect(patched.identifier).toBe('dev.caper.my-game');
    expect(patched.app.windows[0]).toMatchObject({ title: 'My Game', width: 1280, height: 720 });
  });

  it('leaves app.security.csp and unrelated keys untouched', () => {
    const patched = patchTauriConfig(conf, { identifier: 'dev.caper.my-game', title: 'My Game' });

    expect(patched.app.security.csp).toBeNull();
    expect(patched.app.withGlobalTauri).toBe(true);
    expect(patched.build).toEqual(conf.build);
    expect(patched.bundle).toEqual(conf.bundle);
    expect(patched.app.windows[0].resizable).toBe(true);
  });

  it('does not mutate the original object', () => {
    patchTauriConfig(conf, { identifier: 'dev.caper.my-game', title: 'My Game' });
    expect(conf.identifier).toBe('com.tauri.dev');
    expect(conf.app.windows[0].title).toBe('old title');
  });
});

describe('patchPackageScripts', () => {
  it('adds native:dev and native:build when absent', () => {
    const pkg = { name: 'app', scripts: { dev: 'vite' } };
    const patched = patchPackageScripts(pkg);
    expect(patched.scripts).toEqual({ dev: 'vite', 'native:dev': 'tauri dev', 'native:build': 'tauri build' });
  });

  it('never overwrites an existing native:dev or native:build', () => {
    const pkg = { name: 'app', scripts: { 'native:dev': 'echo custom', dev: 'vite' } };
    const patched = patchPackageScripts(pkg);
    expect(patched.scripts['native:dev']).toBe('echo custom');
    expect(patched.scripts['native:build']).toBe('tauri build');
  });

  it('does not mutate the original object', () => {
    const pkg = { name: 'app', scripts: { dev: 'vite' } };
    patchPackageScripts(pkg);
    expect(pkg.scripts['native:dev']).toBeUndefined();
  });
});

describe('initNative', () => {
  function scaffoldApp(dir, { pkg = {} } = {}) {
    fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), '', 'utf-8');
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'my-game', version: '1.0.0', ...pkg }, null, 2) + '\n',
      'utf-8',
    );
  }

  function stubbedRun(calls) {
    return (cmd, args, opts) => {
      calls.push({ cmd, args, opts });
      if (cmd === 'pnpm' && args[0] === 'tauri' && args[1] === 'init') {
        const srcTauri = path.join(opts.cwd, 'src-tauri');
        fs.mkdirSync(srcTauri, { recursive: true });
        fs.writeFileSync(
          path.join(srcTauri, 'tauri.conf.json'),
          JSON.stringify(
            {
              identifier: 'com.tauri.dev',
              build: {
                frontendDist: '../dist',
                devUrl: 'http://localhost:3123',
                beforeDevCommand: 'pnpm vite --port 3123',
                beforeBuildCommand: 'pnpm vite build',
              },
              app: {
                windows: [{ title: 'my-game', width: 800, height: 600 }],
                security: { csp: null },
              },
              bundle: { active: true, targets: ['app'] },
            },
            null,
            2,
          ),
          'utf-8',
        );
      }
      return { status: 0 };
    };
  }

  it('does nothing and makes zero run calls when src-tauri already exists', async () => {
    const dir = makeTempDir();
    scaffoldApp(dir);
    fs.mkdirSync(path.join(dir, 'src-tauri'));
    const pkgBefore = fs.readFileSync(path.join(dir, 'package.json'), 'utf-8');

    const calls = [];
    const result = await initNative(dir, {}, { run: stubbedRun(calls) });

    expect(result.status).toBe('already-initialized');
    expect(calls).toHaveLength(0);
    expect(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')).toBe(pkgBefore);
  });

  it('fails clearly when there is no package.json', async () => {
    const dir = makeTempDir();
    const calls = [];

    await expect(initNative(dir, {}, { run: stubbedRun(calls) })).rejects.toThrow(/package\.json/);
    expect(calls).toHaveLength(0);
  });

  it('runs tauri init with the exact expected argv, then patches the config and package.json', async () => {
    const dir = makeTempDir();
    scaffoldApp(dir);
    const calls = [];

    const result = await initNative(dir, { port: 3123 }, { run: stubbedRun(calls) });

    expect(result.status).toBe('ok');
    expect(result.identifier).toBe('dev.caper.mygame');
    expect(result.port).toBe(3123);

    const addDevCalls = calls.filter((c) => c.args.includes('@tauri-apps/cli@^2'));
    expect(addDevCalls).toHaveLength(1);
    expect(addDevCalls[0].cmd).toBe('pnpm');
    expect(addDevCalls[0].args).toEqual(['add', '-D', '@tauri-apps/cli@^2']);

    const initCall = calls.find((c) => c.args[0] === 'tauri' && c.args[1] === 'init');
    expect(initCall.cmd).toBe('pnpm');
    expect(initCall.args).toEqual([
      'tauri',
      'init',
      '--ci',
      '--app-name',
      'my-game',
      '--window-title',
      'my-game',
      '--frontend-dist',
      '../dist',
      '--dev-url',
      'http://localhost:3123',
      '--before-dev-command',
      'pnpm vite --port 3123',
      '--before-build-command',
      'pnpm vite build',
    ]);

    const conf = JSON.parse(fs.readFileSync(path.join(dir, 'src-tauri/tauri.conf.json'), 'utf-8'));
    expect(conf.identifier).toBe('dev.caper.mygame');
    expect(conf.app.windows[0]).toMatchObject({ title: 'my-game', width: 1280, height: 720 });
    expect(conf.app.security.csp).toBeNull();
    expect(conf.bundle).toEqual({ active: true, targets: ['app'] });

    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'));
    expect(pkg.scripts['native:dev']).toBe('tauri dev');
    expect(pkg.scripts['native:build']).toBe('tauri build');
  });

  it('skips addDev when @tauri-apps/cli is already a devDependency', async () => {
    const dir = makeTempDir();
    scaffoldApp(dir, { pkg: { devDependencies: { '@tauri-apps/cli': '^2.11' } } });
    const calls = [];

    await initNative(dir, { port: 3123 }, { run: stubbedRun(calls) });

    const addDevCalls = calls.filter((c) => c.args.includes('@tauri-apps/cli@^2') || c.cmd === 'pnpm' && c.args[0] === 'add');
    expect(addDevCalls).toHaveLength(0);
  });

  it('does not clobber an existing native:dev script', async () => {
    const dir = makeTempDir();
    scaffoldApp(dir, { pkg: { scripts: { 'native:dev': 'echo custom' } } });
    const calls = [];

    await initNative(dir, { port: 3123 }, { run: stubbedRun(calls) });

    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'));
    expect(pkg.scripts['native:dev']).toBe('echo custom');
    expect(pkg.scripts['native:build']).toBe('tauri build');
  });

  it('runs tauri icon when --icon is given', async () => {
    const dir = makeTempDir();
    scaffoldApp(dir);
    const calls = [];

    await initNative(dir, { port: 3123, icon: 'icon.png' }, { run: stubbedRun(calls) });

    const iconCall = calls.find((c) => c.args[0] === 'tauri' && c.args[1] === 'icon');
    expect(iconCall).toBeTruthy();
    expect(iconCall.args).toEqual(['tauri', 'icon', 'icon.png']);
  });

  it('does not run tauri icon when --icon is not given', async () => {
    const dir = makeTempDir();
    scaffoldApp(dir);
    const calls = [];

    await initNative(dir, { port: 3123 }, { run: stubbedRun(calls) });

    expect(calls.find((c) => c.args[1] === 'icon')).toBeUndefined();
  });

  it('rejects an invalid --identifier', async () => {
    const dir = makeTempDir();
    scaffoldApp(dir);
    const calls = [];

    await expect(initNative(dir, { identifier: 'com.tauri.dev' }, { run: stubbedRun(calls) })).rejects.toThrow();
    await expect(initNative(dir, { identifier: 'not valid' }, { run: stubbedRun(calls) })).rejects.toThrow();
  });
});
