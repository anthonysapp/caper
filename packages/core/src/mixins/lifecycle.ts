import type { DestroyOptions, Ticker } from 'pixi.js';

import { Application } from '../core/Application';
import { Signal } from '../signals';
import type { SignalOrder } from '../signals/Signal';
import type { AppTypeOverrides, Constructor, Size } from '../utils';

/**
 * Configuration for the lifecycle mixin.
 */
export type LifecycleConfig = {
  /**
   * Connect `resize()` to `app.onResize` while the object is on the stage.
   */
  autoResize: boolean;
  /**
   * Add `update()` to `app.ticker` while the object is on the stage.
   */
  autoUpdate: boolean;
  /**
   * Signal order for the `app.onResize` connection.
   */
  resizePriority: SignalOrder;
  /**
   * Ticker priority for the `update()` callback.
   */
  updatePriority: number;
};

const defaultLifecycleConfig: LifecycleConfig = {
  autoResize: true,
  autoUpdate: false,
  resizePriority: 0,
  updatePriority: -999999,
};

/**
 * Interface for objects with a Caper display lifecycle.
 */
export interface ILifecycle {
  app: AppTypeOverrides['App'];

  onDestroy: Signal<() => void>;

  /**
   * Wire the stage lifecycle up. Call this once, from the constructor of the
   * class the mixin is applied to, after `bindAllMethods()`.
   * @param config - The lifecycle configuration.
   */
  _initLifecycle(config?: Partial<LifecycleConfig>): void;

  added(): Promise<void> | void;

  removed(): Promise<void> | void;

  resize(size?: Size): void;

  update(ticker?: Ticker | number): void;

  destroy(options?: DestroyOptions): void;
}

/**
 * The WithLifecycle function is a higher-order function that gives a class the
 * shared Caper display lifecycle: the overridable `added` / `removed` /
 * `resize` / `update` hooks, the `onDestroy` signal, and the stage-scoped
 * `app.onResize` / `app.ticker` connections that back `autoResize` /
 * `autoUpdate` — all torn down again on `removed` and on `destroy`.
 *
 * @param {TBase extends Constructor<any>} Base - The base class to add the lifecycle to.
 *
 * @returns {TBase & Constructor<ILifecycle>} The modified class with the lifecycle.
 */
export function WithLifecycle<TBase extends Constructor<any>>(Base: TBase): TBase & Constructor<ILifecycle> {
  return class extends Base implements ILifecycle {
    // `bindAllMethods()` stops walking the prototype chain here, so everything
    // this mixin adds is bound to the instance — `resize` in particular has to
    // be, since Signal.connect() takes a callback with no context.
    private static readonly __caper_method_binding_root = true;

    public onDestroy: Signal<() => void> = new Signal();

    private __lifecycleConfig: LifecycleConfig = { ...defaultLifecycleConfig };

    /**
     * Get the application instance.
     */
    public get app(): AppTypeOverrides['App'] {
      return Application.getInstance();
    }

    public _initLifecycle(config: Partial<LifecycleConfig> = {}) {
      this.__lifecycleConfig = { ...defaultLifecycleConfig, ...config };
      // Add an event listener for the 'added' event.
      this.on('added', this._added);
      this.on('removed', this._removed);
    }

    /**
     * This method is called when the object is added to the stage. It is meant to be overridden by subclasses.
     */
    public added() {}

    /**
     * This method is called when the object is removed from the stage. It is meant to be overridden by subclasses.
     */
    public removed() {}

    /**
     * Resize the object. This method is meant to be overridden by subclasses.
     * @param size
     */
    public resize(size?: Size) {
      void size;
    }

    /**
     * Update the object. This method is meant to be overridden by subclasses.
     * @param ticker
     */
    public update(ticker?: Ticker | number) {
      void ticker;
    }

    destroy(options?: DestroyOptions): void {
      if (this.__lifecycleConfig.autoUpdate) {
        this.app.ticker.remove(this.update, this);
      }
      this.onDestroy.emit();
      super.destroy(options);
    }

    /**
     * This method is called when the object is added to the stage. It sets up auto-resizing and auto-updating if enabled.
     */
    private _added() {
      if (this.__lifecycleConfig.autoResize) {
        this.addSignalConnection(
          this.app.onResize.connect(this.resize, this.__lifecycleConfig.resizePriority ?? 'highest'),
        );
      }

      if (this.__lifecycleConfig.autoUpdate) {
        this.app.ticker.add(this.update, this, this.__lifecycleConfig.updatePriority);
      }

      this.added();
    }

    private _removed() {
      if (this.__lifecycleConfig.autoResize) {
        this.app.onResize.disconnect(this.resize);
      }

      if (this.__lifecycleConfig.autoUpdate) {
        this.app.ticker.remove(this.update, this);
      }

      this.removed();
    }
  } as unknown as TBase & Constructor<ILifecycle>;
}
