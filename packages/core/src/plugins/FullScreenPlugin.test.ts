import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// FullScreenPlugin transitively imports Application → Pixi display graph. Stub it.
vi.mock('../core', () => ({
  coreFunctionRegistry: {},
  coreSignalRegistry: {},
}));
vi.mock('../core/Application', () => ({
  Application: { getInstance: () => ({}), containerElement: null },
}));

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
});
