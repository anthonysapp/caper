/**
 * Reads AssetPack's generated `assets.json`.
 *
 * Lives in `internal/` rather than beside the asset-types plugin because
 * build-time validation needs it too, and `internal/` must not depend on
 * `plugins/` — that dependency ran the wrong way and hid a missing import until
 * a real build failed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { cwd, logger } from './util.mjs';

export function loadManifestBundleNames(manifestUrl = 'assets.json') {
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
