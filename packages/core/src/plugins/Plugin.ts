import type { Ticker } from 'pixi.js';
import type { IApplication, ICoreFunctions, ICoreSignals } from '../core';
import { coreFunctionRegistry, coreSignalRegistry } from '../core';
import { Application } from '../core/Application';
import { SignalConnection, SignalConnections } from '../signals';
import { type AppTypeOverrides, bindAllMethods, ImportListItemModule, Logger } from '../utils';

/**
 * Public contract for a Caper plugin. A plugin is a long-lived object
 * with `initialize` / `postInitialize` / `destroy` lifecycle hooks,
 * registered at app bootstrap and accessed via `app.getPlugin(id)`.
 *
 * **Lifecycle order** (per plugin):
 *
 *   1. `constructor` — instantiated by the framework. Don't reference
 *      the app yet; it isn't attached.
 *   2. `initialize(options, app)` — set up internal state, parse options,
 *      open connections, register signals. Awaited by the framework
 *      before any other plugin's `initialize` runs (when ordered by
 *      `requires`). Don't call out to other plugins here unless they
 *      are listed in your `requires` — order isn't guaranteed otherwise.
 *   3. `postInitialize(app)` — runs after every plugin has finished
 *      `initialize`. Safe to look up sibling plugins via `app.getPlugin`
 *      regardless of `requires`. Use for cross-plugin wiring.
 *   4. (use phase) — the plugin is live; signal handlers fire, exposed
 *      methods are called from scenes / other plugins / the app.
 *   5. `destroy()` — called when the app shuts down. Tear down
 *      connections, disconnect signals, free resources. The base class
 *      already disconnects everything added via `addSignalConnection`
 *      and runs everything registered via the cleanup primitives below.
 *
 * **Cleanup primitives.** Don't hand-roll matching add/remove pairs —
 * register the resource through the base class and `destroy()` releases
 * it for you. Overriding `destroy()` is still fine; just call
 * `super.destroy()`.
 *
 *   - `addSignalConnection(...)` — signal connections.
 *   - `listen(target, type, handler, options?)` — DOM listeners. Adds
 *     now, removes on destroy with the same capture/options semantics.
 *   - `addTickerCallback(fn, context?, priority?)` — ticker callbacks on
 *     `app.ticker`. Added now, removed on destroy.
 *   - `addDisposer(...fns)` — anything else (DOM nodes, timers, third
 *     party handles). Disposers run last-in-first-out on destroy, each
 *     isolated so one failure can't skip the others.
 *
 * `listen` and `addTickerCallback` also return a removal function, for
 * the rarer case where you need to detach before the plugin dies. It's
 * safe to call more than once.
 *
 * @example
 * ```ts
 * public initialize(): void {
 *   this.listen(window, 'resize', this._onResize);
 *   this.addTickerCallback(this._update);
 *   this.addDisposer(() => this._el.remove());
 * }
 * // no destroy() override needed — the base class cleans all three up
 * ```
 *
 * Listeners that get attached and detached repeatedly at runtime (an
 * activate/deactivate cycle, say) should stay manual — the primitives
 * are for resources whose lifetime matches the plugin's.
 *
 * Discovery: plugin classes under `src/plugins/` are auto-discovered
 * by the Vite plugin if they default-export a class. Annotate with
 * `definePlugin({ id, requires })` for the canonical id and any
 * dependency declarations:
 *
 * @example
 * ```ts
 * import { definePlugin, IApplication, Plugin } from '@caperjs/core';
 *
 * export const plugin = definePlugin({
 *   id: 'leaderboard',
 *   requires: ['firebase'],   // firebase initializes first
 * });
 *
 * export default class LeaderboardPlugin extends Plugin {
 *   public readonly id = 'leaderboard';
 *
 *   async initialize(_options, app) {
 *     this.firebase = app.getPlugin('firebase'); // guaranteed to exist
 *   }
 * }
 * ```
 */
