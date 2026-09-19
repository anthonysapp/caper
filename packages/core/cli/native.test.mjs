/**
 * `caper native init` — Tauri v2 scaffolding for a Caper app.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  addNativePlugin,
  appSlug,
  commandsFor,
  defaultIdentifier,
  defaultPort,
  initNative,
  isValidIdentifier,
  missingDeps,
  packageManagerFor,
  parsePort,
  patchCapabilities,
  patchPackageScripts,
  patchTauriConfig,
  TAURI_PLUGIN_PERMISSIONS,
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
    const { dev, build, addDev, add } = commandsFor('pnpm', 3123);
    expect(dev).toEqual({ cmd: 'pnpm', args: ['vite', '--port', '3123'] });
    expect(build).toEqual({ cmd: 'pnpm', args: ['vite', 'build'] });
    expect(addDev('@tauri-apps/cli@^2')).toEqual({ cmd: 'pnpm', args: ['add', '-D', '@tauri-apps/cli@^2'] });
    expect(add('@caperjs/plugin-tauri', '@tauri-apps/api@^2')).toEqual({
      cmd: 'pnpm',
      args: ['add', '@caperjs/plugin-tauri', '@tauri-apps/api@^2'],
    });
  });

  it('builds yarn commands', () => {
    const { dev, build, addDev, add } = commandsFor('yarn', 3123);
    expect(dev).toEqual({ cmd: 'yarn', args: ['vite', '--port', '3123'] });
    expect(build).toEqual({ cmd: 'yarn', args: ['vite', 'build'] });
    expect(addDev('@tauri-apps/cli@^2')).toEqual({ cmd: 'yarn', args: ['add', '-D', '@tauri-apps/cli@^2'] });
    expect(add('@caperjs/plugin-tauri')).toEqual({ cmd: 'yarn', args: ['add', '@caperjs/plugin-tauri'] });
  });

  it('builds bun commands', () => {
    const { dev, build, addDev, add } = commandsFor('bun', 3123);
    expect(dev).toEqual({ cmd: 'bunx', args: ['vite', '--port', '3123'] });
    expect(build).toEqual({ cmd: 'bunx', args: ['vite', 'build'] });
    expect(addDev('@tauri-apps/cli@^2')).toEqual({ cmd: 'bun', args: ['add', '-D', '@tauri-apps/cli@^2'] });
    expect(add('@caperjs/plugin-tauri')).toEqual({ cmd: 'bun', args: ['add', '@caperjs/plugin-tauri'] });
  });

  it('builds npm commands', () => {
    const { dev, build, addDev, add } = commandsFor('npm', 3123);
    expect(dev).toEqual({ cmd: 'npx', args: ['vite', '--port', '3123'] });
    expect(build).toEqual({ cmd: 'npx', args: ['vite', 'build'] });
    expect(addDev('@tauri-apps/cli@^2')).toEqual({ cmd: 'npm', args: ['install', '-D', '@tauri-apps/cli@^2'] });
    expect(add('@caperjs/plugin-tauri', '@tauri-apps/api@^2')).toEqual({
      cmd: 'npm',
      args: ['install', '@caperjs/plugin-tauri', '@tauri-apps/api@^2'],
    });
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

describe('TAURI_PLUGIN_PERMISSIONS', () => {
  it('is a frozen array of the three window permissions', () => {
    expect(Object.isFrozen(TAURI_PLUGIN_PERMISSIONS)).toBe(true);
    expect(TAURI_PLUGIN_PERMISSIONS).toEqual([
      'core:window:allow-set-fullscreen',
      'core:window:allow-is-fullscreen',
      'core:window:allow-close',
    ]);
  });
});

describe('patchCapabilities', () => {
  it('appends missing permissions, keeping existing order', () => {
    const capabilities = { permissions: ['core:default', 'core:window:allow-set-fullscreen'] };

    const patched = patchCapabilities(capabilities, TAURI_PLUGIN_PERMISSIONS);

    expect(patched.permissions).toEqual([
      'core:default',
      'core:window:allow-set-fullscreen',
      'core:window:allow-is-fullscreen',
      'core:window:allow-close',
    ]);
  });

  it('does not duplicate permissions already present', () => {
    const capabilities = { permissions: [...TAURI_PLUGIN_PERMISSIONS] };

    const patched = patchCapabilities(capabilities, TAURI_PLUGIN_PERMISSIONS);

    expect(patched.permissions).toEqual([...TAURI_PLUGIN_PERMISSIONS]);
  });

  it('preserves object-form permission entries untouched', () => {
    const objectEntry = { identifier: 'core:window:allow-set-title' };
    const capabilities = { permissions: [objectEntry] };

    const patched = patchCapabilities(capabilities, TAURI_PLUGIN_PERMISSIONS);

    expect(patched.permissions[0]).toBe(objectEntry);
    expect(patched.permissions).toEqual([objectEntry, ...TAURI_PLUGIN_PERMISSIONS]);
  });

  it('creates the permissions array when absent', () => {
    const capabilities = { identifier: 'default' };

    const patched = patchCapabilities(capabilities, TAURI_PLUGIN_PERMISSIONS);

    expect(patched.permissions).toEqual([...TAURI_PLUGIN_PERMISSIONS]);
  });

  it('does not mutate the original object', () => {
    const capabilities = { permissions: ['core:default'] };

    patchCapabilities(capabilities, TAURI_PLUGIN_PERMISSIONS);

    expect(capabilities.permissions).toEqual(['core:default']);
  });
});

describe('missingDeps', () => {
  it('returns names absent from both dependencies and devDependencies', () => {
    const pkg = { dependencies: { a: '1' }, devDependencies: { b: '1' } };
    expect(missingDeps(pkg, ['a', 'b', 'c'])).toEqual(['c']);
  });

  it('returns everything when there are no deps at all', () => {
    expect(missingDeps({}, ['a', 'b'])).toEqual(['a', 'b']);
  });
});

describe('addNativePlugin', () => {
  function scaffoldNativePlugin(dir, { pkg = {}, cargoToml = '[package]\nname = "my-game"\n', capabilities } = {}) {
    fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), '', 'utf-8');
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'my-game', version: '1.0.0', ...pkg }, null, 2) + '\n',
      'utf-8',
    );
    fs.mkdirSync(path.join(dir, 'src-tauri/capabilities'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src-tauri/tauri.conf.json'), JSON.stringify({ identifier: 'dev.caper.my-game' }, null, 2) + '\n', 'utf-8');
    fs.writeFileSync(path.join(dir, 'src-tauri/Cargo.toml'), cargoToml, 'utf-8');
    fs.writeFileSync(
      path.join(dir, 'src-tauri/capabilities/default.json'),
      JSON.stringify(
        capabilities ?? {
          $schema: '../gen/schemas/desktop-schema.json',
          identifier: 'default',
          description: 'Capability for the main window',
          windows: ['main'],
          permissions: ['core:default'],
        },
        null,
        2,
      ) + '\n',
      'utf-8',
    );
  }

  // Mirrors what `pnpm add <pkg>` / `tauri add store` actually do to the
  // filesystem, so a *second* call sees the real post-install state.
  function stubbedPluginRun(calls) {
    return (cmd, args, opts) => {
      calls.push({ cmd, args, opts });
      if (args[0] === 'tauri' && args[1] === 'add' && args[2] === 'store') {
        const cargoTomlPath = path.join(opts.cwd, 'src-tauri/Cargo.toml');
        const existing = fs.readFileSync(cargoTomlPath, 'utf-8');
        fs.writeFileSync(cargoTomlPath, `${existing}\n[dependencies]\ntauri-plugin-store = "2"\n`, 'utf-8');
      } else if (args[0] === 'add' || args[0] === 'install') {
        const pkgPath = path.join(opts.cwd, 'package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        pkg.dependencies = pkg.dependencies ?? {};
        for (const spec of args.slice(1)) {
          const at = spec.lastIndexOf('@');
          const name = at > 0 ? spec.slice(0, at) : spec;
          const version = at > 0 ? spec.slice(at + 1) : 'latest';
          pkg.dependencies[name] = version;
        }
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
      }
      return { status: 0 };
    };
  }

  it('runs the full first-time flow: adds deps, runs tauri add store, and patches capabilities', async () => {
    const dir = makeTempDir();
    scaffoldNativePlugin(dir);
    const calls = [];

    const result = await addNativePlugin(dir, {}, { run: stubbedPluginRun(calls) });

    expect(result.status).toBe('ok');
    expect(result.changed).toBe(true);
    expect(result.addedDeps).toEqual(['@caperjs/plugin-tauri', '@tauri-apps/api']);
    expect(result.ranTauriAddStore).toBe(true);
    expect(result.capabilitiesChanged).toBe(true);
    expect(calls).toHaveLength(2);

    const addCall = calls.find((c) => c.args[0] === 'add');
    expect(addCall.cmd).toBe('pnpm');
    expect(addCall.args).toEqual(['add', '@caperjs/plugin-tauri', '@tauri-apps/api@^2']);

    const storeCall = calls.find((c) => c.args[0] === 'tauri');
    expect(storeCall.cmd).toBe('pnpm');
    expect(storeCall.args).toEqual(['tauri', 'add', 'store']);

    const capabilities = JSON.parse(fs.readFileSync(path.join(dir, 'src-tauri/capabilities/default.json'), 'utf-8'));
    expect(capabilities.permissions).toEqual(['core:default', ...TAURI_PLUGIN_PERMISSIONS]);
  });

  it('is idempotent: a second run makes zero run calls and leaves files unchanged', async () => {
    const dir = makeTempDir();
    scaffoldNativePlugin(dir);

    await addNativePlugin(dir, {}, { run: stubbedPluginRun([]) });

    const pkgAfterFirst = fs.readFileSync(path.join(dir, 'package.json'), 'utf-8');
    const cargoAfterFirst = fs.readFileSync(path.join(dir, 'src-tauri/Cargo.toml'), 'utf-8');
    const capabilitiesAfterFirst = fs.readFileSync(path.join(dir, 'src-tauri/capabilities/default.json'), 'utf-8');

    const secondCalls = [];
    const result = await addNativePlugin(dir, {}, { run: stubbedPluginRun(secondCalls) });

    expect(secondCalls).toHaveLength(0);
    expect(result.changed).toBe(false);
    expect(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')).toBe(pkgAfterFirst);
    expect(fs.readFileSync(path.join(dir, 'src-tauri/Cargo.toml'), 'utf-8')).toBe(cargoAfterFirst);
    expect(fs.readFileSync(path.join(dir, 'src-tauri/capabilities/default.json'), 'utf-8')).toBe(capabilitiesAfterFirst);
  });

  it('fails clearly when src-tauri does not exist, and writes nothing', async () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'my-game' }, null, 2) + '\n', 'utf-8');
    const calls = [];

    await expect(addNativePlugin(dir, {}, { run: stubbedPluginRun(calls) })).rejects.toThrow(/caper native init/);
    expect(calls).toHaveLength(0);
    expect(fs.existsSync(path.join(dir, 'src-tauri'))).toBe(false);
  });

  it('fails clearly when capabilities/default.json is missing', async () => {
    const dir = makeTempDir();
    scaffoldNativePlugin(dir);
    fs.rmSync(path.join(dir, 'src-tauri/capabilities/default.json'));

    await expect(addNativePlugin(dir, {}, { run: stubbedPluginRun([]) })).rejects.toThrow(/capabilities\/default\.json/);
  });

  it('fails clearly when capabilities/default.json is not valid JSON', async () => {
    const dir = makeTempDir();
    scaffoldNativePlugin(dir);
    fs.writeFileSync(path.join(dir, 'src-tauri/capabilities/default.json'), '{ not json', 'utf-8');

    await expect(addNativePlugin(dir, {}, { run: stubbedPluginRun([]) })).rejects.toThrow(/capabilities\/default\.json/);
  });

  it('skips the dep-add call when both deps are already present', async () => {
    const dir = makeTempDir();
    scaffoldNativePlugin(dir, { pkg: { dependencies: { '@caperjs/plugin-tauri': '^1', '@tauri-apps/api': '^2' } } });
    const calls = [];

    const result = await addNativePlugin(dir, {}, { run: stubbedPluginRun(calls) });

    expect(result.addedDeps).toEqual([]);
    expect(calls.find((c) => c.args[0] === 'add' || c.args[0] === 'install')).toBeUndefined();
  });

  it('skips tauri add store when Cargo.toml already lists tauri-plugin-store', async () => {
    const dir = makeTempDir();
    scaffoldNativePlugin(dir, { cargoToml: '[dependencies]\ntauri-plugin-store = "2"\n' });
    const calls = [];

    const result = await addNativePlugin(dir, {}, { run: stubbedPluginRun(calls) });

    expect(result.ranTauriAddStore).toBe(false);
    expect(calls.find((c) => c.args[0] === 'tauri')).toBeUndefined();
  });
});
