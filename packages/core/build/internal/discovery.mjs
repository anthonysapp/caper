/**
 * Filesystem discovery: walks the conventional source directories and reads each
 * file's AST to work out what it declares.
 *
 * Split from the list plugins so the plugins are only about emitting virtual
 * modules, and the crawling can be reasoned about (and fixed) on its own.
 *
 * Every entry point takes an explicit `root` — vite's resolved `config.root`,
 * passed down by the plugin that called it. That is the project root by
 * definition; `process.cwd()` only happens to be the same one, and differs the
 * moment anyone runs `vite --root elsewhere` or invokes vite from a parent
 * directory in a monorepo. It is threaded as a parameter rather than kept in a
 * module-level variable so nothing depends on load order or on who ran first.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  AST_NODE_TYPES,
  DEFINE_HELPER_NAMES,
  findDefaultExportedClass,
  findDefaultExportedScene,
  findExportedConstants,
  parse,
} from './ast.mjs';
import { logger } from './util.mjs';


export async function findTypeScriptFiles(dir) {
  const files = [];

  async function scan(directory) {
    const entries = await fs.promises.readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        await scan(fullPath);
      } else if (entry.isFile() && /\.ts?$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  await scan(dir);
  return files;
}

// Callees whose single argument is treated as the entire config object and
// unwrapped into the exported constant's value. Keep in sync with the
// identity helpers in src/utils/define.ts.

export async function discoverScenes(server, root) {
  const scenesDir = path.resolve(root, 'src/scenes');
  const scenes = [];

  if (!fs.existsSync(scenesDir)) {
    return [];
  }

  const files = await findTypeScriptFiles(scenesDir);

  for (const file of files) {
    try {
      const content = await fs.promises.readFile(file, 'utf-8');
      const ast = parse(content, {
        jsx: false,
        loc: true,
        comment: false,
      });

      const sceneClass = findDefaultExportedScene(ast);
      if (!sceneClass) continue;

      const exports = findExportedConstants(ast);

      const relativePath = file.replace(root, '').replace(/\\/g, '/').split('/src')[1];
      // remove /src — the runtime import uses the raw alias (Vite resolves
      // `.ts` automatically) while the typeof-import codegen needs the
      // extension stripped so TypeScript's path-alias resolution finds it.
      const importPath = `@${relativePath}`;
      const importPathForTypes = importPath.replace(/\.ts$/, '');
      const id = exports.id || sceneClass.id?.name || path.basename(file, '.ts');

      scenes.push({
        id,
        importPath: importPathForTypes,
        module:
          exports.dynamic === false
            ? importPath
            : {
                toString: () => `() => import('${importPath}')`,
                isFunction: true, // Add a flag to identify dynamic imports
              },
        active: exports.active === false ? false : true,
        debugLabel: exports.debug?.label || id,
        debugGroup: exports.debug?.group || undefined,
        debugOrder: exports.debug?.order >= 0 ? exports.debug.order : Number.MAX_SAFE_INTEGER,
        assets: exports.assets ?? undefined,
        plugins: exports.plugins ?? undefined,
        autoUnloadAssets: exports.assets?.autoUnload ?? false,
      });
    } catch (e) {
      const errorMessage = `Error parsing scene file ${file}: ${e.message}`;
      logger.error(errorMessage);
      if (e.stack) {
        logger.error(e.stack);
      }
      if (server) {
        server.ws.send({
          type: 'error',
          err: {
            message: e.message,
            stack: e.stack,
            id: file,
            plugin: 'vite-plugin-scenes',
          },
        });
      }
    }
  }
  return scenes;
}

export async function discoverLocalPlugins(server, root) {
  const pluginsDir = path.resolve(root, 'src/plugins');
  const plugins = [];

  if (!fs.existsSync(pluginsDir)) {
    return [];
  }

  const files = await findTypeScriptFiles(pluginsDir);

  for (const file of files) {
    try {
      const content = await fs.promises.readFile(file, 'utf-8');
      const ast = parse(content, {
        jsx: false,
        loc: true,
        comment: false,
      });

      const hasPluginWrapper = ast.body.some(
        (n) =>
          n.type === AST_NODE_TYPES.ExportNamedDeclaration &&
          n.declaration?.type === AST_NODE_TYPES.VariableDeclaration &&
          n.declaration.declarations.some(
            (d) => d.init?.type === AST_NODE_TYPES.CallExpression && d.init.callee?.name === 'definePlugin',
          ),
      );
      if (!hasPluginWrapper) continue;

      const pluginClass = findDefaultExportedClass(ast);
      if (!pluginClass) continue;

      const exports = findExportedConstants(ast);

      const relativePath = file.replace(root, '').replace(/\\/g, '/').split('/src')[1];
      const importPath = `@${relativePath.replace(/\.ts$/, '')}`;
      const id = exports.id || pluginClass.id?.name || path.basename(file, '.ts');
      const name = pluginClass.id?.name || id;

      plugins.push({
        id,
        name,
        isLocal: true,
        importPath,
        module:
          exports.dynamic === false
            ? importPath
            : {
                toString: () => `() => import('${importPath}')`,
                isFunction: true,
              },
        active: exports.active === false ? false : true,
        requires: Array.isArray(exports.requires) ? exports.requires.filter((r) => typeof r === 'string') : [],
      });
    } catch (e) {
      const errorMessage = `Error parsing plugin file ${file}: ${e.message}`;
      logger.error(errorMessage);
      if (e.stack) {
        logger.error(e.stack);
      }
      if (server) {
        server.ws.send({
          type: 'error',
          err: {
            message: e.message,
            stack: e.stack,
            id: file,
            plugin: 'vite-plugin-plugins',
          },
        });
      }
    }
  }

  return plugins;
}

/**
 * Discovers npm packages prefixed with `@caperjs/plugin-` in the host
 * project's `package.json`. Always emitted as dynamic imports.
 */

