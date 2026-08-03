import { describe, expect, it, vi } from 'vitest';

// AssetsPlugin extends Plugin, which transitively imports Application → Pixi
// display graph. Stub it the same way Plugin.test.ts does.
vi.mock('../core', () => ({
  coreFunctionRegistry: {},
  coreSignalRegistry: {},
}));
vi.mock('../core/Application', () => ({
  Application: { getInstance: () => ({ canvas: { dispatchEvent: vi.fn() } }) },
}));

vi.mock('pixi.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('pixi.js')>();
  return {
    ...actual,
    Assets: {
      load: vi.fn(async () => undefined),
      loadBundle: vi.fn(async () => undefined),
      setPreferences: vi.fn(),
      backgroundLoad: vi.fn(async () => undefined),
      backgroundLoadBundle: vi.fn(async () => undefined),
      unload: vi.fn(async () => undefined),
      unloadBundle: vi.fn(async () => undefined),
    },
  };
});

import { Assets } from 'pixi.js';
import { AssetsPlugin } from './AssetsPlugin';

const loadBundle = vi.mocked(Assets.loadBundle);

describe('AssetsPlugin', () => {
  it('loadRequired only requests bundles that are not already loaded', async () => {
    const plugin = new AssetsPlugin();

    // Mark bundle 'a' as already loaded.
    await plugin.loadBundles('a');
    loadBundle.mockClear();

    plugin.initialize({ preload: { bundles: ['a', 'b'] } });
    await plugin.loadRequired();

    expect(loadBundle).toHaveBeenCalledTimes(1);
    expect(loadBundle).toHaveBeenCalledWith(['b'], expect.anything());
  });
});
