/**
 * Dev-server coverage for the preset.
 *
 * Half of caper's plugins only ever run in `serve` mode — the dev-helper
 * websocket bridge, caper.config validation via `ssrLoadModule`, the asset
 * manifest watcher, and all five discovery plugins. A production build diff says
 * nothing about them, so this starts a real Vite dev server against
 * `test/fixtures/app` and asks it to transform each virtual module.
 *
 * The fixture is deliberately tiny and independent of kitchen-sink, so an app
 * change can't quietly alter what these assertions mean. `assets: false` keeps
 * AssetPack (and its ffmpeg/sharp work) out of the test.
 *
 * Note there is no `process.chdir()` here: the suite runs from the package
 * directory while `root` points at the fixture, so discovery finding anything at
 * all is the assertion that it resolves against vite's root rather than the
 * working directory.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from 'vite';
import { caper } from './index.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(here, '../test/fixtures/app');
const coreSrc = path.resolve(here, '../src');

let server;

beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root: fixtureRoot,
    logLevel: 'silent',
    plugins: [caper({ assets: false })],
    // `watch: null` and `noDiscovery` keep the file watcher and the dep
    // optimizer out of a unit test: both outlive `close()` here and hang
    // teardown, and neither is what these assertions are about.
    server: { middlewareMode: true, open: false, watch: null },
    optimizeDeps: { noDiscovery: true },
    resolve: {
      // The fixture lives inside the package it imports, so there is no
      // node_modules self-link to resolve through.
      alias: { '@caperjs/core': coreSrc },
    },
  });
}, 60_000);

afterAll(async () => {
  // `close()` returns in ~1ms on its own, but here it waits for vite's dep
  // optimizer to finish the work the transform requests kicked off — hence the
  // raised timeout rather than the default 10s.
  await server?.close();
}, 60_000);

/** Transformed source of a virtual module, via vite's own module pipeline. */
async function load(id) {
  const result = await server.transformRequest(id);
  return result?.code ?? '';
}

describe('dev server', () => {
  it('boots with the preset and resolves the project root', () => {
    expect(server.config.root).toBe(fixtureRoot);
    // Caper's defaults reached the resolved config.
    expect(server.config.publicDir).toContain('public');
    expect(server.config.resolve.dedupe).toContain('pixi.js');
  });

  it('serves index.html with the runtime entry injected', async () => {
    const html = await server.transformIndexHtml('/', '<html><head></head><body></body></html>');
    // The plugin injects `import("caper-runtime")` as an inline module script,
    // which vite rewrites into an html-proxy module in dev — so the literal id
    // isn't in the HTML. What matters is that a module script reached the body.
    expect(html).toMatch(/<body>[\s\S]*<script type="module"[\s\S]*<\/body>/);
    expect(html).toContain('html-proxy');
  });

  it('transforms the runtime module', async () => {
    const code = await load('caper-runtime');
    expect(code).toContain('installCaperGlobal');
    expect(code).toContain('bootstrap');
  });

  it('discovers the fixture scene', async () => {
    const code = await load('virtual:caper-scenes');
    expect(code).toContain('sceneList');
    expect(code).toContain('main');
  });

  it('discovers popups, entities and uis', async () => {
    expect(await load('virtual:caper-popups')).toContain('example');
    expect(await load('virtual:caper-entities')).toContain('marker');
    const uis = await load('virtual:caper-uis');
    // Both come from `defineUI({ id })`, one under a non-standard export name.
    expect(uis).toContain('badge');
    expect(uis).toContain('chip');
  });

  it('exposes the plugin list module', async () => {
    expect(await load('virtual:caper-plugins')).toContain('pluginsList');
  });

  it('loads and validates caper.config.ts', async () => {
    const code = await load('virtual:caper-config');
    expect(code).toContain('caper.config');
  });

  it('omits the asset plugins when assets is false', () => {
    const names = server.config.plugins.map((plugin) => plugin.name);
    expect(names).not.toContain('vite-plugin-assetpack');
    expect(names).not.toContain('vite-plugin-asset-types');
    expect(names).toContain('vite-plugin-caper-dev-helper');
  });
});
