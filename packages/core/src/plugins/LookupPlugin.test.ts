import { describe, expect, it, vi } from 'vitest';

// LookupPlugin -> Plugin.ts transitively imports Application → Pixi display graph. Stub it.
vi.mock('../core', () => ({
  coreFunctionRegistry: {} as Record<string, unknown>,
  coreSignalRegistry: {} as Record<string, unknown>,
}));
vi.mock('../core/Application', () => ({
  Application: { getInstance: () => ({}) },
}));

import { coreFunctionRegistry } from '../core';
import { Container } from '../display/Container';
import { LookupPlugin } from './LookupPlugin';

describe('LookupPlugin', () => {
  it('registers getChildAtPath (and its siblings) in the core function registry', () => {
    const plugin = new LookupPlugin();
    plugin.registerCoreFunctions();

    expect((coreFunctionRegistry as Record<string, unknown>).getChildAtPath).toBe(plugin.getChildAtPath);
  });

  it('disconnects its global container subscriptions on destroy', async () => {
    const plugin = new LookupPlugin();
    const added = vi.spyOn(plugin as any, 'onChildAdded');
    const removed = vi.spyOn(plugin as any, 'onChildRemoved');
    await plugin.initialize();

    const child = { label: 'Thing', children: [] } as any;
    Container.onGlobalChildAdded.emit(child);
    Container.onGlobalChildRemoved.emit(child);
    expect(added).toHaveBeenCalledTimes(1);
    expect(removed).toHaveBeenCalledTimes(1);

    plugin.destroy();
    Container.onGlobalChildAdded.emit(child);
    Container.onGlobalChildRemoved.emit(child);
    expect(added).toHaveBeenCalledTimes(1);
    expect(removed).toHaveBeenCalledTimes(1);
  });
});
