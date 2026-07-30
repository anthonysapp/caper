/**
 * The five list plugins and the virtual modules they feed the runtime:
 * `virtual:caper-scenes`, `-plugins`, `-popups`, `-entities`, `-uis`.
 *
 * Each asks `internal/discovery.mjs` what exists, then emits a module the runtime
 * imports — statically for entities and UI (so `this.add.entity(id)` can construct
 * synchronously) and dynamically for scenes and popups (so they code-split).
 */
import path from 'node:path';
import {
  discoverEntities,
  discoverLocaleKeys,
  discoverPlugins,
  discoverPopups,
  discoverScenes,
  discoverUIs,
} from '../internal/discovery.mjs';
import { logger } from '../internal/util.mjs';
import { loadManifestBundleNames } from '../internal/manifest.mjs';

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
