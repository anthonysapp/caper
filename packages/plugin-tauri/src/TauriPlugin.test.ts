import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// TauriPlugin pulls `@caperjs/core` for the Plugin base class and the `isTauri` /
// `isDev` flags; importing the real package would drag in Pixi and the app
// singleton. Stub it the way plugin-crunch stubs core for Sensor.test.ts, with a
// base class faithful to `addDisposer` / `listen` / `destroy`.
const h = vi.hoisted(() => {
  const flags = { isTauri: true, isDev: false, isMobile: false, isAndroid: false };
  const app: any = {
    paused: false,
    pause: vi.fn(),
    resume: vi.fn(),
    fullScreen: { setFullscreenDriver: vi.fn() },
  };
  return { flags, app };
});

vi.mock('@caperjs/core', () => {
  class StubPlugin {
    public id = 'Plugin';
    protected _options: any = {};
    private _disposers: Array<() => void> = [];

    public get app() {
      return h.app;
    }

    public get options() {
      return this._options;
    }

    public addDisposer(...fns: Array<() => void>) {
      this._disposers.push(...fns);
    }

    public listen(target: EventTarget, type: string, handler: any, options?: any) {
      target.addEventListener(type, handler, options);
      let removed = false;
      const remove = () => {
        if (removed) return;
        removed = true;
        target.removeEventListener(type, handler, options);
      };
      this.addDisposer(remove);
      return remove;
    }

    public destroy() {
      const disposers = this._disposers;
      this._disposers = [];
      for (let i = disposers.length - 1; i >= 0; i--) {
        disposers[i]();
      }
    }
  }

  return {
    Plugin: StubPlugin,
    Logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
    get isTauri() {
      return h.flags.isTauri;
    },
    get isDev() {
      return h.flags.isDev;
    },
    get isMobile() {
      return h.flags.isMobile;
    },
    get isAndroid() {
      return h.flags.isAndroid;
    },
  };
});

const tauriWindow = vi.hoisted(() => ({
  setFullscreen: vi.fn(async () => undefined),
  isFullscreen: vi.fn(async () => false),
  close: vi.fn(async () => undefined),
  onResized: vi.fn(async (_cb: any) => vi.fn()),
  onFocusChanged: vi.fn(async (_cb: any) => vi.fn()),
}));
const getCurrentWindow = vi.hoisted(() => vi.fn(() => tauriWindow));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow }));

const tauriStore = vi.hoisted(() => ({
  set: vi.fn(async () => undefined),
  get: vi.fn(async () => undefined),
  save: vi.fn(async () => undefined),
}));
const storeLoad = vi.hoisted(() => vi.fn(async () => tauriStore));
vi.mock('@tauri-apps/plugin-store', () => ({ load: storeLoad }));

const tauriListen = vi.hoisted(() => vi.fn(async (_e: string, _cb: any) => vi.fn()));
const backButton = vi.hoisted(() => {
  const state: { handler: ((payload: { canGoBack: boolean }) => void) | null; unregister: ReturnType<typeof vi.fn> } = {
    handler: null,
    unregister: vi.fn(),
  };
  const onBackButtonPress = vi.fn(async (handler: (payload: { canGoBack: boolean }) => void) => {
    state.handler = handler;
    return { unregister: state.unregister };
  });
  return { state, onBackButtonPress };
});
vi.mock('@tauri-apps/api/app', () => ({ onBackButtonPress: backButton.onBackButtonPress }));

vi.mock('@tauri-apps/api/event', () => ({
  listen: tauriListen,
  TauriEvent: { WINDOW_SUSPENDED: 'tauri://suspended', WINDOW_RESUMED: 'tauri://resumed' },
}));

import TauriPlugin from './TauriPlugin';

