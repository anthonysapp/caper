/**
 * The dev-time watcher wiring of `vite-plugin-caper-config`.
 *
 * The generated `caper-app.d.ts` types scenes, plugins, popups, entities, UI
 * elements and locale keys — so every directory those are discovered from has to
 * be in the watch set, or adding one of them types as `never` until the dev
 * server restarts. A real dev server can't assert this (the suite runs with
 * `watch: null`), so the hooks are driven directly with a stub server.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveConfig } from 'vite';
import { caper } from '../index.mjs';
import { caperConfigPlugin, pluginTypeImports } from './caperConfig.mjs';
import { parse } from '../internal/ast.mjs';
import { logger } from '../internal/util.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(here, '../../test/fixtures/app');

let root;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'caper-config-watch-'));
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

/** Drives `configResolved` + `configureServer` and captures what got watched. */
function wire() {
  const plugin = caperConfigPlugin();
  const watched = [];
  const handlers = [];
  const server = {
    watcher: {
      add: (target) => watched.push(target),
      on: (_event, handler) => handlers.push(handler),
    },
    ws: { send: () => {} },
  };
  plugin.configResolved({ root });
  plugin.configureServer(server);
  return { watched, handlers };
}

describe('dev watcher', () => {
  it('watches every directory the generated types are built from', () => {
    const { watched } = wire();
    for (const dir of ['scenes', 'plugins', 'popups', 'entities', 'ui', 'locales']) {
      expect(watched).toContain(path.resolve(root, `src/${dir}`));
    }
  });

  it('regenerates types when a UI element is added or renamed', async () => {
    const info = vi.spyOn(logger, 'info').mockImplementation(() => {});
    const { handlers } = wire();
    await handlers[0](path.resolve(root, 'src/ui/HudPanel.ts'));
    expect(info.mock.calls.flat().join('\n')).toContain('UI file changed');
  });

  it('ignores files outside the watched tree', async () => {
    const info = vi.spyOn(logger, 'info').mockImplementation(() => {});
    const { handlers } = wire();
    await handlers[0](path.resolve(root, 'src/other/Thing.ts'));
    expect(info).not.toHaveBeenCalled();
  });
});

describe('api.generateTypes', () => {
  it('writes caper-app.d.ts to a temp copy of the fixture', async () => {
    fs.cpSync(fixtureRoot, root, { recursive: true });

    const resolved = await resolveConfig(
      { configFile: false, root, logLevel: 'silent', plugins: [caper()] },
      'serve',
    );
    const plugin = resolved.plugins.find((p) => p.name === 'vite-plugin-caper-config');
    await plugin.api.generateTypes();

    const dtsPath = path.join(root, 'src', 'types', 'caper-app.d.ts');
    expect(fs.existsSync(dtsPath)).toBe(true);
    const content = fs.readFileSync(dtsPath, 'utf-8');
    expect(content).toContain("'main'");
  });
});

function configureNpmPlugins(config, packages) {
  fs.writeFileSync(path.join(root, 'caper.config.ts'), `export default defineConfig({ plugins: ${config} });`);
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    dependencies: Object.fromEntries(packages.map(([name]) => [name, '1.0.0'])),
  }));
  for (const [name, fields] of packages) {
    if (!fields) continue;
    const dir = path.join(root, 'node_modules', name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, ...fields }));
  }
}

async function generatedAppTypes() {
  const plugin = caperConfigPlugin();
  plugin.configResolved({ root, publicDir: path.join(root, 'public') });
  await plugin.api.generateTypes();
  return fs.readFileSync(path.join(root, 'src/types/caper-app.d.ts'), 'utf8');
}

describe('npm plugin type imports', () => {
  it('imports listed typed packages, including tuple entries, once in package order', async () => {
    configureNpmPlugins("['z', ['3d', {}], '3d']", [
      ['@caperjs/plugin-z', { types: './index.d.ts' }],
      ['@caperjs/plugin-3d', { exports: { '.': { types: './index.d.ts' } } }],
    ]);

    const types = await generatedAppTypes();
    expect(types.match(/import type \{\} from '[^']+';/g)).toEqual([
      "import type {} from '@caperjs/plugin-3d';",
      "import type {} from '@caperjs/plugin-z';",
    ]);
  });

  it('omits packages that are unlisted, missing, or lack declarations', async () => {
    configureNpmPlugins("['missing', 'untyped']", [
      ['@caperjs/plugin-unlisted', { typings: './index.d.ts' }],
      ['@caperjs/plugin-missing', null],
      ['@caperjs/plugin-untyped', {}],
    ]);

    expect(await generatedAppTypes()).not.toContain('import type {} from');
  });

  it('ignores local, inactive, and dynamic config entries', () => {
    const configObject = parse("export default defineConfig({ plugins: (['3d', ['4d', {}], ...extra, id] as const) satisfies unknown[] });")
      .body[0].declaration.arguments[0];
    expect(pluginTypeImports(configObject, [
      { id: '3d', name: '@caperjs/plugin-3d', isLocal: true, hasTypes: true },
      { id: '4d', name: '@caperjs/plugin-4d', isLocal: false, active: false, hasTypes: true },
      { id: 'other', name: '@caperjs/plugin-other', isLocal: false, hasTypes: true },
    ])).toEqual([]);
  });

  it('reads a configured plugin through as const and satisfies wrappers', () => {
    const configObject = parse("export default defineConfig({ plugins: (['3d'] as const) satisfies readonly string[] });")
      .body[0].declaration.arguments[0];
    expect(pluginTypeImports(configObject, [
      { id: '3d', name: '@caperjs/plugin-3d', isLocal: false, hasTypes: true },
    ])).toEqual(["import type {} from '@caperjs/plugin-3d';"]);
  });
});
