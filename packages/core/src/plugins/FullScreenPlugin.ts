import { Application } from '../core/Application';
import { Signal } from '../signals';
import { bindAllMethods, Logger } from '../utils';
import type { IPlugin } from './Plugin';
import { Plugin } from './Plugin';

/**
 * Supplies fullscreen to the {@link FullScreenPlugin} from somewhere other than the
 * DOM Fullscreen API — a native shell, say, where `requestFullscreen` does not exist.
 *
 * Install one with {@link IFullScreenPlugin.setFullscreenDriver}; passing `null`
 * restores the plugin's normal DOM behavior.
 */
export interface FullscreenDriver {
  /** Whether this driver can enter fullscreen at all. */
  readonly supported: boolean;
  /** Enter fullscreen. A rejected promise is logged, never thrown. */
  request(): void | Promise<void>;
  /** Leave fullscreen. A rejected promise is logged, never thrown. */
  exit(): void | Promise<void>;
  /** Start reporting state changes; returns an unsubscribe. Called once when the driver is set. */
  subscribe?(notify: (isFullscreen: boolean) => void): () => void;
}

/**
 * Interface for the FullScreen plugin providing cross-browser fullscreen functionality.
 * Handles fullscreen mode management with comprehensive browser compatibility.
 */
export interface IFullScreenPlugin extends IPlugin {
  /** Current fullscreen state */
  isFullScreen: boolean;
  /** The HTML element or Window object used for fullscreen operations */
  fullScreenElement: HTMLElement | Window | null;
  /** Signal emitted when fullscreen state changes */
  onFullScreenChange: Signal<(isFullscreen: boolean) => void>;
  /** Toggles between fullscreen and windowed mode */
  toggleFullScreen: () => void;
  /** Sets the fullscreen state explicitly */
  setFullScreen: (value: boolean) => void;
  /** Sets the element to be used for fullscreen operations */
  setFullScreenElement: (element: HTMLElement | Window | null) => void;
  /** Installs (or, with `null`, removes) a driver that supplies fullscreen instead of the DOM */
  setFullscreenDriver: (driver: FullscreenDriver | null) => void;
  /** Whether the current environment supports fullscreen functionality */
  readonly canFullscreen: boolean;
}

/**
 * Cross-browser fullscreen functionality plugin for web applications.
 *
 * Provides comprehensive fullscreen mode management with automatic browser
 * compatibility handling, event management, and flexible element targeting.
 * Supports all major browsers including Chrome, Firefox, Safari, and Edge.
 *
 * Key Features:
 * - Cross-browser fullscreen API compatibility
 * - Automatic event handling and state synchronization
 * - Flexible element targeting (container, window, or custom elements)
 * - Signal-based event system for reactive programming
 * - Graceful fallback handling for unsupported browsers
 * - Automatic cleanup and error handling
 *
 * @example
 * ```typescript
 * // Get the fullscreen plugin
 * const fullscreen = app.plugins.get<IFullScreenPlugin>('fullscreen');
 *
 * // Listen for fullscreen changes
 * fullscreen.onFullScreenChange.connect((isFullscreen) => {
 *   console.log('Fullscreen state:', isFullscreen);
 *   updateUIForFullscreen(isFullscreen);
 * });
 *
 * // Toggle fullscreen mode
 * document.getElementById('fullscreenBtn').addEventListener('click', () => {
 *   if (fullscreen.canFullscreen) {
 *     fullscreen.toggleFullScreen();
 *   } else {
 *     console.warn('Fullscreen not supported');
 *   }
 * });
 *
 * // Set custom element for fullscreen
 * const gameContainer = document.getElementById('gameContainer');
 * fullscreen.setFullScreenElement(gameContainer);
 * fullscreen.setFullScreen(true);
 * ```
 */
export class FullScreenPlugin extends Plugin implements IFullScreenPlugin {
  /** Plugin identifier for framework registration */
  public readonly id = 'fullscreen';

  /**
   * Signal emitted when fullscreen state changes.
   * Provides the new fullscreen state as a boolean parameter.
   */
  public onFullScreenChange: Signal<(isFullscreen: boolean) => void> = new Signal<(isFullscreen: boolean) => void>();

  /** Internal fullscreen state tracking */
  private _isFullScreen: boolean = false;
  /** Internal reference to the fullscreen target element */
  private _fullScreenElement: HTMLElement | Window | null = null;
  /** Installed driver, if any. When set it replaces every DOM fullscreen path. */
  private _driver: FullscreenDriver | null = null;
  /** Unsubscribe handed back by the current driver's `subscribe`. */
  private _driverUnsubscribe: (() => void) | null = null;
  /** Last state the current driver reported. */
  private _driverIsFullScreen: boolean = false;

  /**
   * Sets the fullscreen state and triggers the appropriate fullscreen operation.
   * @param value - True to enter fullscreen, false to exit
   */
  set isFullScreen(value: boolean) {
    this._isFullScreen = value;
    this.setFullScreen(value);
  }

  /**
   * Gets the current fullscreen state.
   * @returns True if currently in fullscreen mode
   */
  get isFullScreen(): boolean {
    return this._isFullScreen;
  }

