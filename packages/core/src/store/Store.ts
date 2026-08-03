import type { IApplication } from '../core';
import { isStorageCapable, type IStorageCapability } from '../core/interfaces/IStorageCapability';
import type { IPlugin } from '../plugins/Plugin';
import { Signal } from '../signals';
import { type AppTypeOverrides, Logger } from '../utils';

export type StoreErrorDetail = {
  adapterId: string;
  operation: 'save' | 'load';
  key: string;
  error: Error;
};

type AppPlugins = AppTypeOverrides['Plugins'];

/**
 * Configuration for a single save call.
 */
type AdapterSaveConfig = {
  adapterId: string;
  awaitSave: boolean;
};

/**
 * Thin façade over the Application's plugin registry.
 *
 * A "storage adapter" is nothing more than a `Plugin` whose instance implements
 * {@link IStorageCapability}. The `Store` doesn't own a second registry — it
 * just filters `app._plugins` for storage-capable entries and routes save/load
 * calls through them.
 */
export interface IStore {
  initialize(app: IApplication): IStore;

  destroy(): void;

  getAdapter<T extends IStorageCapability = IStorageCapability>(adapterId: AppPlugins): T;

  hasAdapter(adapterId: AppPlugins): boolean;

  save(
    adapterId: AppPlugins | AppPlugins[] | Partial<AdapterSaveConfig> | Partial<AdapterSaveConfig>[],
    key: string,
    data: any,
    awaitSave?: boolean,
  ): Promise<any>;

  load(adapterId: AppPlugins, key: string): Promise<any>;

  onError: Signal<(detail: StoreErrorDetail) => void>;
}

export class Store implements IStore {
  public readonly onError = new Signal<(detail: StoreErrorDetail) => void>();
  private _app!: IApplication;

  public initialize(app: IApplication): IStore {
    this._app = app;
    return this;
  }

  public destroy(): void {
    // Plugin lifecycle is owned by Application. Nothing to clean up here.
    this.onError.disconnectAll();
  }

  private _emitError(detail: StoreErrorDetail): void {
    Logger.error(
      `[Store.${detail.operation}] adapter='${detail.adapterId}' key='${detail.key}': ${detail.error.message}`,
    );
    this.onError.emit(detail);
  }

  /**
   * Returns a storage-capable plugin by id. Throws if the plugin is missing or
   * does not implement {@link IStorageCapability}.
   */
  public getAdapter<T extends IStorageCapability = IStorageCapability>(adapterId: AppPlugins): T {
    const plugin = this._app.getPlugin(adapterId as string) as unknown as IPlugin & Partial<IStorageCapability>;
    if (!plugin) {
      throw new Error(`Adapter ${String(adapterId)} not found`);
    }
    if (!isStorageCapable(plugin)) {
      throw new Error(`Plugin '${String(adapterId)}' is not storage-capable (missing save/load)`);
    }
    return plugin as unknown as T;
  }

  public hasAdapter(adapterId: AppPlugins): boolean {
    const plugin = this._app.getPlugin(adapterId as string) as unknown as IPlugin | undefined;
    return !!plugin && isStorageCapable(plugin);
  }

  /**
   * Iterates every storage-capable plugin currently registered with the app.
   */
  private allAdapterIds(): string[] {
    // Application exposes its plugin map as `_plugins` (protected). We reach in
    // via a known cast rather than widening the public IApplication surface.
    const map = (this._app as unknown as { _plugins: Map<string, IPlugin> })._plugins;
    const ids: string[] = [];
    if (map) {
      for (const [id, plugin] of map) {
        if (isStorageCapable(plugin)) ids.push(id);
      }
    }
    return ids;
  }

  public async save(
    adapterId: AppPlugins | AppPlugins[] | Partial<AdapterSaveConfig> | Partial<AdapterSaveConfig>[],
    key: string,
    data: any,
    awaitSave = true,
  ): Promise<any> {
    let keys: string[] | Partial<AdapterSaveConfig>[] = [];
    const result: any[] = [];

    if (!Array.isArray(adapterId)) {
      if (typeof adapterId === 'object') {
        keys = [adapterId];
      } else {
        keys = [adapterId as string];
      }
    } else {
      keys = adapterId as string[] | Partial<AdapterSaveConfig>[];
    }

    const hasStarKey = keys.some(
      (k) => (k as string) === '*' || (k as Partial<AdapterSaveConfig>)?.adapterId === '*',
    );
    if (hasStarKey) {
      keys = this.allAdapterIds();
    }

    for (let i = 0; i < keys.length; i++) {
      let aKey: string;
      let shouldAwait = false;
      if (typeof keys[i] === 'object') {
        const obj = keys[i] as Partial<AdapterSaveConfig>;
        aKey = obj.adapterId as string;
        shouldAwait = obj.awaitSave ?? false;
      } else {
        aKey = keys[i] as unknown as string;
        shouldAwait = awaitSave;
      }

      let adapter: IStorageCapability;
      try {
        adapter = this.getAdapter(aKey as AppPlugins);
      } catch (e) {
        this._emitError({ adapterId: aKey, operation: 'save', key, error: e as Error });
        throw e;
      }

      if (shouldAwait) {
        try {
          result.push(await adapter.save(key, data));
        } catch (e) {
          this._emitError({ adapterId: aKey, operation: 'save', key, error: e as Error });
          throw e;
        }
      } else {
        // Fire-and-forget: don't block caller, but never let failures vanish
        // as unhandled promise rejections. Route them through onError instead.
        const idForSignal = aKey;
        result.push(
          adapter.save(key, data).catch((e: unknown) => {
            this._emitError({
              adapterId: idForSignal,
              operation: 'save',
              key,
              error: e as Error,
            });
          }),
        );
      }
    }
    return result;
  }

  public async load(adapterId: AppPlugins, key: string): Promise<any> {
    try {
      return await this.getAdapter(adapterId).load(key);
    } catch (e) {
      this._emitError({
        adapterId: adapterId as string,
        operation: 'load',
        key,
        error: e as Error,
      });
      throw e;
    }
  }
}
