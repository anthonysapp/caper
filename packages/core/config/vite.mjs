import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import wasm from 'vite-plugin-wasm';
import { z } from 'zod';

// oxc-parser emits an ESTree-compatible AST. We keep the `AST_NODE_TYPES`
// shape so existing call sites don't have to change — every value below is
// just the ESTree node-type string. If you add a new check, reference the
// ESTree spec at https://github.com/estree/estree.


import { assetpackPlugin } from './assetpack.mjs';
import { AST_NODE_TYPES, extractConfigReferences, findConfigObject, parse } from '../build/internal/ast.mjs';
import { cwd, DTS_FILE_NAME, logger } from '../build/internal/util.mjs';
import { assetTypesPlugin, loadManifestBundleNames } from '../build/plugins/assetTypes.mjs';
import { caperDevHelperPlugin } from '../build/plugins/devHelper.mjs';
import {
  entityListPlugin,
  pluginListPlugin,
  popupListPlugin,
  sceneListPlugin,
  uiListPlugin,
} from '../build/plugins/lists.mjs';
import { pngFallbackPrunePlugin } from '../build/plugins/pruneFallbacks.mjs';
import { createCaperRuntimePlugin } from '../build/plugins/runtime.mjs';
import { caperPwaPlugins } from '../build/plugins/pwa.mjs';


/**
 * Strict-fields Zod schema for `caper.config.ts`.
 *
 * Only validates the fields that produce cryptic runtime errors today when
 * they're malformed (wrong type, wrong shape). Everything else is passed
 * through via `.loose()` so the schema doesn't need to stay 1:1 with
 * `IApplicationOptions` — that would be a maintenance trap. Cross-reference
 * validation (`defaultScene` must exist in discovered scenes, `plugins[]`
 * IDs must exist) is deferred to Phase 5 #9 (build-time validation).
 *
 * Validation runs inside the Vite plugin in dev mode only, so Zod never
 * ships to the client bundle.
 */
const pluginConfigSchema = z.union([
  z.string(),
  z.tuple([
    z.string(),
    z
      .object({
        autoLoad: z.boolean().optional(),
        options: z.any().optional(),
      })
      .loose(),
  ]),
]);

const caperConfigSchema = z
  .object({
    id: z.string().min(1).optional(),
    application: z.any().optional(),
    defaultScene: z.string().min(1).optional(),
    defaultSceneLoadMethod: z.string().optional(),
    plugins: z.array(pluginConfigSchema).optional(),
    scenes: z.any().optional(),
    assets: z
      .object({
        manifest: z.any().optional(),
        preload: z
          .object({
            bundles: z.array(z.string()).optional(),
          })
          .loose()
          .optional(),
        background: z
          .object({
            bundles: z.array(z.string()).optional(),
          })
          .loose()
          .optional(),
      })
      .loose()
      .optional(),
    useStore: z.boolean().optional(),
    useSpine: z.boolean().optional(),
    useLayout: z.boolean().optional(),
    useVoiceover: z.boolean().optional(),
    useHash: z.boolean().optional(),
    // Build-time only — read by readCaperBuildFlags(), no runtime effect.
    useWasm: z.boolean().optional(),
    showStats: z.boolean().optional(),
    showSceneDebugMenu: z.boolean().optional(),
    resizeToContainer: z.boolean().optional(),
    logger: z.string().optional(),
    sceneGroupOrder: z.array(z.string()).optional(),
  })
  .loose();

/**
 * Evaluate the user's `caper.config.ts` through Vite's own module
 * graph and validate the default export. Dev-only — requires a live
 * `server` (i.e. `vite dev`). Returns `true` on success.
 */
