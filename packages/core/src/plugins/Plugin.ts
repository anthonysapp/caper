import type { IApplication, ICoreFunctions, ICoreSignals } from '../core';
import { coreFunctionRegistry, coreSignalRegistry } from '../core';
import { Application } from '../core/Application';
import { SignalConnection, SignalConnections } from '../signals';
import { type AppTypeOverrides, bindAllMethods, ImportListItemModule } from '../utils';

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
 *      already disconnects everything added via `addSignalConnection`.
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

  /** Tear down. Called on app shutdown. */
  destroy(): void;

  /**
   * Track a signal connection so it gets auto-disconnected on `destroy`.
   * Prefer this over storing connections manually.
   */
  addSignalConnection(...args: SignalConnection[]): void;

  /** Disconnect every connection added via `addSignalConnection`. */
  clearSignalConnections(): void;

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

  public destroy(): void {
    this._signalConnections.disconnectAll();
  }

  public initialize(options?: Partial<O>, _app?: IApplication): Promise<void> | void;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async initialize(_options: Partial<O>, _app?: IApplication): Promise<void> {
    return Promise.resolve(undefined);
  }

  public postInitialize(_app: IApplication): Promise<void> | void;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
