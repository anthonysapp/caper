/**
 * The five discovery plugins, and the virtual modules they feed the runtime:
 * `virtual:caper-scenes`, `-plugins`, `-popups`, `-entities`, `-uis`.
 *
 * Each walks a conventional directory (`src/scenes`, `src/plugins`, ...), reads
 * every file's AST to find its default-exported class and its exported
 * constants, and emits a list the runtime imports — statically for entities and
 * UI (so `this.add.entity(id)` can construct synchronously) and dynamically for
 * scenes and popups (so they code-split).
 *
 * Directories resolve against `process.cwd()`, which is the project root under
 * any normal invocation but not under `vite --root elsewhere`. Threading vite's
 * resolved root through here is a known follow-up.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFINE_HELPER_NAMES,
  findDefaultExportedClass,
  findDefaultExportedScene,
  findExportedConstants,
  parse,
} from '../internal/ast.mjs';
import { cwd, logger } from '../internal/util.mjs';
import { loadManifestBundleNames } from './assetTypes.mjs';

/**
 * Walks `src/plugins/` recursively, AST-parses each TypeScript file, and
 * returns a list of local plugin metadata objects.
 *
 *  - requires `export const <name> = definePlugin({...})` — files without
 *    this marker are skipped (so sibling helper modules that incidentally
 *    default-export a class don't get phantom-registered as plugins)
 *  - requires a default-exported class in the file
 *  - honours `export const id`, `export const active`, `export const dynamic`
 *    (also flattened from inside `definePlugin({...})` by findExportedConstants)
 *  - default is dynamic import (code-split), opt out with `dynamic = false`
 *  - plugin ID defaults to exported `id` → class name → filename
 */
