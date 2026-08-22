import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * `caper({ solid: true })` — pull `@caperjs/solid`'s Vite plugin into the preset.
 *
 * The dependency arrow only ever points from the app: core knows the specifier,
 * never the package. Nothing is imported unless the app opts in.
 *
 * Resolution starts at the app root, not at this file. Under pnpm (and any other
 * non-hoisted layout) `@caperjs/solid` is not a sibling of `@caperjs/core`, so a
 * bare `import('@caperjs/solid/vite')` from here would fail even when the app has
 * the package installed.
 *
 * @param {true|{ include?: string[] }} solid The preset's `solid` option.
 * @param {string} [from] Directory to resolve from; the app root by default.
 * @returns {Promise<import('vite').PluginOption>}
 */
export async function caperSolidPlugin(solid, from = process.cwd()) {
  const req = createRequire(path.join(from, 'package.json'));
  let entry;
  try {
    entry = req.resolve('@caperjs/solid/vite');
  } catch {
    throw new Error('[caper] solid: true requires @caperjs/solid to be installed (pnpm add @caperjs/solid solid-js)');
  }
  const { caperSolid } = await import(pathToFileURL(entry).href);
  return caperSolid(typeof solid === 'object' ? solid : undefined);
}
