import type { IApplication } from '../core/interfaces/IApplication';
import { Signal } from '../signals';
import { Logger } from '../utils/console/Logger';
import { isMobile, isTauri } from '../utils/platform';
import type { OrientationConfig, OrientationLock as Orientation, OrientationOverlayOptions } from '../utils/orientation';
import { resolveOrientation } from '../utils/orientation';
import type { IPlugin } from './Plugin';
import { Plugin } from './Plugin';

export interface IOrientationPlugin extends IPlugin {
  /** The lock from `caper.config.ts`'s `orientation`, or `undefined` when unset. */
  readonly orientation: Orientation | undefined;
  /** Whether the plugin is watching at all: orientation set, a touch/mobile device, not Tauri. */
  readonly active: boolean;
  /** Whether the device is currently held the wrong way. */
  readonly mismatched: boolean;
  /** Fires when `mismatched` changes. Still fires with `orientation: { lock, overlay: false }`. */
  onMismatchChanged: Signal<(mismatched: boolean) => void>;
}

export const ORIENTATION_OVERLAY_TEXT: Readonly<Record<Orientation, string>> = Object.freeze({
  portrait: 'Rotate your device',
  landscape: 'Turn your device sideways',
});

const OVERLAY_ATTRIBUTE = 'data-caper-orientation-overlay';

type LockableOrientation = ScreenOrientation & { lock?: (orientation: string) => Promise<void> };

/**
 * The web "rotate your device" guard for `orientation` in `caper.config.ts`.
 *
 * Only on a touch/mobile browser outside Tauri (native apps are locked by their
 * manifests; desktop browsers never see it). While the device is held the
 * wrong way it shows a full-screen DOM overlay and pauses the app, then hides
 * it and resumes when the device turns back. It only resumes a pause it made
 * itself. Entering fullscreen also asks `screen.orientation.lock` for the
 * orientation (works on Android Chrome; a rejection is ignored).
 */
export class OrientationPlugin extends Plugin implements IOrientationPlugin {
  public readonly id = 'orientation';

  public onMismatchChanged: Signal<(mismatched: boolean) => void> = new Signal<(mismatched: boolean) => void>();

  private _orientation: Orientation | undefined;
  private _overlayOptions: OrientationOverlayOptions | false = {};
  private _active = false;
  private _mismatched = false;
  /** Whether *this* plugin is the one that paused the app. */
  private _didPause = false;
  private _query: MediaQueryList | null = null;
  private _overlay: HTMLElement | null = null;

  public get orientation(): Orientation | undefined {
    return this._orientation;
  }

  public get active(): boolean {
    return this._active;
  }

  public get mismatched(): boolean {
    return this._mismatched;
  }

  /**
   * `options` is `caper.config.ts`'s `orientation` itself: the config key is
   * this plugin's id, so `loadPlugin` hands the value over as the options.
   */
  public initialize(options?: OrientationConfig | unknown): void {
    const resolved = resolveOrientation(options);
    this._orientation = resolved?.lock;
    this._overlayOptions = resolved?.overlay ?? {};
  }

  // The work happens in postInitialize: pausing reaches into the audio and timer
  // plugins, which register after this one.
  public postInitialize(_app?: IApplication): void {
    if (!this._orientation) return;

    if (!isMobile || isTauri) return;
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    this._active = true;
    this._query = window.matchMedia('(orientation: portrait)');
    this.listen(this._query, 'change', this._check);
    this.addDisposer(this._teardown);

    const onFullScreenChange = this.app.fullScreen?.onFullScreenChange;
    if (onFullScreenChange) {
      this.addSignalConnection(onFullScreenChange.connect(this._onFullScreenChange));
    }

    this._check();
  }

  private _check(): void {
    if (!this._query || !this._orientation) return;
    const mismatched = this._query.matches !== (this._orientation === 'portrait');
    if (mismatched === this._mismatched) return;
    this._mismatched = mismatched;

    if (this._overlayOptions !== false) {
      if (mismatched) {
        this._showOverlay();
        this._pause();
      } else {
        this._hideOverlay();
        this._resume();
      }
    }

    this.onMismatchChanged.emit(mismatched);
  }

  private _onFullScreenChange(isFullscreen: boolean): void {
    if (!isFullscreen || typeof screen === 'undefined') return;
    const screenOrientation = screen.orientation as LockableOrientation | undefined;
    try {
      void screenOrientation?.lock?.(this._orientation === 'landscape' ? 'landscape' : 'portrait')?.catch?.(() => {});
    } catch {
      // No lock on this browser (iOS); the overlay still covers it.
    }
  }

  private _showOverlay(): void {
    if (typeof document === 'undefined') return;
    if (!this._overlay) this._overlay = this._createOverlay();
    if (!this._overlay.isConnected) document.body.appendChild(this._overlay);
  }

  private _hideOverlay(): void {
    this._overlay?.remove();
  }

  private _createOverlay(): HTMLElement {
    const options = this._overlayOptions || {};
    let el: HTMLElement;
    if (options.element) {
      el = options.element();
    } else {
      el = document.createElement('div');
      el.textContent = options.text ?? ORIENTATION_OVERLAY_TEXT[this._orientation!];
      el.setAttribute('role', 'alert');
      el.style.cssText =
        'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;' +
        'padding:24px;box-sizing:border-box;text-align:center;font-size:24px;line-height:1.3;font-weight:600;' +
        'touch-action:none;user-select:none;-webkit-user-select:none;pointer-events:auto;';
      el.style.background = options.background ?? '#000';
      el.style.color = options.color ?? '#fff';
      el.style.fontFamily = options.fontFamily ?? 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    }
    el.setAttribute(OVERLAY_ATTRIBUTE, '');
    if (options.className) el.classList.add(...options.className.split(/\s+/).filter(Boolean));
    return el;
  }

  /** Pause the app, but only if nothing else already did, and remember that we did. */
  private _pause(): void {
    if (this.app.paused) return;
    // Mark it first: if a pause listener throws, the app is still paused and must resume on turn-back.
    this._didPause = true;
    try {
      this.app.pause();
    } catch (error) {
      Logger.error('A pause listener threw while the orientation overlay paused the app:', error);
    }
  }

  /** Resume the app, but only if this plugin is the one that paused it. */
  private _resume(): void {
    if (!this._didPause) return;
    this._didPause = false;
    this.app.resume();
  }

  private _teardown(): void {
    this._hideOverlay();
    this._overlay = null;
    this._resume();
    this._query = null;
    this._active = false;
  }
}
