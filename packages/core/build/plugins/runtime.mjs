/**
 * The `caper-runtime` virtual module: the entry the framework injects into
 * index.html so an app needs no hand-written `src/index.ts` that only exists to
 * import it.
 *
 * It installs the `Caper` global, hands the discovered scene/plugin/popup/entity
 * /ui lists over, then boots the application from `virtual:caper-config`. When the
 * preset was given a `pwa` option, the PWA runtime is appended here too — that is
 * what makes `Caper.pwa` real, rather than the never-imported entry it used to
 * live in.
 */
import { pwaRuntimeSnippet } from './pwa.mjs';

export function createCaperRuntimePlugin({ pwa } = {}) {
  const virtualModuleId = 'caper-runtime';
  const resolvedVirtualModuleId = '\0' + virtualModuleId;

  return {
    name: 'vite-plugin-caper-runtime',
    enforce: 'pre',
    // Auto-inject the runtime entry so apps don't need a hand-written
    // `src/index.ts` that just does `import('caper-runtime')`. Legacy HTML that
    // already references the runtime (or a src/index.(ts|js) entry) is left
    // untouched so existing apps keep working.
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const referencesRuntime = html.includes('caper-runtime');
        const referencesLegacyEntry = /<script[^>]*\bsrc=["'][^"']*src\/index\.(ts|js)["']/.test(html);
        if (referencesRuntime || referencesLegacyEntry) {
          return html;
        }
        return {
          html,
          tags: [
            {
              tag: 'script',
              attrs: { type: 'module' },
              children: 'import("caper-runtime");',
              injectTo: 'body',
            },
          ],
        };
      },
    },
    resolveId(id) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId;
      }
    },
    load(id) {
      if (id === resolvedVirtualModuleId) {
        return `
          import { pluginsList } from 'virtual:caper-plugins';
          import { sceneList } from 'virtual:caper-scenes';
          import { popupList } from 'virtual:caper-popups';
          import { entityList } from 'virtual:caper-entities';
          import { uiList } from 'virtual:caper-uis';
          import { create, signalCaperReady, installCaperGlobal } from '@caperjs/core';

          (globalThis).Caper = (globalThis).Caper || {};

          // Install Caper.apps / Caper.ready() / Caper.automation immediately
          // so automation drivers can await Caper.ready() before boot finishes.
          installCaperGlobal();

          try {
            (globalThis).Caper.APP_NAME = __CAPER_APP_NAME;
            (globalThis).Caper.APP_VERSION = __CAPER_APP_VERSION;
          } catch (e) {
            console.error('Failed to set app name and version', e);
          }

          (globalThis).Caper.sceneList = sceneList;
          (globalThis).Caper.pluginsList = pluginsList;
          (globalThis).Caper.popupList = popupList;
          (globalThis).Caper.entityList = entityList;
          (globalThis).Caper.uiList = uiList;

          (globalThis).Caper.sceneIds = sceneList.map((scene) => scene.id);
          (globalThis).Caper.pluginIds = pluginsList.map((plugin) => plugin.id);
          (globalThis).Caper.popupIds = popupList.map((popup) => popup.id);
          (globalThis).Caper.entityIds = entityList.map((entity) => entity.id);
          (globalThis).Caper.uiIds = uiList.map((ui) => ui.id);

          (globalThis).Caper.get = function (key) {
            (globalThis).Caper = (globalThis).Caper || {};
            return key ? (globalThis).Caper[key] : (globalThis).Caper;
          };

          async function bootstrap() {
            const configModule = await import('virtual:caper-config');
            const config = configModule.default;
            (globalThis).Caper.config = config;
            const app = await create(config);
            const mains = import.meta.glob('/src/main.ts', { eager: true });
            const mainPath = Object.keys(mains)[0];

            if (mainPath) {
              const mainModule = mains[mainPath];
              if (mainModule && typeof mainModule.default === 'function') {
                await mainModule.default(app);
              }
            }

            signalCaperReady(app);
          }

          // Pass dev-ness through to the framework. This virtual module is
          // transformed in the CONSUMER app's vite context, so import.meta.env
          // is real here — inside the pre-built framework lib it has already
          // been compiled away, so globals.ts reads Caper.__dev instead.
          (globalThis).Caper.__dev = !!import.meta.env.DEV;

          // Mark this app as managed by the vite runtime so create() does not
          // double-signal readiness, then guard against a double bootstrap.
          // (ES module caching already prevents re-evaluating this id; this is
          // belt-and-braces.)
          (globalThis).Caper.__runtimeManaged = true;
          if (!(globalThis).__CAPER_BOOTSTRAPPED__) {
            (globalThis).__CAPER_BOOTSTRAPPED__ = true;
            bootstrap();
          }
${pwa ? pwaRuntimeSnippet(pwa) : ''}
        `;
      }
    },
  };
}
