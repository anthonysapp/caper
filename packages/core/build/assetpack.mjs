import { AssetPack, Logger } from '@assetpack/core';
import { pixiPipes } from '@assetpack/core/pixi';
import process from 'node:process';
import path from 'path';

const cwd = process.cwd();

/**
 * AssetPack pipe that reads a {weight=<value>} filename tag and converts
 * it into the `weights` array that PixiJS's loadWebFont expects.
 *
 * Usage: name the font file with both tags, e.g.
 *   SpaceGrotesk-Bold{family=SpaceGrotesk}{weight=bold}{wf}.ttf
 *
 * AssetPack extracts `weight` as a scalar; PixiJS needs `weights` as a
 * string[].  This pipe bridges the two.  Runs before the webfont pipe so
 * the metadata is in place before any transform.
 */
function fontWeights() {
  return {
    folder: false,
    name: 'font-weights',
    defaultOptions: null,
    tags: { weight: 'weight' },
    test(asset) {
      return asset.allMetaData[this.tags.weight] !== undefined;
    },
    async transform(asset) {
      const raw = asset.allMetaData[this.tags.weight];
      asset.metaData.weights = (Array.isArray(raw) ? raw : [raw]).map(String);
      return [asset];
    },
  };
}

const defaultManifestUrl = 'assets.json';

const defaultPixiPipesConfig = {
  // Retina-first: raw art is authored at 2x native game pixels. AssetPack
  // treats the source as the largest resolution listed, so this emits @2x
  // plus downscaled 1x and 0.5x. Apps whose art is authored at 1x override
  // `resolutions` via `caper({ assets: { resolutions } })` (or tag individual
  // assets {fix}).
  resolutions: { high: 2, default: 1, low: 0.5 },
  // Quality-first compression: the upstream webp default (quality 80, lossy
  // alpha) rings on anti-aliased UI edges, and browsers load .webp over .png.
  // alphaQuality 100 makes the alpha channel lossless (kills edge halos);
  // quality 92 + smartSubsample tame RGB bleed; png quality 100 skips palette
  // quantization on the fallback. effort 6 only costs prod builds — dev
  // rebuilds override the effort knobs below.
  compression: {
    jpg: true,
    png: { quality: 100 },
    webp: { quality: 92, alphaQuality: 100, smartSubsample: true, effort: 6 },
  },
  texturePacker: {
    nameStyle: 'relative',
    removeFileExtension: true,
    texturePacker: { nameStyle: 'relative', removeFileExtension: true },
  },
  // AssetPack's audio defaults are a trap: the mp3 output has
  // `recompress: false`, so an mp3 source is *copied* — a 320kbps master ships
  // untouched, cover art included — while the ogg twin is re-encoded down to
  // 32kbps mono. Since pixi's resolver prefers ogg, desktop ends up playing the
  // worst copy of a file the project also ships at ten times the size. Both
  // outputs get the same music-grade target instead, and `noVideo` drops the
  // embedded cover art ffmpeg would otherwise copy into every output.
  audio: {
    outputs: [
      {
        formats: ['.mp3'],
        recompress: true,
        options: { audioBitrate: 128, audioChannels: 2, audioFrequency: 44100, noVideo: true },
      },
      {
        formats: ['.ogg'],
        recompress: true,
        options: { audioBitrate: 128, audioChannels: 2, audioFrequency: 44100, noVideo: true },
      },
    ],
  },
  webfont: {},
  manifest: { trimExtensions: true, createShortcuts: true, output: defaultManifestUrl },
};

// Effort/CPU knobs only — quality options are untouched, so dev output pixels
// match production; dev rebuilds just spend less time squeezing bytes.
const devCompressionEffort = {
  png: { effort: 1, compressionLevel: 1 },
  webp: { effort: 0 },
};

function devCompression(compression) {
  if (!compression) return compression;
  const result = { ...compression };
  for (const [format, effort] of Object.entries(devCompressionEffort)) {
    const current = result[format];
    if (current === false) continue;
    result[format] = { ...(current === true ? {} : current), ...effort };
  }
  return result;
}

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Keys whose value is one whole decision rather than a bag of options, so an
 * override replaces it outright instead of merging into it.
 *
 * `resolutions` is the important one, and AssetPack's own `pixiPipes()` makes the
 * same exception ("don't merge the resolutions, just overwrite them"): the object
 * is a *set of tiers*, so merging `{ default: 1, low: 0.5 }` into caper's
 * retina-first default would silently put `high: 2` back and render 1x art at
 * half size.
 */
const REPLACE_WHOLE = new Set(['resolutions']);

/**
 * Deep-merge `overrides` over `base`: plain objects recurse, everything else
 * (arrays, scalars, `false`) replaces. Deep so that overriding one knob keeps
 * its siblings — `{ compression: { png: false } }` must not silently discard
 * caper's webp settings. Arrays replace rather than merge because the arrays
 * here are whole specifications (an audio `outputs` list), not sets to extend.
 */
