import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  platform: { isMobile: true, isTouch: true, isTauri: false },
  app: null as any,
}));

vi.mock('../core', () => ({ coreFunctionRegistry: {}, coreSignalRegistry: {} }));
vi.mock('../core/Application', () => ({
  Application: { getInstance: () => h.app },
}));
vi.mock('../utils/platform', () => ({
  get isMobile() {
    return h.platform.isMobile;
  },
  get isTouch() {
    return h.platform.isTouch;
  },
  get isTauri() {
    return h.platform.isTauri;
  },
}));

import { Signal } from '../signals';
import { OrientationPlugin } from './OrientationPlugin';

/** A `matchMedia('(orientation: portrait)')` whose answer the test flips. */
function mockMatchMedia(portrait: boolean) {
  const listeners = new Set<(event: { matches: boolean }) => void>();
  const query = {
    matches: portrait,
    media: '(orientation: portrait)',
    addEventListener: vi.fn((_type: string, fn: any) => listeners.add(fn)),
    removeEventListener: vi.fn((_type: string, fn: any) => listeners.delete(fn)),
  };
  window.matchMedia = vi.fn(() => query) as any;
  return {
    query,
    listeners,
    rotate(toPortrait: boolean) {
      query.matches = toPortrait;
      for (const fn of [...listeners]) fn({ matches: toPortrait });
    },
  };
}

function makeApp(config: Record<string, unknown>) {
  const app = {
    config,
    paused: false,
    pause: vi.fn(() => {
      app.paused = true;
    }),
    resume: vi.fn(() => {
      app.paused = false;
    }),
    fullScreen: { onFullScreenChange: new Signal<(isFullscreen: boolean) => void>() },
  };
  return app;
}

const overlay = () => document.querySelector<HTMLElement>('[data-caper-orientation-overlay]');

