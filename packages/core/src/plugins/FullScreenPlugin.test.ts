import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// FullScreenPlugin transitively imports Application → Pixi display graph. Stub it.
vi.mock('../core', () => ({
  coreFunctionRegistry: {},
  coreSignalRegistry: {},
}));
vi.mock('../core/Application', () => ({
  Application: { getInstance: () => ({}), containerElement: null },
}));

import { Logger } from '../utils';
import type { FullscreenDriver } from './FullScreenPlugin';
import { FullScreenPlugin } from './FullScreenPlugin';

describe('FullScreenPlugin fullscreenchange handling', () => {
  let plugin: FullScreenPlugin;

  beforeEach(() => {
    plugin = new FullScreenPlugin();
    plugin.initialize();
  });

  afterEach(() => {
    plugin.destroy();
    delete (document as any).webkitFullscreenElement;
  });

  it('clears the cached state when the browser leaves fullscreen', () => {
    (plugin as any)._isFullScreen = true;
    const spy = vi.fn();
    plugin.onFullScreenChange.connect(spy);

    document.dispatchEvent(new Event('fullscreenchange'));

    expect(plugin.isFullScreen).toBe(false);
    expect(spy).toHaveBeenCalledWith(false);
  });

  it('sets the cached state from vendor-prefixed fullscreen elements', () => {
    (document as any).webkitFullscreenElement = document.body;
    const spy = vi.fn();
    plugin.onFullScreenChange.connect(spy);

    document.dispatchEvent(new Event('webkitfullscreenchange'));

    expect(plugin.isFullScreen).toBe(true);
    expect(spy).toHaveBeenCalledWith(true);
  });

  it('handles a single fullscreenchange event exactly once', () => {
    const spy = vi.fn();
    plugin.onFullScreenChange.connect(spy);

    document.dispatchEvent(new Event('fullscreenchange'));

    expect(spy).toHaveBeenCalledTimes(1);
  });
});

function makeDriver(overrides: Partial<FullscreenDriver> = {}) {
  const unsubscribe = vi.fn();
  const driver = {
    supported: true,
    request: vi.fn(),
    exit: vi.fn(),
    subscribe: vi.fn(() => unsubscribe),
    ...overrides,
  } as FullscreenDriver & {
    request: ReturnType<typeof vi.fn>;
    exit: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
  };
  return { driver, unsubscribe };
}

describe('FullScreenPlugin fullscreen driver seam', () => {
  let plugin: FullScreenPlugin;
  let element: HTMLElement & { requestFullscreen: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    plugin = new FullScreenPlugin();
    plugin.initialize();
    element = document.createElement('div') as any;
    element.requestFullscreen = vi.fn();
    plugin.setFullScreenElement(element);
  });

  afterEach(() => {
    plugin.destroy();
  });

  it('routes setFullScreen through the driver instead of the DOM', () => {
    const { driver } = makeDriver();
    plugin.setFullscreenDriver(driver);

    plugin.setFullScreen(true);
    expect(driver.request).toHaveBeenCalledTimes(1);
    expect(element.requestFullscreen).not.toHaveBeenCalled();

    plugin.setFullScreen(false);
    expect(driver.exit).toHaveBeenCalledTimes(1);
  });

  it('routes toggleFullScreen through the driver', () => {
    const { driver } = makeDriver();
    plugin.setFullscreenDriver(driver);

    plugin.toggleFullScreen();
    expect(driver.request).toHaveBeenCalledTimes(1);

    plugin.toggleFullScreen();
    expect(driver.exit).toHaveBeenCalledTimes(1);
  });

  it('mirrors canFullscreen from the driver', () => {
    const { driver } = makeDriver({ supported: false });
    plugin.setFullscreenDriver(driver);
    expect(plugin.canFullscreen).toBe(false);

    plugin.setFullscreenDriver(makeDriver({ supported: true }).driver);
    expect(plugin.canFullscreen).toBe(true);
  });

  it('starts with isFullscreen false and updates it from notify', () => {
    const { driver } = makeDriver();
    plugin.setFullscreenDriver(driver);
    const notify = driver.subscribe.mock.calls[0][0] as (v: boolean) => void;
    const spy = vi.fn();
    plugin.onFullScreenChange.connect(spy);

    expect(plugin.isFullscreen).toBe(false);

    notify(true);
    expect(plugin.isFullscreen).toBe(true);
    expect(plugin.isFullScreen).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(true);

    // same value again — no second emit
    notify(true);
    expect(spy).toHaveBeenCalledTimes(1);

    notify(false);
    expect(plugin.isFullscreen).toBe(false);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith(false);
  });

  it('unsubscribes the previous driver when a new one is set', () => {
    const first = makeDriver();
    plugin.setFullscreenDriver(first.driver);
    expect(first.unsubscribe).not.toHaveBeenCalled();

    const second = makeDriver();
    plugin.setFullscreenDriver(second.driver);
    expect(first.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes and restores DOM behavior when the driver is cleared', () => {
    const { driver, unsubscribe } = makeDriver();
    plugin.setFullscreenDriver(driver);
    plugin.setFullscreenDriver(null);

    expect(unsubscribe).toHaveBeenCalledTimes(1);

    plugin.setFullScreen(true);
    expect(driver.request).not.toHaveBeenCalled();
    expect(element.requestFullscreen).toHaveBeenCalledTimes(1);
    expect(plugin.canFullscreen).toBe(true);
  });

  it('unsubscribes the driver on destroy', () => {
    const { driver, unsubscribe } = makeDriver();
    plugin.setFullscreenDriver(driver);

    plugin.destroy();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('logs a rejected driver request instead of throwing', async () => {
    const error = new Error('nope');
    const spy = vi.spyOn(Logger, 'error').mockImplementation(() => undefined);
    const { driver } = makeDriver({ request: vi.fn(() => Promise.reject(error)) });
    plugin.setFullscreenDriver(driver);

    expect(() => plugin.setFullScreen(true)).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
