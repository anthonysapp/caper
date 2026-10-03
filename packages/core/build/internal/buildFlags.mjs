/**
 * Build flags read out of `caper.config.ts` before anything can execute it. See
 * the comment on `readCaperBuildFlags` for why this is an AST parse.
 */
import fs from 'node:fs';
import path from 'node:path';
import { AST_NODE_TYPES, findConfigObject, parse } from './ast.mjs';
import { resolveOrientation } from '../../src/utils/orientation.js';
import { cwd } from './util.mjs';

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
      try {
        flags.orientation = readOrientationLock(prop.value);
      } catch {
        // silent here, like every other build flag; the schema reports it
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

/** A property's value node when it is a string literal, else `undefined`. */
function stringLiteral(node) {
  return node?.type === AST_NODE_TYPES.Literal && typeof node.value === 'string' ? node.value : undefined;
}

/**
 * The lock out of an `orientation` value node: the string literal itself, or
 * the `lock` string literal of an object literal (`overlay` is never read: it
 * may hold a function). Normalized and validated by `resolveOrientation`.
 */
function readOrientationLock(node) {
  if (node?.type === AST_NODE_TYPES.ObjectExpression) {
    const lockProp = node.properties.find(
      (p) => p.type === AST_NODE_TYPES.Property && p.key?.type === AST_NODE_TYPES.Identifier && p.key.name === 'lock',
    );
    if (!lockProp) throw new Error("orientation needs a lock: { lock: 'portrait' | 'landscape' }");
    const lock = stringLiteral(lockProp.value);
    if (lock === undefined) throw new Error("orientation.lock must be written as a string literal, 'portrait' or 'landscape'");
    return resolveOrientation({ lock }).lock;
  }
  const value = stringLiteral(node);
  if (value === undefined) {
    throw new Error("orientation must be written as a string literal ('portrait' or 'landscape') or { lock: '...' }");
  }
  return resolveOrientation(value).lock;
}

/**
 * The orientation lock from `<root>/caper.config.ts`, for the native CLI
 * commands and `caper doctor`: `orientation: 'portrait'` or
 * `orientation: { lock: 'portrait', ... }`. Same AST parse as
 * `readCaperBuildFlags`, so nothing is executed and no DOM stub is needed, but
 * strict where that one is silent: it throws when the file does not parse,
 * when no `defineConfig({...})` object literal is found, or when the lock is
 * not `'portrait'` / `'landscape'` written as a string literal. Callers turn
 * the throw into a warning.
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
  return prop ? readOrientationLock(prop.value) : undefined;
}
