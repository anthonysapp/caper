import type { SceneAssets, SceneDebug, ScenePlugins } from '../display/Scene';
import type { AppTypeOverrides } from './types';

type AppPluginId = AppTypeOverrides['Plugins'];

/**
 * Runtime-free helpers that give scene/plugin/popup/entity config files
 * strong type inference without forcing users to extend base classes or
 * hand-type every file-level export.
 *
 * They are all typed identity functions (`(config) => config`), following
 * the Vite / Rollup / Playwright `defineConfig` pattern. No runtime cost:
 * the vite-plugin-caper-config scanner reads the call's object
 * argument via AST just like it reads individual `export const` forms.
 *
 * Example:
 *
 *   // src/scenes/MenuScene.ts
 *   import { defineScene, Scene } from '@caper-engine/core';
 *   export const scene = defineScene({
 *     id: 'menu',
 *     assets: { preload: { bundles: ['menu'] } },
 *     plugins: ['google-analytics'],
 *   });
 *   export default class MenuScene extends Scene { ... }
 */

/**
 * Scene metadata accepted by `defineScene`. Mirrors the runtime
 * `SceneConfig` in `display/Scene.ts` — reuses the canonical `SceneAssets`
 * / `ScenePlugins` / `SceneDebug` types so there's one source of truth.
 *
 * `id` is required here (unlike the runtime `SceneConfig` where it's
 * optional, because the scene class itself may carry the id).
 */
export interface SceneConfigInput {
  /** Unique scene ID used in `app.scenes.loadScene()`. */
  id: string;
  /** Defaults to `true`. Set `false` to hide from discovery without deleting the file. */
  active?: boolean;
  /** Defaults to `true` (code-split). Set `false` to force a static import. */
  dynamic?: boolean;
  /**
   * Asset load configuration. Uses the canonical `SceneAssets` shape:
   *
   *   { preload: { bundles: [...] }, background: { bundles: [...] }, autoUnload: true }
   */
  assets?: SceneAssets;
  /** Plugin IDs this scene requires. Loaded lazily on scene load. */
  plugins?: ScenePlugins;
  /** Labels used by the debug UI scene picker. */
  debug?: SceneDebug;
}

export interface PluginConfigInput {
  /** Unique plugin ID used in `app.getPlugin(id)`. */
  id: string;
  /** Defaults to `true`. Set `false` to hide from discovery without deleting the file. */
  active?: boolean;
  /** Defaults to `true` (code-split). Set `false` to force a static import. */
  dynamic?: boolean;
  /**
   * Plugin IDs that must be initialized before this one. The framework
   * topologically sorts plugins by `requires` at bootstrap, so the order
   * in `caper.config.ts` doesn't matter — required deps will always
   * `initialize()` (and `postInitialize()`) before any plugin that
   * requires them.
   *
   * Bootstrap fails loudly if a required plugin id isn't registered in
   * `caper.config.ts plugins[]`, or if there's a dependency cycle. The
   * error message includes the fix.
   *
   * Build-time validation also checks `requires` against discovered
   * plugin IDs and warns on typos before you ever run the app.
   */
  requires?: AppPluginId[];
}

export interface PopupConfigInput {
  /** Unique popup ID used in `app.popups.show(id)`. */
  id: string;
  active?: boolean;
  dynamic?: boolean;
}

export interface EntityConfigInput {
  /** Unique entity ID used in `app.entities.create(id)`. */
  id: string;
  active?: boolean;
  dynamic?: boolean;
}

export interface UIConfigInput {
  /** Unique UI element ID used in `this.add.ui(id)`. */
  id: string;
  /** Defaults to `true`. Set `false` to hide from discovery without deleting the file. */
  active?: boolean;
  /** Defaults to `false` (static import). Set `true` to code-split. */
  dynamic?: boolean;
}

export function defineScene<T extends SceneConfigInput>(config: T): T {
  return config;
}

export function definePlugin<T extends PluginConfigInput>(config: T): T {
  return config;
}

export function definePopup<T extends PopupConfigInput>(config: T): T {
  return config;
}

export function defineEntity<T extends EntityConfigInput>(config: T): T {
  return config;
}

export function defineUI<T extends UIConfigInput>(config: T): T {
  return config;
}
