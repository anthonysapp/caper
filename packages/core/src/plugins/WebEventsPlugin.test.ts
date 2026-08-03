import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// WebEventsPlugin transitively imports Application → Pixi display graph. Stub it.
vi.mock('../core', () => ({
  coreFunctionRegistry: {},
  coreSignalRegistry: {},
}));
vi.mock('../core/Application', () => ({
  Application: { getInstance: () => ({ renderer: { canvas: null } }) },
}));

import { Signal } from '../signals';
import { WebEventsPlugin } from './WebEventsPlugin';

type FakeVisualViewport = EventTarget & { scale: number };

function installFakeVisualViewport(): FakeVisualViewport {
  const vv = new EventTarget() as FakeVisualViewport;
  vv.scale = 1;
  (window as any).visualViewport = vv;
  return vv;
}

describe('WebEventsPlugin visualViewport resize', () => {
  let plugin: WebEventsPlugin;

  beforeEach(() => {
    delete (window as any).visualViewport;
    plugin = new WebEventsPlugin();
  });

  afterEach(() => {
    plugin.destroy();
    delete (window as any).visualViewport;
  });

  it('emits onResize when the visual viewport resizes at scale 1', () => {
    const vv = installFakeVisualViewport();
    plugin.initialize();
    const spy = vi.fn();
    plugin.onResize.connect(spy);

    vv.dispatchEvent(new Event('resize'));

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ width: window.innerWidth, height: window.innerHeight });
  });

  it('ignores visual viewport resizes during pinch-zoom (scale !== 1)', () => {
    const vv = installFakeVisualViewport();
    plugin.initialize();
    const spy = vi.fn();
    plugin.onResize.connect(spy);

    vv.scale = 2;
    vv.dispatchEvent(new Event('resize'));

    expect(spy).not.toHaveBeenCalled();
  });

  it('stops listening after destroy', () => {
    const vv = installFakeVisualViewport();
    plugin.initialize();
    const spy = vi.fn();
    plugin.onResize.connect(spy);

    plugin.destroy();
    vv.dispatchEvent(new Event('resize'));

    expect(spy).not.toHaveBeenCalled();
  });

  it('initializes without error when visualViewport is unavailable', () => {
    expect(() => plugin.initialize()).not.toThrow();
  });
});

describe('WebEventsPlugin destroy', () => {
  let plugin: WebEventsPlugin;

  beforeEach(() => {
    plugin = new WebEventsPlugin();
  });

  it('stops handling orientationchange after destroy', () => {
    const spy = vi.spyOn(plugin as any, '_onOrientationChanged');
    plugin.initialize();

    window.dispatchEvent(new Event('orientationchange'));
    expect(spy).toHaveBeenCalledTimes(1);

    plugin.destroy();
    window.dispatchEvent(new Event('orientationchange'));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('disconnects tracked signal connections on destroy', () => {
    const signal = new Signal<() => void>();
    const handler = vi.fn();
    plugin.addSignalConnection(signal.connect(handler));

    plugin.destroy();
    signal.emit();

    expect(handler).not.toHaveBeenCalled();
  });
});