export interface IPlugin<O = any> {
  /** Unique plugin id. Must match the `definePlugin({ id })` value. */
  id: string;

  /** The owning application instance. Available after registration. */
  app: IApplication;

  /** Resolved options after `initialize` merges defaults with the user's. */
  readonly options: O;

  /**
   * Set up the plugin. Called once at bootstrap, awaited before any
   * dependent plugin's `initialize` runs. Use this to parse options,
   * open connections, and register signals.
   *
   * @param options Partial options from `caper.config.ts plugins[]`.
   * @param app The application instance, fully constructed but possibly
   *   mid-bootstrap (other plugins may not yet be initialized — see
   *   `requires` and `postInitialize`).
   */
  initialize(options: Partial<O>, app: IApplication): Promise<void> | void;

  /**
   * Cross-plugin wiring hook. Called after every plugin has finished
   * `initialize`. Safe to look up siblings via `app.getPlugin(id)` here
   * regardless of `requires` — they're all live.
   */
  postInitialize(_app: IApplication): Promise<void> | void;

  /**
   * Tear down. Called on app shutdown. Runs every registered disposer
   * (last-in-first-out) and disconnects every tracked signal connection.
   * Safe to call more than once — the second call is a no-op.
   */
  destroy(): void;

  /**
   * Track a signal connection so it gets auto-disconnected on `destroy`.
   * Prefer this over storing connections manually.
   */
  addSignalConnection(...args: SignalConnection[]): void;

  /** Disconnect every connection added via `addSignalConnection`. */
  clearSignalConnections(): void;

  /**
   * Register cleanup callbacks to run on `destroy`. Use for resources
   * the other primitives don't cover — DOM nodes, timers, third-party
   * handles.
   *
   * Disposers run last-in-first-out (so teardown mirrors setup), and each
   * one is isolated: a throwing disposer is reported and the rest still
   * run.
   */
  addDisposer(...fns: Array<() => void>): void;

  /**
   * Add a DOM event listener now and remove it on `destroy`, with the
   * same capture/options semantics it was added with.
   *
   * @returns A removal function, for the rarer case where the listener
   *   must come off before the plugin dies. Safe to call more than once.
   */
  listen(
    target: EventTarget,
    type: string,
    handler: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions | boolean,
  ): () => void;

  /**
   * Add a callback to `app.ticker` now and remove it on `destroy`. The
   * ticker is resolved when this is called, not at construction.
   *
   * @returns A removal function, for the rarer case where the callback
   *   must come off before the plugin dies. Safe to call more than once.
   */
  addTickerCallback(fn: (ticker: Ticker) => void, context?: unknown, priority?: number): () => void;

  /** Register methods this plugin exposes via the core function registry. */
  registerCoreFunctions(): void;

  /** Register signals this plugin exposes via the core signal registry. */
  registerCoreSignals(): void;
}

export interface PluginListItem {
  id: string;
  path: string;
  module?: ImportListItemModule<IPlugin>;
  assets?: string[];
  plugins?: string[];
  /**
   * IDs of other plugins that must initialize before this one. Populated
   * from `definePlugin({ requires: [...] })` for local plugins; carried
   * through discovery to bootstrap so the framework can topologically
   * sort the active plugin set.
   */
  requires?: string[];
}

export class Plugin<O = any> implements IPlugin<O> {
  private static readonly __caper_method_binding_root = true;
  // A collection of signal connections.
  protected _signalConnections: SignalConnections = new SignalConnections();
  // Cleanup callbacks registered via addDisposer / listen / addTickerCallback.
  protected _disposers: Array<() => void> = [];

  protected _options: O;

  get options(): O {
    return this._options;
  }

  constructor(public id: string = 'Plugin') {
    bindAllMethods(this);
  }

  public get app(): AppTypeOverrides['App'] {
    return Application.getInstance();
  }

