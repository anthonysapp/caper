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
import { logger } from './internal/util.mjs';
import { assetTypesPlugin } from './plugins/assetTypes.mjs';
import { caperConfigPlugin } from './plugins/caperConfig.mjs';
import { caperDevHelperPlugin } from './plugins/devHelper.mjs';
import { entityListPlugin, pluginListPlugin, popupListPlugin, sceneListPlugin, uiListPlugin } from './plugins/lists.mjs';
import { pngFallbackPrunePlugin } from './plugins/pruneFallbacks.mjs';
import { caperPwaPlugins } from './plugins/pwa.mjs';
import { createCaperRuntimePlugin } from './plugins/runtime.mjs';
import { caperSolidPlugin } from './plugins/solid.mjs';
import { createCaperViewportPlugin } from './plugins/viewport.mjs';

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

  // Service workers can't register on Tauri's `tauri://localhost` origin, and
  // the PWA defaults force `base: '/'` — so under the Tauri CLI, skip the
  // plugin (and its runtime registration snippet) entirely rather than ship a
  // dead one.
  const disablePwaForTauri = Boolean(pwa) && Boolean(process.env.TAURI_ENV_PLATFORM);
  if (disablePwaForTauri) {
    logger.info('caper: PWA disabled for this native (Tauri) build; service workers do not work on the tauri:// origin');
  }
  const effectivePwa = disablePwaForTauri ? undefined : pwa;

  return [
    {
      // These must be singletons. A second copy — e.g. a @caperjs plugin
      // package resolving @caperjs/core from its own node_modules — bundles two
      // frameworks: registries register twice ("Plugin with id … already
      // registered") and instanceof/signal identity breaks across the copies.
      name: 'caper:dedupe',
      config: () => ({
        resolve: { dedupe: ['@caperjs/core', 'pixi.js', '@pixi/sound', 'gsap'] },
      }),
    },
    ...(buildFlags.useWasm ? [wasm()] : []),
    createCaperRuntimePlugin({ pwa: effectivePwa }),
    createCaperViewportPlugin(),
    viteStaticCopy({
      // The captions plugin's bitmap font. `silent` matters: without it,
      // vite-plugin-static-copy *throws* when the glob matches nothing, so any
      // install layout that doesn't put caper's source at exactly this path
      // fails the whole build over an optional font.
      silent: true,
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
    // The manifest name reaches build-time validation this way — it is the only
    // place that knows a project overrode it.
    caperConfigPlugin(true, manifestUrl),
    caperDevHelperPlugin(),
    ...(effectivePwa ? caperPwaPlugins(effectivePwa) : []),
  ];
}

/**
 * @typedef {object} CaperOptions
 * @property {object|false} [assets] AssetPack pixi-pipes overrides, deep-merged
 *   over caper's defaults. `false` omits the asset plugins entirely. Set
 *   `pngFallback: true` to keep the png twins a production build otherwise prunes.
 * @property {object} [pwa] vite-plugin-pwa options, merged over caper's PWA
 *   defaults. Absent means no service worker and no web manifest. Two extras are
 *   caper's own: `autoRegister` (default true) and
 *   `update: 'prompt' | 'auto' | 'manual'` (default 'prompt', which shows caper's
 *   DOM update banner; 'auto' reloads the page as soon as a new build lands;
 *   'manual' installs no UI at all and leaves it to the game, which listens to
 *   `app.onPwaUpdateAvailable`).
 * @property {boolean|{include?: string[]}} [solid] Compile `.tsx` with
 *   `@caperjs/solid`'s Solid JSX plugin. Absent or `false` imports nothing.
 *   An object forwards `include` (default `['**\/*.tsx']`).
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
    // Vite awaits promises in the plugins array, so the lazy import stays off
    // `caper()`'s own signature — projects keep writing `plugins: [caper()]`.
    ...(options.solid ? [caperSolidPlugin(options.solid)] : []),
    ...caperPluginList(options),
  ];
}

export default caper;
