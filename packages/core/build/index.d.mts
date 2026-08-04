import type { PluginOption } from 'vite';
import type { VitePWAOptions } from 'vite-plugin-pwa';

export interface CaperOptions {
  /**
   * AssetPack pixi-pipes overrides, deep-merged over caper's defaults.
   * `false` omits the asset plugins entirely. Set `pngFallback: true` to keep
   * the png twins a production build otherwise prunes.
   */
  assets?: Record<string, unknown> | false;
  /**
   * vite-plugin-pwa options, merged over caper's PWA defaults. Absent means no
   * service worker and no web manifest. `autoRegister` (default true) and
   * `update` ('prompt' shows caper's update banner, 'auto' reloads when a new
   * build lands, 'manual' leaves it to the game via `app.onPwaUpdateAvailable`)
   * are caper's own extras.
   */
  pwa?: Partial<VitePWAOptions> & {
    autoRegister?: boolean;
    update?: 'prompt' | 'auto' | 'manual';
  };
}

/**
 * The caper Vite preset. An app's whole `vite.config.ts` is:
 * `export default defineConfig({ plugins: [caper()] })`.
 */
export declare function caper(options?: CaperOptions): PluginOption[];
export default caper;
