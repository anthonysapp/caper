import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { agentInit } from './agent.mjs';
import { parseRustcVersion, runChecks } from './doctor.mjs';
import { TAURI_PLUGIN_PERMISSIONS } from './native.mjs';

const START_MARKER = '<!-- caper:agent-start -->';
const END_MARKER = '<!-- caper:agent-end -->';

const installedVersion = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf-8')).version;

let tempDir = null;

afterEach(() => {
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  tempDir = null;
});

function makeTempDir() {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'caper-doctor-'));
  return tempDir;
}

function setMtime(file, secondsAgo) {
  const t = Date.now() / 1000 - secondsAgo;
  fs.utimesSync(file, t, t);
}

function find(checks, id) {
  return checks.find((c) => c.id === id);
}

describe('runChecks', () => {
  it('reports failures/warnings for an empty app directory', async () => {
    const cwd = makeTempDir();

    const checks = await runChecks(cwd, { online: false });

    expect(find(checks, 'version').status).toBe('ok');
    expect(find(checks, 'link').status).toBe('fail');
    expect(find(checks, 'app-types').status).toBe('fail');
    expect(find(checks, 'agent').status).toBe('warn');
    expect(find(checks, 'asset-types').status).toBe('warn');
    expect(find(checks, 'asset-manifest').status).toBe('warn');
    expect(find(checks, 'caches').status).toBe('ok');
  });

  it('marks app types ok when fresh and warns after a newer source file', async () => {
    const cwd = makeTempDir();

    fs.mkdirSync(path.join(cwd, 'src/types'), { recursive: true });
    fs.writeFileSync(path.join(cwd, 'caper.config.ts'), '// config', 'utf-8');
    fs.writeFileSync(path.join(cwd, 'src/types/caper-app.d.ts'), '// types', 'utf-8');
    setMtime(path.join(cwd, 'caper.config.ts'), 100);
    setMtime(path.join(cwd, 'src/types/caper-app.d.ts'), 50);

    const first = await runChecks(cwd, { online: false });
    expect(find(first, 'app-types').status).toBe('ok');

    fs.mkdirSync(path.join(cwd, 'src/scenes'), { recursive: true });
    fs.writeFileSync(path.join(cwd, 'src/scenes/Example.ts'), '// scene', 'utf-8');
    setMtime(path.join(cwd, 'src/scenes/Example.ts'), 10);

    const second = await runChecks(cwd, { online: false });
    expect(find(second, 'app-types').status).toBe('warn');
  });

  it('warns when the agent pointer version does not match the installed version', async () => {
    const cwd = makeTempDir();

    const block = `${START_MARKER}
## Caper agent pointers

This app runs on \`@caperjs/core@0.0.1\`.

- Before engine-facing work, load the \`caper\` skill at \`.claude/skills/caper/SKILL.md\`.
${END_MARKER}`;
    fs.writeFileSync(path.join(cwd, 'AGENTS.md'), block, 'utf-8');
    fs.mkdirSync(path.join(cwd, '.claude/skills/caper'), { recursive: true });
    fs.writeFileSync(path.join(cwd, '.claude/skills/caper/SKILL.md'), '# skill', 'utf-8');

    const checks = await runChecks(cwd, { online: false });
    const agent = find(checks, 'agent');

    expect(agent.status).toBe('warn');
    expect(agent.hint).toContain('@caperjs/core@0.0.1');
  });

  it('reports agent pointers ok when the block and skill are current', async () => {
    const cwd = makeTempDir();

    await agentInit(cwd);

    const checks = await runChecks(cwd, { online: false });
    expect(find(checks, 'agent').status).toBe('ok');
  });

  it('skips the solid tsconfig check when the app does not use @caperjs/solid', async () => {
    const cwd = makeTempDir();
    fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ dependencies: { '@caperjs/core': '^1' } }), 'utf-8');

    const checks = await runChecks(cwd, { online: false });

    expect(find(checks, 'solid-tsconfig')).toBeUndefined();
  });

  it('names every tsconfig setting a solid app is missing', async () => {
    const cwd = makeTempDir();
    fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ dependencies: { '@caperjs/solid': '^1' } }), 'utf-8');
    fs.writeFileSync(path.join(cwd, 'tsconfig.json'), '{\n  // solid needs more than this\n  "compilerOptions": { "jsx": "preserve" }\n}\n', 'utf-8');

    const checks = await runChecks(cwd, { online: false });
    const solid = find(checks, 'solid-tsconfig');

    expect(solid.status).toBe('fail');
    expect(solid.hint).toContain('"jsxFactory": "CaperJSX.h"');
    expect(solid.hint).toContain('"@caperjs/solid/jsx" in types');
    expect(solid.hint).not.toContain('"jsx": "preserve"');
  });

  it('passes a solid app whose tsconfig has all three settings', async () => {
    const cwd = makeTempDir();
    fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ devDependencies: { '@caperjs/solid': '^1' } }), 'utf-8');
    fs.writeFileSync(
      path.join(cwd, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { jsx: 'preserve', jsxFactory: 'CaperJSX.h', types: ['@caperjs/core/client', '@caperjs/solid/jsx'] },
      }),
      'utf-8',
    );

    const checks = await runChecks(cwd, { online: false });

    expect(find(checks, 'solid-tsconfig').status).toBe('ok');
  });

  it('resolves solid tsconfig settings inherited through a relative extends', async () => {
    const cwd = makeTempDir();
    fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ dependencies: { '@caperjs/solid': '^1' } }), 'utf-8');
    fs.writeFileSync(
      path.join(cwd, 'base.tsconfig.json'),
      JSON.stringify({
        compilerOptions: { jsx: 'preserve', jsxFactory: 'CaperJSX.h', types: ['@caperjs/core/client', '@caperjs/solid/jsx'] },
      }),
      'utf-8',
    );
    fs.writeFileSync(path.join(cwd, 'tsconfig.json'), JSON.stringify({ extends: './base.tsconfig.json' }), 'utf-8');

    const checks = await runChecks(cwd, { online: false });

    expect(find(checks, 'solid-tsconfig').status).toBe('ok');
  });

  it("lets the app's own tsconfig override a bad base setting", async () => {
    const cwd = makeTempDir();
    fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ dependencies: { '@caperjs/solid': '^1' } }), 'utf-8');
    fs.writeFileSync(
      path.join(cwd, 'base.tsconfig.json'),
      JSON.stringify({
        compilerOptions: { jsx: 'preserve', jsxFactory: 'Wrong.h', types: ['@caperjs/core/client', '@caperjs/solid/jsx'] },
      }),
      'utf-8',
    );
    fs.writeFileSync(
      path.join(cwd, 'tsconfig.json'),
      JSON.stringify({ extends: './base.tsconfig.json', compilerOptions: { jsxFactory: 'CaperJSX.h' } }),
      'utf-8',
    );

    const checks = await runChecks(cwd, { online: false });

    expect(find(checks, 'solid-tsconfig').status).toBe('ok');
  });

  it("fails when the app's own tsconfig overrides a good base setting with a bad one", async () => {
    const cwd = makeTempDir();
    fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ dependencies: { '@caperjs/solid': '^1' } }), 'utf-8');
    fs.writeFileSync(
      path.join(cwd, 'base.tsconfig.json'),
      JSON.stringify({
        compilerOptions: { jsx: 'preserve', jsxFactory: 'CaperJSX.h', types: ['@caperjs/core/client', '@caperjs/solid/jsx'] },
      }),
      'utf-8',
    );
    fs.writeFileSync(
      path.join(cwd, 'tsconfig.json'),
      JSON.stringify({ extends: './base.tsconfig.json', compilerOptions: { jsxFactory: 'Wrong.h' } }),
      'utf-8',
    );

    const checks = await runChecks(cwd, { online: false });
    const solid = find(checks, 'solid-tsconfig');

    expect(solid.status).toBe('fail');
    expect(solid.hint).toContain('"jsxFactory": "CaperJSX.h"');
  });

  it('resolves solid tsconfig settings from a later entry in an extends array', async () => {
    const cwd = makeTempDir();
    fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ dependencies: { '@caperjs/solid': '^1' } }), 'utf-8');
    fs.writeFileSync(path.join(cwd, 'first.tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true } }), 'utf-8');
    fs.writeFileSync(
      path.join(cwd, 'second.tsconfig.json'),
      JSON.stringify({
        compilerOptions: { jsx: 'preserve', jsxFactory: 'CaperJSX.h', types: ['@caperjs/core/client', '@caperjs/solid/jsx'] },
      }),
      'utf-8',
    );
    fs.writeFileSync(path.join(cwd, 'tsconfig.json'), JSON.stringify({ extends: ['./first.tsconfig.json', './second.tsconfig.json'] }), 'utf-8');

    const checks = await runChecks(cwd, { online: false });

    expect(find(checks, 'solid-tsconfig').status).toBe('ok');
  });

  it('resolves solid tsconfig settings through a chained extends', async () => {
    const cwd = makeTempDir();
    fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ dependencies: { '@caperjs/solid': '^1' } }), 'utf-8');
    fs.writeFileSync(
      path.join(cwd, 'grandparent.tsconfig.json'),
      JSON.stringify({
        compilerOptions: { jsx: 'preserve', jsxFactory: 'CaperJSX.h', types: ['@caperjs/core/client', '@caperjs/solid/jsx'] },
      }),
      'utf-8',
    );
    fs.writeFileSync(path.join(cwd, 'parent.tsconfig.json'), JSON.stringify({ extends: './grandparent.tsconfig.json' }), 'utf-8');
    fs.writeFileSync(path.join(cwd, 'tsconfig.json'), JSON.stringify({ extends: './parent.tsconfig.json' }), 'utf-8');

    const checks = await runChecks(cwd, { online: false });

    expect(find(checks, 'solid-tsconfig').status).toBe('ok');
  });

  it('does not throw on a broken extends path and falls back to the own tsconfig', async () => {
    const cwd = makeTempDir();
    fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ dependencies: { '@caperjs/solid': '^1' } }), 'utf-8');
    fs.writeFileSync(
      path.join(cwd, 'tsconfig.json'),
      JSON.stringify({ extends: './does-not-exist.json', compilerOptions: { jsx: 'preserve' } }),
      'utf-8',
    );

    const checks = await runChecks(cwd, { online: false });
    const solid = find(checks, 'solid-tsconfig');

    expect(solid.status).toBe('fail');
    expect(solid.hint).toContain('"jsxFactory": "CaperJSX.h"');
    expect(solid.hint).toContain('"@caperjs/solid/jsx" in types');
    expect(solid.hint).not.toContain('"jsx": "preserve"');
  });

  it('reports a linked package missing its build', async () => {
    const cwd = makeTempDir();
    const checkout = path.join(cwd, 'checkout');
    fs.mkdirSync(path.join(checkout, 'src'), { recursive: true });
    fs.writeFileSync(path.join(checkout, 'src/a.ts'), '// a', 'utf-8');

    const linkPath = path.join(cwd, 'node_modules/@caperjs/core');
    fs.mkdirSync(path.dirname(linkPath), { recursive: true });
    fs.symlinkSync(checkout, linkPath, 'dir');

    const checks = await runChecks(cwd, { online: false });
    const link = find(checks, 'link');

    expect(link.status).toBe('fail');
    expect(link.label).toContain('linked from');
    expect(link.hint).toContain('pnpm build');
  });

  it('reports a linked package ok when the build is newer than source', async () => {
    const cwd = makeTempDir();
    const checkout = path.join(cwd, 'checkout');

    fs.mkdirSync(path.join(checkout, 'src'), { recursive: true });
    fs.writeFileSync(path.join(checkout, 'src/a.ts'), '// a', 'utf-8');
    setMtime(path.join(checkout, 'src/a.ts'), 50);

    fs.mkdirSync(path.join(checkout, 'lib'), { recursive: true });
    fs.writeFileSync(path.join(checkout, 'lib/caper.mjs'), '// build', 'utf-8');
    setMtime(path.join(checkout, 'lib/caper.mjs'), 10);

    const linkPath = path.join(cwd, 'node_modules/@caperjs/core');
    fs.mkdirSync(path.dirname(linkPath), { recursive: true });
    fs.symlinkSync(checkout, linkPath, 'dir');

    const checks = await runChecks(cwd, { online: false });
    const link = find(checks, 'link');

    expect(link.status).toBe('ok');
    expect(link.label).toContain('linked from');
  });
});

