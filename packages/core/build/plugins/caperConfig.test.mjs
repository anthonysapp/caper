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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { caperConfigPlugin } from './caperConfig.mjs';
import { logger } from '../internal/util.mjs';

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
