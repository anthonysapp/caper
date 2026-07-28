import type { AppTypeOverrides, Orientation, Size } from '../../utils';

/** Default ladder. Values are min-widths; the lowest must be 0. */
export const defaultBreakpoints = {
  mobile: 0,
  tablet: 768,
  desktop: 1024,
  wide: 1440,
} as const;

export type DefaultTierName = keyof typeof defaultBreakpoints;

export type Pointer = 'coarse' | 'fine';

/**
 * Ladder tier names. When the app declares its own set in `caper.config.ts`,
 * the generated `Breakpoints` override REPLACES the defaults rather than
 * adding to them — a config with `ultrawide` but no `mobile` must not
 * autocomplete `mobile`.
 */
export type BreakpointTierName = AppTypeOverrides extends { Breakpoints: infer B }
  ? B & string
  : DefaultTierName;

/** Config-declared mode names. `never` when none are declared. */
export type BreakpointModeName = AppTypeOverrides extends { BreakpointModes: infer M }
  ? M & string
  : never;

/** Everything nameable: tiers, modes and axis values share one namespace. */
export type BreakpointName = BreakpointTierName | BreakpointModeName | Orientation | Pointer;

/**
 * Accepted at call sites: known names autocomplete, runtime-defined names
 * still compile.
 */
export type BreakpointNameLike = BreakpointName | (string & {});

/** The evaluated state every decision is made against. */
export interface BreakpointContext {
  width: number;
  height: number;
  /** width / height; 0 when height is 0 */
  aspect: number;
  tier: BreakpointNameLike;
  orientation: Orientation;
  pointer: Pointer;
}

/** The body of a mode: a condition object, or a predicate for anything else. */
export type BreakpointMode<N extends string = BreakpointNameLike> =
  | ((ctx: BreakpointContext) => boolean)
  | {
      /** the active tier is this one (or one of these) */
      tier?: N | N[];
      /** width >= this stop (tier name or raw px) */
      atLeast?: N | number;
      /** width < this stop (tier name or raw px) */
      below?: N | number;
      orientation?: Orientation;
      pointer?: Pointer;
      minHeight?: number;
      maxHeight?: number;
    };

/** The shape of the top-level `breakpoints` key in caper.config.ts. */
export type BreakpointsConfig<
  T extends Record<string, number> = Record<string, number>,
  M extends Record<string, BreakpointMode> = Record<string, BreakpointMode>,
> = {
  tiers: T;
  modes: M;
};

/** What the plugin receives from `config.breakpoints`; both halves optional. */
export type BreakpointPluginOptions = Partial<BreakpointsConfig>;

export interface BreakpointChangeDetail {
  current: BreakpointNameLike;
  previous: BreakpointNameLike;
  /** names that became true this evaluation — tiers, modes, orientation, pointer */
  entered: string[];
  /** names that became false this evaluation */
  left: string[];
  size: Size;
}
