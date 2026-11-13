import { afterEach, describe, expect, it } from 'vitest';

import { generatePluginList, getPreRendererPlugins, sortPluginsByRequires } from './config';

// `generatePluginList` reads `globalThis.Caper.get('pluginsList')` — normally
// populated by the caper-runtime virtual module the Vite plugin injects. In
// hand-written entries or unit tests, `Caper` doesn't exist at all, so the
// bare `Caper.get(...)` call must not throw.
describe('generatePluginList', () => {
  afterEach(() => {
    delete (globalThis as unknown as { Caper?: unknown }).Caper;
  });

  it('resolves to [] when there is no runtime-managed Caper global and no plugins configured', async () => {
    expect((globalThis as unknown as { Caper?: unknown }).Caper).toBeUndefined();
    await expect(generatePluginList([])).resolves.toEqual([]);
  });

  it('still resolves plugins when the Caper runtime global IS present', async () => {
    (globalThis as unknown as { Caper: { get: (key: string) => unknown } }).Caper = {
      get: (key: string) =>
        key === 'pluginsList'
          ? [{ id: 'audio', path: 'audio', module: () => Promise.resolve({}), requires: [] }]
          : undefined,
    };

    const result = await generatePluginList(['audio' as never]);
    expect(result).toEqual([
      { id: 'audio', path: 'audio', module: expect.any(Function), requires: [], phase: undefined, options: undefined, autoLoad: true },
    ]);
  });

  it('passes the discovered plugin phase through', async () => {
    (globalThis as unknown as { Caper: { get: (key: string) => unknown } }).Caper = {
      get: () => [{ id: '3d', path: '3d', module: () => Promise.resolve({}), phase: 'pre-renderer' }],
    };

    expect((await generatePluginList(['3d' as never]))[0].phase).toBe('pre-renderer');
  });

  // A bare string entry must match on the whole id. Indexing `plugin[0]` on a
  // string yields its first character, so a discovered plugin whose id is that
  // single character used to shadow the real match.
  it('does not match a plugin whose id equals the first character of a string entry', async () => {
    (globalThis as unknown as { Caper: { get: (key: string) => unknown } }).Caper = {
      get: (key: string) =>
        key === 'pluginsList'
          ? [
              { id: 'a', path: 'a', module: () => Promise.resolve({}), requires: [] },
              { id: 'audio', path: 'audio', module: () => Promise.resolve({}), requires: [] },
            ]
          : undefined,
    };

    const result = await generatePluginList(['audio' as never]);
    expect(result.map((p) => p.id)).toEqual(['audio']);
  });
});

describe('getPreRendererPlugins', () => {
  const item = (id: string, phase?: 'pre-renderer', requires: string[] = [], autoLoad = true) => ({
    id,
    module: () => Promise.resolve({}),
    phase,
    requires,
    autoLoad,
  });

  it('returns only pre-renderer plugins in config order', () => {
    const items = [item('first', 'pre-renderer'), item('normal'), item('second', 'pre-renderer')];
    expect(getPreRendererPlugins(items).map((p) => p.id)).toEqual(['first', 'second']);
  });

  it('rejects a pre-renderer plugin marked autoLoad: false', () => {
    expect(() => getPreRendererPlugins([item('3d', 'pre-renderer', [], false)])).toThrow(/Plugin '3d'.*autoLoad: false/);
  });

  it('rejects a pre-renderer plugin listed in a scene', () => {
    expect(() => getPreRendererPlugins([item('3d', 'pre-renderer')], [{ id: 'game', plugins: ['3d'] }])).toThrow(/Plugin '3d'.*scene 'game'/);
  });

  it('rejects a pre-renderer dependency on a normal plugin', () => {
    expect(() => getPreRendererPlugins([item('3d', 'pre-renderer', ['physics']), item('physics')])).toThrow(/Plugin '3d'.*requires 'physics'/);
  });

  it('reports all problems in one error', () => {
    expect(() => getPreRendererPlugins([item('3d', 'pre-renderer', ['physics'], false), item('physics')])).toThrow(/autoLoad: false[\s\S]*requires 'physics'/);
  });

  it('allows a normal plugin to require a pre-renderer plugin', () => {
    expect(() => getPreRendererPlugins([item('3d', 'pre-renderer'), item('physics', undefined, ['3d'])])).not.toThrow();
  });
});

// Default plugins (`audio`, `input`, ...) are registered on the app before the
// config-listed ones, so they never appear in the list handed to the sorter.
// A `requires: ['audio']` must therefore be satisfiable from the already
// registered set rather than blowing up bootstrap.
describe('sortPluginsByRequires', () => {
  const item = (id: string, requires: string[] = []) => ({
    id,
    path: id,
    module: () => Promise.resolve({}),
    requires,
    options: undefined,
    autoLoad: true,
  });

  it('treats a required id that is already registered on the app as satisfied', () => {
    const items = [item('a', ['audio']), item('b')];
    const registered = new Set(['audio']);

    expect(() => sortPluginsByRequires(items, registered)).not.toThrow();
    expect(sortPluginsByRequires(items, registered).map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('still throws for a required id that is neither configured nor registered', () => {
    const items = [item('a', ['nonsense']), item('b')];

    expect(() => sortPluginsByRequires(items, new Set(['audio']))).toThrow(/nonsense/);
  });

  it('checks missing requirements even when there is only one plugin', () => {
    expect(() => sortPluginsByRequires([item('3d', ['missing'])])).toThrow(/missing/);
  });
});
