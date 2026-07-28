import { Logger } from '../../utils';

import type { BreakpointContext, BreakpointMode, BreakpointNameLike } from './types';

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

/** Names already warned about, so a resize drag cannot flood the console. */
const warned = new Set<string>();

function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  Logger.warn(message);
}

/**
 * Turn a tier name or raw pixel value into a width stop. The single place
 * names become numbers, so mode bodies and the plugin's own `atLeast`/`below`
 * cannot disagree.
 */
export function resolveStop(
  ladder: NormalizedLadder,
  value: BreakpointNameLike | number,
): number | undefined {
  if (typeof value === 'number') return value;
  const stop = ladder.byName[value];
  if (stop === undefined) {
    warnOnce(`stop:${value}`, `[breakpoints] unknown tier '${value}' — known tiers: ${ladder.names.join(', ')}.`);
  }
  return stop;
}

/**
 * Evaluate one mode against a context. Object keys are ANDed; an unknown tier
 * name fails the whole mode; a throwing predicate is treated as false.
 */
export function matchesMode(
  ctx: BreakpointContext,
  mode: BreakpointMode,
  ladder: NormalizedLadder,
  label = 'mode',
): boolean {
  if (typeof mode === 'function') {
    try {
      return mode(ctx) === true;
    } catch (e) {
      warnOnce(`predicate:${label}`, `[breakpoints] mode '${label}' threw; treating as false. ${String(e)}`);
      return false;
    }
  }

  if (mode.tier !== undefined) {
    const wanted = Array.isArray(mode.tier) ? mode.tier : [mode.tier];
    if (!wanted.includes(ctx.tier as never)) return false;
  }

  if (mode.atLeast !== undefined) {
    const stop = resolveStop(ladder, mode.atLeast);
    if (stop === undefined || ctx.width < stop) return false;
  }

  if (mode.below !== undefined) {
    const stop = resolveStop(ladder, mode.below);
    if (stop === undefined || ctx.width >= stop) return false;
  }

  if (mode.orientation !== undefined && ctx.orientation !== mode.orientation) return false;
  if (mode.pointer !== undefined && ctx.pointer !== mode.pointer) return false;
  if (mode.minHeight !== undefined && ctx.height < mode.minHeight) return false;
  if (mode.maxHeight !== undefined && ctx.height > mode.maxHeight) return false;

  return true;
}