function hide(hidden: boolean) {
  Object.defineProperty(document, 'visibilityState', {
    value: hidden ? 'hidden' : 'visible',
    configurable: true,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

/** The handler a `vi.fn` mock was called with, for the async Tauri `onX` subscribers. */
const handlerOf = (fn: ReturnType<typeof vi.fn>, call = 0) => fn.mock.calls[call][0] as (...args: any[]) => any;

let plugin: TauriPlugin;

beforeEach(() => {
  vi.clearAllMocks();
  h.flags.isTauri = true;
  h.flags.isDev = false;
  h.app.paused = false;
  h.app.pause.mockImplementation(() => {
    h.app.paused = true;
  });
  h.app.resume.mockImplementation(() => {
    h.app.paused = false;
  });
  tauriWindow.onResized.mockImplementation(async () => vi.fn());
  tauriWindow.onFocusChanged.mockImplementation(async () => vi.fn());
  tauriWindow.isFullscreen.mockResolvedValue(false);
  localStorage.clear();
  plugin = new TauriPlugin();
});

afterEach(() => {
  plugin.destroy();
  hide(false);
});

describe('TauriPlugin on the plain web', () => {
  beforeEach(async () => {
    h.flags.isTauri = false;
    await plugin.initialize({}, h.app);
    await plugin.postInitialize(h.app);
  });

  it('never touches a Tauri module', () => {
    expect(getCurrentWindow).not.toHaveBeenCalled();
    expect(storeLoad).not.toHaveBeenCalled();
    expect(tauriListen).not.toHaveBeenCalled();
  });

  it('does not register a fullscreen driver', () => {
    expect(h.app.fullScreen.setFullscreenDriver).not.toHaveBeenCalled();
  });

  it('round-trips save/load through localStorage', async () => {
    await plugin.save('progress', { level: 3 });
    expect(localStorage.getItem('caper:progress')).toBe(JSON.stringify({ level: 3 }));
    await expect(plugin.load('progress')).resolves.toEqual({ level: 3 });
  });

  it('returns undefined for a missing key', async () => {
    await expect(plugin.load('nope')).resolves.toBeUndefined();
  });

  it('returns undefined for a corrupt key', async () => {
    localStorage.setItem('caper:broken', '{not json');
    await expect(plugin.load('broken')).resolves.toBeUndefined();
  });

  it('quits as a no-op', async () => {
    await expect(plugin.quit()).resolves.toBeUndefined();
    expect(tauriWindow.close).not.toHaveBeenCalled();
  });

  it('does not wire the context menu', () => {
    const event = new Event('contextmenu', { cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});

describe('TauriPlugin pause ownership', () => {
  it('pauses on hide and resumes on show', async () => {
    await plugin.initialize({}, h.app);

    hide(true);
    expect(h.app.pause).toHaveBeenCalledTimes(1);

    hide(false);
    expect(h.app.resume).toHaveBeenCalledTimes(1);
  });

  it('leaves an already-paused app alone, and does not resume it', async () => {
    await plugin.initialize({}, h.app);
    h.app.paused = true;

    hide(true);
    expect(h.app.pause).not.toHaveBeenCalled();

    hide(false);
    expect(h.app.resume).not.toHaveBeenCalled();
  });

  it('does not listen for visibility when pauseOnHide is false', async () => {
    await plugin.initialize({ pauseOnHide: false }, h.app);

    hide(true);
    expect(h.app.pause).not.toHaveBeenCalled();
  });

  it('does not wire focus changes by default', async () => {
    await plugin.initialize({}, h.app);
    expect(tauriWindow.onFocusChanged).not.toHaveBeenCalled();
  });

  it('pauses on blur and resumes on focus when pauseOnBlur is enabled', async () => {
    await plugin.initialize({ pauseOnBlur: true }, h.app);
    const onFocus = handlerOf(tauriWindow.onFocusChanged);

    onFocus({ payload: false });
    expect(h.app.pause).toHaveBeenCalledTimes(1);

    onFocus({ payload: true });
    expect(h.app.resume).toHaveBeenCalledTimes(1);
  });

  it('does not resume on focus when it did not pause', async () => {
    await plugin.initialize({ pauseOnBlur: true }, h.app);
    const onFocus = handlerOf(tauriWindow.onFocusChanged);
    h.app.paused = true;

    onFocus({ payload: false });
    onFocus({ payload: true });
    expect(h.app.pause).not.toHaveBeenCalled();
    expect(h.app.resume).not.toHaveBeenCalled();
  });

  it('pauses on the native suspend event and resumes on resume', async () => {
    await plugin.initialize({}, h.app);

    const suspended = tauriListen.mock.calls.find((c) => c[0] === 'tauri://suspended');
    const resumed = tauriListen.mock.calls.find((c) => c[0] === 'tauri://resumed');
    expect(suspended).toBeDefined();
    expect(resumed).toBeDefined();

    (suspended![1] as any)({});
    expect(h.app.pause).toHaveBeenCalledTimes(1);

    (resumed![1] as any)({});
    expect(h.app.resume).toHaveBeenCalledTimes(1);
  });
});

describe('TauriPlugin native fullscreen', () => {
  const driver = () => h.app.fullScreen.setFullscreenDriver.mock.calls[0][0];

  beforeEach(async () => {
    await plugin.initialize({}, h.app);
    await plugin.postInitialize(h.app);
  });

  it('registers a driver on app.fullScreen', () => {
    expect(h.app.fullScreen.setFullscreenDriver).toHaveBeenCalledTimes(1);
    expect(driver().supported).toBe(true);
  });

  it('drives the native window from request/exit', async () => {
    await driver().request();
    expect(tauriWindow.setFullscreen).toHaveBeenCalledWith(true);

    await driver().exit();
    expect(tauriWindow.setFullscreen).toHaveBeenCalledWith(false);
  });

  it('notifies on a resize that changed the native fullscreen state', async () => {
    const notify = vi.fn();
    driver().subscribe(notify);

    tauriWindow.isFullscreen.mockResolvedValue(true);
    await handlerOf(tauriWindow.onResized)({ payload: { width: 1, height: 1 } });

    expect(notify).toHaveBeenCalledWith(true);
  });

  it('removes the driver and unlistens on destroy', async () => {
    const unlistenResized = vi.fn();
    plugin.destroy();

    plugin = new TauriPlugin();
    tauriWindow.onResized.mockImplementation(async () => unlistenResized);
    await plugin.initialize({}, h.app);
    await plugin.postInitialize(h.app);

    plugin.destroy();

    expect(unlistenResized).toHaveBeenCalledTimes(1);
    const calls = h.app.fullScreen.setFullscreenDriver.mock.calls;
    expect(calls[calls.length - 1][0]).toBeNull();
  });

  it('skips the driver when nativeFullscreen is false', async () => {
    plugin.destroy();
    plugin = new TauriPlugin();
    h.app.fullScreen.setFullscreenDriver.mockClear();

    await plugin.initialize({ nativeFullscreen: false }, h.app);
    await plugin.postInitialize(h.app);

    expect(h.app.fullScreen.setFullscreenDriver).not.toHaveBeenCalled();
  });

  // Found on a Pixel 8: Tauri's window.setFullscreen() is desktop-only and rejects on
  // Android/iOS, while the mobile webview's own HTML Fullscreen API works. Installing
  // the native driver there replaced a working path with a failing one.
  it('leaves core DOM fullscreen alone on mobile', async () => {
    plugin.destroy();
    plugin = new TauriPlugin();
    h.app.fullScreen.setFullscreenDriver.mockClear();
    h.flags.isMobile = true;

    try {
      await plugin.initialize({}, h.app);
      await plugin.postInitialize(h.app);
    } finally {
      h.flags.isMobile = false;
    }

    expect(h.app.fullScreen.setFullscreenDriver).not.toHaveBeenCalled();
  });
});

describe('TauriPlugin storage', () => {
  beforeEach(async () => {
    await plugin.initialize({}, h.app);
  });

  it('saves through the store and flushes it', async () => {
    await plugin.save('progress', { level: 3 });
    expect(storeLoad).toHaveBeenCalledWith('caper-save.json', { autoSave: true });
    expect(tauriStore.set).toHaveBeenCalledWith('progress', { level: 3 });
    expect(tauriStore.save).toHaveBeenCalledTimes(1);
  });

  it('loads through the store', async () => {
    tauriStore.get.mockResolvedValueOnce({ level: 7 } as any);
    await expect(plugin.load('progress')).resolves.toEqual({ level: 7 });
    expect(tauriStore.get).toHaveBeenCalledWith('progress');
  });

  it('opens the store only once', async () => {
    await plugin.save('a', 1);
    await plugin.save('b', 2);
    await plugin.load('a');
    expect(storeLoad).toHaveBeenCalledTimes(1);
  });

  it('honours a custom store file', async () => {
    plugin.destroy();
    plugin = new TauriPlugin();
    await plugin.initialize({ storeFile: 'slots.json' }, h.app);
    await plugin.save('a', 1);
    expect(storeLoad).toHaveBeenCalledWith('slots.json', { autoSave: true });
  });

  it('rejects with a clear error when the store fails', async () => {
    tauriStore.set.mockRejectedValueOnce(new Error('disk full'));
    await expect(plugin.save('progress', 1)).rejects.toThrow(/progress/);
  });
});

describe('TauriPlugin context menu', () => {
  it('prevents the webview context menu in production builds', async () => {
    h.flags.isDev = false;
    await plugin.initialize({}, h.app);

    const event = new Event('contextmenu', { cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('leaves the context menu alone in dev builds', async () => {
    h.flags.isDev = true;
    await plugin.initialize({}, h.app);

    const event = new Event('contextmenu', { cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('leaves the context menu alone when disabled explicitly', async () => {
    await plugin.initialize({ disableContextMenu: false }, h.app);

    const event = new Event('contextmenu', { cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('stops preventing it after destroy', async () => {
    await plugin.initialize({}, h.app);
    plugin.destroy();

    const event = new Event('contextmenu', { cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});

describe('TauriPlugin quit', () => {
  it('closes the native window', async () => {
    await plugin.initialize({}, h.app);
    await plugin.quit();
    expect(tauriWindow.close).toHaveBeenCalledTimes(1);
  });
});


describe('TauriPlugin Android back button', () => {
  let plugin: TauriPlugin;
  const keys: string[] = [];
  const record = (e: Event) => keys.push(`${e.type}:${(e as KeyboardEvent).key}`);

  beforeEach(() => {
    keys.length = 0;
    backButton.state.handler = null;
    backButton.state.unregister.mockClear();
    backButton.onBackButtonPress.mockClear();
    h.flags.isTauri = true;
    h.flags.isAndroid = true;
    document.addEventListener('keydown', record);
    document.addEventListener('keyup', record);
    plugin = new TauriPlugin();
  });

  afterEach(() => {
    plugin.destroy();
    h.flags.isAndroid = false;
    document.removeEventListener('keydown', record);
    document.removeEventListener('keyup', record);
  });

  // The back button is just another key: Caper's keyboard controls pick it up from the
  // document like any key, and the game's own controls config + action contexts decide
  // what it does (close a popup, toggle pause, ...). No behavior is hard-coded here.
  it('turns a back press into a GoBack key press on the document', async () => {
    await plugin.initialize({}, h.app);
    expect(backButton.onBackButtonPress).toHaveBeenCalledTimes(1);

    backButton.state.handler?.({ canGoBack: false });

    expect(keys).toEqual(['keydown:GoBack', 'keyup:GoBack']);
  });

  it('uses the configured key name', async () => {
    await plugin.initialize({ backButtonKey: 'Escape' }, h.app);
    backButton.state.handler?.({ canGoBack: false });
    expect(keys).toEqual(['keydown:Escape', 'keyup:Escape']);
  });

  it('does not listen when backButtonKey is false, or off Android', async () => {
    await plugin.initialize({ backButtonKey: false }, h.app);
    expect(backButton.onBackButtonPress).not.toHaveBeenCalled();

    plugin.destroy();
    plugin = new TauriPlugin();
    h.flags.isAndroid = false;
    await plugin.initialize({}, h.app);
    expect(backButton.onBackButtonPress).not.toHaveBeenCalled();
  });

  it('unregisters the native listener on destroy', async () => {
    await plugin.initialize({}, h.app);
    plugin.destroy();
    expect(backButton.state.unregister).toHaveBeenCalledTimes(1);
  });
});
