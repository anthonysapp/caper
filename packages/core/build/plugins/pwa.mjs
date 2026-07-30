/**
 * PWA support for the `caper()` preset: `caper({ pwa: {} })` should be enough to
 * ship an installable game. Anything a project does set wins over the defaults
 * below.
 *
 * Three halves, really. `caperPwaPlugins()` adds vite-plugin-pwa with caper's
 * defaults merged under the project's options, plus a small companion plugin that
 * fills in the parts only knowable once vite has resolved its config (icons found
 * in `publicDir`, and the precache globs). `pwaRuntimeSnippet()` returns the code
 * that installs `Caper.pwa` — appended to the `caper-runtime` virtual module,
 * which `index.html` already loads.
 *
 * That last part is the fix for the old arrangement: `withPWA()` added a virtual
 * `caper-pwa` rollup input that defined `Caper.pwa.register()`, but nothing ever
 * imported it, so registration never ran and the API was dead. Registering from
 * the runtime also means `injectRegister` defaults to `false` — exactly one thing
 * registers the worker.
 */
import fs from 'node:fs';
import path from 'node:path';
import { VitePWA } from 'vite-plugin-pwa';
import { readAppIdentity } from '../defaults.mjs';

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Deep-merge `overrides` over `base`; arrays and scalars replace. */
function deepMerge(base, overrides) {
  if (!isPlainObject(overrides)) return overrides === undefined ? base : overrides;
  const out = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    out[key] = isPlainObject(value) && isPlainObject(base?.[key]) ? deepMerge(base[key], value) : value;
  }
  return out;
}

/**
 * Icon files a project is likely to already have, in the names the usual
 * favicon generators produce. A web manifest needs a 192 and a 512 to be
 * installable, so finding them automatically is the difference between
 * `pwa: {}` working and quietly producing an uninstallable app.
 */
const ICON_CANDIDATES = [
  { file: 'android-chrome-192x192.png', sizes: '192x192' },
  { file: 'pwa-192x192.png', sizes: '192x192' },
  { file: 'icon-192.png', sizes: '192x192' },
  { file: 'android-chrome-512x512.png', sizes: '512x512' },
  { file: 'pwa-512x512.png', sizes: '512x512' },
  { file: 'icon-512.png', sizes: '512x512' },
];

/**
 * Manifest icon entries for whatever conventional icons exist in `publicDir`.
 * The largest one is repeated as `maskable` so Android doesn't letterbox it.
 */
export function discoverIcons(publicDir) {
  if (!publicDir || !fs.existsSync(publicDir)) return [];

  const icons = [];
  const seen = new Set();
  for (const { file, sizes } of ICON_CANDIDATES) {
    if (seen.has(sizes)) continue;
    if (!fs.existsSync(path.join(publicDir, file))) continue;
    seen.add(sizes);
    icons.push({ src: `/${file}`, sizes, type: 'image/png' });
  }

  const largest = icons.find((icon) => icon.sizes === '512x512');
  if (largest) icons.push({ ...largest, purpose: 'maskable' });

  return icons;
}

/**
 * Precache the shell, runtime-cache the art.
 *
 * A caper game's `public/assets` is usually tens of megabytes, so precaching it
 * would turn "install" into a full download — and workbox would silently skip
 * whatever exceeded its 2MB default anyway. So: precache what's needed to boot
 * (code, icons, fonts, the asset manifest, the `required` bundle, level data) and
 * let everything else land in the cache the first time it's fetched.
 */
function defaultWorkbox() {
  return {
    globPatterns: [
      'index.html',
      'manifest.webmanifest',
      'assets/*.{js,css}',
      'assets/assets.json',
      'assets/caper/**/*',
      'assets/required/**/*.{webp,png,json,woff2,ttf}',
      'assets/splash/**/*.{webp,png}',
      'levels/**/*.json',
      '*.{ico,svg,png}',
    ],
    // A pixi + game bundle clears the 2MiB default on its own.
    maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
    cleanupOutdatedCaches: true,
    navigateFallback: 'index.html',
    runtimeCaching: [
      {
        // Cache-busted filenames make these immutable: first fetch wins, and a
        // new build simply asks for new names.
        urlPattern: /^\/assets\/.*\.(?:webp|png|jpg|json|mp3|ogg|woff2|ttf|atlas|skel|fnt)$/,
        handler: 'CacheFirst',
        options: {
          cacheName: 'caper-assets',
          expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 60 },
          cacheableResponse: { statuses: [0, 200] },
          // Safari streams audio with Range requests, which a plain CacheFirst
          // match would answer with a 200 and break playback.
          rangeRequests: true,
        },
      },
    ],
  };
}