describe('parseRustcVersion', () => {
  it('parses a normal rustc --version line', () => {
    expect(parseRustcVersion('rustc 1.98.1 (48a229cea 2026-09-01)')).toBe('1.98.1');
  });

  it('returns null for garbage input', () => {
    expect(parseRustcVersion('command not found')).toBeNull();
    expect(parseRustcVersion('')).toBeNull();
    expect(parseRustcVersion(undefined)).toBeNull();
  });
});

function writeTauriConf(cwd, overrides = {}) {
  fs.mkdirSync(path.join(cwd, 'src-tauri'), { recursive: true });
  fs.writeFileSync(
    path.join(cwd, 'src-tauri/tauri.conf.json'),
    JSON.stringify(
      {
        identifier: 'dev.caper.my-game',
        build: {
          frontendDist: '../dist',
          devUrl: 'http://localhost:3123',
          beforeDevCommand: 'pnpm vite --port 3123',
          beforeBuildCommand: 'pnpm run build',
        },
        app: { windows: [{ title: 'My Game', width: 1280, height: 720 }], security: { csp: null } },
        ...overrides,
      },
      null,
      2,
    ),
    'utf-8',
  );
}

function writeTauriCli(cwd, version) {
  const dir = path.join(cwd, 'node_modules/@tauri-apps/cli');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: '@tauri-apps/cli', version }), 'utf-8');
}

