import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IApplication } from '../core';
import { Store } from './Store';

type FakePlugin = {
  id: string;
  save?: (key: string, data: any) => Promise<any>;
  load?: (key: string) => Promise<any>;
};

function makeApp(plugins: FakePlugin[]): IApplication {
  const map = new Map<string, FakePlugin>();
  for (const p of plugins) map.set(p.id, p);
  return {
    _plugins: map,
    getPlugin: (id: string) => map.get(id),
  } as unknown as IApplication;
}

describe('Store', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('getAdapter throws for missing plugin', () => {
    const store = new Store().initialize(makeApp([]));
    expect(() => store.getAdapter('missing' as never)).toThrow(/not found/);
  });

  it('getAdapter throws when plugin is not storage-capable', () => {
    const store = new Store().initialize(makeApp([{ id: 'p1' }]));
    expect(() => store.getAdapter('p1' as never)).toThrow(/not storage-capable/);
  });

  it('hasAdapter reflects storage capability', () => {
    const store = new Store().initialize(
      makeApp([
        { id: 'capable', save: async () => {}, load: async () => {} },
        { id: 'not' },
      ]),
    );
    expect(store.hasAdapter('capable' as never)).toBe(true);
    expect(store.hasAdapter('not' as never)).toBe(false);
    expect(store.hasAdapter('missing' as never)).toBe(false);
  });

  it('save (awaited) routes to adapter.save and returns its value', async () => {
    const save = vi.fn(async (k: string, d: any) => ({ k, d }));
    const store = new Store().initialize(
      makeApp([{ id: 'a', save, load: async () => undefined }]),
    );
    const result = await store.save('a' as never, 'key', 42);
    expect(save).toHaveBeenCalledWith('key', 42);
    expect(result).toEqual([{ k: 'key', d: 42 }]);
  });

  it('save fire-and-forget emits onError when adapter.save rejects', async () => {
    const err = new Error('boom');
    const store = new Store().initialize(
      makeApp([
        {
          id: 'a',
          save: async () => {
            throw err;
          },
          load: async () => undefined,
        },
      ]),
    );
    const errHandler = vi.fn();
    store.onError.connect(errHandler);

    const result = await store.save('a' as never, 'k', 1, false);
    // Wait for the fire-and-forget promise inside `result[0]` to settle.
    await result[0];

    expect(errHandler).toHaveBeenCalledTimes(1);
    const detail = errHandler.mock.calls[0][0];
    expect(detail.adapterId).toBe('a');
    expect(detail.operation).toBe('save');
    expect(detail.key).toBe('k');
    expect(detail.error).toBe(err);
  });

  it('save (awaited) emits onError and rethrows on adapter failure', async () => {
    const err = new Error('nope');
    const store = new Store().initialize(
      makeApp([
        {
          id: 'a',
          save: async () => {
            throw err;
          },
          load: async () => undefined,
        },
      ]),
    );
    const errHandler = vi.fn();
    store.onError.connect(errHandler);

    await expect(store.save('a' as never, 'k', 1, true)).rejects.toBe(err);
    expect(errHandler).toHaveBeenCalledTimes(1);
    expect(errHandler.mock.calls[0][0].operation).toBe('save');
  });

  it('load emits onError and rethrows on adapter failure', async () => {
    const err = new Error('read fail');
    const store = new Store().initialize(
      makeApp([
        {
          id: 'a',
          save: async () => undefined,
          load: async () => {
            throw err;
          },
        },
      ]),
    );
    const errHandler = vi.fn();
    store.onError.connect(errHandler);

    await expect(store.load('a' as never, 'k')).rejects.toBe(err);
    expect(errHandler).toHaveBeenCalledTimes(1);
    expect(errHandler.mock.calls[0][0].operation).toBe('load');
  });

  it('save with "*" fans out to every storage-capable plugin', async () => {
    const saveA = vi.fn(async () => 'a');
    const saveB = vi.fn(async () => 'b');
    const store = new Store().initialize(
      makeApp([
        { id: 'a', save: saveA, load: async () => undefined },
        { id: 'b', save: saveB, load: async () => undefined },
        { id: 'c' }, // not storage-capable → must be skipped
      ]),
    );
    await store.save('*' as never, 'k', 1);
    expect(saveA).toHaveBeenCalledWith('k', 1);
    expect(saveB).toHaveBeenCalledWith('k', 1);
  });

  it('save with "*" anywhere in an adapter array fans out to every storage-capable plugin', async () => {
    const saveA = vi.fn(async () => 'a');
    const saveB = vi.fn(async () => 'b');
    const store = new Store().initialize(
      makeApp([
        { id: 'a', save: saveA, load: async () => undefined },
        { id: 'b', save: saveB, load: async () => undefined },
        { id: 'c' }, // not storage-capable → must be skipped
      ]),
    );
    await store.save(['a', '*'] as never, 'k', 1);
    expect(saveA).toHaveBeenCalledWith('k', 1);
    expect(saveB).toHaveBeenCalledWith('k', 1);
  });
});
