/**
 * Detects when AssetPack's output folder was last written by a different
 * mode (dev vs. production) than the one about to run, so the caller can
 * bypass AssetPack's cache for that one run.
 *
 * AssetPack caches by config hash, and dev/production get separate cache
 * files but share one output folder (Vite's `publicDir`). A cache hit only
 * means "my inputs are unchanged" — it says nothing about whether the other
 * mode overwrote the shared folder since. The marker records which mode
 * last wrote the folder so a mode switch can be detected and the cache
 * bypassed for that one run, forcing a full rebuild.
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * A stable string that differs whenever dev and production configs differ
 * (or the pipes config / manifest url otherwise change), so it can be
 * compared across runs without re-deriving AssetPack's own config hash.
 */
export function outputModeKey({ isProduction, pixiPipesConfig, manifestUrl }) {
  const mode = isProduction ? 'production' : 'development';
  return `${mode}|${JSON.stringify(pixiPipesConfig ?? {})}|${manifestUrl ?? ''}`;
}

/**
 * True when the output folder can't be trusted to match `key`: no marker,
 * an unreadable one, a different stored key, or an empty/missing output
 * folder (nothing there to trust either way).
 */
export function shouldBypassCache({ markerPath, outputDir, key }) {
  let stored;
  try {
    stored = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  } catch {
    return true;
  }
  if (stored?.key !== key) return true;

  let entries;
  try {
    entries = fs.readdirSync(outputDir);
  } catch {
    return true;
  }
  return entries.length === 0;
}

export function writeMarker({ markerPath, key, outputDir }) {
  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  fs.writeFileSync(markerPath, JSON.stringify({ key, output: outputDir }), 'utf8');
}