export async function discoverLocalPlugins(server) {
  const pluginsDir = path.resolve(process.cwd(), 'src/plugins');
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

      const relativePath = file.replace(process.cwd(), '').replace(/\\/g, '/').split('/src')[1];
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
export function discoverNpmPlugins() {
  const packageJsonPath = path.resolve(process.cwd(), 'package.json');
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

export async function discoverPlugins(server) {
  const [local, npm] = [await discoverLocalPlugins(server), discoverNpmPlugins()];
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
export async function discoverLocalClassFiles({ dir, kind, server, defaultDynamic = true }) {
  const rootDir = path.resolve(process.cwd(), dir);
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

      const relativePath = file.replace(process.cwd(), '').replace(/\\/g, '/').split('/src')[1];
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

export async function discoverPopups(server) {
  return discoverLocalClassFiles({ dir: 'src/popups', kind: 'popup', server });
}

export async function discoverEntities(server) {
  // Entities default to static imports so `this.add.entity(id, props)` can
  // synchronously construct without awaiting a dynamic import. Opt into
  // code-splitting per-entity with `defineEntity({ dynamic: true })`.
  return discoverLocalClassFiles({ dir: 'src/entities', kind: 'entity', server, defaultDynamic: false });
}

export async function discoverUIs(server) {
  // UI elements default to static imports so `this.add.ui(id, props)` can
  // synchronously construct. Same rationale as entities.
  return discoverLocalClassFiles({ dir: 'src/ui', kind: 'ui', server, defaultDynamic: false });
}

/**
 * Factory for `virtual:caper-popups` / `virtual:caper-entities`.
 * Thin wrapper around a discover function that generates the static-import
 * + dynamic-import `() => import(...)` mix, same shape as the scenes/plugins
 * virtual modules.
 */
export function createClassListPlugin({ virtualModuleId, discoverFn, exportName, pluginName }) {
  const resolvedVirtualModuleId = '\0' + virtualModuleId;
  let server;

  const extractClassName = (item) => {
    const basename = path.basename(item.module);
    return basename.replace(/\.ts$/, '');
  };

  const generate = (items) => {
    const staticItems = items.filter((i) => i.module && !i.module.isFunction);
    const imports = staticItems.map((i) => `import ${extractClassName(i)} from '${i.module}';`);

    return `
    ${imports.join('\n')}
    export const ${exportName} = [
      ${items
        .map((item) => {
          const moduleExpr =
            item.module && !item.module.isFunction
              ? extractClassName(item)
              : (item.module?.toString?.() ?? `() => import('${item.importPath}')`);
          return `{
        id: '${item.id}',
        name: '${item.name}',
        active: ${item.active},
        module: ${moduleExpr}
      }`;
        })
        .join(',\n')}
    ];
  `;
  };

  return {
    name: pluginName,
    configureServer(s) {
      server = s;
    },
    resolveId(id) {
      if (id === virtualModuleId) return resolvedVirtualModuleId;
    },
    async load(id) {
      if (id === resolvedVirtualModuleId) {
        const items = await discoverFn(server);
        return generate(items);
      }
    },
  };
}

export function popupListPlugin(isProject = true) {
  if (!isProject) {
    const virtualModuleId = 'virtual:caper-popups';
    const resolvedVirtualModuleId = '\0' + virtualModuleId;
    return {
      name: 'vite-plugin-popups',
      resolveId: (id) => (id === virtualModuleId ? resolvedVirtualModuleId : undefined),
      load: (id) => (id === resolvedVirtualModuleId ? 'export const popupList = [];' : undefined),
    };
  }
  return createClassListPlugin({
    virtualModuleId: 'virtual:caper-popups',
    discoverFn: discoverPopups,
    exportName: 'popupList',
    pluginName: 'vite-plugin-popups',
  });
}

export function entityListPlugin(isProject = true) {
  if (!isProject) {
    const virtualModuleId = 'virtual:caper-entities';
    const resolvedVirtualModuleId = '\0' + virtualModuleId;
    return {
      name: 'vite-plugin-entities',
      resolveId: (id) => (id === virtualModuleId ? resolvedVirtualModuleId : undefined),
      load: (id) => (id === resolvedVirtualModuleId ? 'export const entityList = [];' : undefined),
    };
  }
  return createClassListPlugin({
    virtualModuleId: 'virtual:caper-entities',
    discoverFn: discoverEntities,
    exportName: 'entityList',
    pluginName: 'vite-plugin-entities',
  });
}

export function uiListPlugin(isProject = true) {
  if (!isProject) {
    const virtualModuleId = 'virtual:caper-uis';
    const resolvedVirtualModuleId = '\0' + virtualModuleId;
    return {
      name: 'vite-plugin-uis',
      resolveId: (id) => (id === virtualModuleId ? resolvedVirtualModuleId : undefined),
      load: (id) => (id === resolvedVirtualModuleId ? 'export const uiList = [];' : undefined),
    };
  }
  return createClassListPlugin({
    virtualModuleId: 'virtual:caper-uis',
    discoverFn: discoverUIs,
    exportName: 'uiList',
    pluginName: 'vite-plugin-uis',
  });
}

/**
 * Walks `src/locales/`, picks a reference locale file (prefers `en.ts`,
 * falls back alphabetically), AST-parses its default-exported object, and
 * flattens every leaf path into a dot-notation key.
 *
 * Given:
 *   export default { foo: 'bar', obj: { nested: 'baz' }, replace: { x: '...' } };
 * Returns:
 *   ['foo', 'obj.nested', 'replace.x']
 *
 * Only string literal leaves are emitted. Arrays, function calls, and other
 * non-object/non-literal expressions are ignored (they can't be typed
 * meaningfully at this layer).
 */
export async function discoverLocaleKeys(server) {
  const localesDir = path.resolve(process.cwd(), 'src/locales');
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
export function pluginListPlugin(isProject = true) {
  function extractClassName(plugin) {
    // For static (non-function) imports, the module value is the raw import path.
    const basename = path.basename(plugin.module);
    return basename.replace(/\.ts$/, '');
  }

  function generatePluginListModule(plugins) {
    const staticPlugins = plugins.filter((p) => p.module && !p.module.isFunction && p.isLocal);

    // npm static imports would collide on class-name derivation from the pkg
    // path, so only local plugins support `dynamic = false`. npm packages are
    // always dynamic.
    const imports = staticPlugins.map((p) => `import ${extractClassName(p)} from '${p.module}';`);

    return `
    ${imports.join('\n')}
    export const pluginsList = [
      ${plugins
        .map((plugin) => {
          const moduleExpr =
            plugin.module && !plugin.module.isFunction && plugin.isLocal
              ? extractClassName(plugin)
              : (plugin.module?.toString?.() ?? `() => import('${plugin.importPath}')`);
          return `{
        name: '${plugin.name}',
        id: '${plugin.id}',
        isLocal: ${plugin.isLocal},
        active: ${plugin.active},
        requires: ${JSON.stringify(plugin.requires || [])},
        module: ${moduleExpr}
      }`;
        })
        .join(',\n')}
    ];
  `;
  }

  const virtualModuleId = 'virtual:caper-plugins';
  const resolvedVirtualModuleId = '\0' + virtualModuleId;

  let server;

  return {
    name: 'vite-plugin-plugins',
    configureServer(s) {
      server = s;
    },
    resolveId(id) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId;
      }
    },
    async load(id) {
      if (id === resolvedVirtualModuleId) {
        const plugins = isProject ? await discoverPlugins(server) : [];
        return generatePluginListModule(plugins);
      }
    },
  };
}

// scene list plugin
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
export async function discoverScenes(server) {
  const scenesDir = path.resolve(process.cwd(), 'src/scenes');
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

      const relativePath = file.replace(process.cwd(), '').replace(/\\/g, '/').split('/src')[1];
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

export function sceneListPlugin(isProject = true) {
  function extractClassName(scene) {
    const basename = path.basename(scene.module);
    // remove .ts
    return basename.replace('.ts', '');
  }

  function generateSceneListModule(scenes) {
    // extract non function scenes from the list
    const nonFunctionScenes = scenes.filter((scene) => !scene.module.isFunction);

    const imports = nonFunctionScenes.map((scene) => `import ${extractClassName(scene)} from '${scene.module}';`);

    const result = `
    ${imports.join('\n')}
    export const sceneList = [
      ${scenes
        .map(
          (scene) => `{
        id: '${scene.id}',
        active: ${scene.active},
        module: ${scene.module.isFunction ? scene.module.toString() : extractClassName(scene)},
        debugLabel: ${JSON.stringify(scene.debugLabel)},
        debugGroup: ${JSON.stringify(scene.debugGroup)},
        debugOrder: ${scene.debugOrder},
        assets: ${JSON.stringify(scene.assets)},
        plugins: ${JSON.stringify(scene.plugins)},
        autoUnloadAssets: ${scene.autoUnloadAssets}
      }`,
        )
        .join(',\n')}
    ];
  `;
    return result;
  }

  const virtualModuleId = 'virtual:caper-scenes';
  const resolvedVirtualModuleId = '\0' + virtualModuleId;

  let server;

  return {
    name: 'vite-plugin-scenes',
    configureServer(s) {
      server = s;
    },
    resolveId(id) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId;
      }
    },
    async load(id) {
      if (id === resolvedVirtualModuleId) {
        let scenes = [];
        if (isProject) {
          scenes = await discoverScenes(server);
        }
        return generateSceneListModule(scenes);
      }
    },
  };
}

/**
 * @param {{ pwa?: object }} [options] When `pwa` is set, the runtime module also
 *   installs `Caper.pwa` and (unless `autoRegister: false`) registers the
 *   service worker. See `../build/plugins/pwa.mjs`.
 */