  /**
   * Sets the element to be used for fullscreen operations.
   * @param value - The HTML element or Window object to use for fullscreen
   */
  set fullScreenElement(value: HTMLElement | Window | null) {
    this.setFullScreenElement(value);
  }

  /**
   * Gets the current fullscreen target element.
   * @returns The element currently set for fullscreen operations
   */
  get fullScreenElement(): HTMLElement | Window | null {
    return this._fullScreenElement;
  }

  /**
   * Creates the fullscreen plugin instance.
   * Binds all methods to maintain proper context when used as event handlers.
   */
  constructor() {
    super();
    bindAllMethods(this);
  }

  /**
   * Gets the application instance.
   * @returns The singleton Application instance
   */
  get app(): Application {
    return Application.getInstance();
  }

  /**
   * Initializes the fullscreen plugin by setting up browser event listeners.
   * Registers listeners for all major browser fullscreen change events.
   *
   * @example
   * ```typescript
   * // Called automatically by the plugin system
   * // Registers listeners for: fullscreenchange, webkitfullscreenchange,
   * // mozfullscreenchange, msfullscreenchange
   * ```
   */
  public initialize(): void {
    this.listen(document, 'fullscreenchange', this._onFullScreenChange);
    this.listen(document, 'webkitfullscreenchange', this._onFullScreenChange);
    this.listen(document, 'mozfullscreenchange', this._onFullScreenChange);
    this.listen(document, 'msfullscreenchange', this._onFullScreenChange);
  }

  /**
   * Toggles between fullscreen and windowed mode.
   *
   * @example
   * ```typescript
   * // Toggle fullscreen on button click
   * button.addEventListener('click', () => {
   *   fullscreenPlugin.toggleFullScreen();
   * });
   *
   * // Keyboard shortcut for fullscreen
   * document.addEventListener('keydown', (e) => {
   *   if (e.key === 'F11') {
   *     e.preventDefault();
   *     fullscreenPlugin.toggleFullScreen();
   *   }
   * });
   * ```
   */
  public toggleFullScreen() {
    this.setFullScreen(!this._isFullScreen);
  }

  /**
   * Sets the fullscreen state explicitly.
   *
   * @param value - True to enter fullscreen, false to exit fullscreen
   *
   * @example
   * ```typescript
   * // Enter fullscreen mode
   * fullscreenPlugin.setFullScreen(true);
   *
   * // Exit fullscreen mode
   * fullscreenPlugin.setFullScreen(false);
   *
   * // Conditional fullscreen based on game state
   * if (gameState === 'playing') {
   *   fullscreenPlugin.setFullScreen(true);
   * }
   * ```
   */
  public setFullScreen(value: boolean) {
    this._isFullScreen = value;
    const driver = this._driver;
    if (driver) {
      this._runDriver(() => (value ? driver.request() : driver.exit()));
      return;
    }
    if (value) {
      this._requestFullscreen();
    } else {
      this._exitFullscreen();
    }
  }

  /**
   * Sets the element to be used for fullscreen operations.
   * If no element is provided, uses the default application container.
   *
   * @param value - The HTML element or Window to use for fullscreen operations
   *
   * @example
   * ```typescript
   * // Use a specific game container
   * const gameDiv = document.getElementById('game-container');
   * fullscreenPlugin.setFullScreenElement(gameDiv);
   *
   * // Use the entire window
   * fullscreenPlugin.setFullScreenElement(window);
   *
   * // Reset to default (application container)
   * fullscreenPlugin.setFullScreenElement(null);
   * ```
   */
  public setFullScreenElement(value: HTMLElement | Window | null) {
    if (!value) {
      Logger.warn('No element passed to setFullScreenElement for fullscreen mode');
    }
    this._fullScreenElement = value;
  }

  /**
   * Installs a driver that supplies fullscreen instead of the DOM Fullscreen API —
   * for native shells (Tauri, say) whose webview has no `requestFullscreen`.
   *
   * Setting a driver unsubscribes the previous one. Passing `null` removes the
   * driver and restores the plugin's normal DOM behavior.
   *
   * @param driver - The driver to install, or `null` to remove the current one.
   *
   * @example
   * ```typescript
   * fullscreenPlugin.setFullscreenDriver({
   *   supported: true,
   *   request: () => win.setFullscreen(true),
   *   exit: () => win.setFullscreen(false),
   *   subscribe: (notify) => win.onResized(async () => notify(await win.isFullscreen())),
   * });
   * ```
   */
  public setFullscreenDriver(driver: FullscreenDriver | null): void {
    this._unsubscribeDriver();
    this._driver = driver;
    this._driverIsFullScreen = false;
    if (driver?.subscribe) {
      this._driverUnsubscribe = driver.subscribe(this._onDriverStateChange);
    }
  }

  /**
   * Tears down the plugin, unsubscribing any installed fullscreen driver.
   */
  public destroy(): void {
    this._unsubscribeDriver();
    super.destroy();
  }

