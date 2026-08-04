import { beforeEach, describe, expect, it, vi } from 'vitest';

// Plugin.ts transitively imports Application → Pixi display graph. Stub it.
vi.mock('../core', () => ({
  coreFunctionRegistry: {},
  coreSignalRegistry: {},
}));

const { mockTicker } = vi.hoisted(() => ({
  mockTicker: { add: vi.fn(), remove: vi.fn() },
}));

vi.mock('../core/Application', () => ({
  Application: { getInstance: () => ({ ticker: mockTicker }) },
}));

import { Signal } from '../signals';
import { Logger } from '../utils';
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

describe('Plugin lifecycle cleanup', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockTicker.add.mockClear();
    mockTicker.remove.mockClear();
  });

  it('runs disposers LIFO, and only once', () => {
    const p = new TestPlugin();
    const order: string[] = [];
    p.addDisposer(
      () => order.push('a'),
      () => order.push('b'),
    );
    p.addDisposer(() => order.push('c'));

    p.destroy();
    expect(order).toEqual(['c', 'b', 'a']);

    p.destroy();
    expect(order).toEqual(['c', 'b', 'a']);
  });

  it('destroy is idempotent for signal connections too', () => {
    const p = new TestPlugin();
    const s = new Signal<() => void>();
    const handler = vi.fn();
    p.addSignalConnection(s.connect(handler));

    p.destroy();
    expect(() => p.destroy()).not.toThrow();
    s.emit();
    expect(handler).not.toHaveBeenCalled();
  });

  it('a throwing disposer does not stop the rest, and is reported', () => {
    const errorSpy = vi.spyOn(Logger, 'error').mockImplementation(() => undefined);
    const p = new TestPlugin();
    const first = vi.fn();
    const last = vi.fn();

    p.addDisposer(first);
    p.addDisposer(() => {
      throw new Error('boom');
    });
    p.addDisposer(last);

    expect(() => p.destroy()).not.toThrow();
    expect(first).toHaveBeenCalledTimes(1);
    expect(last).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('listen() attaches now and detaches on destroy', () => {
    const p = new TestPlugin();
    const target = document.createElement('div');
    const handler = vi.fn();

    p.listen(target, 'click', handler);
    target.dispatchEvent(new Event('click'));
    expect(handler).toHaveBeenCalledTimes(1);

    p.destroy();
    target.dispatchEvent(new Event('click'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('listen() detaches capture-phase listeners with matching options', () => {
    const p = new TestPlugin();
    const parent = document.createElement('div');
    const child = document.createElement('div');
    parent.appendChild(child);
    document.body.appendChild(parent);
    const handler = vi.fn();

    p.listen(parent, 'click', handler, true);
    child.dispatchEvent(new Event('click', { bubbles: true }));
    expect(handler).toHaveBeenCalledTimes(1);

    p.destroy();
    child.dispatchEvent(new Event('click', { bubbles: true }));
    expect(handler).toHaveBeenCalledTimes(1);

    parent.remove();
  });

  it('listen() returns an early-removal fn that is safe to call twice', () => {
    const p = new TestPlugin();
    const target = document.createElement('div');
    const handler = vi.fn();

    const remove = p.listen(target, 'click', handler);
    remove();
    remove();
    target.dispatchEvent(new Event('click'));
    expect(handler).not.toHaveBeenCalled();
    expect(() => p.destroy()).not.toThrow();
  });

  it('addTickerCallback() adds to the app ticker and removes on destroy', () => {
    const p = new TestPlugin();
    const fn = vi.fn();

    p.addTickerCallback(fn, p, 5);
    expect(mockTicker.add).toHaveBeenCalledWith(fn, p, 5);

    p.destroy();
    expect(mockTicker.remove).toHaveBeenCalledWith(fn, p);
  });

  it('addTickerCallback() returns an early-removal fn that only removes once', () => {
    const p = new TestPlugin();
    const fn = vi.fn();

    const remove = p.addTickerCallback(fn);
    remove();
    remove();
    p.destroy();
    expect(mockTicker.remove).toHaveBeenCalledTimes(1);
  });
});
