import { describe, expect, it, vi } from 'vitest';

// Plugin.ts transitively imports Application → Pixi display graph. Stub it.
vi.mock('../core', () => ({
  coreFunctionRegistry: {},
  coreSignalRegistry: {},
}));
vi.mock('../core/Application', () => ({
  Application: { getInstance: () => ({}) },
}));

import { Signal } from '../signals';
import { Plugin } from './Plugin';

class TestPlugin extends Plugin<{ foo: string }> {
  public initCalls = 0;
  public postCalls = 0;
  public readonly id = 'test';
  protected _options = { foo: 'default' };

  async initialize(options: Partial<{ foo: string }> = {}) {
    this._options = { ...this._options, ...options };
    this.initCalls++;
  }

  async postInitialize() {
    this.postCalls++;
  }
}

describe('Plugin', () => {
  it('runs initialize and merges options', async () => {
    const p = new TestPlugin();
    await p.initialize({ foo: 'bar' });
    expect(p.initCalls).toBe(1);
    expect(p.options.foo).toBe('bar');
  });

  it('runs postInitialize independently', async () => {
    const p = new TestPlugin();
    await p.postInitialize();
    expect(p.postCalls).toBe(1);
  });

  it('destroy disconnects tracked signal connections', () => {
    const p = new TestPlugin();
    const s = new Signal<() => void>();
    const handler = vi.fn();
    p.addSignalConnection(s.connect(handler));
    s.emit();
    expect(handler).toHaveBeenCalledTimes(1);

    p.destroy();
    s.emit();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('clearSignalConnections disconnects without destroying', () => {
    const p = new TestPlugin();
    const s = new Signal<() => void>();
    const handler = vi.fn();
    p.addSignalConnection(s.connect(handler));
    p.clearSignalConnections();
    s.emit();
    expect(handler).not.toHaveBeenCalled();
  });

  it('base Plugin.initialize/postInitialize resolve without error', async () => {
    const p = new Plugin('base');
    await expect(p.initialize({})).resolves.toBeUndefined();
    await expect(p.postInitialize({} as never)).resolves.toBeUndefined();
  });
});