  /**
   * Tear down the plugin. Runs every registered disposer (last-in-first-out,
   * each isolated so one failure can't skip the others), then disconnects
   * every tracked signal connection. Idempotent.
   *
   * Subclasses may override this, but must call `super.destroy()`.
   */
  public destroy(): void {
    // swap the list out first, so a disposer that (indirectly) re-enters
    // destroy can't run anything twice
    const disposers = this._disposers;
    this._disposers = [];
    for (let i = disposers.length - 1; i >= 0; i--) {
      try {
        disposers[i]();
      } catch (e) {
        Logger.error(`Plugin "${this.id}" threw while running a disposer:`, e);
      }
    }
    this._signalConnections.disconnectAll();
  }

  public initialize(options?: Partial<O>, _app?: IApplication): Promise<void> | void;

  public async initialize(_options: Partial<O>, _app?: IApplication): Promise<void> {
    return Promise.resolve(undefined);
  }

  public postInitialize(_app: IApplication): Promise<void> | void;

  public async postInitialize(_app: IApplication): Promise<void> {
    return Promise.resolve(undefined);
  }

  /**
   * Add signal connections to the container.
   * @param args - The signal connections to add.
   */
  public addSignalConnection(...args: SignalConnection[]) {
    for (const connection of args) {
      this._signalConnections.add(connection);
    }
  }

  public clearSignalConnections() {
    this._signalConnections.disconnectAll();
  }

  /**
   * Register cleanup callbacks to run on `destroy`, last-in-first-out.
   * Use for resources the other primitives don't cover — DOM nodes,
   * timers, third-party handles.
   * @param fns - The cleanup callbacks to register.
   */
  public addDisposer(...fns: Array<() => void>): void {
    for (const fn of fns) {
      this._disposers.push(fn);
    }
  }

  /**
   * Add a DOM event listener now and remove it on `destroy`, with the same
   * capture/options semantics it was added with.
   * @param target - The event target to listen on.
   * @param type - The event type.
   * @param handler - The listener.
   * @param options - Passed through to both add and remove, so capture-phase
   *   listeners detach correctly.
   * @returns A removal function for early detachment. Safe to call more than once.
   */
  public listen(
    target: EventTarget,
    type: string,
    handler: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions | boolean,
  ): () => void {
    target.addEventListener(type, handler, options);
    let removed = false;
    const remove = () => {
      if (removed) {
        return;
      }
      removed = true;
      target.removeEventListener(type, handler, options);
    };
    this.addDisposer(remove);
    return remove;
  }

  /**
   * Add a callback to `app.ticker` now and remove it on `destroy`. The ticker
   * is resolved when this is called, not at construction.
   * @param fn - The ticker callback.
   * @param context - The context to invoke the callback with.
   * @param priority - Pixi `UPDATE_PRIORITY` for the callback.
   * @returns A removal function for early detachment. Safe to call more than once.
   */
  public addTickerCallback(fn: (ticker: Ticker) => void, context?: unknown, priority?: number): () => void {
    const ticker = this.app.ticker;
    ticker.add(fn, context, priority);
    let removed = false;
    const remove = () => {
      if (removed) {
        return;
      }
      removed = true;
      ticker.remove(fn, context);
    };
    this.addDisposer(remove);
    return remove;
  }

  /**
   * @override
   * @protected
   */
  public registerCoreFunctions(): void {
    const functions = this.getCoreFunctions();
    functions.forEach((f) => {
      const fName = f as keyof ICoreFunctions;
      // @ts-expect-error implicit any
      coreFunctionRegistry[fName] = this[f];
    });
  }

  /**
   * @override
   * @protected
   */
  public registerCoreSignals(): void {
    const signals = this.getCoreSignals();
    signals.forEach((s) => {
      const sName = s as keyof ICoreSignals;
      // @ts-expect-error implicit any
      coreSignalRegistry[sName] = this[s];
    });
  }

  protected getCoreFunctions(): string[] {
    return [];
  }

  protected getCoreSignals(): string[] {
    return [];
  }
}
