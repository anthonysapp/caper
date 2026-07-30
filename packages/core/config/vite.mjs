import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseSync } from 'oxc-parser';
import { createLogger, mergeConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import wasm from 'vite-plugin-wasm';
import { z } from 'zod';

// oxc-parser emits an ESTree-compatible AST. We keep the `AST_NODE_TYPES`
// shape so existing call sites don't have to change — every value below is
// just the ESTree node-type string. If you add a new check, reference the
// ESTree spec at https://github.com/estree/estree.
const AST_NODE_TYPES = {
  ArrayExpression: 'ArrayExpression',
  CallExpression: 'CallExpression',
  ClassDeclaration: 'ClassDeclaration',
  ExportDefaultDeclaration: 'ExportDefaultDeclaration',
  ExportNamedDeclaration: 'ExportNamedDeclaration',
  Identifier: 'Identifier',
  ImportDeclaration: 'ImportDeclaration',
  Literal: 'Literal',
  ObjectExpression: 'ObjectExpression',
  Property: 'Property',
  VariableDeclaration: 'VariableDeclaration',
};

/**
 * Thin wrapper around oxc-parser that mirrors the shape we previously got
 * from `@typescript-eslint/typescript-estree`: it returns the `Program`
 * node directly, so `ast.body` / `for (const node of ast.body)` keeps working.
 *
 * Swapping `typescript-estree` (JS-written TS parser, ~500KB, slow) out for
 * oxc-parser (Rust, bundled with Vite 8) was the biggest remaining DX win
 * from the Phase 1b rolldown `PLUGIN_TIMINGS` report: the config/discovery
 * AST parses are the hottest paths in the dev-server startup and HMR.
 */
function parse(content, _options = {}) {
  const result = parseSync('caper-discovery.ts', content, {
    lang: 'ts',
    sourceType: 'module',
  });
  if (result.errors && result.errors.length > 0) {
    const first = result.errors[0];
    const msg = first.message || JSON.stringify(first);
    const err = new Error(`oxc-parser: ${msg}`);
    throw err;
  }
  return result.program;
}

const env = process.env.NODE_ENV;
const cwd = process.cwd();

const logger = createLogger('caper-config');

import { assetpackPlugin } from './assetpack.mjs';
import { pngFallbackPrunePlugin } from '../build/plugins/pruneFallbacks.mjs';
import { caperPwaPlugins, pwaRuntimeSnippet } from '../build/plugins/pwa.mjs';

const DTS_FILE_NAME = 'caper-app.d.ts';
const ASSET_DTS_FILE_NAME = 'caper-assets.d.ts';

/**
 * Strict-fields Zod schema for `caper.config.ts`.
 *
 * Only validates the fields that produce cryptic runtime errors today when
 * they're malformed (wrong type, wrong shape). Everything else is passed
 * through via `.loose()` so the schema doesn't need to stay 1:1 with
 * `IApplicationOptions` — that would be a maintenance trap. Cross-reference
 * validation (`defaultScene` must exist in discovered scenes, `plugins[]`
 * IDs must exist) is deferred to Phase 5 #9 (build-time validation).
 *
 * Validation runs inside the Vite plugin in dev mode only, so Zod never
 * ships to the client bundle.
 */
const pluginConfigSchema = z.union([
  z.string(),
  z.tuple([
    z.string(),
    z
      .object({
        autoLoad: z.boolean().optional(),
        options: z.any().optional(),
      })
      .loose(),
  ]),
]);

const caperConfigSchema = z
  .object({
    id: z.string().min(1).optional(),
    application: z.any().optional(),
    defaultScene: z.string().min(1).optional(),
    defaultSceneLoadMethod: z.string().optional(),
    plugins: z.array(pluginConfigSchema).optional(),
    scenes: z.any().optional(),
    assets: z
      .object({
        manifest: z.any().optional(),
        preload: z
          .object({
            bundles: z.array(z.string()).optional(),
          })
          .loose()
          .optional(),
        background: z
          .object({
            bundles: z.array(z.string()).optional(),
          })
          .loose()
          .optional(),
      })
      .loose()
      .optional(),
    useStore: z.boolean().optional(),
    useSpine: z.boolean().optional(),
    useLayout: z.boolean().optional(),
    useVoiceover: z.boolean().optional(),
    useHash: z.boolean().optional(),
    // Build-time only — read by readCaperBuildFlags(), no runtime effect.
    useWasm: z.boolean().optional(),
    showStats: z.boolean().optional(),
    showSceneDebugMenu: z.boolean().optional(),
    resizeToContainer: z.boolean().optional(),
    logger: z.string().optional(),
    sceneGroupOrder: z.array(z.string()).optional(),
  })
  .loose();

/**
 * Evaluate the user's `caper.config.ts` through Vite's own module
 * graph and validate the default export. Dev-only — requires a live
 * `server` (i.e. `vite dev`). Returns `true` on success.
 */
async function validateCaperConfig(server) {
  if (!server || typeof server.ssrLoadModule !== 'function') return true;
  const configPath = path.resolve(cwd, 'caper.config.ts');
  if (!fs.existsSync(configPath)) return true;

  // caper.config.ts pulls in @caperjs/core, which statically bundles
  // @pixi/sound and GSAP. Both run browser-only top-level side effects
  // during module init, which throw one after another under Vite SSR
  // (Node, no DOM) and abort the whole ssrLoadModule — so config
  // validation silently never runs. Install minimal stubs just for the
  // duration of the load, and only for whichever globals aren't already
  // defined (jsdom, a future Vite DOM environment, etc.).
  //
  // - document.createElement('audio').canPlayType: @pixi/sound's
  //   utils/supported.mjs probes playable formats at module top level.
  // - createElement(...).style: GSAP's CSSPlugin auto-registers at
  //   import time and does `'transform' in tempDiv.style` on a div it
  //   creates via document.createElement — needs a `style` object (any
  //   object satisfies the `in` check; contents are never read here).
  // - globalThis.window: @pixi/sound's WebAudioContext/SoundLibrary
  //   singleton construction reads `window` at module top level.
  const hadDocument = 'document' in globalThis;
  const hadWindow = 'window' in globalThis;
  if (!hadDocument) {
    globalThis.document = {
      createElement: () => ({ canPlayType: () => '', style: {} }),
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  }
  if (!hadWindow) {
    globalThis.window = globalThis;
  }

  let mod;
  try {
    mod = await server.ssrLoadModule(configPath);
  } catch {
    // Config failed to load — the normal type-regen path already surfaces
    // this error through the websocket overlay, so don't double-report.
    return false;
  } finally {
    if (!hadDocument) delete globalThis.document;
    if (!hadWindow) delete globalThis.window;
  }
  const cfg = mod.default;
  if (!cfg) return true;

  const result = caperConfigSchema.safeParse(cfg);
  if (result.success) return true;

  const issues = result.error.issues
    .map((i) => `  - ${i.path.length ? i.path.join('.') : '(root)'}: ${i.message}`)
    .join('\n');
  const message = `Invalid caper.config.ts:\n${issues}`;
  logger.error(`[caper] ${message}`);

  server.ws.send({
    type: 'error',
    err: {
      message,
      id: configPath,
      plugin: 'vite-plugin-caper-config',
    },
  });
  return false;
}

// write a debounce function
const debounce = (func, wait) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Function to generate TypeScript types from the manifest
async function generateAssetTypes(manifest) {
  // Flat totals per category (back-compat: AssetTextures, AssetAudio, etc.)
  const assetsByType = {
    textures: new Set(),
    spritesheets: new Set(),
    tpsFrames: new Set(),
    fonts: new Set(),
    bitmapFonts: new Set(),
    fontFamilies: new Set(),
    bitmapFontFamilies: new Set(),
    audio: new Set(),
    json: new Set(),
    spine: new Set(),
    rive: new Set(),
  };

  // Per-bundle breakdown so we can narrow e.g. AssetTexturesIn<'menu'> → only
  // textures that actually ship in the 'menu' bundle. Shape:
  // byBundle.textures.menu = Set(['menu/logo'])
  const byBundle = {
    textures: {},
    spritesheets: {},
    tpsFrames: {},
    fonts: {},
    bitmapFonts: {},
    audio: {},
    json: {},
    spine: {},
    rive: {},
  };
  const addToBundle = (category, bundleName, alias) => {
    if (!byBundle[category][bundleName]) byBundle[category][bundleName] = new Set();
    byBundle[category][bundleName].add(alias);
  };

  const bundles = manifest.bundles || [];
  const bundleNames = new Set();

  // Process each bundle
  for (const bundle of bundles) {
    bundleNames.add(bundle.name);

    // Process each asset in the bundle
    for (const asset of bundle.assets) {
      const aliases = asset.alias || [];
      const srcs = Array.isArray(asset.src) ? asset.src : [asset.src];
      const firstSrc = srcs[0];
      const ext = path.extname(firstSrc).toLowerCase();

      // Add to appropriate category based on extension and data tags
      if (asset.data?.tags?.tps || (ext === '.json' && firstSrc.includes('sheet'))) {
        aliases.forEach((alias) => {
          assetsByType.spritesheets.add(alias);
          addToBundle('spritesheets', bundle.name, alias);
        });

        // Extract frame names from TPS JSON files
        if (asset.data?.tags?.tps) {
          try {
            // Find the first .json file in the src array
            const jsonSrc = srcs.find((src) => src.endsWith('.json'));
            if (jsonSrc) {
              // Construct the full path to the JSON file
              const jsonPath = path.join(process.cwd(), 'public', 'assets', jsonSrc);

              // Read and parse the JSON file
              const jsonContent = await fs.promises.readFile(jsonPath, 'utf8');
              const tpsData = JSON.parse(jsonContent);

              // Extract frame names from the "frames" object
              if (tpsData.frames) {
                Object.keys(tpsData.frames).forEach((frameName) => {
                  assetsByType.tpsFrames.add(frameName);
                  addToBundle('tpsFrames', bundle.name, frameName);
                });
              }
            }
          } catch (error) {
            logger.warn(`Failed to load TPS frames from ${firstSrc}:`, error.message);
          }
        }
      } else if (ext === '.json' && !firstSrc.includes('atlas')) {
        aliases.forEach((alias) => {
          assetsByType.json.add(alias);
          addToBundle('json', bundle.name, alias);
        });
      } else if (['.png', '.webp', '.jpg', '.jpeg', '.svg'].includes(ext)) {
        aliases.forEach((alias) => {
          assetsByType.textures.add(alias);
          addToBundle('textures', bundle.name, alias);
        });
      } else if (['.mp3', '.ogg', '.wav'].includes(ext)) {
        aliases.forEach((alias) => {
          assetsByType.audio.add(alias);
          addToBundle('audio', bundle.name, alias);
        });
      } else if (['.ttf', '.woff', '.woff2'].includes(ext) || asset.data?.tags?.wf) {
        aliases.forEach((alias) => {
          assetsByType.fonts.add(alias);
          addToBundle('fonts', bundle.name, alias);
        });
        if (asset.data?.family) {
          assetsByType.fontFamilies.add(asset.data.family);
        }
      } else if (['.fnt'].includes(ext)) {
        aliases.forEach((alias) => {
          assetsByType.bitmapFonts.add(alias);
          assetsByType.bitmapFontFamilies.add(alias);
          addToBundle('bitmapFonts', bundle.name, alias);
        });
      } else if (['.atlas', '.skel', '.json'].some((e) => firstSrc.includes(e)) && firstSrc.includes('spine')) {
        aliases.forEach((alias) => {
          assetsByType.spine.add(alias);
          addToBundle('spine', bundle.name, alias);
        });
      } else if (ext === '.riv') {
        aliases.forEach((alias) => {
          assetsByType.rive.add(alias);
          addToBundle('rive', bundle.name, alias);
        });
      }
    }
  }

  // Convert Sets to sorted arrays for consistent output
  const types = Object.fromEntries(Object.entries(assetsByType).map(([key, value]) => [key, [...value].sort()]));

  // Helper to emit a per-bundle mapped type body like:
  //   '\n    menu: \'menu/logo\' | \'menu/bg\';\n    game: \'game/hero\';\n  '
  // Returns `never` if no bundle contains anything in the category.
  const emitByBundleMap = (category) => {
    const entries = Object.entries(byBundle[category])
      .map(([bundleName, set]) => [bundleName, [...set].sort()])
      .filter(([, arr]) => arr.length > 0);
    if (entries.length === 0) return '{}';
    const lines = entries.map(([name, arr]) => `    ${name}: '${arr.join("' | '")}';`);
    return `{\n${lines.join('\n')}\n  }`;
  };

  return `// This file is auto-generated. Do not edit.
import type { ResolvedAsset, Texture, Spritesheet } from 'pixi.js';

/**
 * Available bundle names in the asset manifest
 * @example
 * const bundle: AssetBundles = 'game';
 */
export type AssetBundles = ${[...bundleNames].length ? `\n  | '${[...bundleNames].sort().join("'\n  | '")}'` : 'never'};

/**
 * Available texture names in the asset manifest
 * @example
 * const texture: AssetTextures = 'game/wordmark';
 */
export type AssetTextures = ${types.textures.length ? `\n  | '${types.textures.join("'\n  | '")}'` : 'never'};

/**
 * Per-bundle texture map. Use \`AssetTexturesIn<'menu'>\` to get the exact
 * set of textures shipped in a single bundle, so a scene that only loads
 * the 'menu' bundle can't accidentally reference a 'game/*' texture.
 */
export type AssetTexturesByBundle = ${emitByBundleMap('textures')};
export type AssetTexturesIn<B extends AssetBundles> = B extends keyof AssetTexturesByBundle ? AssetTexturesByBundle[B] : never;

/**
 * Available spritesheet names in the asset manifest
 * @example
 * const spritesheet: AssetSpritesheets = 'game/sheet';
 */
export type AssetSpritesheets = ${types.spritesheets.length ? `\n  | '${types.spritesheets.join("'\n  | '")}'` : 'never'};

export type AssetSpritesheetsByBundle = ${emitByBundleMap('spritesheets')};
export type AssetSpritesheetsIn<B extends AssetBundles> = B extends keyof AssetSpritesheetsByBundle ? AssetSpritesheetsByBundle[B] : never;

/**
 * Available TPS frame names from spritesheets
 * @example
 * const frame: AssetTPSFrames = 'btn/blue';
 */
export type AssetTPSFrames = ${types.tpsFrames.length ? `\n  | '${types.tpsFrames.join("'\n  | '")}'` : 'never'};

export type AssetTPSFramesByBundle = ${emitByBundleMap('tpsFrames')};
export type AssetTPSFramesIn<B extends AssetBundles> = B extends keyof AssetTPSFramesByBundle ? AssetTPSFramesByBundle[B] : never;

/**
 * Available font names in the asset manifest
 * @example
 * const font: AssetFonts = 'SpaceGrotesk-Regular';
 */
export type AssetFonts = ${types.fonts.length ? `\n  | '${types.fonts.join("'\n  | '")}'` : 'never'};

/**
 * Available font names in the asset manifest
 * @example
 * const font: AssetFonts = 'SpaceGrotesk-Regular';
 */
export type AssetBitmapFonts = ${types.bitmapFonts.length ? `\n  | '${types.bitmapFonts.join("'\n  | '")}'` : 'never'};

/**
 * Available audio names in the asset manifest
 * @example
 * const audio: AssetAudio = 'click';
 */
export type AssetAudio = ${types.audio.length ? `\n  | '${types.audio.join("'\n  | '")}'` : 'never'};

export type AssetAudioByBundle = ${emitByBundleMap('audio')};
export type AssetAudioIn<B extends AssetBundles> = B extends keyof AssetAudioByBundle ? AssetAudioByBundle[B] : never;

/**
 * Available JSON file names in the asset manifest
 * @example
 * const json: AssetJson = 'locales/en';
 */
export type AssetJson = ${types.json.length ? `\n  | '${types.json.join("'\n  | '")}'` : 'never'};

/**
 * Available Spine animation names in the asset manifest
 * @example
 * const spine: AssetSpine = 'spine/hero';
 */
export type AssetSpine = ${types.spine.length ? `\n  | '${types.spine.join("'\n  | '")}'` : 'never'};

/**
 * Available Rive animation names in the asset manifest
 * @example
 * const rive: AssetRive = 'static/marty';
 */
export type AssetRive = ${types.rive.length ? `\n  | '${types.rive.join("'\n  | '")}'` : 'never'};

/**
 * Available font family names
 * @example
 * const fontFamily: AssetFontFamilies = 'Space Grotesk';
 */
export type AssetFontFamilies = ${types.fontFamilies.length ? `\n  | '${types.fontFamilies.join("'\n  | '")}'` : 'never'};

/**
 * Available font family names
 * @example
 * const fontFamily: AssetFontFamilies = 'Space Grotesk';
 */
export type AssetBitmapFontFamilies = ${types.bitmapFontFamilies.length ? `\n  | '${types.bitmapFontFamilies.join("'\n  | '")}'` : 'never'};

/**
 * Union type of all asset names
 * @example
 * const asset: AssetAlias = 'game/wordmark';
 */
export type AssetAlias = 
  | AssetTextures 
  | AssetSpritesheets 
  | AssetTPSFrames
  | AssetFonts 
  | AssetBitmapFonts
  | AssetAudio 
  | AssetJson
  | AssetSpine
  | AssetRive;

/**
 * Type-safe manifest structure
 */
export interface AssetManifest {
  bundles: {
    [K in AssetBundles]: {
      name: K;
      assets: ResolvedAsset[];
    }
  };
}

/**
 * Type-safe asset types after loading
 */
export interface AssetTypes {
  textures: Record<AssetTextures, Texture>;
  spritesheets: Record<AssetSpritesheets, Spritesheet>;
  tpsFrames: Record<AssetTPSFrames, Texture>;
  fonts: Record<AssetFonts, any>;
  audio: Record<AssetAudio, HTMLAudioElement>;
  json: Record<AssetJson, any>;
  spine: Record<AssetSpine, any>;
  rive: Record<AssetRive, any>;
  fontFamilies: Record<AssetFontFamilies, any>;
  bitmapFonts: Record<AssetBitmapFonts, any>;
  bitmapFontFamilies: Record<AssetBitmapFontFamilies, any>;
}

/**
 * Helper type to get the asset type for a given alias
 * @example
 * type MyTextureType = AssetTypeOf<'game/wordmark'>; // Texture
 */
export type AssetTypeOf<T extends AssetAlias> = 
  T extends AssetTextures ? Texture :
  T extends AssetSpritesheets ? Spritesheet :
  T extends AssetTPSFrames ? Texture :
  T extends AssetFonts ? any :
  T extends AssetBitmapFonts ? any :
  T extends AssetAudio ? HTMLAudioElement :
  T extends AssetJson ? any :
  T extends AssetSpine ? any :
  T extends AssetRive ? any :
  T extends AssetFontFamilies ? any :
  T extends AssetBitmapFontFamilies ? any :
  never;
  

/**
 * Get the bundle name for a given asset
 * @example
 * type MyBundle = AssetBundleOf<'game/wordmark'>; // 'game'
 */
export type AssetBundleOf<T extends AssetAlias> = Extract<AssetBundles, T extends \`\${infer B}/\${string}\` ? B : never>;

/**
 * Add type overrides to the framework
 */
declare module '@caperjs/core' {
  interface AssetTypeOverrides {
    Texture: AssetTextures;
    TPSFrames: AssetTPSFrames; 
    SpriteSheet: AssetSpritesheets;
    SpineData: AssetSpine;
    Audio: AssetAudio;
    FontFamily: AssetFontFamilies;
    BitmapFontFamily: AssetBitmapFontFamilies;
    Bundles: AssetBundles;
  }
}
`;
}

// Function to write types file
async function writeAssetTypes(manifest, outputDir) {
  const types = await generateAssetTypes(manifest);
  // Change output path to ./src/types/
  const srcTypesDir = path.join(process.cwd(), 'src', 'types');

  try {
    // Ensure the directory exists
    await fs.promises.mkdir(srcTypesDir, { recursive: true });
    const typesPath = path.join(srcTypesDir, ASSET_DTS_FILE_NAME);
    await fs.promises.writeFile(typesPath, types, 'utf8');
    logger.info(`Caper asset types plugin:: Generated types at ${typesPath}`);
  } catch (error) {
    logger.error('Caper asset types plugin:: Error writing types file:', error);
    // Fallback to original location if src folder doesn't exist
    const typesPath = path.join(outputDir, ASSET_DTS_FILE_NAME);
    await fs.promises.writeFile(typesPath, types, 'utf8');
    logger.info(`Caper asset types plugin:: Generated types at fallback location ${typesPath}`);
  }
}

// Asset types generation plugin
export function assetTypesPlugin(manifestUrl = 'assets.json') {
  let viteServer;
  let manifestWatcher;
  let ispPwaEnabled = false;

  async function generate(manifestUrl) {
    try {
      const manifestPath = path.join(process.cwd(), 'public', 'assets', manifestUrl);
      if (!fs.existsSync(manifestPath)) {
        logger.warn(`Caper asset types plugin:: manifest not found at ${manifestPath}, skipping type generation`);
        return;
      }
      const manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf8'));
      await writeAssetTypes(manifest, path.dirname(manifestPath));
      logger.info('Caper asset types plugin:: manifest changed, reloading browser...');
      viteServer?.ws?.send({ type: 'full-reload' });
    } catch (error) {
      logger.error('Caper asset types plugin:: Error handling manifest change:', error);
    }
  }

  const debouncedHandleManifestChange = debounce(generate, 300);

  return {
    name: 'vite-plugin-asset-types',
    config(config) {
      ispPwaEnabled = config.plugins.some((p) => p.name === 'vite-plugin-pwa');
    },
    async buildStart() {
      // a short delay to allow assetpack to generate the manifest
      await delay(500);
      await generate(manifestUrl);
      await delay(500);
    },
    configureServer(server) {
      viteServer = server;

      // Watch for manifest changes in development
      const manifestPath = path.join(process.cwd(), 'public', 'assets', manifestUrl);
      server.watcher.add(manifestPath);
      logger.info(`Caper asset types plugin:: watching manifest at ${manifestPath}`);

      const handleChange = async (file) => {
        if (file === manifestPath) {
          await debouncedHandleManifestChange(manifestUrl);
        }
      };

      server.watcher.on('add', handleChange);
      server.watcher.on('change', handleChange);
    },
    async buildEnd() {
      manifestWatcher?.close();

      // Generate types in build mode as well
      try {
        const manifestPath = path.join(process.cwd(), 'public', 'assets', manifestUrl);
        if (fs.existsSync(manifestPath)) {
          const manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf8'));
          await writeAssetTypes(manifest, path.dirname(manifestPath));
        }
      } catch (error) {
        logger.error('Caper asset types plugin:: Error generating types during build:', error);
      }
      await delay(500);
    },
    async closeBundle() {
      if (ispPwaEnabled && env !== 'development') {
        logger.info('Caper asset types plugin:: PWA enabled, generating types one last time after bundle');
        await generate(manifestUrl);
      }
    },
  };
}

/**
 * Read the assetpack manifest from disk and return the set of bundle names.
 * Returns `null` if the manifest doesn't exist yet — in that case the caller
 * should skip bundle-name validation rather than spam false warnings.
 */
function loadManifestBundleNames(manifestUrl = 'assets.json') {
  const manifestPath = path.join(process.cwd(), 'public', 'assets', manifestUrl);
  if (!fs.existsSync(manifestPath)) return null;
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const names = new Set();
    for (const bundle of manifest.bundles || []) {
      if (bundle?.name) names.add(bundle.name);
    }
    return names;
  } catch (e) {
    logger.warn(`[caper] Could not parse manifest for build-time validation: ${e.message}`);
    return null;
  }
}

/**
 * Extract `defaultScene` string and the `plugins: [...]` id list from an
 * already-parsed `defineConfig({...})` ObjectExpression AST node. Returns
 * `{ defaultScene, pluginIds }` where either may be undefined if absent.
 *
 * Plugin entries can be either a string literal or a tuple literal whose
 * first element is a string literal — anything else (dynamic expressions,
 * spreads, non-literal identifiers) is skipped silently, since we can't
 * statically know the ID.
 */
function extractConfigReferences(configObject) {
  const result = { defaultScene: undefined, pluginIds: [] };
  if (!configObject || configObject.type !== AST_NODE_TYPES.ObjectExpression) return result;

  for (const prop of configObject.properties) {
    if (prop.type !== AST_NODE_TYPES.Property || prop.key?.type !== AST_NODE_TYPES.Identifier) continue;
    if (prop.key.name === 'defaultScene' && prop.value?.type === AST_NODE_TYPES.Literal) {
      result.defaultScene = prop.value.value;
    }
    if (prop.key.name === 'plugins' && prop.value?.type === AST_NODE_TYPES.ArrayExpression) {
      for (const el of prop.value.elements) {
        if (!el) continue;
        if (el.type === AST_NODE_TYPES.Literal && typeof el.value === 'string') {
          result.pluginIds.push(el.value);
        } else if (el.type === AST_NODE_TYPES.ArrayExpression && el.elements[0]?.type === AST_NODE_TYPES.Literal) {
          const first = el.elements[0];
          if (typeof first.value === 'string') result.pluginIds.push(first.value);
        }
      }
    }
  }
  return result;
}

/**
 * Locate the `defineConfig({...})` ObjectExpression in a parsed
 * `caper.config.ts` AST. Handles both the default-export form
 * (`export default defineConfig({...})`) and the named-const form
 * (`export const config = defineConfig({...})`).
 */
function findConfigObject(ast) {
  let configObject;
  for (const node of ast.body) {
    if (
      node.type === AST_NODE_TYPES.ExportDefaultDeclaration &&
      node.declaration?.type === AST_NODE_TYPES.CallExpression &&
      node.declaration.callee?.name === 'defineConfig'
    ) {
      configObject = node.declaration.arguments[0];
    } else if (
      node.type === AST_NODE_TYPES.ExportNamedDeclaration &&
      node.declaration?.type === AST_NODE_TYPES.VariableDeclaration
    ) {
      const decl = node.declaration.declarations.find(
        (d) => d.init?.type === AST_NODE_TYPES.CallExpression && d.init.callee?.name === 'defineConfig',
      );
      if (decl) configObject = decl.init.arguments[0];
    }
  }
  return configObject;
}

/**
 * Boolean build-time flags read straight out of `caper.config.ts`.
 *
 * Vite fixes a config's plugin list the moment the config object is created — no
 * plugin hook can add one later, and `caper()` runs while the project's
 * vite.config is still being evaluated, long before anything could execute
 * caper.config.ts. So these are pulled with the same oxc AST parse discovery
 * already uses rather than by importing the file: importing pulls in
 * @caperjs/core, whose @pixi/sound + GSAP deps run
 * browser-only top-level side effects that throw under Node (see
 * `validateCaperConfig` for the gory details).
 *
 * Only boolean literals are honoured. A missing, empty, or unparseable
 * config silently yields the defaults — this runs before the normal config
 * error reporting, so it must never be the thing that fails the build.
 */
function readCaperBuildFlags() {
  const flags = { useWasm: false };
  const configPath = path.resolve(cwd, 'caper.config.ts');
  if (!fs.existsSync(configPath)) return flags;

  let configObject;
  try {
    configObject = findConfigObject(parse(fs.readFileSync(configPath, 'utf-8')));
  } catch {
    return flags;
  }
  if (configObject?.type !== AST_NODE_TYPES.ObjectExpression) return flags;

  for (const prop of configObject.properties) {
    if (prop.type !== AST_NODE_TYPES.Property || prop.key?.type !== AST_NODE_TYPES.Identifier) continue;
    if (!(prop.key.name in flags)) continue;
    if (prop.value?.type === AST_NODE_TYPES.Literal && typeof prop.value.value === 'boolean') {
      flags[prop.key.name] = prop.value.value;
    }
  }
  return flags;
}

/**
 * Cross-reference validation over discovered scenes/plugins/popups/entities
 * + the parsed `caper.config.ts` AST + the assetpack manifest. Emits
 * warnings via the project logger; in dev mode also forwards warnings to
 * the browser error overlay as info so they're impossible to miss.
 *
 * Checks:
 *  1. Scene `assets.preload.bundles` / `assets.background.bundles` entries
 *     exist in the assetpack manifest.
 *  2. Plugin IDs in `caper.config.ts` match a discovered plugin
 *     (npm `@caperjs/plugin-*` OR local `src/plugins/*`).
 *  3. `defaultScene` in `caper.config.ts` matches a discovered scene ID.
 *  4. No duplicate scene / plugin / popup / entity IDs across discovery.
 *
 * All issues are warnings, not errors — they shouldn't fail the build
 * (typos are a dev-time problem; the runtime will still start, just with
 * broken references the user needs to see).
 */
function runBuildTimeValidation({
  server,
  configPath,
  configObject,
  scenes,
  plugins,
  popups,
  entities,
  breakpointsName,
}) {
  const warnings = [];
  const bundleNames = loadManifestBundleNames();

  // 1. Scene bundle references
  if (bundleNames && bundleNames.size > 0) {
    for (const scene of scenes) {
      for (const kind of ['preload', 'background']) {
        const bundlesField = scene.assets?.[kind]?.bundles;
        if (!bundlesField) continue;
        const list = Array.isArray(bundlesField) ? bundlesField : [bundlesField];
        for (const bundle of list) {
          if (typeof bundle !== 'string') continue;
          if (!bundleNames.has(bundle)) {
            warnings.push(
              `Scene '${scene.id}' references ${kind} bundle '${bundle}' which is not in the assetpack manifest. ` +
                `Known bundles: ${[...bundleNames].join(', ') || '(none)'}.`,
            );
          }
        }
      }
    }
  }

  // 2 + 3. caper.config.ts cross-references
  const { defaultScene, pluginIds: configPluginIds } = extractConfigReferences(configObject);
  const discoveredPluginIds = new Set(plugins.map((p) => p.id));
  const discoveredSceneIds = new Set(scenes.map((s) => s.id));

  for (const id of configPluginIds) {
    if (!discoveredPluginIds.has(id)) {
      warnings.push(
        `caper.config.ts references plugin '${id}' which was not discovered. ` +
          `Known plugin IDs: ${[...discoveredPluginIds].join(', ') || '(none)'}.`,
      );
    }
  }
  if (defaultScene && !discoveredSceneIds.has(defaultScene)) {
    warnings.push(
      `caper.config.ts defaultScene is '${defaultScene}' but no scene with that id was discovered. ` +
        `Known scene IDs: ${[...discoveredSceneIds].join(', ') || '(none)'}.`,
    );
  }

  // 4. Plugin `requires` cross-references (local plugins only — npm
  // plugins can declare requires on the class itself, which the runtime
  // topo-sort handles, but the AST can't see).
  for (const p of plugins) {
    if (!p.isLocal || !Array.isArray(p.requires) || p.requires.length === 0) continue;
    for (const req of p.requires) {
      if (!discoveredPluginIds.has(req)) {
        warnings.push(
          `Plugin '${p.id}' requires '${req}' which is not a discovered plugin. ` +
            `Known plugin IDs: ${[...discoveredPluginIds].join(', ') || '(none)'}.`,
        );
      }
    }
  }

  // 4b. Plugin `requires` cycle detection (build-time, so the dev sees the
  // cycle in the terminal/overlay before bootstrap even tries to run).
  const cycleEdges = new Map();
  for (const p of plugins) {
    cycleEdges.set(
      p.id,
      (p.requires ?? []).filter((r) => discoveredPluginIds.has(r)),
    );
  }
  const cycle = detectCycle(cycleEdges);
  if (cycle) {
    warnings.push(`Plugin dependency cycle: ${cycle.join(' → ')}`);
  }

  // 5. Duplicate-id detection
  const checkDuplicates = (label, list) => {
    const seen = new Map();
    for (const item of list) {
      if (seen.has(item.id)) {
        warnings.push(`Duplicate ${label} id '${item.id}' — multiple files export the same id.`);
      } else {
        seen.set(item.id, true);
      }
    }
  };
  checkDuplicates('scene', scenes);
  checkDuplicates('plugin', plugins);
  checkDuplicates('popup', popups);
  checkDuplicates('entity', entities);

  // 6. Breakpoints declared in config but not via defineBreakpoints() — the
  // names will work at runtime but get no intellisense.
  if (!breakpointsName && configObject?.type === AST_NODE_TYPES.ObjectExpression) {
    const hasKey = configObject.properties.some(
      (p) => p.type === AST_NODE_TYPES.Property && p.key?.name === 'breakpoints',
    );
    if (hasKey) {
      warnings.push(
        `caper.config.ts sets \`breakpoints\` but no \`defineBreakpoints()\` export was found — breakpoint names will not be type-checked. Wrap the object: \`export const breakpoints = defineBreakpoints({ ... })\`.`,
      );
    }
  }

  if (warnings.length === 0) return;

  for (const msg of warnings) {
    // Vite's createLogger is suppressed inside the dts plugin chain during
    // builds, so go straight to console.warn — yellow ANSI so it stands out
    // amid Vite's own output.
    console.warn(`\x1b[33m[caper] ${msg}\x1b[0m`);
  }

  if (server?.ws) {
    // Surface the first warning in the browser overlay so a dev in the
    // tab notices. Subsequent ones are in the terminal — don't spam the
    // overlay with a stack of them.
    server.ws.send({
      type: 'error',
      err: {
        message:
          `caper build-time validation (${warnings.length} warning${warnings.length === 1 ? '' : 's'}):\n` +
          warnings.map((w) => '  • ' + w).join('\n'),
        id: configPath,
        plugin: 'vite-plugin-caper-config',
      },
    });
  }
}

/**
 * DFS-based cycle detection over a `Map<id, dependencyIds[]>` graph.
 * Returns the cycle path (e.g. `['A','B','A']`) on the first cycle found,
 * or `null` if the graph is acyclic. Used by build-time validation so a
 * plugin requires-cycle surfaces in the terminal before bootstrap runs.
 */
function detectCycle(edges) {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map();
  for (const id of edges.keys()) color.set(id, WHITE);
  const stack = [];

  function visit(id) {
    if (color.get(id) === GRAY) {
      const startIdx = stack.indexOf(id);
      return [...stack.slice(startIdx), id];
    }
    if (color.get(id) === BLACK) return null;
    color.set(id, GRAY);
    stack.push(id);
    for (const dep of edges.get(id) ?? []) {
      const found = visit(dep);
      if (found) return found;
    }
    stack.pop();
    color.set(id, BLACK);
    return null;
  }

  for (const id of edges.keys()) {
    const found = visit(id);
    if (found) return found;
  }
  return null;
}

function caperConfigPlugin(isProject = true) {
  const virtualModuleId = 'virtual:caper-config';
  const resolvedVirtualModuleId = '\0' + virtualModuleId;

  async function generateTypes(server) {
    if (!isProject) return { types: 'export {}' };

    const configPath = path.resolve(cwd, 'caper.config.ts');

    let ast;
    try {
      const content = await fs.promises.readFile(configPath, 'utf-8');
      if (!content.trim()) {
        // This can happen during file saves, where the file is temporarily empty.
        return { types: '/* caper.config.ts is empty, skipping augmentation. */' };
      }
      ast = parse(content, { jsx: false });
    } catch (e) {
      if (e.code === 'ENOENT') {
        // This can happen during file saves that do a delete/recreate.
        return { types: '/* caper.config.ts not found, skipping augmentation. */' };
      }
      logger.error(`[caper] Error parsing caper.config.ts: ${e.message}`);
      if (e.stack) {
        logger.error(e.stack);
      }
      return {
        types: '/* Error parsing caper.config.ts, skipping augmentation. See console for details. */',
        error: e,
      };
    }

    let appClassName = 'Application';
    let appImportPath = '@caperjs/core';
    let dataTypeName = 'Record<string, any>';
    let dataSchemaName = '';
    let hasActions = false;
    let hasContexts = false;
    let breakpointsName = '';

    let configObject;

    for (const node of ast.body) {
      if (
        node.type === AST_NODE_TYPES.ExportNamedDeclaration &&
        node.declaration?.type === AST_NODE_TYPES.VariableDeclaration
      ) {
        // Find data schema
        const dataDecl = node.declaration.declarations.find(
          (d) => d.init?.type === AST_NODE_TYPES.CallExpression && d.init.callee.name === 'defineData',
        );
        if (dataDecl && dataDecl.id.type === AST_NODE_TYPES.Identifier) {
          dataSchemaName = dataDecl.id.name;
          dataTypeName = `typeof ${dataSchemaName}`;
        }

        // Find breakpoints (detect by callee, like defineData — more robust
        // than matching on the variable name).
        const bpDecl = node.declaration.declarations.find(
          (d) => d.init?.type === AST_NODE_TYPES.CallExpression && d.init.callee.name === 'defineBreakpoints',
        );
        if (bpDecl && bpDecl.id.type === AST_NODE_TYPES.Identifier) {
          breakpointsName = bpDecl.id.name;
        }

        // Find actions
        if (node.declaration.declarations.some((d) => d.id.name === 'actions')) {
          hasActions = true;
        }

        // Find contexts
        if (node.declaration.declarations.some((d) => d.id.name === 'contexts')) {
          hasContexts = true;
        }

        // Find defineConfig to get application class
        const configDecl = node.declaration.declarations.find(
          (d) => d.init?.type === AST_NODE_TYPES.CallExpression && d.init.callee.name === 'defineConfig',
        );
        if (configDecl?.init.type === AST_NODE_TYPES.CallExpression) {
          configObject = configDecl.init.arguments[0];
        }
      } else if (
        node.type === AST_NODE_TYPES.ExportDefaultDeclaration &&
        node.declaration.type === AST_NODE_TYPES.CallExpression &&
        node.declaration.callee.name === 'defineConfig'
      ) {
        configObject = node.declaration.arguments[0];
      }
    }

    if (configObject?.type === AST_NODE_TYPES.ObjectExpression) {
      const appProperty = configObject.properties.find(
        (p) =>
          p.type === AST_NODE_TYPES.Property &&
          p.key.name === 'application' &&
          p.value.type === AST_NODE_TYPES.Identifier,
      );

      if (appProperty) {
        const importedAppName = appProperty.value.name;
        const importDecl = ast.body.find(
          (n) =>
            n.type === AST_NODE_TYPES.ImportDeclaration && n.specifiers.some((s) => s.local.name === importedAppName),
        );
        if (importDecl) {
          appClassName = importedAppName;
          appImportPath = importDecl.source.value;
        }
      }
    }

    // Discover scenes, plugins, popups, entities, and locale keys.
    const scenes = await discoverScenes(server);
    const plugins = await discoverPlugins(server);
    const popups = await discoverPopups(server);
    const entities = await discoverEntities(server);
    const uis = await discoverUIs(server);
    const localeKeys = await discoverLocaleKeys(server);

    const sceneIds = scenes.filter((s) => s.active !== false).map((s) => s.id);
    const pluginIds = plugins.filter((p) => p.active !== false).map((p) => p.id);
    const popupIds = popups.filter((p) => p.active !== false).map((p) => p.id);
    const entityIds = entities.filter((e) => e.active !== false).map((e) => e.id);
    const uiIds = uis.filter((u) => u.active !== false).map((u) => u.id);

    // Build-time cross-reference validation. Warnings for typos that would
    // silently fail at runtime (missing bundles, unknown plugin IDs,
    // defaultScene pointing at a non-existent scene, duplicate IDs).
    runBuildTimeValidation({
      server,
      configPath,
      configObject,
      scenes,
      plugins,
      popups,
      entities,
      breakpointsName,
    });

    const sceneIdType = sceneIds.length > 0 ? `\n  | '${sceneIds.join("'\n  | '")}'` : 'string';
    const pluginIdType = pluginIds.length > 0 ? `\n  | '${pluginIds.join("'\n  | '")}'` : 'string';
    const popupIdType = popupIds.length > 0 ? `\n  | '${popupIds.join("'\n  | '")}'` : 'string';
    const entityIdType = entityIds.length > 0 ? `\n  | '${entityIds.join("'\n  | '")}'` : 'string';
    const uiIdType = uiIds.length > 0 ? `\n  | '${uiIds.join("'\n  | '")}'` : 'string';
    const localeKeyType = localeKeys.length > 0 ? `\n  | '${localeKeys.join("'\n  | '")}'` : 'string';

    // Emit a keyed `{ id: typeof import('...').default }` map for each of
    // scenes/popups/entities so the framework can derive typed constructor
    // props via `ConstructorParameters<...>[0]` / `InstanceType<...>` at call
    // sites (`this.add.entity(id, props)` etc). Uses the `@/` alias path the
    // discovery already emits — the generated .d.ts lives inside the user's
    // project so tsconfig `paths` applies.
    const buildClassMap = (items) => {
      const active = items.filter((i) => i.active !== false && i.importPath);
      if (active.length === 0) return '  [id: string]: never;';
      return active
        .map((item) => `  ${JSON.stringify(item.id)}: typeof import('${item.importPath}').default;`)
        .join('\n');
    };

    const sceneClassMap = buildClassMap(scenes);
    const popupClassMap = buildClassMap(popups);
    const entityClassMap = buildClassMap(entities);
    const uiClassMap = buildClassMap(uis);

    const configDir = path.dirname(configPath);
    const dtsDir = path.resolve(configDir, 'src/types');

    let relativeAppPath = appImportPath;
    if (appImportPath.startsWith('.')) {
      relativeAppPath = path.relative(dtsDir, path.resolve(configDir, appImportPath)).replace(/\\/g, '/');
      if (relativeAppPath.endsWith('.ts')) {
        relativeAppPath = relativeAppPath.slice(0, -3);
      }
    }

    const relativeConfigPath = path.relative(dtsDir, configPath).replace(/\\/g, '/').replace(/\.ts$/, '');

    const imports = [];
    if (appClassName === 'Application') {
      imports.push(`import type { Application } from '@caperjs/core';`);
    }
    if (fs.existsSync(configPath)) {
      const configParts = [];
      if (dataSchemaName) {
        configParts.push(dataSchemaName);
      }
      if (hasActions) {
        configParts.push('actions');
      }
      if (hasContexts) {
        configParts.push('contexts');
      }
      if (breakpointsName) {
        configParts.push(breakpointsName);
      }
      if (configParts.length > 0) {
        imports.push(`import type { ${configParts.join(', ')} } from '${relativeConfigPath}';`);
      }
    }
    if (appClassName !== 'Application') {
      imports.push(`import type { ${appClassName} } from '${relativeAppPath}';`);
    }

    return {
      types: `
// This file is auto-generated by caper. Do not edit.
${imports.join('\n')}
// Data
type AppData = ${dataTypeName};

// Action Contexts
${hasContexts ? 'type AppContexts = (typeof contexts)[number];' : 'type AppContexts = string;'}

// Actions
${hasActions ? 'type AppActionMap = typeof actions;' : 'type AppActionMap = Record<string, any>;'}
${hasActions ? 'type AppActions = keyof AppActionMap;' : 'type AppActions = string;'}

// Scenes
type AppScenes = ${sceneIdType};

// Plugins
type AppPlugins = ${pluginIdType};

// Popups
type AppPopups = ${popupIdType};

// Entities
type AppEntities = ${entityIdType};

// UI Elements
type AppUIs = ${uiIdType};

// Class maps — typeof-import pointers to the real discovered classes. The
// framework uses these with ConstructorParameters<> + InstanceType<> + infer
// to derive typed props and return types for this.add.entity / popups.show /
// scenes.load without any AST type extraction.
type AppSceneClasses = {
${sceneClassMap}
};

type AppPopupClasses = {
${popupClassMap}
};

type AppEntityClasses = {
${entityClassMap}
};

type AppUIClasses = {
${uiClassMap}
};

// Locale keys (flattened dot-paths from src/locales/<reference>.ts)
type AppLocaleKeys = ${localeKeyType};${breakpointsName ? `\n\n// Breakpoints\ntype AppBreakpoints = keyof (typeof ${breakpointsName})['tiers'] & string;\ntype AppBreakpointModes = keyof (typeof ${breakpointsName})['modes'] & string;` : ''}

/**
 * Add type overrides to the framework
 */
declare module '@caperjs/core' {
  interface AppTypeOverrides {
    App: ${appClassName};
    Data: AppData;
    Contexts: AppContexts;
    Actions: AppActions;
    ActionMap: AppActionMap;
    Scenes: AppScenes;
    Plugins: AppPlugins;
    Popups: AppPopups;
    Entities: AppEntities;
    SceneClasses: AppSceneClasses;
    PopupClasses: AppPopupClasses;
    EntityClasses: AppEntityClasses;
    UIs: AppUIs;
    UIClasses: AppUIClasses;
    LocaleKeys: AppLocaleKeys;${breakpointsName ? `\n    Breakpoints: AppBreakpoints;\n    BreakpointModes: AppBreakpointModes;` : ''}
    Eases: Eases;
  }
}
`,
    };
  }

  async function build(msg = `Building ${DTS_FILE_NAME}`, server) {
    logger.info(msg);
    const { types, error } = await generateTypes(server);

    if (error) {
      if (server) {
        server.ws.send({
          type: 'error',
          err: {
            message: error.message,
            stack: error.stack,
            id: path.resolve(cwd, 'caper.config.ts'),
            plugin: 'vite-plugin-caper-config',
          },
        });
      }
      return;
    }

    const typesDir = path.resolve(cwd, 'src/types');
    await fs.promises.mkdir(typesDir, { recursive: true });
    await fs.promises.writeFile(path.join(typesDir, DTS_FILE_NAME), types, 'utf-8');

    // Dev-only: evaluate + validate the user's config through Vite's SSR
    // module graph. Failures surface in the overlay with file:line detail.
    // Prod builds skip this (no server).
    if (server) {
      await validateCaperConfig(server);
      server.ws.send({ type: 'full-reload' });
    }
  }

  return {
    name: 'vite-plugin-caper-config',
    enforce: 'pre',
    resolveId(id) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId;
      }
    },
    async load(id) {
      if (id === resolvedVirtualModuleId) {
        return `
          const configModule = await import('/caper.config.ts');
          export default configModule.default;
        `;
      }
    },
    async buildStart() {
      if (!isProject) return;
      await build('Generating types from caper.config.ts');
    },
    configureServer(server) {
      if (!isProject) return;

      const configPath = path.resolve(cwd, 'caper.config.ts');
      const scenesDir = path.resolve(cwd, 'src/scenes');
      const pluginsDir = path.resolve(cwd, 'src/plugins');
      const popupsDir = path.resolve(cwd, 'src/popups');
      const entitiesDir = path.resolve(cwd, 'src/entities');
      const localesDir = path.resolve(cwd, 'src/locales');

      const handleFileChange = async (file) => {
        const isScene = file.startsWith(scenesDir);
        const isPlugin = file.startsWith(pluginsDir);
        const isPopup = file.startsWith(popupsDir);
        const isEntity = file.startsWith(entitiesDir);
        const isLocale = file.startsWith(localesDir);
        const isConfig = file === configPath;

        if (!isScene && !isPlugin && !isPopup && !isEntity && !isLocale && !isConfig) return;

        const msg = isScene
          ? 'Scene file changed'
          : isPlugin
            ? 'Plugin file changed'
            : isPopup
              ? 'Popup file changed'
              : isEntity
                ? 'Entity file changed'
                : isLocale
                  ? 'Locale file changed'
                  : 'Config file changed';
        await build(`${msg}, regenerating types...`, server);
      };

      server.watcher.add(configPath);
      server.watcher.add(scenesDir);
      server.watcher.add(pluginsDir);
      server.watcher.add(popupsDir);
      server.watcher.add(entitiesDir);
      server.watcher.add(localesDir);

      server.watcher.on('change', handleFileChange);
      server.watcher.on('add', handleFileChange);
      server.watcher.on('unlink', handleFileChange);
    },
  };
}

/** PLUGINS */
/**
 * Walks `src/plugins/` recursively, AST-parses each TypeScript file, and
 * returns a list of local plugin metadata objects.
 *
 *  - requires `export const <name> = definePlugin({...})` — files without
 *    this marker are skipped (so sibling helper modules that incidentally
 *    default-export a class don't get phantom-registered as plugins)
 *  - requires a default-exported class in the file
 *  - honours `export const id`, `export const active`, `export const dynamic`
 *    (also flattened from inside `definePlugin({...})` by findExportedConstants)
 *  - default is dynamic import (code-split), opt out with `dynamic = false`
 *  - plugin ID defaults to exported `id` → class name → filename
 */
async function discoverLocalPlugins(server) {
  const pluginsDir = path.resolve(process.cwd(), 'src/plugins');
  const plugins = [];

  if (!fs.existsSync(pluginsDir)) {
    return [];
  }

  const files = await findTypeScriptFiles(pluginsDir);

  for (const file of files) {
    try {
      const content = await fs.promises.readFile(file, 'utf-8');
      const ast = parse(content, {
        jsx: false,
        loc: true,
        comment: false,
      });

      const hasPluginWrapper = ast.body.some(
        (n) =>
          n.type === AST_NODE_TYPES.ExportNamedDeclaration &&
          n.declaration?.type === AST_NODE_TYPES.VariableDeclaration &&
          n.declaration.declarations.some(
            (d) => d.init?.type === AST_NODE_TYPES.CallExpression && d.init.callee?.name === 'definePlugin',
          ),
      );
      if (!hasPluginWrapper) continue;

      const pluginClass = findDefaultExportedClass(ast);
      if (!pluginClass) continue;

      const exports = findExportedConstants(ast);

      const relativePath = file.replace(process.cwd(), '').replace(/\\/g, '/').split('/src')[1];
      const importPath = `@${relativePath.replace(/\.ts$/, '')}`;
      const id = exports.id || pluginClass.id?.name || path.basename(file, '.ts');
      const name = pluginClass.id?.name || id;

      plugins.push({
        id,
        name,
        isLocal: true,
        importPath,
        module:
          exports.dynamic === false
            ? importPath
            : {
                toString: () => `() => import('${importPath}')`,
                isFunction: true,
              },
        active: exports.active === false ? false : true,
        requires: Array.isArray(exports.requires) ? exports.requires.filter((r) => typeof r === 'string') : [],
      });
    } catch (e) {
      const errorMessage = `Error parsing plugin file ${file}: ${e.message}`;
      logger.error(errorMessage);
      if (e.stack) {
        logger.error(e.stack);
      }
      if (server) {
        server.ws.send({
          type: 'error',
          err: {
            message: e.message,
            stack: e.stack,
            id: file,
            plugin: 'vite-plugin-plugins',
          },
        });
      }
    }
  }

  return plugins;
}

/**
 * Discovers npm packages prefixed with `@caperjs/plugin-` in the host
 * project's `package.json`. Always emitted as dynamic imports.
 */
function discoverNpmPlugins() {
  const packageJsonPath = path.resolve(process.cwd(), 'package.json');
  if (!fs.existsSync(packageJsonPath)) return [];

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  const allDependencies = {
    ...(packageJson.dependencies || {}),
    ...(packageJson.devDependencies || {}),
  };

  return Object.keys(allDependencies)
    .filter((dep) => dep.startsWith('@caperjs/plugin-'))
    .map((packageName) => {
      const id = packageName.replace('@caperjs/plugin-', '');
      return {
        id,
        name: packageName,
        isLocal: false,
        importPath: packageName,
        module: {
          toString: () => `() => import('${packageName}')`,
          isFunction: true,
        },
        active: true,
        // npm plugins can declare `requires` on the class itself
        // (`public readonly requires = ['firebase']`); the runtime topo-sort
        // reads from the live instance, so empty here is fine.
        requires: [],
      };
    });
}

async function discoverPlugins(server) {
  const [local, npm] = [await discoverLocalPlugins(server), discoverNpmPlugins()];
  return [...npm, ...local];
}

/**
 * Generic recursive-class-file discoverer. Walks a directory, AST-parses
 * each .ts file, requires a default-exported class, and reads `id` /
 * `active` / `dynamic` metadata (either from individual exports or a
 * `defineX({...})` wrapper). Used for popups and entities — same shape
 * as scenes/plugins minus the npm-package discovery path.
 *
 * `defaultDynamic` sets the emit mode when a file doesn't declare it
 * explicitly. Entities default to `false` (static import) because the
 * typed `this.add.entity(id, props)` factory needs sync access to the
 * constructor; popups default to `true` because `show()` is async.
 */
async function discoverLocalClassFiles({ dir, kind, server, defaultDynamic = true }) {
  const rootDir = path.resolve(process.cwd(), dir);
  if (!fs.existsSync(rootDir)) return [];

  const files = await findTypeScriptFiles(rootDir);
  const results = [];

  for (const file of files) {
    try {
      const content = await fs.promises.readFile(file, 'utf-8');
      const ast = parse(content);

      const cls = findDefaultExportedClass(ast);
      if (!cls) continue;

      const exports = findExportedConstants(ast);

      const relativePath = file.replace(process.cwd(), '').replace(/\\/g, '/').split('/src')[1];
      const importPath = `@${relativePath.replace(/\.ts$/, '')}`;
      const id = exports.id || cls.id?.name || path.basename(file, '.ts');
      const name = cls.id?.name || id;
      const isDynamic = exports.dynamic !== undefined ? exports.dynamic : defaultDynamic;

      results.push({
        id,
        name,
        importPath,
        module: !isDynamic
          ? importPath
          : {
              toString: () => `() => import('${importPath}')`,
              isFunction: true,
            },
        active: exports.active === false ? false : true,
      });
    } catch (e) {
      const errorMessage = `Error parsing ${kind} file ${file}: ${e.message}`;
      logger.error(errorMessage);
      if (e.stack) logger.error(e.stack);
      if (server) {
        server.ws.send({
          type: 'error',
          err: {
            message: e.message,
            stack: e.stack,
            id: file,
            plugin: `vite-plugin-${kind}s`,
          },
        });
      }
    }
  }

  return results;
}

async function discoverPopups(server) {
  return discoverLocalClassFiles({ dir: 'src/popups', kind: 'popup', server });
}

async function discoverEntities(server) {
  // Entities default to static imports so `this.add.entity(id, props)` can
  // synchronously construct without awaiting a dynamic import. Opt into
  // code-splitting per-entity with `defineEntity({ dynamic: true })`.
  return discoverLocalClassFiles({ dir: 'src/entities', kind: 'entity', server, defaultDynamic: false });
}

async function discoverUIs(server) {
  // UI elements default to static imports so `this.add.ui(id, props)` can
  // synchronously construct. Same rationale as entities.
  return discoverLocalClassFiles({ dir: 'src/ui', kind: 'ui', server, defaultDynamic: false });
}

/**
 * Factory for `virtual:caper-popups` / `virtual:caper-entities`.
 * Thin wrapper around a discover function that generates the static-import
 * + dynamic-import `() => import(...)` mix, same shape as the scenes/plugins
 * virtual modules.
 */
function createClassListPlugin({ virtualModuleId, discoverFn, exportName, pluginName }) {
  const resolvedVirtualModuleId = '\0' + virtualModuleId;
  let server;

  const extractClassName = (item) => {
    const basename = path.basename(item.module);
    return basename.replace(/\.ts$/, '');
  };

  const generate = (items) => {
    const staticItems = items.filter((i) => i.module && !i.module.isFunction);
    const imports = staticItems.map((i) => `import ${extractClassName(i)} from '${i.module}';`);

    return `
    ${imports.join('\n')}
    export const ${exportName} = [
      ${items
        .map((item) => {
          const moduleExpr =
            item.module && !item.module.isFunction
              ? extractClassName(item)
              : (item.module?.toString?.() ?? `() => import('${item.importPath}')`);
          return `{
        id: '${item.id}',
        name: '${item.name}',
        active: ${item.active},
        module: ${moduleExpr}
      }`;
        })
        .join(',\n')}
    ];
  `;
  };

  return {
    name: pluginName,
    configureServer(s) {
      server = s;
    },
    resolveId(id) {
      if (id === virtualModuleId) return resolvedVirtualModuleId;
    },
    async load(id) {
      if (id === resolvedVirtualModuleId) {
        const items = await discoverFn(server);
        return generate(items);
      }
    },
  };
}

export function popupListPlugin(isProject = true) {
  if (!isProject) {
    const virtualModuleId = 'virtual:caper-popups';
    const resolvedVirtualModuleId = '\0' + virtualModuleId;
    return {
      name: 'vite-plugin-popups',
      resolveId: (id) => (id === virtualModuleId ? resolvedVirtualModuleId : undefined),
      load: (id) => (id === resolvedVirtualModuleId ? 'export const popupList = [];' : undefined),
    };
  }
  return createClassListPlugin({
    virtualModuleId: 'virtual:caper-popups',
    discoverFn: discoverPopups,
    exportName: 'popupList',
    pluginName: 'vite-plugin-popups',
  });
}

export function entityListPlugin(isProject = true) {
  if (!isProject) {
    const virtualModuleId = 'virtual:caper-entities';
    const resolvedVirtualModuleId = '\0' + virtualModuleId;
    return {
      name: 'vite-plugin-entities',
      resolveId: (id) => (id === virtualModuleId ? resolvedVirtualModuleId : undefined),
      load: (id) => (id === resolvedVirtualModuleId ? 'export const entityList = [];' : undefined),
    };
  }
  return createClassListPlugin({
    virtualModuleId: 'virtual:caper-entities',
    discoverFn: discoverEntities,
    exportName: 'entityList',
    pluginName: 'vite-plugin-entities',
  });
}

export function uiListPlugin(isProject = true) {
  if (!isProject) {
    const virtualModuleId = 'virtual:caper-uis';
    const resolvedVirtualModuleId = '\0' + virtualModuleId;
    return {
      name: 'vite-plugin-uis',
      resolveId: (id) => (id === virtualModuleId ? resolvedVirtualModuleId : undefined),
      load: (id) => (id === resolvedVirtualModuleId ? 'export const uiList = [];' : undefined),
    };
  }
  return createClassListPlugin({
    virtualModuleId: 'virtual:caper-uis',
    discoverFn: discoverUIs,
    exportName: 'uiList',
    pluginName: 'vite-plugin-uis',
  });
}

/**
 * Walks `src/locales/`, picks a reference locale file (prefers `en.ts`,
 * falls back alphabetically), AST-parses its default-exported object, and
 * flattens every leaf path into a dot-notation key.
 *
 * Given:
 *   export default { foo: 'bar', obj: { nested: 'baz' }, replace: { x: '...' } };
 * Returns:
 *   ['foo', 'obj.nested', 'replace.x']
 *
 * Only string literal leaves are emitted. Arrays, function calls, and other
 * non-object/non-literal expressions are ignored (they can't be typed
 * meaningfully at this layer).
 */
async function discoverLocaleKeys(server) {
  const localesDir = path.resolve(process.cwd(), 'src/locales');
  if (!fs.existsSync(localesDir)) return [];

  const files = (await fs.promises.readdir(localesDir)).filter((f) => /\.ts$/.test(f)).sort();
  if (files.length === 0) return [];

  // Pick the reference file: en.ts if present, else the first alphabetically.
  const referenceFile = files.find((f) => f === 'en.ts') || files[0];
  const filePath = path.join(localesDir, referenceFile);

  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    if (!content.trim()) return [];

    const ast = parse(content);
    const defaultExport = ast.body.find((n) => n.type === AST_NODE_TYPES.ExportDefaultDeclaration);
    if (!defaultExport) return [];

    // Allow either `export default { ... }` or `export default satisfies ...`
    let obj = defaultExport.declaration;
    if (obj && obj.type === 'TSSatisfiesExpression') obj = obj.expression;
    if (!obj || obj.type !== AST_NODE_TYPES.ObjectExpression) return [];

    const keys = [];
    const walk = (node, prefix) => {
      if (node.type !== AST_NODE_TYPES.ObjectExpression) return;
      for (const prop of node.properties) {
        if (prop.type !== AST_NODE_TYPES.Property) continue;
        let name;
        if (prop.key.type === AST_NODE_TYPES.Identifier) name = prop.key.name;
        else if (prop.key.type === AST_NODE_TYPES.Literal) name = String(prop.key.value);
        else continue;
        const dotPath = prefix ? `${prefix}.${name}` : name;
        if (prop.value.type === AST_NODE_TYPES.ObjectExpression) {
          walk(prop.value, dotPath);
        } else if (prop.value.type === AST_NODE_TYPES.Literal) {
          keys.push(dotPath);
        }
      }
    };
    walk(obj, '');
    return keys.sort();
  } catch (e) {
    const errorMessage = `Error parsing locale file ${filePath}: ${e.message}`;
    logger.error(errorMessage);
    if (server) {
      server.ws.send({
        type: 'error',
        err: {
          message: e.message,
          stack: e.stack,
          id: filePath,
          plugin: 'vite-plugin-locales',
        },
      });
    }
    return [];
  }
}

/**
 * Virtual module plugin for `virtual:caper-plugins`. Mirrors
 * `sceneListPlugin`: supports static + dynamic imports per entry, preserves
 * the full metadata shape so consumers can filter by `active` / read IDs.
 */
export function pluginListPlugin(isProject = true) {
  function extractClassName(plugin) {
    // For static (non-function) imports, the module value is the raw import path.
    const basename = path.basename(plugin.module);
    return basename.replace(/\.ts$/, '');
  }

  function generatePluginListModule(plugins) {
    const staticPlugins = plugins.filter((p) => p.module && !p.module.isFunction && p.isLocal);

    // npm static imports would collide on class-name derivation from the pkg
    // path, so only local plugins support `dynamic = false`. npm packages are
    // always dynamic.
    const imports = staticPlugins.map((p) => `import ${extractClassName(p)} from '${p.module}';`);

    return `
    ${imports.join('\n')}
    export const pluginsList = [
      ${plugins
        .map((plugin) => {
          const moduleExpr =
            plugin.module && !plugin.module.isFunction && plugin.isLocal
              ? extractClassName(plugin)
              : (plugin.module?.toString?.() ?? `() => import('${plugin.importPath}')`);
          return `{
        name: '${plugin.name}',
        id: '${plugin.id}',
        isLocal: ${plugin.isLocal},
        active: ${plugin.active},
        requires: ${JSON.stringify(plugin.requires || [])},
        module: ${moduleExpr}
      }`;
        })
        .join(',\n')}
    ];
  `;
  }

  const virtualModuleId = 'virtual:caper-plugins';
  const resolvedVirtualModuleId = '\0' + virtualModuleId;

  let server;

  return {
    name: 'vite-plugin-plugins',
    configureServer(s) {
      server = s;
    },
    resolveId(id) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId;
      }
    },
    async load(id) {
      if (id === resolvedVirtualModuleId) {
        const plugins = isProject ? await discoverPlugins(server) : [];
        return generatePluginListModule(plugins);
      }
    },
  };
}

// scene list plugin
async function findTypeScriptFiles(dir) {
  const files = [];

  async function scan(directory) {
    const entries = await fs.promises.readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        await scan(fullPath);
      } else if (entry.isFile() && /\.ts?$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  await scan(dir);
  return files;
}

// Callees whose single argument is treated as the entire config object and
// unwrapped into the exported constant's value. Keep in sync with the
// identity helpers in src/utils/define.ts.
const DEFINE_HELPER_NAMES = new Set(['defineScene', 'definePlugin', 'definePopup', 'defineEntity', 'defineUI']);

function findExportedConstants(ast) {
  const exports = {};

  function extractValue(node) {
    switch (node.type) {
      case AST_NODE_TYPES.Literal:
        return node.value;
      case AST_NODE_TYPES.ArrayExpression:
        return node.elements.map((element) => element && extractValue(element)).filter((value) => value !== undefined);
      case AST_NODE_TYPES.ObjectExpression: {
        const obj = {};
        for (const prop of node.properties) {
          if (prop.type === AST_NODE_TYPES.Property && prop.key.type === AST_NODE_TYPES.Identifier) {
            obj[prop.key.name] = extractValue(prop.value);
          }
        }
        return obj;
      }
      case AST_NODE_TYPES.CallExpression: {
        // Unwrap `defineScene({...})` / `definePlugin({...})` / etc.
        // Other call expressions are opaque to discovery.
        const calleeName = node.callee?.name;
        if (calleeName && DEFINE_HELPER_NAMES.has(calleeName) && node.arguments[0]) {
          return extractValue(node.arguments[0]);
        }
        return undefined;
      }
      default:
        return undefined;
    }
  }

  for (const node of ast.body) {
    if (
      node.type === AST_NODE_TYPES.ExportNamedDeclaration &&
      node.declaration?.type === AST_NODE_TYPES.VariableDeclaration
    ) {
      for (const declarator of node.declaration.declarations) {
        if (declarator.id.type === AST_NODE_TYPES.Identifier && declarator.init) {
          exports[declarator.id.name] = extractValue(declarator.init);
        }
      }
    }
  }

  // Flatten `export const scene = defineScene({...})` / `export const plugin
  // = definePlugin({...})` wrappers onto the top level so discovery code can
  // stay agnostic: `exports.id`, `exports.active`, `exports.assets`, etc.
  // work whether the user wrote individual exports or the helper form.
  // Individual file-level exports take precedence on conflict.
  for (const wrapperKey of ['scene', 'plugin', 'popup', 'entity']) {
    const wrapped = exports[wrapperKey];
    if (wrapped && typeof wrapped === 'object' && !Array.isArray(wrapped)) {
      for (const [k, v] of Object.entries(wrapped)) {
        if (exports[k] === undefined) exports[k] = v;
      }
    }
  }

  return exports;
}

/**
 * Finds the file's default-exported class. Handles both common forms:
 *
 *   // inline
 *   export default class Foo extends Bar { ... }
 *
 *   // named declaration + separate default export
 *   export class Foo extends Bar { ... }
 *   export default Foo;
 *
 *   // or unexported named class
 *   class Foo extends Bar { ... }
 *   export default Foo;
 *
 * The separate-default form requires a second pass to resolve the
 * identifier back to a matching `ClassDeclaration` in the same file.
 */
function findDefaultExportedClass(ast) {
  let identifierName = null;

  for (const node of ast.body) {
    if (node.type !== AST_NODE_TYPES.ExportDefaultDeclaration) continue;
    // Form 1: `export default class Foo { ... }`
    if (node.declaration.type === AST_NODE_TYPES.ClassDeclaration) {
      return node.declaration;
    }
    // Form 2/3: `export default Foo;` — remember the name to resolve below.
    if (node.declaration.type === AST_NODE_TYPES.Identifier) {
      identifierName = node.declaration.name;
      break;
    }
  }
  if (!identifierName) return null;

  // Resolve the identifier to a class declaration in the same file. Accept
  // either a bare `class Foo {}` or an `export class Foo {}` form.
  for (const node of ast.body) {
    if (node.type === AST_NODE_TYPES.ClassDeclaration && node.id?.name === identifierName) {
      return node;
    }
    if (
      node.type === AST_NODE_TYPES.ExportNamedDeclaration &&
      node.declaration?.type === AST_NODE_TYPES.ClassDeclaration &&
      node.declaration.id?.name === identifierName
    ) {
      return node.declaration;
    }
  }

  return null;
}

// Back-compat alias — scene code historically called `findDefaultExportedScene`.
const findDefaultExportedScene = findDefaultExportedClass;

async function discoverScenes(server) {
  const scenesDir = path.resolve(process.cwd(), 'src/scenes');
  const scenes = [];

  if (!fs.existsSync(scenesDir)) {
    return [];
  }

  const files = await findTypeScriptFiles(scenesDir);

  for (const file of files) {
    try {
      const content = await fs.promises.readFile(file, 'utf-8');
      const ast = parse(content, {
        jsx: false,
        loc: true,
        comment: false,
      });

      const sceneClass = findDefaultExportedScene(ast);
      if (!sceneClass) continue;

      const exports = findExportedConstants(ast);

      const relativePath = file.replace(process.cwd(), '').replace(/\\/g, '/').split('/src')[1];
      // remove /src — the runtime import uses the raw alias (Vite resolves
      // `.ts` automatically) while the typeof-import codegen needs the
      // extension stripped so TypeScript's path-alias resolution finds it.
      const importPath = `@${relativePath}`;
      const importPathForTypes = importPath.replace(/\.ts$/, '');
      const id = exports.id || sceneClass.id?.name || path.basename(file, '.ts');

      scenes.push({
        id,
        importPath: importPathForTypes,
        module:
          exports.dynamic === false
            ? importPath
            : {
                toString: () => `() => import('${importPath}')`,
                isFunction: true, // Add a flag to identify dynamic imports
              },
        active: exports.active === false ? false : true,
        debugLabel: exports.debug?.label || id,
        debugGroup: exports.debug?.group || undefined,
        debugOrder: exports.debug?.order >= 0 ? exports.debug.order : Number.MAX_SAFE_INTEGER,
        assets: exports.assets ?? undefined,
        plugins: exports.plugins ?? undefined,
        autoUnloadAssets: exports.assets?.autoUnload ?? false,
      });
    } catch (e) {
      const errorMessage = `Error parsing scene file ${file}: ${e.message}`;
      logger.error(errorMessage);
      if (e.stack) {
        logger.error(e.stack);
      }
      if (server) {
        server.ws.send({
          type: 'error',
          err: {
            message: e.message,
            stack: e.stack,
            id: file,
            plugin: 'vite-plugin-scenes',
          },
        });
      }
    }
  }
  return scenes;
}

export function sceneListPlugin(isProject = true) {
  function extractClassName(scene) {
    const basename = path.basename(scene.module);
    // remove .ts
    return basename.replace('.ts', '');
  }

  function generateSceneListModule(scenes) {
    // extract non function scenes from the list
    const nonFunctionScenes = scenes.filter((scene) => !scene.module.isFunction);

    const imports = nonFunctionScenes.map((scene) => `import ${extractClassName(scene)} from '${scene.module}';`);

    const result = `
    ${imports.join('\n')}
    export const sceneList = [
      ${scenes
        .map(
          (scene) => `{
        id: '${scene.id}',
        active: ${scene.active},
        module: ${scene.module.isFunction ? scene.module.toString() : extractClassName(scene)},
        debugLabel: ${JSON.stringify(scene.debugLabel)},
        debugGroup: ${JSON.stringify(scene.debugGroup)},
        debugOrder: ${scene.debugOrder},
        assets: ${JSON.stringify(scene.assets)},
        plugins: ${JSON.stringify(scene.plugins)},
        autoUnloadAssets: ${scene.autoUnloadAssets}
      }`,
        )
        .join(',\n')}
    ];
  `;
    return result;
  }

  const virtualModuleId = 'virtual:caper-scenes';
  const resolvedVirtualModuleId = '\0' + virtualModuleId;

  let server;

  return {
    name: 'vite-plugin-scenes',
    configureServer(s) {
      server = s;
    },
    resolveId(id) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId;
      }
    },
    async load(id) {
      if (id === resolvedVirtualModuleId) {
        let scenes = [];
        if (isProject) {
          scenes = await discoverScenes(server);
        }
        return generateSceneListModule(scenes);
      }
    },
  };
}

/**
 * @param {{ pwa?: object }} [options] When `pwa` is set, the runtime module also
 *   installs `Caper.pwa` and (unless `autoRegister: false`) registers the
 *   service worker. See `../build/plugins/pwa.mjs`.
 */
function createCaperRuntimePlugin({ pwa } = {}) {
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

function caperDevHelperPlugin() {
  return {
    name: 'vite-plugin-caper-dev-helper',
    configureServer(server) {
      server.ws.on('caper:show-error', (data) => {
        const { error } = data;
        // Send the 'error' event back to the client
        server.ws.send({
          type: 'error',
          err: {
            message: error.message || 'An unknown error occurred.',
            stack: error.stack || new Error(error.message).stack,
            id: error.id,
            loc: {
              file: error.id,
              line: error.line,
              column: error.column,
            },
            plugin: 'caper-dev-helper',
          },
        });
      });
    },
  };
}

/** END PLUGINS */

/** CONFIG */
const buildFlags = readCaperBuildFlags();

/**
 * The plugins caper contributes, in order. Internal — the public surface is
 * `caper()` in `../build/index.mjs`, which owns option handling and the config
 * defaults. Lives here for now because every factory below is module-private;
 * the split moves them out (see `plan/vite-preset-rework.md`).
 *
 * @param {{ assets?: object | false, pwa?: object }} [options]
 * @returns {import('vite').PluginOption[]}
 */
export function caperPluginList({ assets = {}, pwa } = {}) {
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