function makeRun(responses) {
  return (cmd, args) => {
    const key = `${cmd} ${args.join(' ')}`;
    if (key in responses) {
      const value = responses[key];
      if (value instanceof Error) throw value;
      return value;
    }
    throw new Error(`unstubbed command in test: ${key}`);
  };
}

describe('runChecks native rows', () => {
  it('are absent when src-tauri does not exist', async () => {
    const cwd = makeTempDir();

    const checks = await runChecks(cwd, { online: false });

    expect(find(checks, 'native-rust')).toBeUndefined();
    expect(find(checks, 'native-tauri-cli')).toBeUndefined();
    expect(find(checks, 'native-identifier')).toBeUndefined();
    expect(find(checks, 'native-dev-port')).toBeUndefined();
    expect(find(checks, 'native-xcode-clt')).toBeUndefined();
  });

  it('report rustc ok when the version is new enough', async () => {
    const cwd = makeTempDir();
    writeTauriConf(cwd);
    writeTauriCli(cwd, '2.11.4');

    const checks = await runChecks(cwd, {
      online: false,
      run: makeRun({ 'rustc --version': 'rustc 1.98.1 (48a229cea 2026-09-01)' }),
    });

    const rust = find(checks, 'native-rust');
    expect(rust.status).toBe('ok');
    expect(rust.label).toContain('1.98.1');
  });

  it('fails rustc when the version is below 1.88.0', async () => {
    const cwd = makeTempDir();
    writeTauriConf(cwd);
    writeTauriCli(cwd, '2.11.4');

    const checks = await runChecks(cwd, {
      online: false,
      run: makeRun({ 'rustc --version': 'rustc 1.87.0 (abc 2025-01-01)' }),
    });

    const rust = find(checks, 'native-rust');
    expect(rust.status).toBe('fail');
    expect(rust.hint).toMatch(/rustup/);
  });

  it('fails rustc when it is not installed', async () => {
    const cwd = makeTempDir();
    writeTauriConf(cwd);
    writeTauriCli(cwd, '2.11.4');

    const checks = await runChecks(cwd, {
      online: false,
      run: makeRun({ 'rustc --version': new Error('command not found') }),
    });

    const rust = find(checks, 'native-rust');
    expect(rust.status).toBe('fail');
    expect(rust.hint).toMatch(/rustup\.rs/);
  });

  it('reports native-tauri-cli ok when @tauri-apps/cli major 2 is resolvable', async () => {
    const cwd = makeTempDir();
    writeTauriConf(cwd);
    writeTauriCli(cwd, '2.11.4');

    const checks = await runChecks(cwd, { online: false, run: makeRun({ 'rustc --version': 'rustc 1.98.1 ()' }) });

    expect(find(checks, 'native-tauri-cli').status).toBe('ok');
  });

  it('fails native-tauri-cli when @tauri-apps/cli is missing', async () => {
    const cwd = makeTempDir();
    writeTauriConf(cwd);

    const checks = await runChecks(cwd, { online: false, run: makeRun({ 'rustc --version': 'rustc 1.98.1 ()' }) });

    const tauriCli = find(checks, 'native-tauri-cli');
    expect(tauriCli.status).toBe('fail');
    expect(tauriCli.hint).toMatch(/caper native init/);
  });

  it('warns native-tauri-cli on a non-2 major version', async () => {
    const cwd = makeTempDir();
    writeTauriConf(cwd);
    writeTauriCli(cwd, '1.6.0');

    const checks = await runChecks(cwd, { online: false, run: makeRun({ 'rustc --version': 'rustc 1.98.1 ()' }) });

    expect(find(checks, 'native-tauri-cli').status).toBe('warn');
  });

  it('fails native-identifier on the tauri placeholder', async () => {
    const cwd = makeTempDir();
    writeTauriConf(cwd, { identifier: 'com.tauri.dev' });
    writeTauriCli(cwd, '2.11.4');

    const checks = await runChecks(cwd, { online: false, run: makeRun({ 'rustc --version': 'rustc 1.98.1 ()' }) });

    expect(find(checks, 'native-identifier').status).toBe('fail');
  });

  it('warns native-identifier on the dev.caper.* default', async () => {
    const cwd = makeTempDir();
    writeTauriConf(cwd, { identifier: 'dev.caper.my-game' });
    writeTauriCli(cwd, '2.11.4');

    const checks = await runChecks(cwd, { online: false, run: makeRun({ 'rustc --version': 'rustc 1.98.1 ()' }) });

    const identifier = find(checks, 'native-identifier');
    expect(identifier.status).toBe('warn');
    expect(identifier.hint).toMatch(/before shipping/);
  });

  it('passes native-identifier for a real identifier', async () => {
    const cwd = makeTempDir();
    writeTauriConf(cwd, { identifier: 'dev.caperjs.kitchensink' });
    writeTauriCli(cwd, '2.11.4');

    const checks = await runChecks(cwd, { online: false, run: makeRun({ 'rustc --version': 'rustc 1.98.1 ()' }) });

    expect(find(checks, 'native-identifier').status).toBe('ok');
  });

  it('fails native-identifier when tauri.conf.json is unreadable', async () => {
    const cwd = makeTempDir();
    fs.mkdirSync(path.join(cwd, 'src-tauri'), { recursive: true });
    fs.writeFileSync(path.join(cwd, 'src-tauri/tauri.conf.json'), '{ not json', 'utf-8');
    writeTauriCli(cwd, '2.11.4');

    const checks = await runChecks(cwd, { online: false, run: makeRun({ 'rustc --version': 'rustc 1.98.1 ()' }) });

    expect(find(checks, 'native-identifier').status).toBe('fail');
  });

  it('warns native-dev-port when beforeDevCommand port differs from devUrl', async () => {
    const cwd = makeTempDir();
    writeTauriConf(cwd, {
      build: {
        frontendDist: '../dist',
        devUrl: 'http://localhost:3123',
        beforeDevCommand: 'pnpm vite --port 3200',
        beforeBuildCommand: 'pnpm run build',
      },
    });
    writeTauriCli(cwd, '2.11.4');

    const checks = await runChecks(cwd, { online: false, run: makeRun({ 'rustc --version': 'rustc 1.98.1 ()' }) });

    expect(find(checks, 'native-dev-port').status).toBe('warn');
  });

  it('warns native-dev-port when devUrl is the shared default port 3000', async () => {
    const cwd = makeTempDir();
    writeTauriConf(cwd, {
      build: {
        frontendDist: '../dist',
        devUrl: 'http://localhost:3000',
        beforeDevCommand: 'pnpm vite',
        beforeBuildCommand: 'pnpm run build',
      },
    });
    writeTauriCli(cwd, '2.11.4');

    const checks = await runChecks(cwd, { online: false, run: makeRun({ 'rustc --version': 'rustc 1.98.1 ()' }) });

    const devPort = find(checks, 'native-dev-port');
    expect(devPort.status).toBe('warn');
    expect(devPort.hint).toMatch(/collides/);
  });

  it('passes native-dev-port for a consistent non-3000 port', async () => {
    const cwd = makeTempDir();
    writeTauriConf(cwd, {
      build: {
        frontendDist: '../dist',
        devUrl: 'http://localhost:3123',
        beforeDevCommand: 'pnpm vite --port 3123',
        beforeBuildCommand: 'pnpm run build',
      },
    });
    writeTauriCli(cwd, '2.11.4');

    const checks = await runChecks(cwd, { online: false, run: makeRun({ 'rustc --version': 'rustc 1.98.1 ()' }) });

    expect(find(checks, 'native-dev-port').status).toBe('ok');
  });

  it('reports native-xcode-clt ok on darwin when xcode-select succeeds', async () => {
    const cwd = makeTempDir();
    writeTauriConf(cwd);
    writeTauriCli(cwd, '2.11.4');

    const checks = await runChecks(cwd, {
      online: false,
      platform: 'darwin',
      run: makeRun({ 'rustc --version': 'rustc 1.98.1 ()', 'xcode-select -p': '/Library/Developer/CommandLineTools' }),
    });

    expect(find(checks, 'native-xcode-clt').status).toBe('ok');
  });

  it('fails native-xcode-clt on darwin when xcode-select fails', async () => {
    const cwd = makeTempDir();
    writeTauriConf(cwd);
    writeTauriCli(cwd, '2.11.4');

    const checks = await runChecks(cwd, {
      online: false,
      platform: 'darwin',
      run: makeRun({ 'rustc --version': 'rustc 1.98.1 ()', 'xcode-select -p': new Error('not installed') }),
    });

    expect(find(checks, 'native-xcode-clt').status).toBe('fail');
  });

  it('omits native-xcode-clt on non-darwin platforms', async () => {
    const cwd = makeTempDir();
    writeTauriConf(cwd);
    writeTauriCli(cwd, '2.11.4');

    const checks = await runChecks(cwd, {
      online: false,
      platform: 'linux',
      run: makeRun({ 'rustc --version': 'rustc 1.98.1 ()' }),
    });

    expect(find(checks, 'native-xcode-clt')).toBeUndefined();
  });
});

