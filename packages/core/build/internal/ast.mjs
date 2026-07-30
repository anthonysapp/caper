/**
 * Everything caper's build plugins learn by reading source rather than running
 * it: an oxc parse wrapper, plus the extractors discovery uses to find a file's
 * exported constants, its default-exported class, and the object passed to
 * `defineConfig`.
 *
 * Source is parsed rather than imported because importing a project's modules
 * pulls in @caperjs/core, whose @pixi/sound and GSAP dependencies run
 * browser-only side effects at module top level and throw under plain Node.
 */
import { parseSync } from 'oxc-parser';

export const AST_NODE_TYPES = {
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
export function parse(content, _options = {}) {
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

export function extractConfigReferences(configObject) {
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
export function findConfigObject(ast) {
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

export const DEFINE_HELPER_NAMES = new Set(['defineScene', 'definePlugin', 'definePopup', 'defineEntity', 'defineUI']);

export function findExportedConstants(ast) {
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

  // Export names whose value came out of a `define*()` helper, in source order.
  const wrapperKeys = [];

  for (const node of ast.body) {
    if (
      node.type === AST_NODE_TYPES.ExportNamedDeclaration &&
      node.declaration?.type === AST_NODE_TYPES.VariableDeclaration
    ) {
      for (const declarator of node.declaration.declarations) {
        if (declarator.id.type === AST_NODE_TYPES.Identifier && declarator.init) {
          exports[declarator.id.name] = extractValue(declarator.init);
          if (
            declarator.init.type === AST_NODE_TYPES.CallExpression &&
            DEFINE_HELPER_NAMES.has(declarator.init.callee?.name)
          ) {
            wrapperKeys.push(declarator.id.name);
          }
        }
      }
    }
  }

  // Flatten `export const scene = defineScene({...})` / `export const ui =
  // defineUI({...})` wrappers onto the top level so discovery code can stay
  // agnostic: `exports.id`, `exports.active`, `exports.assets` etc. work whether
  // the file used individual exports or the helper form.
  //
  // Which exports get flattened is decided by *what they are* — a call to a
  // define helper — rather than by matching a hardcoded list of export names.
  // That list read ['scene', 'plugin', 'popup', 'entity'], so `defineUI` was
  // silently ignored and every UI element registered under its class name
  // instead of its declared id. Naming the export anything other than the kind
  // (`export const ui_ = defineUI(...)`) failed the same way.
  //
  // Individual file-level exports still take precedence on conflict, and earlier
  // wrappers win over later ones.
  for (const wrapperKey of wrapperKeys) {
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
export function findDefaultExportedClass(ast) {
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
export const findDefaultExportedScene = findDefaultExportedClass;
