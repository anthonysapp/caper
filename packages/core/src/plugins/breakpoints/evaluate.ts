import type { BreakpointNameLike } from './types';

/**
 * A tier ladder, validated and sorted ascending by stop. `names[i]` and
 * `stops[i]` are parallel arrays so tier lookup is a single forward scan.
 */
export interface NormalizedLadder {
  readonly names: string[];
  readonly stops: number[];
  readonly byName: Readonly<Record<string, number>>;
}

/**
 * Validate and sort a tier map. Throws rather than warns: a silently wrong
 * ladder is far more expensive to debug than a boot failure (spec §11).
 */
export function normalizeTiers(tiers: Record<string, number>): NormalizedLadder {
  const entries = Object.entries(tiers);
  if (entries.length === 0) {
    throw new Error('[breakpoints] `tiers` is empty — declare at least one tier in caper.config.ts.');
  }

  for (const [name, stop] of entries) {
    if (!Number.isFinite(stop) || stop < 0) {
      throw new Error(
        `[breakpoints] tier '${name}' has an invalid stop (${stop}) — stops must be finite numbers >= 0.`,
      );
    }
  }

  const sorted = entries.slice().sort((a, b) => a[1] - b[1]);

  if (sorted[0][1] !== 0) {
    throw new Error(
      `[breakpoints] the lowest tier must start at 0, but '${sorted[0][0]}' starts at ${sorted[0][1]}.`,
    );
  }

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i][1] === sorted[i - 1][1]) {
      throw new Error(
        `[breakpoints] tiers '${sorted[i - 1][0]}' and '${sorted[i][0]}' share the same stop (${sorted[i][1]}) — stops must be unique.`,
      );
    }
  }

  return {
    names: sorted.map(([name]) => name),
    stops: sorted.map(([, stop]) => stop),
    byName: Object.fromEntries(sorted),
  };
}

/** The highest tier whose stop is <= width. Clamps to the lowest tier. */
export function resolveTier(ladder: NormalizedLadder, width: number): BreakpointNameLike {
  let name = ladder.names[0];
  for (let i = 0; i < ladder.stops.length; i++) {
    if (width < ladder.stops[i]) break;
    name = ladder.names[i];
  }
  return name;
}