export function discoverNpmPlugins(root) {
  const packageJsonPath = path.resolve(root, 'package.json');
  if (!fs.existsSync(packageJsonPath)) return [];

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  const allDependencies = {
    ...(packageJson.dependencies || {}),
    ...(packageJson.devDependencies || {}),
  };

  return Object.keys(allDependencies)
    .filter((dep) => dep.startsWith('@caperjs/plugin-'))
    .map((packageName) => {
      const id = packageName.replace('@caperjs/plugin-', '');
      return {
        id,
        name: packageName,
        isLocal: false,
        importPath: packageName,
        module: {
          toString: () => `() => import('${packageName}')`,
          isFunction: true,
        },
        active: true,
        // npm plugins can declare `requires` on the class itself
        // (`public readonly requires = ['firebase']`); the runtime topo-sort
        // reads from the live instance, so empty here is fine.
        requires: [],
      };
    });
}

export async function discoverPlugins(server, root) {
  const [local, npm] = [await discoverLocalPlugins(server, root), discoverNpmPlugins(root)];
  return [...npm, ...local];
}

/**
 * Generic recursive-class-file discoverer. Walks a directory, AST-parses
 * each .ts file, requires a default-exported class, and reads `id` /
 * `active` / `dynamic` metadata (either from individual exports or a
 * `defineX({...})` wrapper). Used for popups and entities — same shape
 * as scenes/plugins minus the npm-package discovery path.
 *
 * `defaultDynamic` sets the emit mode when a file doesn't declare it
 * explicitly. Entities default to `false` (static import) because the
 * typed `this.add.entity(id, props)` factory needs sync access to the
 * constructor; popups default to `true` because `show()` is async.
 */

export async function discoverLocalClassFiles({ dir, kind, server, root, defaultDynamic = true }) {
  const rootDir = path.resolve(root, dir);
  if (!fs.existsSync(rootDir)) return [];

  const files = await findTypeScriptFiles(rootDir);
  const results = [];

  for (const file of files) {
    try {
      const content = await fs.promises.readFile(file, 'utf-8');
      const ast = parse(content);

      const cls = findDefaultExportedClass(ast);
      if (!cls) continue;

      const exports = findExportedConstants(ast);

      const relativePath = file.replace(root, '').replace(/\\/g, '/').split('/src')[1];
      const importPath = `@${relativePath.replace(/\.ts$/, '')}`;
      const id = exports.id || cls.id?.name || path.basename(file, '.ts');
      const name = cls.id?.name || id;
      const isDynamic = exports.dynamic !== undefined ? exports.dynamic : defaultDynamic;

      results.push({
        id,
        name,
        importPath,
        module: !isDynamic
          ? importPath
          : {
              toString: () => `() => import('${importPath}')`,
              isFunction: true,
            },
        active: exports.active === false ? false : true,
      });
    } catch (e) {
      const errorMessage = `Error parsing ${kind} file ${file}: ${e.message}`;
      logger.error(errorMessage);
      if (e.stack) logger.error(e.stack);
      if (server) {
        server.ws.send({
          type: 'error',
          err: {
            message: e.message,
            stack: e.stack,
            id: file,
            plugin: `vite-plugin-${kind}s`,
          },
        });
      }
    }
  }

  return results;
}