describe('OrientationPlugin', () => {
  let plugin: OrientationPlugin;
  const originalMatchMedia = window.matchMedia;

  async function start(config: Record<string, unknown>) {
    h.app = makeApp(config);
    plugin = new OrientationPlugin();
    // The config key `orientation` is the plugin id, so its value arrives as the options.
    plugin.initialize(config.orientation as any);
    await plugin.postInitialize(h.app);
    return h.app;
  }

  beforeEach(() => {
    h.platform = { isMobile: true, isTouch: true, isTauri: false };
  });

  afterEach(() => {
    plugin?.destroy();
    window.matchMedia = originalMatchMedia;
    document.querySelectorAll('[data-caper-orientation-overlay]').forEach((node) => node.remove());
  });

  it('still resumes when turned back if a pause listener threw (paused before the first scene)', async () => {
    const media = mockMatchMedia(false);
    h.app = makeApp({ orientation: 'portrait' });
    // Like app.pause() when a scene-manager listener throws: the app is paused, then the call throws.
    h.app.pause = vi.fn(() => {
      h.app.paused = true;
      throw new TypeError("Cannot read properties of undefined (reading 'onPause')");
    });
    plugin = new OrientationPlugin();
    plugin.initialize('portrait' as any);
    await plugin.postInitialize(h.app);
    expect(h.app.paused).toBe(true);

    media.rotate(true);
    expect(h.app.resume).toHaveBeenCalledTimes(1);
    expect(h.app.paused).toBe(false);
  });

  it('shows the overlay and pauses when the device is held the wrong way, from the start', async () => {
    mockMatchMedia(false);
    const app = await start({ orientation: 'portrait' });

    expect(plugin.mismatched).toBe(true);
    expect(app.pause).toHaveBeenCalledTimes(1);
    expect(overlay()?.textContent).toBe('Rotate your device');
  });

  it('hides the overlay and resumes when the device turns the right way', async () => {
    const media = mockMatchMedia(true);
    const app = await start({ orientation: { lock: 'landscape' } });
    expect(plugin.orientation).toBe('landscape');
    expect(overlay()?.textContent).toBe('Turn your device sideways');
    const changes: boolean[] = [];
    plugin.onMismatchChanged.connect((mismatched) => changes.push(mismatched));

    media.rotate(false);

    expect(plugin.mismatched).toBe(false);
    expect(overlay()).toBeNull();
    expect(app.resume).toHaveBeenCalledTimes(1);
    expect(app.paused).toBe(false);

    media.rotate(true);
    expect(overlay()).not.toBeNull();
    expect(changes).toEqual([false, true]);
  });

  it('does nothing while the orientation matches', async () => {
    mockMatchMedia(true);
    const app = await start({ orientation: 'portrait' });
    expect(plugin.active).toBe(true);
    expect(plugin.mismatched).toBe(false);
    expect(overlay()).toBeNull();
    expect(app.pause).not.toHaveBeenCalled();
  });

  it('does not resume a game someone else paused', async () => {
    const media = mockMatchMedia(true);
    h.app = makeApp({ orientation: 'portrait' });
    h.app.paused = true;
    plugin = new OrientationPlugin();
    plugin.initialize('portrait');
    await plugin.postInitialize(h.app);

    media.rotate(false);
    expect(overlay()).not.toBeNull();
    expect(h.app.pause).not.toHaveBeenCalled();

    media.rotate(true);
    expect(overlay()).toBeNull();
    expect(h.app.resume).not.toHaveBeenCalled();
    expect(h.app.paused).toBe(true);
  });

  it('with overlay: false shows no overlay and does not pause, but still signals', async () => {
    const media = mockMatchMedia(true);
    const app = await start({ orientation: { lock: 'portrait', overlay: false } });
    const changes: boolean[] = [];
    plugin.onMismatchChanged.connect((mismatched) => changes.push(mismatched));

    media.rotate(false);

    expect(plugin.mismatched).toBe(true);
    expect(changes).toEqual([true]);
    expect(overlay()).toBeNull();
    expect(app.pause).not.toHaveBeenCalled();
  });

  it('is inert when orientation is unset', async () => {
    mockMatchMedia(false);
    const app = await start({});
    expect(plugin.active).toBe(false);
    expect(window.matchMedia).not.toHaveBeenCalled();
    expect(overlay()).toBeNull();
    expect(app.pause).not.toHaveBeenCalled();
  });

  it('is inert on a desktop browser', async () => {
    h.platform = { isMobile: false, isTouch: false, isTauri: false };
    mockMatchMedia(false);
    const app = await start({ orientation: 'portrait' });
    expect(plugin.active).toBe(false);
    expect(overlay()).toBeNull();
    expect(app.pause).not.toHaveBeenCalled();
  });

  it('is inert on a touchscreen laptop, which is not a phone or tablet', async () => {
    h.platform = { isMobile: false, isTouch: true, isTauri: false };
    mockMatchMedia(false);
    const app = await start({ orientation: 'portrait' });
    expect(plugin.active).toBe(false);
    expect(overlay()).toBeNull();
    expect(app.pause).not.toHaveBeenCalled();
  });

  it('is inert inside Tauri, where the manifest locks the orientation', async () => {
    h.platform = { isMobile: true, isTouch: true, isTauri: true };
    mockMatchMedia(false);
    const app = await start({ orientation: 'portrait' });
    expect(plugin.active).toBe(false);
    expect(overlay()).toBeNull();
    expect(app.pause).not.toHaveBeenCalled();
  });

  it('applies custom text, colors, font and className to the default element', async () => {
    mockMatchMedia(false);
    await start({
      orientation: {
        lock: 'portrait',
        overlay: { text: 'Hold it upright', background: 'rgb(10, 20, 30)', color: 'rgb(1, 2, 3)', fontFamily: 'Parlour', className: 'my-rotate' },
      },
    });

    const el = overlay()!;
    expect(el.textContent).toBe('Hold it upright');
    expect(el.style.background).toContain('rgb(10, 20, 30)');
    expect(el.style.color).toBe('rgb(1, 2, 3)');
    expect(el.style.fontFamily).toContain('Parlour');
    expect(el.classList.contains('my-rotate')).toBe(true);
    expect(el.style.position).toBe('fixed');
  });

  it('uses a custom element in place of the default one', async () => {
    mockMatchMedia(false);
    const custom = document.createElement('section');
    custom.textContent = 'custom';
    const element = vi.fn(() => custom);
    await start({ orientation: { lock: 'portrait', overlay: { element } } });

    expect(custom.isConnected).toBe(true);
    expect(custom.dataset.caperOrientationOverlay).toBeDefined();
    expect(custom.textContent).toBe('custom');
    expect(element).toHaveBeenCalledTimes(1);
  });

  it('locks the screen orientation on entering fullscreen, swallowing a rejection', async () => {
    mockMatchMedia(true);
    const lock = vi.fn(() => Promise.reject(new Error('not supported')));
    Object.defineProperty(screen, 'orientation', { configurable: true, value: { lock } });
    try {
      const app = await start({ orientation: 'landscape' });
      app.fullScreen.onFullScreenChange.emit(true);
      expect(lock).toHaveBeenCalledWith('landscape');
      app.fullScreen.onFullScreenChange.emit(false);
      expect(lock).toHaveBeenCalledTimes(1);
      await Promise.resolve();
    } finally {
      delete (screen as any).orientation;
    }
  });

  it('cleans up on destroy: removes the overlay, the listener, and resumes what it paused', async () => {
    const media = mockMatchMedia(false);
    const app = await start({ orientation: 'portrait' });
    expect(overlay()).not.toBeNull();

    plugin.destroy();

    expect(overlay()).toBeNull();
    expect(media.listeners.size).toBe(0);
    expect(app.resume).toHaveBeenCalledTimes(1);
    expect(app.fullScreen.onFullScreenChange.hasConnections()).toBe(false);
  });
});
