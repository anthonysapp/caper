import { IPlugin, PluginListItem } from '../plugins/Plugin';
import { type AppTypeOverrides, ImportList, Logger } from '../utils';
import { AppConfig } from './types';

type PluginId = AppTypeOverrides['Plugins'];

export type PluginConfig = PluginId | [PluginId, { autoLoad?: boolean; options?: any }];

/**
 * Resolves the config's plugin list (which may be a mix of IDs and `[id, opts]`
 * tuples) against the discovered plugin registry injected by the Vite runtime
 * plugin. Plugin discovery now includes everything formerly registered as a
 * "storage adapter" — unified into a single list.
 */
export async function generatePluginList<T extends IPlugin = IPlugin>(plugins: PluginConfig[]): Promise<ImportList<T>> {
  const pluginsList: PluginListItem[] =
    ((globalThis as unknown as { Caper?: { get?: (key: string) => unknown } }).Caper?.get?.(
      'pluginsList',
    ) as PluginListItem[] | undefined) ?? [];

  return plugins
    .map((plugin) => {
      const p = pluginsList.find((p) => p.id === plugin || p.id === plugin[0]);
      if (!p) {
        Logger.warn(`Plugin ${plugin} not found`);
        return null;
      }
      const pluginAsArray = plugin as [string, { autoLoad?: boolean; options?: any }];
      return {
        id: p.id,
        path: p.path,
        module: p.module,
        requires: p.requires ?? [],
        options: pluginAsArray[1]?.options,
        autoLoad: pluginAsArray[1]?.autoLoad === false ? false : true,
      };
    })
    .filter(Boolean) as ImportList<T>;
}

export function defineConfig(config: Partial<AppConfig>) {
  return config;
}

/**
 * Topologically sort the active plugin list by each item's `requires` field
 * so dependencies initialize before dependents. Throws on missing required
 * plugin or on cycle. Used by `Application.registerPlugins()` at bootstrap.
 *
 * Behavior:
 *   - If `B.requires = ['A']`, A is initialized before B regardless of the
 *     order they appear in `caper.config.ts plugins[]`.
 *   - If `B.requires = ['A']` but A is not in the active plugin list, this
 *     throws with an error message that names B, names A, and tells the
 *     user to add A to `caper.config.ts plugins[]`. We deliberately do NOT
 *     auto-register the missing dep — the config file is the single source
 *     of truth for what plugins run, and silently inserting transitive
 *     deps would make it stop being trustworthy.
 *   - If a cycle exists (A→B→A), throws with the cycle path printed.
 *
 * Stable order: items with no dependencies preserve their original
 * relative order from `caper.config.ts`. Only items participating in a
 * `requires` chain get reordered.
 */
export function sortPluginsByRequires<T extends ImportList<IPlugin>[number]>(items: T[]): T[] {
  if (items.length < 2) return items.slice();

  const byId = new Map<string, T>();
  for (const it of items) byId.set(it.id, it);

  // Verify every required id is present in the active set. Collect ALL
  // missing deps before throwing so the user can fix them in one pass
  // rather than play whack-a-mole.
  const missing: Array<{ from: string; required: string }> = [];
  for (const it of items) {
    for (const req of it.requires ?? []) {
      if (!byId.has(req)) missing.push({ from: it.id, required: req });
    }
  }
  if (missing.length > 0) {
    const lines = missing.map(
      (m) => `  - Plugin '${m.from}' requires '${m.required}' which is not registered.`,
    );
    const fix =
      `\nAdd the missing plugin id(s) to plugins[] in caper.config.ts:\n  ` +
      [...new Set(missing.map((m) => `'${m.required}'`))].join(', ');
    throw new Error(`Caper bootstrap failed:\n${lines.join('\n')}${fix}`);
  }

  // Kahn's algorithm with deterministic tie-breaking by original index.
  const indexOf = new Map<string, number>();
  items.forEach((it, i) => indexOf.set(it.id, i));

  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>(); // id → [ids that require it]
  for (const it of items) {
    inDegree.set(it.id, (it.requires ?? []).length);
    for (const req of it.requires ?? []) {
      if (!dependents.has(req)) dependents.set(req, []);
      dependents.get(req)!.push(it.id);
    }
  }

  // Ready queue, ordered by original index for stability.
  const ready: string[] = [];
  for (const it of items) {
    if (inDegree.get(it.id) === 0) ready.push(it.id);
  }
  ready.sort((a, b) => indexOf.get(a)! - indexOf.get(b)!);

  const result: T[] = [];
  while (ready.length > 0) {
    const id = ready.shift()!;
    result.push(byId.get(id)!);
    for (const dep of dependents.get(id) ?? []) {
      inDegree.set(dep, inDegree.get(dep)! - 1);
      if (inDegree.get(dep) === 0) {
        // Insert in original-index order to keep stable.
        const idx = indexOf.get(dep)!;
        let i = 0;
        while (i < ready.length && indexOf.get(ready[i])! < idx) i++;
        ready.splice(i, 0, dep);
      }
    }
  }

  if (result.length !== items.length) {
    // Cycle: find one and report it.
    const remaining = items.filter((it) => !result.includes(it)).map((it) => it.id);
    const cyclePath = findCyclePath(remaining, byId);
    throw new Error(
      `Caper bootstrap failed: plugin dependency cycle detected: ${cyclePath.join(' → ')}\n` +
        `Plugins involved: ${remaining.join(', ')}`,
    );
  }

  return result;
}

function findCyclePath<T extends { id: string; requires?: string[] }>(
  remainingIds: string[],
  byId: Map<string, T>,
): string[] {
  // DFS from each remaining node until we revisit a node on the current path.
  const onStack = new Set<string>();
  const path: string[] = [];
  const remaining = new Set(remainingIds);

  function dfs(id: string): string[] | null {
    if (onStack.has(id)) {
      const startIdx = path.indexOf(id);
      return [...path.slice(startIdx), id];
    }
    if (!remaining.has(id)) return null;
    onStack.add(id);
    path.push(id);
    for (const req of byId.get(id)?.requires ?? []) {
      const found = dfs(req);
      if (found) return found;
    }
    path.pop();
    onStack.delete(id);
    return null;
  }

  for (const id of remainingIds) {
    const found = dfs(id);
    if (found) return found;
  }
  return remainingIds;
}
