/**
 * Marker interface for plugins that can act as a key/value store.
 *
 * Any plugin whose instance has `save` and `load` methods is considered
 * storage-capable and will be reachable via `app.store.getAdapter(id)` /
 * `app.store.save(id, ...)` / `app.store.load(id, ...)`.
 *
 * Implementations are free to interpret `key` and the variadic tail however
 * they like — e.g. Firebase treats `key` as a collection name.
 */
export interface IStorageCapability<TSaveResult = any, TLoadResult = any> {
  save(key: string, data: any, ...rest: any[]): Promise<TSaveResult> | TSaveResult;
  load(key: string, ...rest: any[]): Promise<TLoadResult | undefined> | TLoadResult | undefined;
}

/**
 * Duck-typed guard. No base class, no inheritance — any plugin that defines
 * `save` and `load` qualifies.
 */
export function isStorageCapable(plugin: unknown): plugin is IStorageCapability {
  return (
    !!plugin &&
    typeof (plugin as IStorageCapability).save === 'function' &&
    typeof (plugin as IStorageCapability).load === 'function'
  );
}
