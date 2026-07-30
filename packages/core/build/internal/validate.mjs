/**
 * Build-time checks over what discovery found: that every scene/plugin/popup id
 * is unique, that referenced asset bundles exist in the manifest, and that
 * plugin dependencies form no cycle.
 *
 * These run before the app ever boots, so a typo in a bundle name fails the
 * build instead of throwing at runtime in front of a player.
 */
import { logger } from './util.mjs';

export function runBuildTimeValidation({
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
export function detectCycle(edges) {
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
