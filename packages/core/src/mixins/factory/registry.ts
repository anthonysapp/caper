/**
 * Runtime registry for `this.add.entity(id, props)` lookups.
 *
 * The Vite plugin's entity discovery emits a `virtual:caper-entities` module
 * with static imports by default (`defaultDynamic: false` in
 * `discoverLocalClassFiles`). The `caper-runtime` virtual module pulls that
 * list onto `globalThis.Caper.entityList` before the Application starts, so
 * by the time any scene fires `initialize()` and calls `this.add.entity`,
 * the list is in place.
 *
 * This registry is populated lazily on first lookup — no explicit bootstrap
 * step needed. Entities declared with `defineEntity({ dynamic: true })` have
 * an async `module` function and are skipped: the sync factory API can't
 * wait for them. That's an intentional tradeoff — if a project needs code-
 * split entities, they use `add.existing(new Foo(...), props)` with a
 * manual lazy import instead.
 */

type EntityConstructor = new (props?: unknown) => unknown;

type EntityListItem = {
  id: string;
  active?: boolean;
  module?: EntityConstructor | (() => Promise<unknown>);
};

let registry: Map<string, EntityConstructor> | null = null;

function ensureRegistry(): Map<string, EntityConstructor> {
  if (registry) return registry;
  registry = new Map();
  const list: EntityListItem[] =
    (globalThis as unknown as { Caper?: { get?: (key: string) => unknown } }).Caper?.get?.(
      'entityList',
    ) as EntityListItem[] | undefined ?? [];
  for (const item of list) {
    if (item.active === false) continue;
    if (typeof item.module === 'function' && item.module.prototype) {
      registry.set(item.id, item.module as EntityConstructor);
    }
    // Dynamic (arrow-function) modules have no prototype — skipped, since
    // `this.add.entity` is sync and can't await a dynamic import.
  }
  return registry;
}

export function getEntityCtor(id: string): EntityConstructor | undefined {
  return ensureRegistry().get(id);
}

export function getRegisteredEntityIds(): string[] {
  return [...ensureRegistry().keys()];
}

/**
 * Reset the registry. Test-only — production code should rely on the lazy
 * initialization from `globalThis.Caper.entityList`.
 */
export function _resetEntityRegistry(): void {
  registry = null;
}
