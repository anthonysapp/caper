import { Ticker } from 'pixi.js';
import { PauseConfig } from '../core';
import { type AppTypeOverrides, type AssetTypeOverrides, Size } from '../utils';
import type { IContainer } from './Container';
import { Container } from './Container';

type AppScenes = AppTypeOverrides['Scenes'];

type SceneAssetsToLoad = {
  assets?: (string | { alias: string; src: string | string[] })[];
  bundles?: AssetTypeOverrides['Bundles'] | AssetTypeOverrides['Bundles'][];
};

export type SceneAssets = {
  preload?: SceneAssetsToLoad;
  background?: SceneAssetsToLoad;
  autoUnload?: boolean;
};

export type ScenePlugins = AppTypeOverrides['Plugins'][];

export type SceneDebug = {
  label?: string;
  group?: string;
  order?: number;
};

export type SceneConfig = {
  id?: string;
  dynamic?: boolean;
  active?: boolean;
  assets?: SceneAssets;
  plugins?: ScenePlugins;
  debug?: SceneDebug;
};

export interface IScene extends IContainer {
  id: AppScenes;
  label?: string;
  assets?: SceneAssets;
  autoUnloadAssets?: boolean;

  enter(): Promise<any>;

  exit(): Promise<any>;

  initialize(): Promise<void> | void;

  start(): Promise<void> | void;

  onPause(config: PauseConfig): void;

  onResume(config: PauseConfig): void;
}

export interface SceneListItem {
  id: string;
  path: string;
  scene: () => Promise<new () => IScene> | IScene;
  debug?: {
    label?: string;
    group?: string;
  };
  assets?: SceneAssets;
  plugins?: ScenePlugins;
  autoUnloadAssets: boolean;
}

/**
 * Base class for all scenes in a Caper app. A scene is a self-contained
 * unit of game state and display — start screen, level, menu, etc.
 *
 * **Lifecycle order** (per scene load):
 *
 *   1. `constructor` — instantiated by the SceneManager. Don't reference
 *      `this.app` here; it's not yet attached to the stage.
 *   2. **Assets load** — anything declared in `assets.preload.bundles` is
 *      fetched before `initialize` runs. Background bundles are kicked
 *      off in parallel and may complete after.
 *   3. `initialize()` — build the display tree. The scene is on the stage
 *      but not yet animated in. Safe to use `this.app`, `this.add.*`,
 *      and any preloaded asset.
 *   4. `enter()` — animate the scene in. Override to return a promise /
 *      tween / timeline; the manager awaits it before calling `start`.
 *   5. `start()` — fired after `enter` resolves. Begin per-frame work,
 *      timers, signal connections, gameplay loops.
 *   6. `update(ticker)` — called every frame while the scene is active.
 *      Read `ticker.deltaMS` for frame timing.
 *   7. `resize(size)` — called on viewport resize. Re-layout here.
 *   8. `onPause(config)` / `onResume(config)` — called when the app pauses
 *      or resumes. Use to halt/restart non-display work (audio, network).
 *   9. `exit()` — animate the scene out. Awaited before `destroy`.
 *  10. `destroy()` — tear down. The base implementation removes the
 *      ticker callback and destroys all children — call `super.destroy()`.
 *
 * Scenes are **discovered automatically** by the Vite plugin walking
 * `src/scenes/`. Annotate the file with `defineScene({ id, assets })`
 * (or individual `export const id` / `export const assets`) to give the
 * scene a stable id and declare its asset bundles.
 *
 * @example
 * ```ts
 * import { defineScene, Scene } from '@caperjs/core';
 *
 * export const scene = defineScene({
 *   id: 'menu',
 *   assets: { preload: { bundles: ['ui'] } },
 * });
 *
 * export default class MenuScene extends Scene {
 *   initialize() {
 *     this.add.text({ text: 'Play', anchor: 0.5 });
 *   }
 *   start() {
 *     // begin gameplay loop
 *   }
 *   destroy() {
 *     super.destroy();
 *   }
 * }
 * ```
 */
export class Scene<Props = void> extends Container implements IScene {
  public readonly id: string;
  public autoUnloadAssets: boolean = false;

  /**
   * Runtime props passed via `app.scenes.load(id, props)`. Populated by
   * `SceneManagerPlugin._createCurrentScene` after construction and before
   * `initialize()` runs, so scene authors can read them safely from any
   * lifecycle hook.
   *
   * Subclasses declare the shape via the generic parameter:
   *
   * @example
   * ```ts
   * class LevelScene extends Scene<{ levelId: number; difficulty: 'easy' | 'hard' }> {
   *   async start() {
   *     const { levelId } = this.props;
   *   }
   * }
   * ```
   *
   * For scenes that don't need props, use the default `Scene<void>` (no
   * generic parameter) — `app.scenes.load('menu')` takes no second arg.
   */
  public props!: Props;

