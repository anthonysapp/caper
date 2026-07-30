/**
 * The `virtual:caper-config` module plus everything that guards it: schema
 * validation of `caper.config.ts`, the build-time id/bundle/cycle checks, and the
 * generated `caper-app.d.ts` that types scene ids, action names and data keys.
 *
 * The config is loaded through vite's own `ssrLoadModule` rather than imported,
 * so the project's TypeScript and path aliases resolve the same way they do for
 * the app itself.
 */
import fs from 'node:fs';
import path from 'node:path';
import { AST_NODE_TYPES, extractConfigReferences, findConfigObject, parse } from '../internal/ast.mjs';
import {
  discoverEntities,
  discoverLocaleKeys,
  discoverPlugins,
  discoverPopups,
  discoverScenes,
  discoverUIs,
} from '../internal/discovery.mjs';
import { caperConfigSchema } from '../internal/schema.mjs';
import { cwd, DTS_FILE_NAME, logger } from '../internal/util.mjs';
import { runBuildTimeValidation } from '../internal/validate.mjs';
import { loadManifestBundleNames } from '../internal/manifest.mjs';

async function validateCaperConfig(server, root) {
  if (!server || typeof server.ssrLoadModule !== 'function') return true;
  const configPath = path.resolve(root, 'caper.config.ts');
  if (!fs.existsSync(configPath)) return true;

  // caper.config.ts pulls in @caperjs/core, which statically bundles
  // @pixi/sound and GSAP. Both run browser-only top-level side effects
  // during module init, which throw one after another under Vite SSR
  // (Node, no DOM) and abort the whole ssrLoadModule — so config
  // validation silently never runs. Install minimal stubs just for the
  // duration of the load, and only for whichever globals aren't already
  // defined (jsdom, a future Vite DOM environment, etc.).
  //
  // - document.createElement('audio').canPlayType: @pixi/sound's
  //   utils/supported.mjs probes playable formats at module top level.
  // - createElement(...).style: GSAP's CSSPlugin auto-registers at
  //   import time and does `'transform' in tempDiv.style` on a div it
  //   creates via document.createElement — needs a `style` object (any
  //   object satisfies the `in` check; contents are never read here).
  // - globalThis.window: @pixi/sound's WebAudioContext/SoundLibrary
  //   singleton construction reads `window` at module top level.
  const hadDocument = 'document' in globalThis;
  const hadWindow = 'window' in globalThis;
  if (!hadDocument) {
    globalThis.document = {
      createElement: () => ({ canPlayType: () => '', style: {} }),
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  }
  if (!hadWindow) {
    globalThis.window = globalThis;
  }

  let mod;
  try {
    mod = await server.ssrLoadModule(configPath);
  } catch {
    // Config failed to load — the normal type-regen path already surfaces
    // this error through the websocket overlay, so don't double-report.
    return false;
  } finally {
    if (!hadDocument) delete globalThis.document;
    if (!hadWindow) delete globalThis.window;
  }
  const cfg = mod.default;
  if (!cfg) return true;

  const result = caperConfigSchema.safeParse(cfg);
  if (result.success) return true;

  const issues = result.error.issues
    .map((i) => `  - ${i.path.length ? i.path.join('.') : '(root)'}: ${i.message}`)
    .join('\n');
  const message = `Invalid caper.config.ts:\n${issues}`;
  logger.error(`[caper] ${message}`);

  server.ws.send({
    type: 'error',
    err: {
      message,
      id: configPath,
      plugin: 'vite-plugin-caper-config',
    },
  });
  return false;
}

// write a debounce function

export function caperConfigPlugin(isProject = true) {
  // vite's resolved project root. Everything below resolves against this rather
  // than process.cwd(), so `vite --root elsewhere` and monorepo invocations from
  // a parent directory find the right caper.config.ts and src/ tree.
  let root = cwd;
  const virtualModuleId = 'virtual:caper-config';
  const resolvedVirtualModuleId = '\0' + virtualModuleId;

  async function generateTypes(server, root) {
    if (!isProject) return { types: 'export {}' };

    const configPath = path.resolve(root, 'caper.config.ts');

    let ast;
    try {
      const content = await fs.promises.readFile(configPath, 'utf-8');
      if (!content.trim()) {
        // This can happen during file saves, where the file is temporarily empty.
        return { types: '/* caper.config.ts is empty, skipping augmentation. */' };
      }
      ast = parse(content, { jsx: false });
    } catch (e) {
      if (e.code === 'ENOENT') {
        // This can happen during file saves that do a delete/recreate.
        return { types: '/* caper.config.ts not found, skipping augmentation. */' };
      }
      logger.error(`[caper] Error parsing caper.config.ts: ${e.message}`);
      if (e.stack) {
        logger.error(e.stack);
      }
      return {
        types: '/* Error parsing caper.config.ts, skipping augmentation. See console for details. */',
        error: e,
      };
    }

    let appClassName = 'Application';
    let appImportPath = '@caperjs/core';
    let dataTypeName = 'Record<string, any>';
    let dataSchemaName = '';
    let hasActions = false;
    let hasContexts = false;
    let breakpointsName = '';

    let configObject;

    for (const node of ast.body) {
      if (
        node.type === AST_NODE_TYPES.ExportNamedDeclaration &&
        node.declaration?.type === AST_NODE_TYPES.VariableDeclaration
      ) {
        // Find data schema
        const dataDecl = node.declaration.declarations.find(
          (d) => d.init?.type === AST_NODE_TYPES.CallExpression && d.init.callee.name === 'defineData',
        );
        if (dataDecl && dataDecl.id.type === AST_NODE_TYPES.Identifier) {
          dataSchemaName = dataDecl.id.name;
          dataTypeName = `typeof ${dataSchemaName}`;
        }

        // Find breakpoints (detect by callee, like defineData — more robust
        // than matching on the variable name).
        const bpDecl = node.declaration.declarations.find(
          (d) => d.init?.type === AST_NODE_TYPES.CallExpression && d.init.callee.name === 'defineBreakpoints',
        );
        if (bpDecl && bpDecl.id.type === AST_NODE_TYPES.Identifier) {
          breakpointsName = bpDecl.id.name;
        }

        // Find actions
        if (node.declaration.declarations.some((d) => d.id.name === 'actions')) {
          hasActions = true;
        }

        // Find contexts
        if (node.declaration.declarations.some((d) => d.id.name === 'contexts')) {
          hasContexts = true;
        }

        // Find defineConfig to get application class
        const configDecl = node.declaration.declarations.find(
          (d) => d.init?.type === AST_NODE_TYPES.CallExpression && d.init.callee.name === 'defineConfig',
        );
        if (configDecl?.init.type === AST_NODE_TYPES.CallExpression) {
          configObject = configDecl.init.arguments[0];
        }
      } else if (
        node.type === AST_NODE_TYPES.ExportDefaultDeclaration &&
        node.declaration.type === AST_NODE_TYPES.CallExpression &&
        node.declaration.callee.name === 'defineConfig'
      ) {
        configObject = node.declaration.arguments[0];
      }
    }

    if (configObject?.type === AST_NODE_TYPES.ObjectExpression) {
      const appProperty = configObject.properties.find(
        (p) =>
          p.type === AST_NODE_TYPES.Property &&
          p.key.name === 'application' &&
          p.value.type === AST_NODE_TYPES.Identifier,
      );

      if (appProperty) {
        const importedAppName = appProperty.value.name;
        const importDecl = ast.body.find(
          (n) =>
            n.type === AST_NODE_TYPES.ImportDeclaration && n.specifiers.some((s) => s.local.name === importedAppName),
        );
        if (importDecl) {
          appClassName = importedAppName;
          appImportPath = importDecl.source.value;
        }
      }
    }

    // Discover scenes, plugins, popups, entities, and locale keys.
    const scenes = await discoverScenes(server, root);
    const plugins = await discoverPlugins(server, root);
    const popups = await discoverPopups(server, root);
    const entities = await discoverEntities(server, root);
    const uis = await discoverUIs(server, root);
    const localeKeys = await discoverLocaleKeys(server, root);

    const sceneIds = scenes.filter((s) => s.active !== false).map((s) => s.id);
    const pluginIds = plugins.filter((p) => p.active !== false).map((p) => p.id);
    const popupIds = popups.filter((p) => p.active !== false).map((p) => p.id);
    const entityIds = entities.filter((e) => e.active !== false).map((e) => e.id);
    const uiIds = uis.filter((u) => u.active !== false).map((u) => u.id);

    // Build-time cross-reference validation. Warnings for typos that would
    // silently fail at runtime (missing bundles, unknown plugin IDs,
    // defaultScene pointing at a non-existent scene, duplicate IDs).
    runBuildTimeValidation({
      server,
      configPath,
      configObject,
      scenes,
      plugins,
      popups,
      entities,
      breakpointsName,
    });

    const sceneIdType = sceneIds.length > 0 ? `\n  | '${sceneIds.join("'\n  | '")}'` : 'string';
    const pluginIdType = pluginIds.length > 0 ? `\n  | '${pluginIds.join("'\n  | '")}'` : 'string';
    const popupIdType = popupIds.length > 0 ? `\n  | '${popupIds.join("'\n  | '")}'` : 'string';
    const entityIdType = entityIds.length > 0 ? `\n  | '${entityIds.join("'\n  | '")}'` : 'string';
    const uiIdType = uiIds.length > 0 ? `\n  | '${uiIds.join("'\n  | '")}'` : 'string';
    const localeKeyType = localeKeys.length > 0 ? `\n  | '${localeKeys.join("'\n  | '")}'` : 'string';

    // Emit a keyed `{ id: typeof import('...').default }` map for each of
    // scenes/popups/entities so the framework can derive typed constructor
    // props via `ConstructorParameters<...>[0]` / `InstanceType<...>` at call
    // sites (`this.add.entity(id, props)` etc). Uses the `@/` alias path the
    // discovery already emits — the generated .d.ts lives inside the user's
    // project so tsconfig `paths` applies.
    const buildClassMap = (items) => {
      const active = items.filter((i) => i.active !== false && i.importPath);
      if (active.length === 0) return '  [id: string]: never;';
      return active
        .map((item) => `  ${JSON.stringify(item.id)}: typeof import('${item.importPath}').default;`)
        .join('\n');
    };

    const sceneClassMap = buildClassMap(scenes);
    const popupClassMap = buildClassMap(popups);
    const entityClassMap = buildClassMap(entities);
    const uiClassMap = buildClassMap(uis);

    const configDir = path.dirname(configPath);
    const dtsDir = path.resolve(configDir, 'src/types');

    let relativeAppPath = appImportPath;
    if (appImportPath.startsWith('.')) {
      relativeAppPath = path.relative(dtsDir, path.resolve(configDir, appImportPath)).replace(/\\/g, '/');
      if (relativeAppPath.endsWith('.ts')) {
        relativeAppPath = relativeAppPath.slice(0, -3);
      }
    }

    const relativeConfigPath = path.relative(dtsDir, configPath).replace(/\\/g, '/').replace(/\.ts$/, '');

    const imports = [];
    if (appClassName === 'Application') {
      imports.push(`import type { Application } from '@caperjs/core';`);
    }
    if (fs.existsSync(configPath)) {
      const configParts = [];
      if (dataSchemaName) {
        configParts.push(dataSchemaName);
      }
      if (hasActions) {
        configParts.push('actions');
      }
      if (hasContexts) {
        configParts.push('contexts');
      }
      if (breakpointsName) {
        configParts.push(breakpointsName);
      }
      if (configParts.length > 0) {
        imports.push(`import type { ${configParts.join(', ')} } from '${relativeConfigPath}';`);
      }
    }
    if (appClassName !== 'Application') {
      imports.push(`import type { ${appClassName} } from '${relativeAppPath}';`);
    }

    return {
      types: `
// This file is auto-generated by caper. Do not edit.
${imports.join('\n')}
// Data
type AppData = ${dataTypeName};

// Action Contexts
${hasContexts ? 'type AppContexts = (typeof contexts)[number];' : 'type AppContexts = string;'}

// Actions
${hasActions ? 'type AppActionMap = typeof actions;' : 'type AppActionMap = Record<string, any>;'}
${hasActions ? 'type AppActions = keyof AppActionMap;' : 'type AppActions = string;'}

// Scenes
type AppScenes = ${sceneIdType};

// Plugins
type AppPlugins = ${pluginIdType};

// Popups
type AppPopups = ${popupIdType};

// Entities
type AppEntities = ${entityIdType};

// UI Elements
type AppUIs = ${uiIdType};

// Class maps — typeof-import pointers to the real discovered classes. The
// framework uses these with ConstructorParameters<> + InstanceType<> + infer
// to derive typed props and return types for this.add.entity / popups.show /
// scenes.load without any AST type extraction.
type AppSceneClasses = {
${sceneClassMap}
};

type AppPopupClasses = {
${popupClassMap}
};

type AppEntityClasses = {
${entityClassMap}
};

type AppUIClasses = {
${uiClassMap}
};

// Locale keys (flattened dot-paths from src/locales/<reference>.ts)
type AppLocaleKeys = ${localeKeyType};${breakpointsName ? `\n\n// Breakpoints\ntype AppBreakpoints = keyof (typeof ${breakpointsName})['tiers'] & string;\ntype AppBreakpointModes = keyof (typeof ${breakpointsName})['modes'] & string;` : ''}

/**
 * Add type overrides to the framework
 */
declare module '@caperjs/core' {
  interface AppTypeOverrides {
    App: ${appClassName};
    Data: AppData;
    Contexts: AppContexts;
    Actions: AppActions;
    ActionMap: AppActionMap;
    Scenes: AppScenes;
    Plugins: AppPlugins;
    Popups: AppPopups;
    Entities: AppEntities;
    SceneClasses: AppSceneClasses;
    PopupClasses: AppPopupClasses;
    EntityClasses: AppEntityClasses;
    UIs: AppUIs;
    UIClasses: AppUIClasses;
    LocaleKeys: AppLocaleKeys;${breakpointsName ? `\n    Breakpoints: AppBreakpoints;\n    BreakpointModes: AppBreakpointModes;` : ''}
    Eases: Eases;
  }
}
`,
    };
  }

  async function build(msg = `Building ${DTS_FILE_NAME}`, server) {
    logger.info(msg);
    const { types, error } = await generateTypes(server, root);

    if (error) {
      if (server) {
        server.ws.send({
          type: 'error',
          err: {
            message: error.message,
            stack: error.stack,
            id: path.resolve(root, 'caper.config.ts'),
            plugin: 'vite-plugin-caper-config',
          },
        });
      }
      return;
    }

    const typesDir = path.resolve(root, 'src/types');
    await fs.promises.mkdir(typesDir, { recursive: true });
    await fs.promises.writeFile(path.join(typesDir, DTS_FILE_NAME), types, 'utf-8');

    // Dev-only: evaluate + validate the user's config through Vite's SSR
    // module graph. Failures surface in the overlay with file:line detail.
    // Prod builds skip this (no server).
    if (server) {
      await validateCaperConfig(server, root);
      server.ws.send({ type: 'full-reload' });
    }
  }

  return {
    name: 'vite-plugin-caper-config',
    configResolved(config) {
      root = config.root;
    },
    enforce: 'pre',
    resolveId(id) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId;
      }
    },
    async load(id) {
      if (id === resolvedVirtualModuleId) {
        return `
          const configModule = await import('/caper.config.ts');
          export default configModule.default;
        `;
      }
    },
    async buildStart() {
      if (!isProject) return;
      await build('Generating types from caper.config.ts');
    },
    configureServer(server) {
      if (!isProject) return;

      const configPath = path.resolve(root, 'caper.config.ts');
      const scenesDir = path.resolve(root, 'src/scenes');
      const pluginsDir = path.resolve(root, 'src/plugins');
      const popupsDir = path.resolve(root, 'src/popups');
      const entitiesDir = path.resolve(root, 'src/entities');
      const localesDir = path.resolve(root, 'src/locales');

      const handleFileChange = async (file) => {
        const isScene = file.startsWith(scenesDir);
        const isPlugin = file.startsWith(pluginsDir);
        const isPopup = file.startsWith(popupsDir);
        const isEntity = file.startsWith(entitiesDir);
        const isLocale = file.startsWith(localesDir);
        const isConfig = file === configPath;

        if (!isScene && !isPlugin && !isPopup && !isEntity && !isLocale && !isConfig) return;

        const msg = isScene
          ? 'Scene file changed'
          : isPlugin
            ? 'Plugin file changed'
            : isPopup
              ? 'Popup file changed'
              : isEntity
                ? 'Entity file changed'
                : isLocale
                  ? 'Locale file changed'
                  : 'Config file changed';
        await build(`${msg}, regenerating types...`, server);
      };

      server.watcher.add(configPath);
      server.watcher.add(scenesDir);
      server.watcher.add(pluginsDir);
      server.watcher.add(popupsDir);
      server.watcher.add(entitiesDir);
      server.watcher.add(localesDir);

      server.watcher.on('change', handleFileChange);
      server.watcher.on('add', handleFileChange);
      server.watcher.on('unlink', handleFileChange);
    },
  };
}

/** END PLUGINS */

/** CONFIG */