/** Caper's vite-plugin-pwa defaults. */
export function defaultPwaOptions() {
  const app = readAppIdentity();

  return {
    // Root-absolute so the worker's scope and the manifest link don't depend on
    // vite's relative production `base`.
    base: '/',
    registerType: 'autoUpdate',
    // The caper runtime registers the worker (see pwaRuntimeSnippet), so the
    // plugin must not also inject a script for it.
    injectRegister: false,
    selfDestroying: process.env.SW_DESTROY === 'true',
    devOptions: {
      // A service worker in dev serves stale assets from cache, which is a bad
      // time in a project whose assets rebuild on save. Opt in with SW_DEV=true.
      enabled: process.env.SW_DEV === 'true',
      navigateFallback: 'index.html',
      suppressWarnings: true,
    },
    manifest: {
      id: '/',
      name: app.name,
      short_name: app.name,
      description: app.description,
      start_url: '/',
      scope: '/',
      theme_color: '#000000',
      background_color: '#000000',
      display: 'fullscreen',
      display_override: ['fullscreen', 'standalone', 'minimal-ui'],
      orientation: 'any',
      categories: ['games', 'entertainment'],
    },
    workbox: defaultWorkbox(),
  };
}

/**
 * Fills the defaults that need vite's resolved config. Mutates the same options
 * object handed to `VitePWA` above, which reads it later (at build time) — doing
 * this here rather than at construction means it follows `publicDir` and
 * `--root`, instead of guessing from `process.cwd()`.
 */
function caperPwaDefaultsPlugin(options, projectSetIcons) {
  return {
    name: 'caper:pwa-defaults',
    configResolved: {
      // Must beat vite-plugin-pwa, which snapshots its options in its own
      // configResolved — mutating after that has no effect on the manifest.
      order: 'pre',
      handler(config) {
        if (projectSetIcons) return;

        const icons = discoverIcons(config.publicDir);
        if (icons.length) {
          options.manifest.icons = icons;
        } else {
          config.logger.warn(
            '[caper] pwa: no icons found in publicDir — the app will not be installable. ' +
              'Add android-chrome-192x192.png and android-chrome-512x512.png, or set pwa.manifest.icons.',
          );
        }
      },
    },
  };
}

/**
 * @param {object} pwa Project options, merged over `defaultPwaOptions()`.
 * @returns {import('vite').PluginOption[]}
 */
export function caperPwaPlugins(pwa) {
  const { autoRegister: _autoRegister, ...projectOptions } = pwa;
  const options = deepMerge(defaultPwaOptions(), projectOptions);
  const projectSetIcons = Boolean(projectOptions.manifest?.icons?.length);

  return [caperPwaDefaultsPlugin(options, projectSetIcons), VitePWA(options)];
}

/**
 * Code appended to the `caper-runtime` virtual module when PWA is enabled.
 * Installs `Caper.pwa` (the interface declared in `src/core/create.ts`) and, by
 * default, registers the worker.
 *
 * The handlers are read off `Caper.pwa` at call time rather than captured, so an
 * app can assign `Caper.pwa.onNeedRefresh` after boot and still have it fire.
 */
export function pwaRuntimeSnippet({ autoRegister = true } = {}) {
  return `
          import { pwaInfo } from 'virtual:pwa-info';
          import { registerSW } from 'virtual:pwa-register';

          (globalThis).Caper.pwa = {
            info: pwaInfo,
            onRegisteredSW(swScriptUrl) {
              console.log('Caper PWA: service worker registered:', swScriptUrl);
            },
            offlineReady() {
              console.log('Caper PWA: ready to work offline');
            },
            register() {
              registerSW({
                immediate: true,
                onRegisteredSW(swScriptUrl) {
                  (globalThis).Caper.pwa.onRegisteredSW?.(swScriptUrl);
                },
                onOfflineReady() {
                  (globalThis).Caper.pwa.offlineReady?.();
                },
                onNeedRefresh() {
                  (globalThis).Caper.pwa.onNeedRefresh?.();
                },
                onRegisterError(error) {
                  (globalThis).Caper.pwa.onRegisterError?.(error);
                },
              });
            },
          };

          ${autoRegister ? '(globalThis).Caper.pwa.register();' : '// autoRegister: false — the app calls Caper.pwa.register()'}
  `;
}
