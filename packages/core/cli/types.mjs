import { bold, cyan, green, red, yellow } from 'kleur/colors';

import path from 'node:path';
import process from 'node:process';

/**
 * `caper types` — regenerate the generated `.d.ts` files without a dev server.
 *
 * Reads the project's `vite.config.ts` (which contains `caper()`), runs the
 * asset pipeline once if present, then writes `src/types/caper-app.d.ts` and
 * `src/types/caper-assets.d.ts`. Use `--no-assets` to skip the AssetPack run
 * and asset type generation.
 */

const APP_DTS = 'caper-app.d.ts';
const ASSET_DTS = 'caper-assets.d.ts';

/**
 * @param {string[]} args
 * @returns {{ assets: boolean }}
 */
function parseArgs(args) {
  return {
    assets: !args.includes('--no-assets'),
  };
}

/**
 * Find a plugin by name in Vite's resolved (flat) plugin list.
 *
 * @param {import('vite').ResolvedConfig} config
 * @param {string} name
 */
function findPlugin(config, name) {
  return config.plugins.find((p) => p && p.name === name);
}

/**
 * Generate `caper-app.d.ts` and optionally `caper-assets.d.ts` for a project.
 *
 * @param {string} root - project root (where vite.config.ts / caper.config.ts live)
 * @param {{ assets?: boolean }} [options]
 * @returns {Promise<{ appTypes: string, assetTypes: string | null }>}
 */
export async function generateTypes(root, { assets = true } = {}) {
  const { resolveConfig } = await import('vite');
  const config = await resolveConfig({ root, logLevel: 'warn' }, 'serve', 'development');

  const caperConfigPlugin = findPlugin(config, 'vite-plugin-caper-config');
  if (!caperConfigPlugin) {
    throw new Error("caper() is not in this project's vite.config — nothing to generate");
  }
  if (!caperConfigPlugin.api?.generateTypes) {
    throw new Error(
      "the caper() preset in this project's vite.config predates `caper types` — the CLI and `@caperjs/core/vite` must come from the same @caperjs/core install (>= 0.6.0)",
    );
  }

  const assetpackPlugin = findPlugin(config, 'vite-plugin-assetpack');
  const assetTypesPlugin = findPlugin(config, 'vite-plugin-asset-types');

  if (assets && assetpackPlugin) {
    await assetpackPlugin.api.runOnce();
  }

  await caperConfigPlugin.api.generateTypes();

  if (assets && assetTypesPlugin) {
    await assetTypesPlugin.api.generateTypes();
  }

  const typesDir = path.resolve(root, 'src', 'types');
  return {
    appTypes: path.join(typesDir, APP_DTS),
    assetTypes: assets && assetTypesPlugin ? path.join(typesDir, ASSET_DTS) : null,
  };
}

/**
 * CLI entry for `caper types`.
 *
 * @param {string[]} args
 */
export async function types(args) {
  const { assets } = parseArgs(args);
  const root = process.cwd();

  try {
    const { appTypes, assetTypes } = await generateTypes(root, { assets });

    console.log(green(bold('✓ Generated types')) + ` ${cyan(path.relative(root, appTypes))}`);
    if (assetTypes) {
      console.log(green(bold('✓ Generated types')) + ` ${cyan(path.relative(root, assetTypes))}`);
    } else if (!assets) {
      console.log(`  ${yellow('Skipped asset types generation')} (use without --no-assets to include them)`);
    }
  } catch (error) {
    console.error(red(`caper types: ${error.message}`));
    process.exit(1);
  }
}
