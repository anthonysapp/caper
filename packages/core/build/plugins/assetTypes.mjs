/**
 * Turns AssetPack's `assets.json` into `caper-assets.d.ts`, so every bundle,
 * texture, spritesheet, font, audio clip and JSON file in the project is a
 * literal type rather than a string an app can typo.
 *
 * Regenerated whenever the manifest changes — the plugin watches it in dev and
 * reloads the page, because vite does not reload for changes under `publicDir`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadManifestBundleNames } from '../internal/manifest.mjs';
import { ASSET_DTS_FILE_NAME, debounce, delay, logger } from '../internal/util.mjs';

export { loadManifestBundleNames };

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