async function validateCaperConfig(server) {
  if (!server || typeof server.ssrLoadModule !== 'function') return true;
  const configPath = path.resolve(cwd, 'caper.config.ts');
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
function readCaperBuildFlags() {
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
function runBuildTimeValidation({
  server,
  configPath,
  configObject,
  scenes,
  plugins,
  popups,
  entities,
  breakpointsName,
}) {
  const warnings = [];
  const bundleNames = loadManifestBundleNames();

  // 1. Scene bundle references
  if (bundleNames && bundleNames.size > 0) {
    for (const scene of scenes) {
      for (const kind of ['preload', 'background']) {
        const bundlesField = scene.assets?.[kind]?.bundles;
        if (!bundlesField) continue;
        const list = Array.isArray(bundlesField) ? bundlesField : [bundlesField];
        for (const bundle of list) {
          if (typeof bundle !== 'string') continue;
          if (!bundleNames.has(bundle)) {
            warnings.push(
              `Scene '${scene.id}' references ${kind} bundle '${bundle}' which is not in the assetpack manifest. ` +
                `Known bundles: ${[...bundleNames].join(', ') || '(none)'}.`,
            );
          }
        }
      }
    }
  }

  // 2 + 3. caper.config.ts cross-references
  const { defaultScene, pluginIds: configPluginIds } = extractConfigReferences(configObject);
  const discoveredPluginIds = new Set(plugins.map((p) => p.id));
  const discoveredSceneIds = new Set(scenes.map((s) => s.id));

  for (const id of configPluginIds) {
    if (!discoveredPluginIds.has(id)) {
      warnings.push(
        `caper.config.ts references plugin '${id}' which was not discovered. ` +
          `Known plugin IDs: ${[...discoveredPluginIds].join(', ') || '(none)'}.`,
      );
    }
  }
  if (defaultScene && !discoveredSceneIds.has(defaultScene)) {
    warnings.push(
      `caper.config.ts defaultScene is '${defaultScene}' but no scene with that id was discovered. ` +
        `Known scene IDs: ${[...discoveredSceneIds].join(', ') || '(none)'}.`,
    );
  }

  // 4. Plugin `requires` cross-references (local plugins only — npm
  // plugins can declare requires on the class itself, which the runtime
  // topo-sort handles, but the AST can't see).
  for (const p of plugins) {
    if (!p.isLocal || !Array.isArray(p.requires) || p.requires.length === 0) continue;
    for (const req of p.requires) {
      if (!discoveredPluginIds.has(req)) {
        warnings.push(
          `Plugin '${p.id}' requires '${req}' which is not a discovered plugin. ` +
            `Known plugin IDs: ${[...discoveredPluginIds].join(', ') || '(none)'}.`,
        );
      }
    }
  }

  // 4b. Plugin `requires` cycle detection (build-time, so the dev sees the
  // cycle in the terminal/overlay before bootstrap even tries to run).
  const cycleEdges = new Map();
  for (const p of plugins) {
    cycleEdges.set(
      p.id,
      (p.requires ?? []).filter((r) => discoveredPluginIds.has(r)),
    );
  }
  const cycle = detectCycle(cycleEdges);
  if (cycle) {
    warnings.push(`Plugin dependency cycle: ${cycle.join(' → ')}`);
  }

  // 5. Duplicate-id detection
  const checkDuplicates = (label, list) => {
    const seen = new Map();
    for (const item of list) {
      if (seen.has(item.id)) {
        warnings.push(`Duplicate ${label} id '${item.id}' — multiple files export the same id.`);
      } else {
        seen.set(item.id, true);
      }
    }
  };
  checkDuplicates('scene', scenes);
  checkDuplicates('plugin', plugins);
  checkDuplicates('popup', popups);
  checkDuplicates('entity', entities);

  // 6. Breakpoints declared in config but not via defineBreakpoints() — the
  // names will work at runtime but get no intellisense.
  if (!breakpointsName && configObject?.type === AST_NODE_TYPES.ObjectExpression) {
    const hasKey = configObject.properties.some(
      (p) => p.type === AST_NODE_TYPES.Property && p.key?.name === 'breakpoints',
    );
    if (hasKey) {
      warnings.push(
        `caper.config.ts sets \`breakpoints\` but no \`defineBreakpoints()\` export was found — breakpoint names will not be type-checked. Wrap the object: \`export const breakpoints = defineBreakpoints({ ... })\`.`,
      );
    }
  }

  if (warnings.length === 0) return;

  for (const msg of warnings) {
    // Vite's createLogger is suppressed inside the dts plugin chain during
    // builds, so go straight to console.warn — yellow ANSI so it stands out
    // amid Vite's own output.
    console.warn(`\x1b[33m[caper] ${msg}\x1b[0m`);
  }

  if (server?.ws) {
    // Surface the first warning in the browser overlay so a dev in the
    // tab notices. Subsequent ones are in the terminal — don't spam the
    // overlay with a stack of them.
    server.ws.send({
      type: 'error',
      err: {
        message:
          `caper build-time validation (${warnings.length} warning${warnings.length === 1 ? '' : 's'}):\n` +
          warnings.map((w) => '  • ' + w).join('\n'),
        id: configPath,
        plugin: 'vite-plugin-caper-config',
      },
    });
  }
}

/**
 * DFS-based cycle detection over a `Map<id, dependencyIds[]>` graph.
 * Returns the cycle path (e.g. `['A','B','A']`) on the first cycle found,
 * or `null` if the graph is acyclic. Used by build-time validation so a
 * plugin requires-cycle surfaces in the terminal before bootstrap runs.
 */
function detectCycle(edges) {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map();
  for (const id of edges.keys()) color.set(id, WHITE);
  const stack = [];

  function visit(id) {
    if (color.get(id) === GRAY) {
      const startIdx = stack.indexOf(id);
      return [...stack.slice(startIdx), id];
    }
    if (color.get(id) === BLACK) return null;
    color.set(id, GRAY);
    stack.push(id);
    for (const dep of edges.get(id) ?? []) {
      const found = visit(dep);
      if (found) return found;
    }
    stack.pop();
    color.set(id, BLACK);
    return null;
  }

  for (const id of edges.keys()) {
    const found = visit(id);
    if (found) return found;
  }
  return null;
}

function caperConfigPlugin(isProject = true) {
  const virtualModuleId = 'virtual:caper-config';
  const resolvedVirtualModuleId = '\0' + virtualModuleId;

  async function generateTypes(server) {
    if (!isProject) return { types: 'export {}' };

    const configPath = path.resolve(cwd, 'caper.config.ts');

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
    const scenes = await discoverScenes(server);
    const plugins = await discoverPlugins(server);
    const popups = await discoverPopups(server);
    const entities = await discoverEntities(server);
    const uis = await discoverUIs(server);
    const localeKeys = await discoverLocaleKeys(server);

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
    const { types, error } = await generateTypes(server);

    if (error) {
      if (server) {
        server.ws.send({
          type: 'error',
          err: {
            message: error.message,
            stack: error.stack,
            id: path.resolve(cwd, 'caper.config.ts'),
            plugin: 'vite-plugin-caper-config',
          },
        });
      }
      return;
    }

    const typesDir = path.resolve(cwd, 'src/types');
    await fs.promises.mkdir(typesDir, { recursive: true });
    await fs.promises.writeFile(path.join(typesDir, DTS_FILE_NAME), types, 'utf-8');

    // Dev-only: evaluate + validate the user's config through Vite's SSR
    // module graph. Failures surface in the overlay with file:line detail.
    // Prod builds skip this (no server).
    if (server) {
      await validateCaperConfig(server);
      server.ws.send({ type: 'full-reload' });
    }
  }

  return {
    name: 'vite-plugin-caper-config',
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

      const configPath = path.resolve(cwd, 'caper.config.ts');
      const scenesDir = path.resolve(cwd, 'src/scenes');
      const pluginsDir = path.resolve(cwd, 'src/plugins');
      const popupsDir = path.resolve(cwd, 'src/popups');
      const entitiesDir = path.resolve(cwd, 'src/entities');
      const localesDir = path.resolve(cwd, 'src/locales');

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
const buildFlags = readCaperBuildFlags();

/**
 * The plugins caper contributes, in order. Internal — the public surface is
 * `caper()` in `../build/index.mjs`, which owns option handling and the config
 * defaults. Lives here for now because every factory below is module-private;
 * the split moves them out (see `plan/vite-preset-rework.md`).
 *
 * @param {{ assets?: object | false, pwa?: object }} [options]
 * @returns {import('vite').PluginOption[]}
 */
export function caperPluginList({ assets = {}, pwa } = {}) {
  // `assets: false` opts out of the asset pipeline entirely — no assetpack run,
  // no generated asset types. Replaces the old `noAssetpackConfig` export.
  const { manifestUrl = 'assets.json', pngFallback = false, ...pipes } = assets === false ? {} : assets;
  const assetPlugins =
    assets === false
      ? []
      : [
          assetpackPlugin(manifestUrl, pipes),
          assetTypesPlugin(manifestUrl),
          // Production ships webp only unless the project asks for the fallback.
          ...(pngFallback ? [] : [pngFallbackPrunePlugin({ manifestUrl })]),
        ];

  return [
    ...(buildFlags.useWasm ? [wasm()] : []),
    createCaperRuntimePlugin({ pwa }),
    viteStaticCopy({
      targets: [
        {
          src: './node_modules/@caperjs/core/src/plugins/captions/font/*.*',
          dest: './assets/caper/font',
        },
      ],
    }),
    pluginListPlugin(),
    sceneListPlugin(),
    popupListPlugin(),
    entityListPlugin(),
    uiListPlugin(),
    ...assetPlugins,
    caperConfigPlugin(),
    caperDevHelperPlugin(),
    ...(pwa ? caperPwaPlugins(pwa) : []),
  ];
}