function writePluginAppPkg(cwd) {
  fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ dependencies: { '@caperjs/plugin-tauri': '^1' } }), 'utf-8');
}

function writeCargoToml(cwd, { withStorePlugin = true } = {}) {
  fs.writeFileSync(
    path.join(cwd, 'src-tauri/Cargo.toml'),
    withStorePlugin ? '[dependencies]\ntauri-plugin-store = "2"\n' : '[dependencies]\ntauri = "2"\n',
    'utf-8',
  );
}

function writeCapabilities(cwd, permissions = ['core:default', ...TAURI_PLUGIN_PERMISSIONS]) {
  fs.mkdirSync(path.join(cwd, 'src-tauri/capabilities'), { recursive: true });
  fs.writeFileSync(
    path.join(cwd, 'src-tauri/capabilities/default.json'),
    JSON.stringify({ $schema: '../gen/schemas/desktop-schema.json', identifier: 'default', windows: ['main'], permissions }),
    'utf-8',
  );
}

describe('runChecks native-plugin row', () => {
  it('is absent when src-tauri exists but the app does not depend on @caperjs/plugin-tauri', async () => {
    const cwd = makeTempDir();
    writeTauriConf(cwd);
    writeTauriCli(cwd, '2.11.4');

    const checks = await runChecks(cwd, { online: false, run: makeRun({ 'rustc --version': 'rustc 1.98.1 ()' }) });

    expect(find(checks, 'native-plugin')).toBeUndefined();
  });

  it('is absent when the app depends on the plugin but src-tauri does not exist', async () => {
    const cwd = makeTempDir();
    writePluginAppPkg(cwd);

    const checks = await runChecks(cwd, { online: false });

    expect(find(checks, 'native-plugin')).toBeUndefined();
  });

  it('fails when Cargo.toml is unreadable', async () => {
    const cwd = makeTempDir();
    writeTauriConf(cwd);
    writeTauriCli(cwd, '2.11.4');
    writePluginAppPkg(cwd);

    const checks = await runChecks(cwd, { online: false, run: makeRun({ 'rustc --version': 'rustc 1.98.1 ()' }) });
    const row = find(checks, 'native-plugin');

    expect(row.status).toBe('fail');
    expect(row.label).toContain('Cargo.toml');
    expect(row.hint).toMatch(/caper native plugin/);
  });

  it('fails when Cargo.toml is missing tauri-plugin-store', async () => {
    const cwd = makeTempDir();
    writeTauriConf(cwd);
    writeTauriCli(cwd, '2.11.4');
    writePluginAppPkg(cwd);
    writeCargoToml(cwd, { withStorePlugin: false });

    const checks = await runChecks(cwd, { online: false, run: makeRun({ 'rustc --version': 'rustc 1.98.1 ()' }) });
    const row = find(checks, 'native-plugin');

    expect(row.status).toBe('fail');
    expect(row.hint).toMatch(/caper native plugin/);
  });

  it('warns when window permissions are missing from capabilities/default.json', async () => {
    const cwd = makeTempDir();
    writeTauriConf(cwd);
    writeTauriCli(cwd, '2.11.4');
    writePluginAppPkg(cwd);
    writeCargoToml(cwd);
    writeCapabilities(cwd, ['core:default']);

    const checks = await runChecks(cwd, { online: false, run: makeRun({ 'rustc --version': 'rustc 1.98.1 ()' }) });
    const row = find(checks, 'native-plugin');

    expect(row.status).toBe('warn');
    expect(row.label).toContain('core:window:allow-set-fullscreen');
  });

  it('fails when capabilities/default.json is unreadable', async () => {
    const cwd = makeTempDir();
    writeTauriConf(cwd);
    writeTauriCli(cwd, '2.11.4');
    writePluginAppPkg(cwd);
    writeCargoToml(cwd);
    // no capabilities/default.json written

    const checks = await runChecks(cwd, { online: false, run: makeRun({ 'rustc --version': 'rustc 1.98.1 ()' }) });
    const row = find(checks, 'native-plugin');

    expect(row.status).toBe('fail');
    expect(row.hint).toMatch(/caper native plugin/);
  });

  it('is ok when Cargo.toml has the store plugin and all window permissions are present', async () => {
    const cwd = makeTempDir();
    writeTauriConf(cwd);
    writeTauriCli(cwd, '2.11.4');
    writePluginAppPkg(cwd);
    writeCargoToml(cwd);
    writeCapabilities(cwd);

    const checks = await runChecks(cwd, { online: false, run: makeRun({ 'rustc --version': 'rustc 1.98.1 ()' }) });

    expect(find(checks, 'native-plugin').status).toBe('ok');
  });
});
