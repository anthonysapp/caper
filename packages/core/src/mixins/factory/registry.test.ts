import { beforeEach, describe, expect, it } from 'vitest';

import { _resetEntityRegistry, getEntityCtor, getRegisteredEntityIds } from './registry';

// The registry reads from `globalThis.Caper.get('entityList')` on first
// access — the caper-runtime virtual module normally populates this. In
// tests we stub it manually.
function stubGlobalEntityList(list: unknown): void {
  (globalThis as unknown as { Caper: { get: (key: string) => unknown } }).Caper = {
    get: (key: string) => (key === 'entityList' ? list : undefined),
  };
}

class FakeActor {
  constructor(public props?: { color?: number }) {}
}

class FakeBoy {
  constructor() {}
}

describe('entity registry', () => {
  beforeEach(() => {
    _resetEntityRegistry();
    delete (globalThis as unknown as { Caper?: unknown }).Caper;
  });

  it('registers static-import entities from globalThis.Caper.entityList on first access', () => {
    stubGlobalEntityList([
      { id: 'actor', active: true, module: FakeActor },
      { id: 'boy', active: true, module: FakeBoy },
    ]);
    expect(getRegisteredEntityIds().sort()).toEqual(['actor', 'boy']);
    expect(getEntityCtor('actor')).toBe(FakeActor);
    expect(getEntityCtor('boy')).toBe(FakeBoy);
  });

  it('skips inactive entries', () => {
    stubGlobalEntityList([
      { id: 'actor', active: true, module: FakeActor },
      { id: 'inactive', active: false, module: FakeBoy },
    ]);
    expect(getRegisteredEntityIds()).toEqual(['actor']);
    expect(getEntityCtor('inactive')).toBeUndefined();
  });

  it('skips dynamic-import entries (arrow functions without prototypes)', () => {
    const dynamicLoader = () => Promise.resolve({ default: FakeBoy });
    stubGlobalEntityList([
      { id: 'actor', active: true, module: FakeActor },
      { id: 'lazy', active: true, module: dynamicLoader },
    ]);
    // Only the static-import entry is registered — sync `this.add.entity`
    // can't wait for a dynamic import.
    expect(getRegisteredEntityIds()).toEqual(['actor']);
    expect(getEntityCtor('lazy')).toBeUndefined();
  });

  it('returns undefined for unknown ids without throwing', () => {
    stubGlobalEntityList([{ id: 'actor', active: true, module: FakeActor }]);
    expect(getEntityCtor('nonexistent')).toBeUndefined();
  });

  it('handles missing globalThis.Caper gracefully (empty registry)', () => {
    // No stub set — Caper is undefined.
    expect(getRegisteredEntityIds()).toEqual([]);
    expect(getEntityCtor('anything')).toBeUndefined();
  });

  it('caches the registry after first lookup (list only read once)', () => {
    let readCount = 0;
    (globalThis as unknown as { Caper: { get: (key: string) => unknown } }).Caper = {
      get: (key: string) => {
        if (key === 'entityList') readCount++;
        return [{ id: 'actor', active: true, module: FakeActor }];
      },
    };
    getEntityCtor('actor');
    getEntityCtor('actor');
    getRegisteredEntityIds();
    expect(readCount).toBe(1);
  });
});
