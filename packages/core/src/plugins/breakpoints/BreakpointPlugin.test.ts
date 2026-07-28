import { describe, expect, it, vi } from 'vitest';

// Plugin.ts transitively imports Application → Pixi display graph. Stub it.
vi.mock('../../core', () => ({
  coreFunctionRegistry: {},
  coreSignalRegistry: {},
}));
vi.mock('../../core/Application', () => ({
  Application: { getInstance: () => ({}) },
}));

import { coreSignalRegistry } from '../../core';
import { Signal } from '../../signals';
import type { Size } from '../../utils';
import { Logger } from '../../utils';
import { BreakpointPlugin } from './BreakpointPlugin';

function makeApp() {
  const onResize = new Signal<(size: Size) => void>();
  return { onResize, size: { width: 800, height: 600 } as Size };
}

/** Build an initialized plugin bound to a fake app. */
async function setup(options = {}, size: Size = { width: 800, height: 600 }) {
  const app = makeApp();
  app.size = size;
  const plugin = new BreakpointPlugin();
  // `Plugin.app` reads Application.getInstance(); override for the test.
  Object.defineProperty(plugin, 'app', { get: () => app, configurable: true });
  await plugin.initialize(options);
  await plugin.postInitialize(app as never);
  return { app, plugin, resize: (s: Size) => app.onResize.emit(s) };
}

