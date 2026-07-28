import type { BreakpointMode } from './types';

/**
 * Declare an app's tier ladder and modes in `caper.config.ts`. Returns the
 * config unchanged — its value is the inferred literal key types, which the
 * Vite plugin re-exports into `caper-app.d.ts` so tier and mode names
 * autocomplete everywhere.
 *
 * @example
 * ```ts
 * export const breakpoints = defineBreakpoints({
 *   tiers: { mobile: 0, tablet: 768, desktop: 1024 },
 *   modes: { stacked: { below: 880 } },
 * });
 * ```
 */
export function defineBreakpoints<
  const T extends Record<string, number>,
  const M extends Record<string, BreakpointMode<keyof T & string>> = {},
>(config: { tiers: T; modes?: M }): { tiers: T; modes: M } {
  return { tiers: config.tiers, modes: (config.modes ?? {}) as M };
}
