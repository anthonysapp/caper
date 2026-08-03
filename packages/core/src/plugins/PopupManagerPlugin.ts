import { Container } from '../display/Container';
import { Signal } from '../signals';
import type { IPopup, PopupConfig, PopupConstructor } from '../ui';
import { bindAllMethods, getLastMapEntry } from '../utils';
import type { PopupId, PopupInstance, PopupProps } from '../utils';
import type { IPlugin } from './Plugin';
import { Plugin } from './Plugin';

type PopupListItem = {
  id: string | number;
  active?: boolean;
  module?: PopupConstructor | (() => Promise<unknown>);
};

/**`
 * Interface for PopupManager
 */
export interface IPopupManagerPlugin extends IPlugin {
  readonly view: Container; // The view of the PopupManager
  readonly current: IPopup | undefined; // The current active popup
  readonly hasActivePopups: boolean; // Whether there are any active popups
  readonly popupCount: number; // The count of popups
  readonly currentPopupId: string | number | undefined; // The id of the current popup
  // signals
  onShowPopup: Signal<(detail: PopupSignalDetail) => void>; // Signal for when a popup is shown
  onHidePopup: Signal<(detail: PopupSignalDetail) => void>; // Signal for when a popup is hidden
  onPopupChanged: Signal<(detail: PopupSignalDetail) => void>; // Signal for when a popup is changed

  /**
   * Show a discovered popup by id. The `config.data` field is narrowed to
   * the popup's declared data type (if it extends `Popup<MyData>`). Awaits
   * the full show lifecycle (initialize → beforeShow → show animation).
   */
  showPopup<K extends PopupId>(id: K, config?: PopupProps<K>): Promise<PopupInstance<K> | undefined>;

  /** Alias for `showPopup` — shorter when called as `this.popups.show(...)`. */
  show<K extends PopupId>(id: K, config?: PopupProps<K>): Promise<PopupInstance<K> | undefined>;

  hidePopup<T = any>(id: string | number, data?: any): Promise<IPopup<T> | undefined>; // Hide a popup

  removeAllPopups(animate?: boolean): void; // Remove all popups
}

export type PopupSignalDetail<T = any> = { id: string | number; data?: T };

/**
 * PopupManager
 */

export class PopupManagerPlugin extends Plugin implements IPopupManagerPlugin {
  public readonly id: string = 'popups'; // The id of the PopupManager
  public readonly view = new Container(); // The view of the PopupManager

  // signals
  public onShowPopup: Signal<(detail: PopupSignalDetail) => void> = new Signal<(detail: PopupSignalDetail) => void>(); // Signal for when a popup is shown
  public onHidePopup: Signal<(detail: PopupSignalDetail) => void> = new Signal<(detail: PopupSignalDetail) => void>(); // Signal for when a popup is hidden
  public onPopupChanged: Signal<(detail: PopupSignalDetail) => void> = new Signal<
    (detail: PopupSignalDetail) => void
  >(); // Signal for when a popup is changed
  // Map entries may start out as a dynamic-import function (from discovery)
  // and get replaced with the resolved constructor on first `show()` call.
  private _popups: Map<string | number, PopupConstructor | (() => Promise<unknown>)> = new Map();
  private _activePopups: Map<string | number, IPopup> = new Map(); // Map of active popups

  private _currentPopupId: string | number | undefined = undefined; // The id of the current popup

  get currentPopupId(): string | number | undefined {
    return this._currentPopupId;
  }

  get popupCount(): number {
    return this._popups.size;
  }

  get current(): IPopup | undefined {
    if (this._currentPopupId === undefined) {
      return undefined;
    }
    return this._activePopups.get(this._currentPopupId);
  }

  get hasActivePopups(): boolean {
    return this._activePopups.size > 0;
  }

  /**
   * Initialize the PopupManager. Reads the discovered `popupList` from the
   * `caper-runtime` global and pre-registers every active popup. Dynamic
   * imports are stored as-is and resolved on first `show()` call.
   */
  initialize(): void {
    bindAllMethods(this);
    this.view.label = 'PopupManager';
    this._setupAppListeners();
    this._registerDiscoveredPopups();
  }

  /**
   * Destroy the PopupManager
   */
  destroy(): void {
    this._activePopups.clear();
    super.destroy();
  }

