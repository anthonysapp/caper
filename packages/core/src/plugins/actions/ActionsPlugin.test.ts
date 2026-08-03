import { describe, expect, it, vi } from 'vitest';

// ActionsPlugin -> Plugin.ts transitively imports Application → Pixi display graph. Stub it.
vi.mock('../../core', () => ({
  coreFunctionRegistry: {},
  coreSignalRegistry: {},
}));
vi.mock('../../core/Application', () => ({
  Application: { getInstance: () => ({}) },
}));

import type { IApplication } from '../../core';
import { ActionsPlugin } from './ActionsPlugin';

function makePlugin(actions: Record<string, { context: string | string[] }>) {
  const plugin = new ActionsPlugin();
  plugin.initialize({}, { config: { actions } } as unknown as IApplication);
  return plugin;
}

describe('ActionsPlugin', () => {
  it('does not dispatch an action whose context merely contains the current context', () => {
    const plugin = makePlugin({ foo: { context: 'popup' } });
    const handler = vi.fn();
    plugin.getAction('foo').connect(handler);

    plugin.setActionContext('pop');
    plugin.sendAction('foo');

    expect(handler).not.toHaveBeenCalled();
  });

  it('dispatches an action when the string context matches exactly', () => {
    const plugin = makePlugin({ foo: { context: 'popup' } });
    const handler = vi.fn();
    plugin.getAction('foo').connect(handler);

    plugin.setActionContext('popup');
    plugin.sendAction('foo');

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('dispatches an action with a wildcard context in any context', () => {
    const plugin = makePlugin({ foo: { context: '*' } });
    const handler = vi.fn();
    plugin.getAction('foo').connect(handler);

    plugin.setActionContext('anything');
    plugin.sendAction('foo');

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('dispatches an action when an array context includes the current context', () => {
    const plugin = makePlugin({ foo: { context: ['menu', 'popup'] } });
    const handler = vi.fn();
    plugin.getAction('foo').connect(handler);

    plugin.setActionContext('menu');
    plugin.sendAction('foo');
    expect(handler).toHaveBeenCalledTimes(1);

    plugin.setActionContext('men');
    plugin.sendAction('foo');
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
