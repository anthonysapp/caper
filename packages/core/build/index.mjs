/**
 * `caper()` — the Vite preset. This is caper's whole build-time surface:
 *
 *     import { defineConfig } from 'vite';
 *     import { caper } from '@caperjs/core/vite';
 *
 *     export default defineConfig({ plugins: [caper()] });
 *
 * and then plain `vite` / `vite build`. Caper contributes nothing except through
 * Vite's own mechanisms, so plugin ordering, config merging and precedence are
 * Vite's rules rather than caper's. The project's config is the only config.
 *
 * See `plan/vite-preset-rework.md` for why this replaced the old
 * `defaultConfig` + `caper build` arrangement.
 */
import { caperPluginList } from '../config/vite.mjs';
import { caperDefaults } from './defaults.mjs';

/**
 * @typedef {object} CaperOptions
 * @property {object} [assets] AssetPack pixi-pipes overrides, deep-merged over
 *   caper's defaults. `false` omits the asset plugins entirely.
 * @property {object} [pwa] vite-plugin-pwa options, merged over caper's PWA
 *   defaults. Absent means no service worker and no web manifest.
 */

/**
 * @param {CaperOptions} [options]
 * @returns {import('vite').PluginOption[]}
 */
export function caper(options = {}) {
  return [
    {
      name: 'caper:defaults',
      config: (userConfig, env) => caperDefaults(userConfig, env),
    },
    ...caperPluginList(options),
  ];
}

export default caper;
