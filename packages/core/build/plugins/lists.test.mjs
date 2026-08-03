import { describe, expect, it, vi } from 'vitest';
import { parse } from '../internal/ast.mjs';

const discoverPluginsMock = vi.fn();
const discoverScenesMock = vi.fn();

vi.mock('../internal/discovery.mjs', () => ({
  discoverEntities: vi.fn(),
  discoverLocaleKeys: vi.fn(),
  discoverPlugins: (...args) => discoverPluginsMock(...args),
  discoverPopups: vi.fn(),
  discoverScenes: (...args) => discoverScenesMock(...args),
  discoverUIs: vi.fn(),
}));

const { createClassListPlugin, pluginListPlugin, sceneListPlugin } = await import('./lists.mjs');

/** Counts distinct `import <ident> from` lines in generated module source. */
const importIdentifiers = (source) => [...source.matchAll(/import (\S+) from/g)].map((m) => m[1]);

describe('createClassListPlugin identifier collisions', () => {
  it('gives two same-basename items in different directories distinct import identifiers', async () => {
    const items = [
      { id: 'a', name: 'Foo', active: true, module: '/proj/src/x/a/Foo.ts' },
      { id: 'b', name: 'Foo', active: true, module: '/proj/src/x/b/Foo.ts' },
    ];
    const plugin = createClassListPlugin({
      virtualModuleId: 'virtual:test-classes',
      discoverFn: async () => items,
      exportName: 'testList',
      pluginName: 'vite-plugin-test-classes',
    });
    plugin.configResolved({ root: '/proj' });

    const source = await plugin.load('\0virtual:test-classes');
    const idents = importIdentifiers(source);

    expect(idents).toHaveLength(2);
    expect(idents[0]).not.toBe(idents[1]);
    // Emitted id/name fields must be untouched.
    expect(source).toContain("id: 'a'");
    expect(source).toContain("id: 'b'");
    expect(() => parse(source)).not.toThrow();
  });
});

describe('pluginListPlugin identifier collisions', () => {
  it('gives two same-basename local plugins distinct import identifiers', async () => {
    discoverPluginsMock.mockResolvedValueOnce([
      { id: 'a', name: 'Foo', isLocal: true, active: true, requires: [], module: '/proj/src/x/a/Foo.ts' },
      { id: 'b', name: 'Foo', isLocal: true, active: true, requires: [], module: '/proj/src/x/b/Foo.ts' },
    ]);

    const plugin = pluginListPlugin(true);
    plugin.configResolved({ root: '/proj' });

    const source = await plugin.load('\0virtual:caper-plugins');
    const idents = importIdentifiers(source);

    expect(idents).toHaveLength(2);
    expect(idents[0]).not.toBe(idents[1]);
    expect(source).toContain("id: 'a'");
    expect(source).toContain("id: 'b'");
    expect(() => parse(source)).not.toThrow();
  });
});

describe('sceneListPlugin identifier collisions', () => {
  it('gives two same-basename scenes distinct import identifiers', async () => {
    discoverScenesMock.mockResolvedValueOnce([
      { id: 'a', active: true, module: '/proj/src/x/a/Foo.ts', debugLabel: 'a', debugGroup: undefined, debugOrder: 0, assets: undefined, plugins: undefined, autoUnloadAssets: false },
      { id: 'b', active: true, module: '/proj/src/x/b/Foo.ts', debugLabel: 'b', debugGroup: undefined, debugOrder: 0, assets: undefined, plugins: undefined, autoUnloadAssets: false },
    ]);

    const plugin = sceneListPlugin(true);
    plugin.configResolved({ root: '/proj' });

    const source = await plugin.load('\0virtual:caper-scenes');
    const idents = importIdentifiers(source);

    expect(idents).toHaveLength(2);
    expect(idents[0]).not.toBe(idents[1]);
    expect(source).toContain("id: 'a'");
    expect(source).toContain("id: 'b'");
    expect(() => parse(source)).not.toThrow();
  });
});