  /**
   * Checks if the current environment and element support fullscreen functionality.
   *
   * @returns True if fullscreen is supported and available
   *
   * @example
   * ```typescript
   * if (fullscreenPlugin.canFullscreen) {
   *   // Show fullscreen button
   *   fullscreenButton.style.display = 'block';
   * } else {
   *   // Hide fullscreen button or show alternative
   *   fullscreenButton.style.display = 'none';
   *   console.log('Fullscreen not supported on this device');
   * }
   * ```
   */
  public get canFullscreen(): boolean {
    if (this._driver) {
      return this._driver.supported;
    }
    const element = this._fullScreenElement || Application.containerElement;
    if (!element) return false;

    const fullscreenElement = element as HTMLElement;
    return !!(
      fullscreenElement.requestFullscreen ||
      (fullscreenElement as any).webkitRequestFullscreen ||
      (fullscreenElement as any).msRequestFullscreen ||
      (fullscreenElement as any).mozRequestFullScreen
    );
  }

  /**
   * Checks if the document is currently in fullscreen mode.
   * Uses browser-specific properties for cross-browser compatibility.
   *
   * @returns True if any element is currently in fullscreen mode
   */
  public get isFullscreen(): boolean {
    if (this._driver) {
      return this._driverIsFullScreen;
    }
    return !!(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).msFullscreenElement ||
      (document as any).mozFullScreenElement
    );
  }

  /**
   * Gets the core signals exposed by this plugin.
   * @returns Array of signal names available on the plugin
   * @protected
   */
  protected getCoreSignals(): string[] {
    return ['onFullScreenChange'];
  }

  /**
   * Gets the core functions exposed by this plugin.
   * @returns Array of function names available on the plugin
   * @protected
   */
  protected getCoreFunctions(): string[] {
    return ['toggleFullScreen', 'setFullScreen', 'setFullScreenElement'];
  }

  /**
   * Requests fullscreen mode using the appropriate browser API.
   * Handles cross-browser compatibility and error cases.
   * @private
   */
  private _requestFullscreen() {
    const element = this._fullScreenElement || Application.containerElement;
    if (!element) {
      throw new Error('No element available for fullscreen mode');
    }

    const fullscreenElement = element as HTMLElement;
    try {
      if (fullscreenElement.requestFullscreen) {
        fullscreenElement.requestFullscreen();
      } else if ((fullscreenElement as any).webkitRequestFullscreen) {
        (fullscreenElement as any).webkitRequestFullscreen();
      } else if ((fullscreenElement as any).msRequestFullscreen) {
        (fullscreenElement as any).msRequestFullscreen();
      } else if ((fullscreenElement as any).mozRequestFullScreen) {
        (fullscreenElement as any).mozRequestFullScreen();
      }
    } catch (error) {
      Logger.error('Failed to request fullscreen:', error);
      // Reset the fullscreen state since it failed
      this._isFullScreen = false;
    }
  }

  /**
   * Exits fullscreen mode using the appropriate browser API.
   * Handles cross-browser compatibility for fullscreen exit.
   * @private
   */
  private _exitFullscreen() {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if ((document as any).webkitExitFullscreen) {
      (document as any).webkitExitFullscreen();
    } else if ((document as any).msExitFullscreen) {
      (document as any).msExitFullscreen();
    } else if ((document as any).mozCancelFullScreen) {
      (document as any).mozCancelFullScreen();
    }
  }

  /**
   * Handles browser fullscreen change events.
   * Updates internal state and emits the onFullScreenChange signal.
   * @private
   */
  private _onFullScreenChange(): void {
    // the user can leave fullscreen without us (Esc / browser chrome), so re-read
    // the real state instead of trusting the cached flag
    this._isFullScreen = this.isFullscreen;
    this.onFullScreenChange.emit(this._isFullScreen);
  }

  /**
   * Handles a state change reported by the installed driver. Emits only when the
   * value actually changed — drivers poll (Tauri has no fullscreen-change event).
   * @private
   */
  private _onDriverStateChange(isFullscreen: boolean): void {
    if (isFullscreen === this._driverIsFullScreen) {
      return;
    }
    this._driverIsFullScreen = isFullscreen;
    this._isFullScreen = isFullscreen;
    this.onFullScreenChange.emit(isFullscreen);
  }

  /**
   * Runs a driver call, swallowing (and logging) any sync throw or rejection.
   * @private
   */
  private _runDriver(fn: () => void | Promise<void>): void {
    try {
      const result = fn();
      if (result && typeof (result as Promise<void>).catch === 'function') {
        (result as Promise<void>).catch((error) => {
          Logger.error('Fullscreen driver failed:', describeError(error));
        });
      }
    } catch (error) {
      Logger.error('Fullscreen driver failed:', describeError(error));
    }
  }

  /**
   * Drops the current driver's subscription, if it has one.
   * @private
   */
  private _unsubscribeDriver(): void {
    const unsubscribe = this._driverUnsubscribe;
    this._driverUnsubscribe = null;
    if (!unsubscribe) {
      return;
    }
    try {
      unsubscribe();
    } catch (error) {
      Logger.error('Fullscreen driver unsubscribe failed:', error);
    }
  }
}

/** Drivers reject with whatever their platform hands back, often a plain object. */
function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
