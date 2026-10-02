import {
  type FullscreenDriver,
  type IApplication,
  type IPlugin,
  isAndroid,
  isDev,
  isMobile,
  isTauri,
  Logger,
  Plugin,
} from '@caperjs/core';
import type { UnlistenFn } from '@tauri-apps/api/event';
import type { Window as TauriWindow } from '@tauri-apps/api/window';
import type { Store as TauriStore } from '@tauri-apps/plugin-store';
import { version } from './version';

/** Options for {@link TauriPlugin}, all optional. */
export interface TauriPluginOptions {
  /** Pause the app while the webview is hidden/occluded. Default `true`. */
  pauseOnHide?: boolean;
  /** Pause the app while the native window is unfocused. Default `false`. */
  pauseOnBlur?: boolean;
  /** Drive `app.fullScreen` through the native window. Default `true`. */
  nativeFullscreen?: boolean;
  /** Swallow the webview's right-click menu. Default: `true` in production, `false` in dev. */
  disableContextMenu?: boolean;
  /** File the disk-backed key/value store lives in, under the app data dir. Default `'caper-save.json'`. */
  storeFile?: string;
  /**
   * Android only: the keyboard key a back-button press (or back gesture) is delivered
   * as. Bind it in your controls config like any key, e.g.
   * `close: ['Escape', 'GoBack']`, `toggle_pause: ['P', 'GoBack']`; action contexts
   * decide which one fires. While this is on, back never closes the app by itself.
   * `false` leaves Android's default behavior alone. Default `'GoBack'` (the DOM
   * standard name for this key).
   */
  backButtonKey?: string | false;
}

/**
 * Public contract for the Tauri plugin. `save`/`load` make it storage-capable, so
 * it can be named as a `app.store` adapter — on native *and* on the web.
 */
export interface ITauriPlugin extends IPlugin<TauriPluginOptions> {
  /** Whether the app is actually running inside a Tauri webview. */
  readonly isNative: boolean;
  save(key: string, data: any): Promise<void>;
  load<T = any>(key: string): Promise<T | undefined>;
  /** Close the native window. A logged no-op on the web. */
  quit(): Promise<void>;
}

/** Prefix for the web (`localStorage`) fallback keys. */
const WEB_KEY_PREFIX = 'caper:';

/**
 * Read at `initialize` time rather than module-eval time so `isDev` reflects the
 * build the plugin actually runs in.
 */
function defaultOptions(): Required<TauriPluginOptions> {
  return {
    pauseOnHide: true,
    pauseOnBlur: false,
    nativeFullscreen: true,
    disableContextMenu: !isDev,
    storeFile: 'caper-save.json',
    backButtonKey: 'GoBack',
  };
}

/**
 * Native-shell integration for apps packaged with Tauri v2.
 *
 * Everything native is reached through `await import(...)` behind an `isTauri`
 * guard, so the same `plugins: [...]` list loads unchanged on the plain web —
 * where the plugin is inert apart from `save`/`load`, which fall back to
 * `localStorage`.
 *
 * What it does on native:
 * - pauses the app when the webview is hidden (a hidden Tauri window freezes
 *   `requestAnimationFrame` and timers outright), and optionally on blur;
 * - installs a `FullscreenDriver` on `app.fullScreen`, because Tauri's webview
 *   has no HTML Fullscreen API at all;
 * - backs `save`/`load` with `@tauri-apps/plugin-store`, a real file on disk,
 *   rather than `localStorage` (which WebKit may evict);
 * - suppresses the webview's own right-click menu.
 *
 * @example
 * ```ts
 * // caper.config.ts
 * plugins: [['tauri', { options: { pauseOnBlur: true } }]],
 *
 * // anywhere
 * await app.store.save('tauri', 'progress', { level: 3 });
 * ```
 */
export class TauriPlugin extends Plugin<TauriPluginOptions> implements ITauriPlugin {
  public readonly id = 'tauri';
  /** `app.fullScreen` must exist before `postInitialize` installs the driver. */
  public readonly requires = ['fullscreen'];

  protected _options: Required<TauriPluginOptions>;

  /** The native window handle, resolved once on native. */
  private _window: TauriWindow | null = null;
  /** In-flight/settled store open, so the file is opened exactly once. */
  private _storePromise: Promise<TauriStore> | null = null;
  /** Whether *this* plugin is the one that paused the app. */
  private _didPause = false;
  /** The `notify` callback handed over by the fullscreen driver's `subscribe`. */
  private _notifyFullscreen: ((isFullscreen: boolean) => void) | null = null;
  /** So the off-native `quit()` warning is logged once, not once per call. */
  private _warnedQuit = false;

  /** Whether the app is actually running inside a Tauri webview. */
  public get isNative(): boolean {
    return isTauri;
  }

