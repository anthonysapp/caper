import { beforeEach, describe, expect, it } from 'vitest';

// DataAdapter extends Plugin, which transitively imports Application → Pixi display graph. Stub it.
vi.mock('../core', () => ({
  coreFunctionRegistry: {},
  coreSignalRegistry: {},
}));
vi.mock('../core/Application', () => ({
  Application: { getInstance: () => ({}) },
}));

import { vi } from 'vitest';
import { DataAdapter } from './DataAdapter';

describe('DataAdapter', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('clear() with no key removes only this namespace\'s keys, leaving unrelated keys intact', () => {
    localStorage.setItem('myns-foo', '"bar"');
    localStorage.setItem('other-bar', '"baz"');

    const adapter = new DataAdapter();
    adapter.initialize({ namespace: 'myns', initial: { foo: 'bar' } });

    adapter.clear();

    expect(localStorage.getItem('myns-foo')).toBeNull();
    expect(localStorage.getItem('other-bar')).toBe('"baz"');
  });
});
