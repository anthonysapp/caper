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
import { viteStaticCopy } from 'vite-plugin-static-copy';
import wasm from 'vite-plugin-wasm';
import { assetpackPlugin } from './assetpack.mjs';
import { caperDefaults } from './defaults.mjs';
import { readCaperBuildFlags } from './internal/buildFlags.mjs';
import { assetTypesPlugin } from './plugins/assetTypes.mjs';
import { caperConfigPlugin } from './plugins/caperConfig.mjs';
import { caperDevHelperPlugin } from './plugins/devHelper.mjs';
import { entityListPlugin, pluginListPlugin, popupListPlugin, sceneListPlugin, uiListPlugin } from './plugins/lists.mjs';
import { pngFallbackPrunePlugin } from './plugins/pruneFallbacks.mjs';
import { caperPwaPlugins } from './plugins/pwa.mjs';
import { createCaperRuntimePlugin } from './plugins/runtime.mjs';

const buildFlags = readCaperBuildFlags();

function caperPluginList({ assets = {}, pwa } = {}) {
  // `assets: false` opts out of the asset pipeline entirely — no assetpack run,
  // no generated asset types. Replaces the old `noAssetpackConfig` export.
  const { manifestUrl = 'assets.json', pngFallback = false, ...pipes } = assets === false ? {} : assets;
  const assetPlugins =
    assets === false
      ? []
      : [
          assetpackPlugin(manifestUrl, pipes),
          assetTypesPlugin(manifestUrl),
          // Production ships webp only unless the project asks for the fallback.
          ...(pngFallback ? [] : [pngFallbackPrunePlugin({ manifestUrl })]),
        ];

  return [
    ...(buildFlags.useWasm ? [wasm()] : []),
    createCaperRuntimePlugin({ pwa }),
    viteStaticCopy({
      targets: [
        {
          src: './node_modules/@caperjs/core/src/plugins/captions/font/*.*',
          dest: './assets/caper/font',
        },
      ],
    }),
    pluginListPlugin(),
    sceneListPlugin(),
    popupListPlugin(),
    entityListPlugin(),
    uiListPlugin(),
    ...assetPlugins,
    caperConfigPlugin(),
    caperDevHelperPlugin(),
    ...(pwa ? caperPwaPlugins(pwa) : []),
  ];
}

/**
 * @typedef {object} CaperOptions
 * @property {object|false} [assets] AssetPack pixi-pipes overrides, deep-merged
 *   over caper's defaults. `false` omits the asset plugins entirely. Set
 *   `pngFallback: true` to keep the png twins a production build otherwise prunes.
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