  /**
   * Show a discovered popup by id.
   * @param id - The id of the popup (typed against `AppPopups`).
   * @param config - The configuration for the popup. `config.data` is
   *   narrowed via the popup class's `Popup<T>` generic.
   * @returns a promise resolving to the popup instance.
   */
  async showPopup<K extends PopupId>(
    id: K,
    config: PopupProps<K> = {} as PopupProps<K>,
  ): Promise<PopupInstance<K> | undefined> {
    const resolved = await this._resolvePopupCtor(id);
    if (!resolved) return;

    const typedConfig = config as Partial<PopupConfig<any>> & { id?: string | number };
    typedConfig.id = id;
    const instance = this.view.add.existing(new resolved(id, typedConfig as Partial<PopupConfig>));
    instance.initialize();
    this.app.focus.clearFocus();
    instance.beforeShow();
    await instance.show();

    this.app.focus.setFocusLayer(id);
    instance.afterShow();

    this._activePopups.set(id, instance);
    this._currentPopupId = id;

    return new Promise((resolve) => {
      this.app.ticker.addOnce(() => {
        this.onShowPopup.emit({ id, data: typedConfig?.data });
        instance.start();
        this.onPopupChanged.emit({ id, data: typedConfig?.data });
        resolve(instance as PopupInstance<K>);
      });
    });
  }

  /** Alias for `showPopup`. */
  show<K extends PopupId>(id: K, config?: PopupProps<K>): Promise<PopupInstance<K> | undefined> {
    return this.showPopup(id, config);
  }

  /**
   * Hide a popup
   * @param id - The id of the popup
   * @param data
   * @returns a promise resolving to the popup, if it exists
   */
  async hidePopup<T = any>(id: string | number, data?: T): Promise<IPopup<T> | undefined> {
    const popup = this._activePopups.get(id);
    if (popup) {
      popup.beforeHide();
      await popup.hide();
      this.view.removeChild(popup as any);
      this._activePopups.delete(id);
      this._currentPopupId = getLastMapEntry(this._activePopups)?.[0] || undefined;
      return new Promise((resolve) => {
        this.app.ticker.addOnce(() => {
          this.onHidePopup.emit({ id, data });
          popup.end();
          this.onPopupChanged.emit({ id, data });
          resolve(popup);
          popup.restoreActionContext();
        });
      });
    }
    return;
  }

  /**
   * Remove all popups
   * @param animate - Whether to animate the removal
   */
  removeAllPopups(animate: boolean = false): void {
    if (animate) {
      // reuse the single-popup hide path so the view, the active map and the
      // current id get cleaned up once each hide animation resolves
      for (const id of [...this._activePopups.keys()]) {
        void this.hidePopup(id);
      }
    } else {
      this._activePopups.clear();
      this.view.removeChildren();
    }
  }

  protected getCoreFunctions() {
    return ['hidePopup', 'showPopup', 'removeAllPopups'];
  }

  protected getCoreSignals() {
    return ['onShowPopup', 'onHidePopup', 'onPopupChanged'];
  }

  /**
   * Setup application listeners
   * @private
   */
  private _setupAppListeners(): void {
    this.addSignalConnection(this.app.scenes.onSceneChangeStart.connect(() => this.removeAllPopups()));
    this.app.keyboard.onKeyUp('Escape').connect(this._handleEscape);
  }

  /**
   * Pull every active popup off `globalThis.Caper.popupList` (populated by
   * the `caper-runtime` virtual module before the Application starts) and
   * seed the registry. Entries stay as dynamic-import functions until the
   * first `show()` call resolves them.
   */
  private _registerDiscoveredPopups(): void {
    const list: PopupListItem[] =
      ((globalThis as unknown as { Caper?: { get?: (key: string) => unknown } }).Caper?.get?.(
        'popupList',
      ) as PopupListItem[] | undefined) ?? [];
    for (const item of list) {
      if (item.active === false || !item.module) continue;
      this._popups.set(item.id, item.module);
    }
  }

  /**
   * Ensure the popup constructor for `id` is loaded and return it. Resolves
   * dynamic-import functions on first access, caches the result back onto
   * the registry so subsequent shows are synchronous.
   */
  private async _resolvePopupCtor(id: string | number): Promise<PopupConstructor | undefined> {
    const entry = this._popups.get(id);
    if (!entry) {
      const known = [...this._popups.keys()].map((k) => `'${String(k)}'`).join(', ');
      throw new Error(
        `[caper] Unknown popup id '${String(id)}'. ` +
          `Known: ${known.length > 0 ? known : '(none — discovery may have failed)'}`,
      );
    }
    // Already a constructor (has prototype)
    if (typeof entry === 'function' && (entry as PopupConstructor).prototype) {
      return entry as PopupConstructor;
    }
    // Dynamic import function — resolve and cache
    const mod = (await (entry as () => Promise<unknown>)()) as { default?: PopupConstructor };
    const ctor = mod?.default;
    if (!ctor) {
      throw new Error(`[caper] Popup '${String(id)}' module did not export a default class.`);
    }
    this._popups.set(id, ctor);
    return ctor;
  }

  /**
   * Handle escape key press
   * if the current popup should close when escape is pressed (true by default), closes it
   * @private
   */
  private _handleEscape() {
    if (this.current && this.current.config.closeOnEscape) {
      void this.hidePopup(this.current.id);
    }
  }
}
