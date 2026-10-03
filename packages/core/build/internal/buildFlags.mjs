/**
 * Build flags read out of `caper.config.ts` before anything can execute it. See
 * the comment on `readCaperBuildFlags` for why this is an AST parse.
 */
import fs from 'node:fs';
import path from 'node:path';
import { AST_NODE_TYPES, findConfigObject, parse } from './ast.mjs';
import { cwd } from './util.mjs';

export const ORIENTATIONS = Object.freeze(['portrait', 'landscape']);

export function readCaperBuildFlags() {
  const flags = { useWasm: false, orientation: undefined };
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
    if (prop.key.name === 'orientation') {
      if (prop.value?.type === AST_NODE_TYPES.Literal && ORIENTATIONS.includes(prop.value.value)) {
        flags.orientation = prop.value.value;
      }
      continue;
    }
    if (!(prop.key.name in flags)) continue;
    if (prop.value?.type === AST_NODE_TYPES.Literal && typeof prop.value.value === 'boolean') {
      flags[prop.key.name] = prop.value.value;
    }
  }
  return flags;
}

/**
 * `orientation` from `<root>/caper.config.ts`, for the native CLI commands and
 * `caper doctor`. Same AST parse as `readCaperBuildFlags`, so nothing is
 * executed and no DOM stub is needed, but strict where that one is silent: it
 * throws when the file does not parse, when no `defineConfig({...})` object
 * literal is found, or when `orientation` is not `'portrait'` / `'landscape'`
 * written as a string literal. Callers turn the throw into a warning.
 *
 * @param {string} root
 * @returns {'portrait' | 'landscape' | undefined} undefined when there is no config file or no `orientation` key
 */
export function readConfigOrientation(root) {
  const configPath = path.resolve(root, 'caper.config.ts');
  if (!fs.existsSync(configPath)) return undefined;

  const configObject = findConfigObject(parse(fs.readFileSync(configPath, 'utf-8')));
  if (configObject?.type !== AST_NODE_TYPES.ObjectExpression) {
    throw new Error('no defineConfig({ ... }) object literal found');
  }

  const prop = configObject.properties.find(
    (p) => p.type === AST_NODE_TYPES.Property && p.key?.type === AST_NODE_TYPES.Identifier && p.key.name === 'orientation',
  );
  if (!prop) return undefined;
  if (prop.value?.type !== AST_NODE_TYPES.Literal || typeof prop.value.value !== 'string') {
    throw new Error("orientation must be written as a string literal, 'portrait' or 'landscape'");
  }
  if (!ORIENTATIONS.includes(prop.value.value)) {
    throw new Error(`orientation must be 'portrait' or 'landscape' (got ${JSON.stringify(prop.value.value)})`);
  }
  return prop.value.value;
}
