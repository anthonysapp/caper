import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../core', () => ({ coreFunctionRegistry: {}, coreSignalRegistry: {} }));
vi.mock('../core/Application', () => ({
  Application: {
    getInstance: () => ({
      renderer: { canvas: null, width: 320, height: 480, resolution: 1 },
      size: { width: 320, height: 480 },
      resizer: { scale: 1, safeArea: { top: 0, right: 0, bottom: 0, left: 0 } },
    }),
  },
}));

import { ScreenDebugPlugin } from './ScreenDebugPlugin';

describe('ScreenDebugPlugin', () => {
  let plugin: ScreenDebugPlugin;

  beforeEach(() => {
    vi.useFakeTimers();
    plugin = new ScreenDebugPlugin();
  });

  afterEach(() => {
    plugin.destroy();
    vi.useRealTimers();
    document.querySelectorAll('[data-caper-screen-debug]').forEach((node) => node.remove());
  });

  it('appends the overlay and populates metrics on a tick', () => {
    plugin.initialize();
    expect(document.querySelectorAll('[data-caper-screen-debug]')).toHaveLength(3);

    vi.advanceTimersByTime(500);

    const panel = document.querySelector('[data-caper-screen-debug="panel"]');
    expect(panel?.textContent).toContain('inner ');
    expect(panel?.textContent).toContain('standalone ');
  });

  it('repopulates the panel from the interval tick, not just the initial call', () => {
    plugin.initialize();
    const panel = document.querySelector('[data-caper-screen-debug="panel"]')!;
    panel.textContent = '';

    vi.advanceTimersByTime(500);

    expect(panel.textContent).toContain('inner ');
  });

  it('removes every overlay node and clears its interval on destroy', () => {
    const clearInterval = vi.spyOn(window, 'clearInterval');
    plugin.initialize();

    plugin.destroy();

    expect(document.querySelectorAll('[data-caper-screen-debug]')).toHaveLength(0);
    expect(clearInterval).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