  public async initialize(options: Partial<TauriPluginOptions>, _app: IApplication): Promise<void> {
    this._options = { ...defaultOptions(), ...options };

    if (!isTauri) {
      return;
    }

    if (this._options.disableContextMenu) {
      this.listen(document, 'contextmenu', (event) => event.preventDefault());
    }

    if (this._options.pauseOnHide) {
      this.listen(document, 'visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          this._pause();
        } else {
          this._resume();
        }
      });
    }

    const win = await this._nativeWindow();

    if (this._options.pauseOnBlur) {
      this.addDisposer(
        await win.onFocusChanged(({ payload: focused }) => {
          if (focused) {
            this._resume();
          } else {
            this._pause();
          }
        }),
      );
    }

    await this._listenLifecycle();
    await this._listenBackButton();
  }

  public async postInitialize(_app: IApplication): Promise<void> {
    // Desktop only. Tauri's window.setFullscreen() rejects on Android/iOS, where the
    // webview's own HTML Fullscreen API works (and the Android shell already hides the
    // system bars), so on mobile core's DOM path is the one to keep.
    if (!isTauri || isMobile || !this._options.nativeFullscreen) {
      return;
    }

    const fullScreen = this.app.fullScreen;
    const win = await this._nativeWindow();

    // Tauri has no fullscreen-change event; a resize always accompanies the
    // transition, so re-query on resize and report only what changed.
    this.addDisposer(
      await win.onResized(async () => {
        if (!this._notifyFullscreen) {
          return;
        }
        try {
          this._notifyFullscreen(await win.isFullscreen());
        } catch (error) {
          Logger.error(`[${this.id}] could not read the native fullscreen state:`, error);
        }
      }),
    );

    const driver: FullscreenDriver = {
      supported: true,
      request: () => win.setFullscreen(true),
      exit: () => win.setFullscreen(false),
      subscribe: (notify) => {
        this._notifyFullscreen = notify;
        return () => {
          this._notifyFullscreen = null;
        };
      },
    };
    fullScreen.setFullscreenDriver(driver);
    this.addDisposer(() => fullScreen.setFullscreenDriver(null));
  }

  /**
   * Persist `data` under `key` — to the disk-backed store on native, to
   * `localStorage` on the web. Rejects (never swallows) on failure.
   */
  public async save(key: string, data: any): Promise<void> {
    if (!isTauri) {
      try {
        localStorage.setItem(`${WEB_KEY_PREFIX}${key}`, JSON.stringify(data));
      } catch (error) {
        throw new Error(`[${this.id}] failed to save "${key}" to localStorage: ${describe(error)}`);
      }
      return;
    }

    try {
      const store = await this._store();
      await store.set(key, data);
      await store.save();
    } catch (error) {
      throw new Error(`[${this.id}] failed to save "${key}" to ${this._options.storeFile}: ${describe(error)}`);
    }
  }

  /**
   * Read back what `save` wrote. A missing key resolves `undefined`; so does a
   * corrupt `localStorage` entry on the web.
   */
  public async load<T = any>(key: string): Promise<T | undefined> {
    if (!isTauri) {
      const raw = localStorage.getItem(`${WEB_KEY_PREFIX}${key}`);
      if (raw === null) {
        return undefined;
      }
      try {
        return JSON.parse(raw) as T;
      } catch {
        return undefined;
      }
    }

    try {
      const store = await this._store();
      return await store.get<T>(key);
    } catch (error) {
      throw new Error(`[${this.id}] failed to load "${key}" from ${this._options.storeFile}: ${describe(error)}`);
    }
  }

  /** Close the native window. A logged no-op on the web. */
  public async quit(): Promise<void> {
    if (!isTauri) {
      if (!this._warnedQuit) {
        this._warnedQuit = true;
        Logger.warn(`[${this.id}] quit() does nothing outside a Tauri window`);
      }
      return;
    }
    const win = await this._nativeWindow();
    await win.close();
  }

  /** Resolve (once) the native window handle. Only ever called when `isTauri`. */
  private async _nativeWindow(): Promise<TauriWindow> {
    if (!this._window) {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      this._window = getCurrentWindow();
    }
    return this._window;
  }

  /** Open (once) the disk-backed store. Only ever called when `isTauri`. */
  private _store(): Promise<TauriStore> {
    if (!this._storePromise) {
      this._storePromise = (async () => {
        const { load } = await import('@tauri-apps/plugin-store');
        return load(this._options.storeFile, { autoSave: true });
      })();
      // a failed open must not be cached, or every later call sees the same error
      this._storePromise.catch(() => {
        this._storePromise = null;
      });
    }
    return this._storePromise;
  }

  /**
   * Mobile webviews are suspended rather than hidden, so `visibilitychange` is
   * not enough on iOS/Android. These events exist from `@tauri-apps/api` v2.
   */
  /**
   * Android's back button, delivered as an ordinary key press. Caper's keyboard
   * controls read keys off the document, so the game's controls config and action
   * contexts decide what back does; nothing is hard-coded here.
   */
  private async _listenBackButton(): Promise<void> {
    const key = this._options.backButtonKey;
    if (!isAndroid || !key) {
      return;
    }
    try {
      const { onBackButtonPress } = await import('@tauri-apps/api/app');
      const listener = await onBackButtonPress(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
        document.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
      });
      this.addDisposer(() => void listener.unregister());
    } catch (error) {
      Logger.error(`[${this.id}] could not listen for the Android back button:`, error);
    }
  }

  private async _listenLifecycle(): Promise<void> {
    const { listen, TauriEvent } = await import('@tauri-apps/api/event');
    const suspended = (TauriEvent as Record<string, string>).WINDOW_SUSPENDED;
    const resumed = (TauriEvent as Record<string, string>).WINDOW_RESUMED;
    if (!suspended || !resumed) {
      return;
    }
    const unlisten: UnlistenFn[] = await Promise.all([
      listen(suspended, () => this._pause()),
      listen(resumed, () => this._resume()),
    ]);
    this.addDisposer(...unlisten);
  }

  /** Pause the app, but only if nothing else already did — and remember that we did. */
  private _pause(): void {
    if (this.app.paused) {
      return;
    }
    this.app.pause();
    this._didPause = true;
  }

  /** Resume the app, but only if this plugin is the one that paused it. */
  private _resume(): void {
    if (!this._didPause) {
      return;
    }
    this._didPause = false;
    this.app.resume();
  }
}

/** Message text from whatever a rejected Tauri call threw. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export { version };
export default TauriPlugin;
