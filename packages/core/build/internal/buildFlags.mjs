/**
 * Boolean build flags read out of `caper.config.ts` before anything can execute
 * it. See the comment on `readCaperBuildFlags` for why this is an AST parse.
 */
import fs from 'node:fs';
import path from 'node:path';
import { AST_NODE_TYPES, findConfigObject, parse } from './ast.mjs';
import { cwd } from './util.mjs';

export function readCaperBuildFlags() {
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
