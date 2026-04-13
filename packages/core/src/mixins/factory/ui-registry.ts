/**
 * Runtime registry for `this.add.ui(id, props)` lookups.
 *
 * Mirrors the entity registry pattern exactly. The Vite plugin's UI
 * discovery emits a `virtual:caper-uis` module with static imports by
 * default (`defaultDynamic: false`). The `caper-runtime` virtual module
 * pulls that list onto `globalThis.Caper.uiList` before the Application
 * starts.
 *
 * Populated lazily on first lookup — no explicit bootstrap step needed.
 */

type UIConstructor = new (props?: unknown) => unknown;

type UIListItem = {
  id: string;
  active?: boolean;
  module?: UIConstructor | (() => Promise<unknown>);
};

let registry: Map<string, UIConstructor> | null = null;

function ensureRegistry(): Map<string, UIConstructor> {
  if (registry) return registry;
  registry = new Map();
  const list: UIListItem[] =
    (globalThis as unknown as { Caper?: { get?: (key: string) => unknown } }).Caper?.get?.(
      'uiList',
    ) as UIListItem[] | undefined ?? [];
  for (const item of list) {
    if (item.active === false) continue;
    if (typeof item.module === 'function' && item.module.prototype) {
      registry.set(item.id, item.module as UIConstructor);
    }
    // Dynamic (arrow-function) modules have no prototype — skipped, since
    // `this.add.ui` is sync and can't await a dynamic import.
  }
  return registry;
}

export function getUICtor(id: string): UIConstructor | undefined {
  return ensureRegistry().get(id);
}

export function getRegisteredUIIds(): string[] {
  return [...ensureRegistry().keys()];
}

/**
 * Reset the registry. Test-only.
 */
export function _resetUIRegistry(): void {
  registry = null;
}
