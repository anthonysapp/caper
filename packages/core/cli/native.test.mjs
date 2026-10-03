/**
 * `caper native init` — Tauri v2 scaffolding for a Caper app.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import {
  addNativePlugin,
  ANDROID_RUST_TARGETS,
  androidNative,
  appSlug,
  commandsFor,
  defaultIdentifier,
  defaultPort,
  displayTitle,
  findMainActivity,
  initNative,
  isValidIdentifier,
  missingDeps,
  missingRustTargets,
  packageManagerFor,
  parsePort,
  patchAndroidScripts,
  patchCapabilities,
  patchManifestOrientation,
  patchPackageScripts,
  patchTauriConfig,
  planBuildRs,
  planMainActivity,
  readManifestOrientation,
  renderMainActivity,
  resolveAndroidEnv,
  TAURI_PLUGIN_PERMISSIONS,
} from './native.mjs';

// A copy of the manifest `tauri android init` generated for kitchen-sink.
const MANIFEST_FIXTURE = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../test/fixtures/android/AndroidManifest.xml'),
  'utf-8',
);

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

describe('displayTitle', () => {
  it('title-cases a package name into a window title', () => {
    expect(displayTitle('rhodora')).toBe('Rhodora');
    expect(displayTitle('my-game')).toBe('My Game');
    expect(displayTitle('@studio/space_rocks')).toBe('Space Rocks');
  });
});

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

  it('uses a 450x800 window for a portrait game', () => {
    const patched = patchTauriConfig(conf, { identifier: 'dev.caper.my-game', title: 'My Game', orientation: 'portrait' });
    expect(patched.app.windows[0]).toMatchObject({ width: 450, height: 800 });
  });

  it('keeps 1280x720 for a landscape game', () => {
    const patched = patchTauriConfig(conf, { identifier: 'dev.caper.my-game', title: 'My Game', orientation: 'landscape' });
    expect(patched.app.windows[0]).toMatchObject({ width: 1280, height: 720 });
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

  it('keeps the @tauri-apps/cli devDependency the package manager just added', async () => {
    const dir = makeTempDir();
    scaffoldApp(dir);
    const calls = [];
    const tauriRun = stubbedRun(calls);
    // Like a real `pnpm add -D`, write the devDependency into package.json.
    const run = (cmd, args, opts) => {
      if (args[0] === 'add') {
        const pkgPath = path.join(opts.cwd, 'package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        pkg.devDependencies = { ...pkg.devDependencies, '@tauri-apps/cli': '^2.12.1' };
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
      }
      return tauriRun(cmd, args, opts);
    };

    await initNative(dir, {}, { run });

    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'));
    expect(pkg.devDependencies['@tauri-apps/cli']).toBe('^2.12.1');
    expect(pkg.scripts['native:build']).toBe('tauri build');
  });

  it('sizes the window from caper.config orientation', async () => {
    const dir = makeTempDir();
    scaffoldApp(dir);

    const result = await initNative(dir, {}, { run: stubbedRun([]), loadConfig: () => ({ orientation: 'portrait' }) });

    expect(result.warnings).toEqual([]);
    const conf = JSON.parse(fs.readFileSync(path.join(dir, 'src-tauri/tauri.conf.json'), 'utf-8'));
    expect(conf.app.windows[0]).toMatchObject({ width: 450, height: 800 });
  });

  it('warns and keeps 1280x720 when caper.config orientation cannot be read', async () => {
    const dir = makeTempDir();
    scaffoldApp(dir);
    const loadConfig = () => {
      throw new Error('boom');
    };

    const result = await initNative(dir, {}, { run: stubbedRun([]), loadConfig });

    expect(result.status).toBe('ok');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/could not read caper\.config\.ts orientation/);
    const conf = JSON.parse(fs.readFileSync(path.join(dir, 'src-tauri/tauri.conf.json'), 'utf-8'));
    expect(conf.app.windows[0]).toMatchObject({ width: 1280, height: 720 });
  });

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
      'My Game',
      '--window-title',
      'My Game',
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
    expect(conf.app.windows[0]).toMatchObject({ title: 'My Game', width: 1280, height: 720 });
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

const STOCK_MAIN_ACTIVITY =
  'package x.y.z\n\nimport android.os.Bundle\nimport androidx.activity.enableEdgeToEdge\n\nclass MainActivity : TauriActivity() {\n  override fun onCreate(savedInstanceState: Bundle?) {\n    enableEdgeToEdge()\n    super.onCreate(savedInstanceState)\n  }\n}\n';
const STOCK_BUILD_RS = 'fn main() {\n    tauri_build::build()\n}\n';

describe('resolveAndroidEnv', () => {
  const HOME = '/Users/me';
  const MAC_SDK = '/Users/me/Library/Android/sdk';
  const JBR = '/Applications/Android Studio.app/Contents/jbr/Contents/Home';

  function fakeFs(paths, dirs = {}) {
    const set = new Set(paths);
    return {
      exists: (p) => set.has(p),
      listDir: (p) => dirs[p] ?? [],
    };
  }

  it('uses explicit env values as-is', () => {
    const { env, missing } = resolveAndroidEnv({
      env: { ANDROID_HOME: '/sdk', NDK_HOME: '/ndk', JAVA_HOME: '/java', PATH: '/rup/bin:/usr/bin' },
      platform: 'linux',
      homedir: HOME,
      ...fakeFs(['/rup/bin/rustup']),
    });
    expect(env.ANDROID_HOME).toBe('/sdk');
    expect(env.NDK_HOME).toBe('/ndk');
    expect(env.JAVA_HOME).toBe('/java');
    expect(env.PATH).toBe('/rup/bin:/usr/bin');
    expect(missing).toEqual([]);
  });

  it('falls back to ANDROID_SDK_ROOT for ANDROID_HOME', () => {
    const { env } = resolveAndroidEnv({ env: { ANDROID_SDK_ROOT: '/root-sdk', PATH: '' }, platform: 'linux', homedir: HOME, ...fakeFs([]) });
    expect(env.ANDROID_HOME).toBe('/root-sdk');
  });

  it('finds the macOS SDK, the highest NDK (numerically), and Android Studio JBR on darwin', () => {
    const { env, missing } = resolveAndroidEnv({
      env: { PATH: '/rup/bin' },
      platform: 'darwin',
      homedir: HOME,
      ...fakeFs([MAC_SDK, JBR, '/rup/bin/rustup'], {
        [`${MAC_SDK}/ndk`]: ['27.0.12077973', '27.1.12297006', '9.9.9', '.DS_Store'],
      }),
    });
    expect(env.ANDROID_HOME).toBe(MAC_SDK);
    expect(env.NDK_HOME).toBe(`${MAC_SDK}/ndk/27.1.12297006`);
    expect(env.JAVA_HOME).toBe(JBR);
    expect(missing).toEqual([]);
  });

  it('does not probe macOS paths on other platforms and reports what is missing', () => {
    const { env, missing } = resolveAndroidEnv({
      env: { PATH: '/usr/bin' },
      platform: 'linux',
      homedir: HOME,
      ...fakeFs([MAC_SDK, JBR]),
    });
    expect(env.ANDROID_HOME).toBeUndefined();
    expect(missing).toEqual(expect.arrayContaining(['ANDROID_HOME', 'NDK_HOME', 'JAVA_HOME', 'rustup']));
  });

  it('prepends keg-only Homebrew rustup when rustup is not on PATH', () => {
    const { env, missing } = resolveAndroidEnv({
      env: { PATH: '/usr/bin' },
      platform: 'darwin',
      homedir: HOME,
      ...fakeFs(['/opt/homebrew/opt/rustup/bin/rustup', `${HOME}/.cargo/bin/rustup`]),
    });
    expect(env.PATH).toBe('/opt/homebrew/opt/rustup/bin:/usr/bin');
    expect(missing).not.toContain('rustup');
  });

  it('falls back to ~/.cargo/bin when there is no Homebrew rustup', () => {
    const { env } = resolveAndroidEnv({
      env: { PATH: '/usr/bin' },
      platform: 'linux',
      homedir: HOME,
      ...fakeFs([`${HOME}/.cargo/bin/rustup`]),
    });
    expect(env.PATH).toBe(`${HOME}/.cargo/bin:/usr/bin`);
  });

  it("prepends rustup's proxies when Homebrew's rustc would shadow them", () => {
    const { env } = resolveAndroidEnv({
      env: { PATH: `/opt/homebrew/bin:${HOME}/.cargo/bin` },
      platform: 'darwin',
      homedir: HOME,
      ...fakeFs(['/opt/homebrew/bin/rustc', `${HOME}/.cargo/bin/rustup`, `${HOME}/.cargo/bin/rustc`]),
    });
    expect(env.PATH).toBe(`${HOME}/.cargo/bin:/opt/homebrew/bin:${HOME}/.cargo/bin`);
  });

  it("prepends keg-only rustup when Homebrew links rustup next to its own rust's rustc", () => {
    const { env } = resolveAndroidEnv({
      env: { PATH: '/opt/homebrew/bin:/usr/bin' },
      platform: 'darwin',
      homedir: HOME,
      ...fakeFs(['/opt/homebrew/bin/rustc', '/opt/homebrew/bin/rustup', '/opt/homebrew/opt/rustup/bin/rustup']),
    });
    expect(env.PATH).toBe('/opt/homebrew/opt/rustup/bin:/opt/homebrew/bin:/usr/bin');
  });

  it('leaves PATH alone when rustup already comes first', () => {
    const { env } = resolveAndroidEnv({
      env: { PATH: `${HOME}/.cargo/bin:/opt/homebrew/bin` },
      platform: 'darwin',
      homedir: HOME,
      ...fakeFs(['/opt/homebrew/bin/rustc', `${HOME}/.cargo/bin/rustup`, `${HOME}/.cargo/bin/rustc`, '/opt/homebrew/opt/rustup/bin/rustup']),
    });
    expect(env.PATH).toBe(`${HOME}/.cargo/bin:/opt/homebrew/bin`);
  });

  it('keeps unrelated env vars', () => {
    const { env } = resolveAndroidEnv({ env: { FOO: 'bar', PATH: '' }, platform: 'linux', homedir: HOME, ...fakeFs([]) });
    expect(env.FOO).toBe('bar');
  });
});

describe('missingRustTargets', () => {
  it('lists the four Android targets', () => {
    expect(ANDROID_RUST_TARGETS).toEqual(['aarch64-linux-android', 'armv7-linux-androideabi', 'i686-linux-android', 'x86_64-linux-android']);
    expect(Object.isFrozen(ANDROID_RUST_TARGETS)).toBe(true);
  });

  it('returns the targets absent from `rustup target list --installed` output', () => {
    const out = 'aarch64-apple-darwin\naarch64-linux-android\nx86_64-linux-android\n';
    expect(missingRustTargets(out)).toEqual(['armv7-linux-androideabi', 'i686-linux-android']);
  });

  it('returns nothing when all are installed', () => {
    expect(missingRustTargets(ANDROID_RUST_TARGETS.join('\n'))).toEqual([]);
  });
});

describe('planBuildRs', () => {
  it('writes when build.rs is missing', () => {
    expect(planBuildRs(null)).toBe('write');
  });

  it("writes over Tauri's stock build.rs, whitespace-insensitively", () => {
    expect(planBuildRs(STOCK_BUILD_RS)).toBe('write');
    expect(planBuildRs('fn main(){tauri_build::build()}')).toBe('write');
  });

  it('skips when the 16 KB link arg is already there', () => {
    expect(planBuildRs('fn main() { println!("cargo:rustc-link-arg=-Wl,-z,max-page-size=16384"); tauri_build::build() }')).toBe('skip');
  });

  it('warns on a customized build.rs', () => {
    expect(planBuildRs('fn main() {\n    do_something();\n    tauri_build::build()\n}\n')).toBe('warn');
  });
});

describe('planMainActivity / renderMainActivity', () => {
  it("replaces Tauri's stock template", () => {
    expect(planMainActivity(STOCK_MAIN_ACTIVITY)).toBe('write');
  });

  it('replaces an empty-body stock class', () => {
    expect(planMainActivity('package a.b\n\nclass MainActivity : TauriActivity()\n')).toBe('write');
    expect(planMainActivity('package a.b\n\nclass MainActivity : TauriActivity() {}\n')).toBe('write');
  });

  it('skips when the system bars are already hidden', () => {
    expect(planMainActivity(renderMainActivity('package x.y.z'))).toBe('skip');
  });

  it('warns on a customized MainActivity', () => {
    const custom = STOCK_MAIN_ACTIVITY.replace('super.onCreate(savedInstanceState)', 'super.onCreate(savedInstanceState)\n    doMore()');
    expect(planMainActivity(custom)).toBe('warn');
  });

  it("keeps the original package line and hides the bars in onCreate and onWindowFocusChanged", () => {
    const out = renderMainActivity('package dev.caper.my_game');
    expect(out.startsWith('package dev.caper.my_game\n')).toBe(true);
    expect(out).toContain('WindowInsetsCompat.Type.systemBars()');
    expect(out).toContain('BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE');
    expect(out).toContain('override fun onWindowFocusChanged');
  });
});

describe('patchAndroidScripts', () => {
  it('adds the android scripts when absent', () => {
    expect(patchAndroidScripts({ scripts: { dev: 'vite' } }).scripts).toEqual({
      dev: 'vite',
      'native:android:dev': 'tauri android dev',
      'native:android:build': 'tauri android build',
    });
  });

  it('never overwrites existing ones and does not mutate', () => {
    const pkg = { scripts: { 'native:android:dev': 'custom' } };
    const out = patchAndroidScripts(pkg);
    expect(out.scripts['native:android:dev']).toBe('custom');
    expect(out.scripts['native:android:build']).toBe('tauri android build');
    expect(pkg.scripts).toEqual({ 'native:android:dev': 'custom' });
  });
});

describe('androidNative', () => {
  function scaffoldAndroidApp(dir) {
    fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), '', 'utf-8');
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'my-game', scripts: { dev: 'vite' } }, null, 4) + '\n', 'utf-8');
    fs.mkdirSync(path.join(dir, 'src-tauri'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src-tauri/tauri.conf.json'), JSON.stringify({ identifier: 'dev.caper.mygame' }, null, 2) + '\n', 'utf-8');
    fs.writeFileSync(path.join(dir, 'src-tauri/build.rs'), STOCK_BUILD_RS, 'utf-8');
    const bin = path.join(dir, 'bin');
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'rustup'), '', 'utf-8');
    return {
      env: { PATH: bin, ANDROID_HOME: path.join(dir, 'sdk'), NDK_HOME: path.join(dir, 'ndk'), JAVA_HOME: path.join(dir, 'java') },
      platform: 'linux',
      homedir: path.join(dir, 'home'),
    };
  }

  // Mirrors what `rustup target add` / `tauri android init` do to the machine.
  function stubs(state, calls) {
    return {
      exec: (cmd, args, opts) => {
        calls.push({ kind: 'exec', cmd, args, opts });
        if (cmd === 'rustup' && args.join(' ') === 'target list --installed') return state.installed.join('\n') + '\n';
        throw new Error(`unstubbed exec: ${cmd} ${args.join(' ')}`);
      },
      run: (cmd, args, opts) => {
        calls.push({ kind: 'run', cmd, args, opts });
        if (cmd === 'rustup' && args[0] === 'target' && args[1] === 'add') {
          state.installed.push(...args.slice(2));
        } else if (cmd === 'pnpm' && args.join(' ') === 'tauri android init --ci') {
          const dir = path.join(opts.cwd, 'src-tauri/gen/android/app/src/main/java/x/y/z');
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, 'MainActivity.kt'), STOCK_MAIN_ACTIVITY, 'utf-8');
          fs.writeFileSync(path.join(opts.cwd, 'src-tauri/gen/android/app/src/main/AndroidManifest.xml'), MANIFEST_FIXTURE, 'utf-8');
        } else {
          throw new Error(`unstubbed run: ${cmd} ${args.join(' ')}`);
        }
        return { status: 0 };
      },
    };
  }

  function snapshot(dir) {
    const out = {};
    const walk = (p) => {
      for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
        const full = path.join(p, entry.name);
        if (entry.isDirectory()) walk(full);
        else out[path.relative(dir, full)] = fs.readFileSync(full, 'utf-8') + String(fs.statSync(full).mtimeMs);
      }
    };
    walk(dir);
    return out;
  }

  it('fails clearly when src-tauri does not exist, with zero calls', async () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"x"}\n', 'utf-8');
    const calls = [];
    await expect(androidNative(dir, {}, { ...stubs({ installed: [] }, calls), env: {}, platform: 'linux', homedir: dir })).rejects.toThrow(
      /caper native init/,
    );
    expect(calls).toHaveLength(0);
  });

  it('fails in plain English when NDK_HOME, JAVA_HOME or rustup cannot be found, before running anything', async () => {
    const dir = makeTempDir();
    const deps = scaffoldAndroidApp(dir);
    const calls = [];
    await expect(
      androidNative(dir, {}, { ...stubs({ installed: [] }, calls), env: { PATH: '/nowhere' }, platform: 'linux', homedir: path.join(dir, 'home'), exists: () => false }),
    ).rejects.toThrow(/NDK_HOME[\s\S]*JAVA_HOME[\s\S]*rustup/);
    expect(calls).toHaveLength(0);
    expect(deps).toBeTruthy();
  });

  it('runs the full first-time flow with the resolved env passed to every child process', async () => {
    const dir = makeTempDir();
    const deps = scaffoldAndroidApp(dir);
    const calls = [];
    const state = { installed: ['aarch64-apple-darwin', 'aarch64-linux-android'] };

    const result = await androidNative(dir, {}, { ...stubs(state, calls), ...deps });

    expect(result.status).toBe('ok');
    expect(result.changed).toBe(true);
    expect(result.addedTargets).toEqual(['armv7-linux-androideabi', 'i686-linux-android', 'x86_64-linux-android']);
    expect(result.ranAndroidInit).toBe(true);
    expect(result.buildRsPatched).toBe(true);
    expect(result.mainActivityPatched).toBe(true);
    expect(result.addedScripts).toEqual(['native:android:dev', 'native:android:build']);
    expect(result.warnings).toEqual([]);
    expect(result.env).toEqual({ ANDROID_HOME: deps.env.ANDROID_HOME, NDK_HOME: deps.env.NDK_HOME, JAVA_HOME: deps.env.JAVA_HOME });

    const runs = calls.filter((c) => c.kind === 'run');
    expect(runs.map((c) => `${c.cmd} ${c.args.join(' ')}`)).toEqual([
      'rustup target add armv7-linux-androideabi i686-linux-android x86_64-linux-android',
      'pnpm tauri android init --ci',
    ]);
    for (const call of calls) {
      expect(call.opts.cwd).toBe(dir);
      expect(call.opts.env.NDK_HOME).toBe(deps.env.NDK_HOME);
      expect(call.opts.env.JAVA_HOME).toBe(deps.env.JAVA_HOME);
      expect(call.opts.env.PATH).toBe(deps.env.PATH);
    }

    expect(fs.readFileSync(path.join(dir, 'src-tauri/build.rs'), 'utf-8')).toContain('max-page-size=16384');
    const activity = fs.readFileSync(path.join(dir, 'src-tauri/gen/android/app/src/main/java/x/y/z/MainActivity.kt'), 'utf-8');
    expect(activity.startsWith('package x.y.z\n')).toBe(true);
    expect(activity).toContain('WindowInsetsCompat.Type.systemBars()');

    const pkgRaw = fs.readFileSync(path.join(dir, 'package.json'), 'utf-8');
    expect(pkgRaw).toContain('\n    "scripts"');
    expect(JSON.parse(pkgRaw).scripts['native:android:dev']).toBe('tauri android dev');
  });

  it('is idempotent: a second run makes zero run calls and zero writes', async () => {
    const dir = makeTempDir();
    const deps = scaffoldAndroidApp(dir);
    const state = { installed: [] };
    await androidNative(dir, {}, { ...stubs(state, []), ...deps });
    const before = snapshot(dir);

    const calls = [];
    const result = await androidNative(dir, {}, { ...stubs(state, calls), ...deps });

    expect(calls.filter((c) => c.kind === 'run')).toHaveLength(0);
    expect(result.changed).toBe(false);
    expect(result.warnings).toEqual([]);
    expect(snapshot(dir)).toEqual(before);
  });

  const manifestPath = (dir) => path.join(dir, 'src-tauri/gen/android/app/src/main/AndroidManifest.xml');

  it('leaves AndroidManifest.xml alone when caper.config sets no orientation', async () => {
    const dir = makeTempDir();
    const deps = scaffoldAndroidApp(dir);

    const result = await androidNative(dir, {}, { ...stubs({ installed: [] }, []), ...deps, loadConfig: () => ({}) });

    expect(result.orientation).toBeUndefined();
    expect(result.orientationPatched).toBe(false);
    expect(result.warnings).toEqual([]);
    expect(fs.readFileSync(manifestPath(dir), 'utf-8')).toBe(MANIFEST_FIXTURE);
  });

  it('locks MainActivity to caper.config orientation', async () => {
    const dir = makeTempDir();
    const deps = scaffoldAndroidApp(dir);

    const result = await androidNative(dir, {}, { ...stubs({ installed: [] }, []), ...deps, loadConfig: () => ({ orientation: 'portrait' }) });

    expect(result.orientation).toBe('portrait');
    expect(result.orientationPatched).toBe(true);
    expect(readManifestOrientation(fs.readFileSync(manifestPath(dir), 'utf-8'))).toBe('portrait');
  });

  it('applies a changed orientation on the next run, then makes zero writes', async () => {
    const dir = makeTempDir();
    const deps = scaffoldAndroidApp(dir);
    const state = { installed: [] };
    await androidNative(dir, {}, { ...stubs(state, []), ...deps, loadConfig: () => ({ orientation: 'portrait' }) });

    const landscape = { ...deps, loadConfig: () => ({ orientation: 'landscape' }) };
    const changed = await androidNative(dir, {}, { ...stubs(state, []), ...landscape });
    expect(changed.changed).toBe(true);
    expect(changed.orientationPatched).toBe(true);
    expect(readManifestOrientation(fs.readFileSync(manifestPath(dir), 'utf-8'))).toBe('sensorLandscape');

    const before = snapshot(dir);
    const calls = [];
    const again = await androidNative(dir, {}, { ...stubs(state, calls), ...landscape });
    expect(calls.filter((c) => c.kind === 'run')).toHaveLength(0);
    expect(again.changed).toBe(false);
    expect(again.orientationPatched).toBe(false);
    expect(snapshot(dir)).toEqual(before);
  });

  it('reads the lock from the object form of orientation', async () => {
    const dir = makeTempDir();
    const deps = scaffoldAndroidApp(dir);
    const loadConfig = () => ({ orientation: { lock: 'landscape', overlay: false } });

    const result = await androidNative(dir, {}, { ...stubs({ installed: [] }, []), ...deps, loadConfig });

    expect(result.orientation).toBe('landscape');
    expect(readManifestOrientation(fs.readFileSync(manifestPath(dir), 'utf-8'))).toBe('sensorLandscape');
  });

  it('warns and skips orientation when caper.config orientation is invalid', async () => {
    const dir = makeTempDir();
    const deps = scaffoldAndroidApp(dir);

    const result = await androidNative(dir, {}, { ...stubs({ installed: [] }, []), ...deps, loadConfig: () => ({ orientation: { lock: 'any' } }) });

    expect(result.orientationPatched).toBe(false);
    expect(result.warnings[0]).toMatch(/could not read caper\.config\.ts orientation/);
    expect(fs.readFileSync(manifestPath(dir), 'utf-8')).toBe(MANIFEST_FIXTURE);
  });

  it('warns and skips orientation when caper.config cannot be read', async () => {
    const dir = makeTempDir();
    const deps = scaffoldAndroidApp(dir);
    const loadConfig = () => {
      throw new Error('boom');
    };

    const result = await androidNative(dir, {}, { ...stubs({ installed: [] }, []), ...deps, loadConfig });

    expect(result.status).toBe('ok');
    expect(result.orientationPatched).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/could not read caper\.config\.ts orientation/);
    expect(fs.readFileSync(manifestPath(dir), 'utf-8')).toBe(MANIFEST_FIXTURE);
  });

  it('warns when orientation is set but AndroidManifest.xml is missing', async () => {
    const dir = makeTempDir();
    const deps = scaffoldAndroidApp(dir);
    await androidNative(dir, {}, { ...stubs({ installed: [] }, []), ...deps, loadConfig: () => ({}) });
    fs.rmSync(manifestPath(dir));

    const result = await androidNative(dir, {}, { ...stubs({ installed: [...ANDROID_RUST_TARGETS] }, []), ...deps, loadConfig: () => ({ orientation: 'portrait' }) });

    expect(result.orientationPatched).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/AndroidManifest\.xml/);
  });

  it('writes the build.rs template when build.rs is missing', async () => {
    const dir = makeTempDir();
    const deps = scaffoldAndroidApp(dir);
    fs.rmSync(path.join(dir, 'src-tauri/build.rs'));
    const result = await androidNative(dir, {}, { ...stubs({ installed: [...ANDROID_RUST_TARGETS] }, []), ...deps });
    expect(result.buildRsPatched).toBe(true);
    expect(fs.readFileSync(path.join(dir, 'src-tauri/build.rs'), 'utf-8')).toContain('tauri_build::build()');
  });

  it('warns and leaves a customized build.rs and MainActivity untouched', async () => {
    const dir = makeTempDir();
    const deps = scaffoldAndroidApp(dir);
    const customRs = 'fn main() {\n    custom();\n    tauri_build::build()\n}\n';
    fs.writeFileSync(path.join(dir, 'src-tauri/build.rs'), customRs, 'utf-8');
    const activityDir = path.join(dir, 'src-tauri/gen/android/app/src/main/java/a/b');
    fs.mkdirSync(activityDir, { recursive: true });
    const customKt = 'package a.b\n\nclass MainActivity : TauriActivity() {\n  fun other() {}\n}\n';
    fs.writeFileSync(path.join(activityDir, 'MainActivity.kt'), customKt, 'utf-8');
    const calls = [];

    const result = await androidNative(dir, {}, { ...stubs({ installed: [...ANDROID_RUST_TARGETS] }, calls), ...deps });

    expect(result.ranAndroidInit).toBe(false);
    expect(result.buildRsPatched).toBe(false);
    expect(result.mainActivityPatched).toBe(false);
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings[0]).toMatch(/build\.rs[\s\S]*max-page-size=16384/);
    expect(result.warnings[1]).toMatch(/MainActivity\.kt/);
    expect(fs.readFileSync(path.join(dir, 'src-tauri/build.rs'), 'utf-8')).toBe(customRs);
    expect(fs.readFileSync(path.join(activityDir, 'MainActivity.kt'), 'utf-8')).toBe(customKt);
    expect(calls.filter((c) => c.kind === 'run')).toHaveLength(0);
  });
});

describe('patchManifestOrientation', () => {
  const withAttr = (value) => MANIFEST_FIXTURE.replace('android:name=".MainActivity"', `android:name=".MainActivity"\n            android:screenOrientation="${value}"`);

  it('reads no orientation from the stock manifest', () => {
    expect(readManifestOrientation(MANIFEST_FIXTURE)).toBeUndefined();
  });

  it('adds android:screenOrientation under android:name, matching its indentation', () => {
    const patched = patchManifestOrientation(MANIFEST_FIXTURE, 'portrait');
    expect(patched).toBe(withAttr('portrait'));
    expect(readManifestOrientation(patched)).toBe('portrait');
  });

  it('maps landscape to sensorLandscape', () => {
    expect(patchManifestOrientation(MANIFEST_FIXTURE, 'landscape')).toBe(withAttr('sensorLandscape'));
  });

  it('returns the same string when the value already matches', () => {
    const xml = withAttr('portrait');
    expect(patchManifestOrientation(xml, 'portrait')).toBe(xml);
  });

  it('replaces a different existing value', () => {
    expect(patchManifestOrientation(withAttr('landscape'), 'portrait')).toBe(withAttr('portrait'));
    expect(patchManifestOrientation(withAttr('portrait'), 'landscape')).toBe(withAttr('sensorLandscape'));
  });

  it('returns the same string when orientation is unset', () => {
    const xml = withAttr('portrait');
    expect(patchManifestOrientation(xml, undefined)).toBe(xml);
  });

  it('only touches the MainActivity element', () => {
    const xml = MANIFEST_FIXTURE.replace('<provider', '<activity android:name=".Other" />\n\n        <provider');
    const patched = patchManifestOrientation(xml, 'portrait');
    expect(patched).toContain('<activity android:name=".Other" />');
    expect(patched.match(/screenOrientation/g)).toHaveLength(1);
  });
});

describe('findMainActivity', () => {
  it('finds MainActivity.kt anywhere under the java source root', () => {
    const dir = makeTempDir();
    const target = path.join(dir, 'gen/android/app/src/main/java/dev/caper/my_game/MainActivity.kt');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, '', 'utf-8');
    expect(findMainActivity(path.join(dir, 'gen/android'))).toBe(target);
  });

  it('returns null when there is none', () => {
    const dir = makeTempDir();
    expect(findMainActivity(path.join(dir, 'gen/android'))).toBeNull();
  });
});