export async function discoverPopups(server, root) {
  return discoverLocalClassFiles({ dir: 'src/popups', kind: 'popup', server, root });
}

export async function discoverEntities(server, root) {
  // Entities default to static imports so `this.add.entity(id, props)` can
  // synchronously construct without awaiting a dynamic import. Opt into
  // code-splitting per-entity with `defineEntity({ dynamic: true })`.
  return discoverLocalClassFiles({ dir: 'src/entities', kind: 'entity', server, root, defaultDynamic: false });
}

export async function discoverUIs(server, root) {
  // UI elements default to static imports so `this.add.ui(id, props)` can
  // synchronously construct. Same rationale as entities.
  return discoverLocalClassFiles({ dir: 'src/ui', kind: 'ui', server, root, defaultDynamic: false });
}

/**
 * Factory for `virtual:caper-popups` / `virtual:caper-entities`.
 * Thin wrapper around a discover function that generates the static-import
 * + dynamic-import `() => import(...)` mix, same shape as the scenes/plugins
 * virtual modules.
 */

export async function discoverLocaleKeys(server, root) {
  const localesDir = path.resolve(root, 'src/locales');
  if (!fs.existsSync(localesDir)) return [];

  const files = (await fs.promises.readdir(localesDir)).filter((f) => /\.ts$/.test(f)).sort();
  if (files.length === 0) return [];

  // Pick the reference file: en.ts if present, else the first alphabetically.
  const referenceFile = files.find((f) => f === 'en.ts') || files[0];
  const filePath = path.join(localesDir, referenceFile);

  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    if (!content.trim()) return [];

    const ast = parse(content);
    const defaultExport = ast.body.find((n) => n.type === AST_NODE_TYPES.ExportDefaultDeclaration);
    if (!defaultExport) return [];

    // Allow either `export default { ... }` or `export default satisfies ...`
    let obj = defaultExport.declaration;
    if (obj && obj.type === 'TSSatisfiesExpression') obj = obj.expression;
    if (!obj || obj.type !== AST_NODE_TYPES.ObjectExpression) return [];

    const keys = [];
    const walk = (node, prefix) => {
      if (node.type !== AST_NODE_TYPES.ObjectExpression) return;
      for (const prop of node.properties) {
        if (prop.type !== AST_NODE_TYPES.Property) continue;
        let name;
        if (prop.key.type === AST_NODE_TYPES.Identifier) name = prop.key.name;
        else if (prop.key.type === AST_NODE_TYPES.Literal) name = String(prop.key.value);
        else continue;
        const dotPath = prefix ? `${prefix}.${name}` : name;
        if (prop.value.type === AST_NODE_TYPES.ObjectExpression) {
          walk(prop.value, dotPath);
        } else if (prop.value.type === AST_NODE_TYPES.Literal) {
          keys.push(dotPath);
        }
      }
    };
    walk(obj, '');
    return keys.sort();
  } catch (e) {
    const errorMessage = `Error parsing locale file ${filePath}: ${e.message}`;
    logger.error(errorMessage);
    if (server) {
      server.ws.send({
        type: 'error',
        err: {
          message: e.message,
          stack: e.stack,
          id: filePath,
          plugin: 'vite-plugin-locales',
        },
      });
    }
    return [];
  }
}

/**
 * Virtual module plugin for `virtual:caper-plugins`. Mirrors
 * `sceneListPlugin`: supports static + dynamic imports per entry, preserves
 * the full metadata shape so consumers can filter by `active` / read IDs.
 */