function deepMerge(base, overrides) {
  if (!isPlainObject(overrides)) return overrides === undefined ? base : overrides;
  const out = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    const mergeable = isPlainObject(value) && isPlainObject(base?.[key]) && !REPLACE_WHOLE.has(key);
    out[key] = mergeable ? deepMerge(base[key], value) : value;
  }
  return out;
}

/**
 * Whether this is a production build.
 *
 * Vite is the authority here, not `process.env.NODE_ENV`: nothing guarantees
 * vite sets that variable, and depending on it silently shipped a kitchen-sink
 * build with no cache-busting hashes and dev-effort compression. Callers pass
 * `resolvedConfig.isProduction` from `configResolved`; the NODE_ENV read is only
 * a fallback for direct callers outside a vite build.
 */
function resolveIsProduction(isProduction) {
  return isProduction ?? process.env.NODE_ENV === 'production';
}

/**
 * Caper's pixi-pipes defaults with a project's overrides merged in, plus the two
 * environment-dependent adjustments: cache-busting in production, and cheaper
 * compression effort in dev.
 *
 * Exported for tests — the merged pipes themselves are opaque, so this plain
 * object is the only place the merge is observable.
 */
export function resolvePixiPipesConfig(overrides = {}, { cacheBust, isProduction } = {}) {
  const config = deepMerge(defaultPixiPipesConfig, overrides);
  const production = resolveIsProduction(isProduction);

  if (cacheBust !== undefined) {
    config.cacheBust = cacheBust;
  }
  if (config.cacheBust === undefined) {
    config.cacheBust = production;
  }
  if (!production) {
    config.compression = devCompression(config.compression);
  }
  return config;
}

export const assetpackConfig = (manifestUrl = defaultManifestUrl, pixiPipesConfig = {}, env = {}) => {
  const resolved = resolvePixiPipesConfig(pixiPipesConfig, env);

  // A custom manifest filename has to reach the manifest pipe too, or the file
  // gets written as assets.json while everything else looks for the new name.
  if (!pixiPipesConfig?.manifest?.output) {
    resolved.manifest = { ...resolved.manifest, output: manifestUrl };
  }

  const pipes = pixiPipes({ ...resolved });

  // Insert fontWeights before the webfont pipe so that the {weight} tag
  // is converted to a weights[] array before webfont processes the asset.
  const wfIdx = pipes.findIndex((p) => p.name === 'webfont');
  pipes.splice(wfIdx >= 0 ? wfIdx : 0, 0, fontWeights());

  return {
    manifestUrl,
    entry: './assets',
    logLevel: 'info',
    pipes,
  };
};

export default assetpackConfig;

export function assetpackPlugin(manifestUrl = defaultManifestUrl, pixiPipesConfig = {}) {
  let mode;
  let ap;
  let apConfig;
  let isBuilding = false;
  let server;

  let isProduction;

  async function getConfig() {
    if (!apConfig) {
      apConfig = assetpackConfig(manifestUrl, pixiPipesConfig, { isProduction });
    }
  }

  return {
    name: 'vite-plugin-assetpack',
    async configResolved(resolvedConfig) {
      mode = resolvedConfig.command;
      // Captured before getConfig() below, which is what consumes it.
      isProduction = resolvedConfig.isProduction;
      if (!resolvedConfig.publicDir) return;
      await getConfig();
      if (apConfig.output) return;
      const publicDir = resolvedConfig.publicDir.replace(cwd, '');
      const outputPath = path.join(publicDir, 'assets');
      apConfig.output = path.isAbsolute(publicDir)
        ? path.join('.', outputPath).replace(/\\/g, '/')
        : `./${outputPath}`.replace(/\\/g, '/');
      // on windows, for some reason, the output path is ./C:/Users/.../assets
      // so we need to remove the first two characters
      if (apConfig.output.indexOf('./C') === 0) {
        apConfig.output = apConfig.output.substr(2);
      }
    },
    buildStart: async () => {
      if (isBuilding) return;
      isBuilding = true;
      // Load config if not already loaded
      await getConfig();
      if (mode === 'serve') {
        if (ap) return;
        ap = new AssetPack(apConfig);
        // Vite does not reload the page when files under publicDir change, so
        // without this the browser keeps serving stale assets after a rebuild.
        // One reload per completed rebuild batch; the initial pass is skipped
        // (the server isn't listening yet).
        let initial = true;
        await ap.watch(() => {
          if (initial) {
            initial = false;
            return;
          }
          const hot = server?.environments?.client?.hot ?? server?.ws;
          hot?.send({ type: 'full-reload', path: '*' });
          Logger.info('Caper assetpack plugin:: assets rebuilt, reloading page');
        });
      } else {
        await new AssetPack(apConfig).run();
      }
      isBuilding = false;
    },
    configureServer(devServer) {
      server = devServer;
    },
    buildEnd: async () => {
      if (ap) {
        await ap.stop();
        ap = undefined;
      }
    },
  };
}