  protected _animationContext: string;
  public get animationContext(): string {
    return this._animationContext ?? `__scene_${this.id}`;
  }
  public set animationContext(value: string) {
    this._animationContext = value;
  }

  constructor() {
    super({ autoResize: true, autoUpdate: true, priority: 'highest' });
  }

  /**
   * The assets to load for the scene
   * @private
   * @type {AssetLoadingOptions}
   * @example
   * ```ts
   * assets: {
   *  preload: {
   *  assets: ['path/to/asset.png'],
   *  bundles: ['bundle1', 'bundle2'],
   *  },
   *  background: {
   *   assets: ['path/to/asset.png'],
   *   bundles: ['bundle1', 'bundle2'],
   *   },
   * }
   * ```
   */
  private _assets: SceneAssets;

  get assets(): SceneAssets {
    return this._assets;
  }

  set assets(value: SceneAssets) {
    this._assets = value;
  }

  /**
   * Build the scene's display tree. Called once after preload assets
   * have loaded and the scene has been added to the stage, but **before**
   * `enter()` animates it in. Safe to use `this.app`, `this.add.*`, and
   * any asset declared in `assets.preload`.
   *
   * Override to construct sprites, text, containers, layouts. Don't put
   * gameplay loops here — that's `start()`.
   *
   * Can be sync or async; the manager awaits the return value before
   * calling `enter`.
   */
  public initialize(): Promise<void> | void;

  public async initialize(): Promise<void> {}

  /**
   * Animate the scene in. Called after `initialize()` resolves. The
   * manager awaits the returned promise before calling `start()`, so
   * return a tween / timeline / promise to gate the entry on it.
   *
   * Default implementation resolves immediately (no animation).
   *
   * @returns A promise that resolves when the entry animation completes.
   */
  public enter(): Promise<any> {
    return Promise.resolve();
  }

  /**
   * Animate the scene out. Called when the SceneManager is unloading
   * this scene. Awaited before `destroy()` runs.
   *
   * Default implementation resolves immediately (no animation).
   *
   * @returns A promise that resolves when the exit animation completes.
   */
  public exit(): Promise<any> {
    return Promise.resolve();
  }

  /**
   * Begin per-frame work. Called once after `enter()` resolves; this is
   * where gameplay loops, timers, signal connections, and any work that
   * shouldn't start until the scene is fully visible should live.
   *
   * Override to start tickers, subscribe to input, kick off gameplay.
   * Don't build the display tree here — that's `initialize()`.
   *
   * Can be sync or async.
   */
  public start(): Promise<void> | void;

  public async start(): Promise<void> {}

  /**
   * Per-frame update hook. Called every tick while the scene is active,
   * after `start()` has resolved. Use `ticker.deltaMS` for time-based
   * motion that's framerate-independent.
   *
   * The base implementation is a no-op; override to drive game logic.
   * The base `destroy()` removes this from the ticker — call
   * `super.destroy()` if you override destroy.
   *
   * @param ticker The Pixi ticker; provides `deltaMS`, `deltaTime`, etc.
   */
  public update(ticker?: Ticker) {
    void ticker;
  }

  /**
   * Re-layout on viewport resize. Called whenever the host element /
   * window size changes. Use to reposition or rescale display elements
   * relative to the new viewport size.
   *
   * @param size New viewport dimensions.
   * @override
   */
  public resize(size?: Size): void {
    void size;
  }

  /**
   * Tear down the scene. The base implementation removes this scene
   * from the ticker (so `update` stops firing) and destroys all child
   * display objects. **Always call `super.destroy()`** if you override
   * — otherwise the ticker callback leaks.
   *
   * Override to clean up listeners, signal connections, timers, network
   * subscriptions, or anything else not handled by Pixi's destroy.
   */
  public destroy() {
    this.app.ticker.remove(this.update);
    super.destroy({ children: true });
  }

  /**
   * Called when the application is paused. Use to halt non-display
   * work — audio, network polling, gameplay timers. Display state
   * stays on screen; only logic should pause.
   *
   * @param config Pause options (e.g. which subsystems to pause).
   */
  public onPause(config: PauseConfig): void {
    void config;
  }

  /**
   * Called when the application resumes from a pause. Use to restart
   * whatever was halted in `onPause`.
   *
   * @param config Resume options.
   */
  public onResume(config: PauseConfig): void {
    void config;
  }
}
