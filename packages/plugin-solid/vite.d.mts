import type { PluginOption } from 'vite';

export interface CaperSolidOptions {
  /** Which files are compiled as JSX. Default `['**\/*.tsx']`. */
  include?: string[];
}

/** `vite-plugin-solid`, configured for Caper's universal (Pixi) renderer. */
export declare function caperSolid(options?: CaperSolidOptions): PluginOption;
export default caperSolid;
