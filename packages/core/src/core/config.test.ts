import { afterEach, describe, expect, it } from 'vitest';

import { generatePluginList, sortPluginsByRequires } from './config';

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
      { id: 'audio', path: 'audio', module: expect.any(Function), requires: [], options: undefined, autoLoad: true },
    ]);
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
});