describe('BreakpointPlugin', () => {
  it('uses the default ladder and evaluates on postInitialize', async () => {
    const { plugin } = await setup();
    expect(plugin.current).toBe('tablet');
    expect(plugin.orientation).toBe('landscape');
  });

  it('accepts a custom ladder that replaces the defaults', async () => {
    const { plugin } = await setup({ tiers: { tiny: 0, huge: 2200 } });
    expect(plugin.current).toBe('tiny');
    expect(plugin.is('mobile')).toBe(false);
  });

  it('throws on an invalid ladder', async () => {
    const plugin = new BreakpointPlugin();
    await expect(plugin.initialize({ tiers: { a: 320 } })).rejects.toThrow(/must start at 0/i);
  });

  it('updates on resize', async () => {
    const { plugin, resize } = await setup();
    resize({ width: 1200, height: 800 });
    expect(plugin.current).toBe('desktop');
  });

  it('emits onChange only when something flips', async () => {
    const { plugin, resize } = await setup();
    const spy = vi.fn();
    plugin.onChange.connect(spy);

    resize({ width: 810, height: 600 }); // same tier, same axes
    expect(spy).not.toHaveBeenCalled();

    resize({ width: 1200, height: 800 });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toMatchObject({
      current: 'desktop',
      previous: 'tablet',
      entered: ['desktop'],
      left: ['tablet'],
    });
  });

  it('fires enter and leave for tiers and modes', async () => {
    const { plugin, resize } = await setup({ modes: { stacked: { below: 880 } } });
    const entered = vi.fn();
    const left = vi.fn();
    plugin.onEnter('desktop', entered);
    plugin.onLeave('stacked', left);

    expect(plugin.is('stacked')).toBe(true);
    resize({ width: 1200, height: 800 });

    expect(entered).toHaveBeenCalledTimes(1);
    expect(left).toHaveBeenCalledTimes(1);
    expect(plugin.is('stacked')).toBe(false);
  });

  it('when() runs immediately if already matching', async () => {
    const { plugin, resize } = await setup();
    const fn = vi.fn();
    plugin.when('tablet', fn);
    expect(fn).toHaveBeenCalledTimes(1);

    resize({ width: 1200, height: 800 });
    resize({ width: 800, height: 600 });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('when() does not run immediately if not matching', async () => {
    const { plugin } = await setup();
    const fn = vi.fn();
    plugin.when('desktop', fn);
    expect(fn).not.toHaveBeenCalled();
  });

  it('define() evaluates immediately and emits enter', async () => {
    const { plugin } = await setup();
    const fn = vi.fn();
    plugin.onEnter('narrow', fn);
    plugin.define('narrow', { below: 'desktop' });
    expect(plugin.is('narrow')).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('undefine() emits leave and forgets the mode', async () => {
    const { plugin } = await setup({ modes: { stacked: { below: 880 } } });
    const fn = vi.fn();
    plugin.onLeave('stacked', fn);
    plugin.undefine('stacked');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(plugin.is('stacked')).toBe(false);
  });

  it('atLeast and below are exact complements', async () => {
    const { plugin } = await setup();
    for (const name of ['mobile', 'tablet', 'desktop', 'wide']) {
      expect(plugin.atLeast(name)).toBe(!plugin.below(name));
    }
    expect(plugin.between('tablet', 'desktop')).toBe(true);
    expect(plugin.between('desktop', 'wide')).toBe(false);
  });

  it('value() resolves against the current tier', async () => {
    const { plugin, resize } = await setup();
    const map = { mobile: 1, tablet: 2, desktop: 3 };
    expect(plugin.value(map)).toBe(2);
    resize({ width: 400, height: 800 });
    expect(plugin.value(map)).toBe(1);
  });

  it('is() returns false and warns for an unknown name', async () => {
    const { plugin } = await setup();
    expect(plugin.is('nonsense')).toBe(false);
  });

  it('a normal-priority onResize listener sees the updated tier', async () => {
    // Connect the normal-priority listener BEFORE the plugin connects, so
    // insertion order alone would run it first. Only a genuine 'highest'
    // priority on the plugin's handler can make it run before this one.
    const app = makeApp();
    const plugin = new BreakpointPlugin();
    Object.defineProperty(plugin, 'app', { get: () => app, configurable: true });

    let seen: string | undefined;
    app.onResize.connect(() => {
      seen = plugin.current as string;
    });

    await plugin.initialize({});
    await plugin.postInitialize(app as never);

    app.onResize.emit({ width: 1200, height: 800 });
    expect(seen).toBe('desktop');
  });

  it('registerCoreSignals() exposes onBreakpointChanged under its own registry key', async () => {
    const { plugin } = await setup();
    plugin.registerCoreSignals();
    expect(coreSignalRegistry.onBreakpointChanged).toBe(plugin.onChange);
  });

  it('destroy() disconnects enter/leave listeners', async () => {
    const { plugin, resize } = await setup();
    const fn = vi.fn();
    plugin.onEnter('desktop', fn);
    plugin.destroy();
    resize({ width: 1200, height: 800 });
    expect(fn).not.toHaveBeenCalled();
  });

  it('destroy() severs the resize connection, so current stops updating', async () => {
    const { plugin, resize } = await setup();
    expect(plugin.current).toBe('tablet');

    plugin.destroy();
    resize({ width: 1200, height: 800 }); // would move to 'desktop' if still connected

    expect(plugin.current).toBe('tablet');
  });

  it('is() warns via Logger for an unknown name', async () => {
    const { plugin } = await setup();
    const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => undefined);

    plugin.is('nonsense');

    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('onEnter()/onLeave()/when() warn once per unknown name, but still return a live connection', async () => {
    const { plugin } = await setup();
    const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => undefined);

    plugin.onEnter('bogus', () => {});
    plugin.onEnter('bogus', () => {}); // same name again — no additional warning
    expect(warn).toHaveBeenCalledTimes(1);

    plugin.onLeave('bogus', () => {}); // same name, different method — still no additional warning
    expect(warn).toHaveBeenCalledTimes(1);

    plugin.when('other-bogus', () => {}); // different unknown name — warns again
    expect(warn).toHaveBeenCalledTimes(2);

    // Still a live connection: defining the mode later fires it (spec §8).
    const fn = vi.fn();
    const connection = plugin.onEnter('narrow', fn);
    expect(connection).toBeDefined();
    plugin.define('narrow', { below: 'desktop' });
    expect(fn).toHaveBeenCalledTimes(1);

    warn.mockRestore();
  });
});
