import { Logger } from '../../utils';
import type { Size } from '../../utils';

import type { BreakpointContext, BreakpointMode, BreakpointNameLike, Pointer } from './types';

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

/** Build the evaluated state from a raw size plus the pointer axis. */
export function buildContext(size: Size, ladder: NormalizedLadder, pointer: Pointer): BreakpointContext {
  const { width, height } = size;
  return {
    width,
    height,
    aspect: height === 0 ? 0 : width / height,
    tier: resolveTier(ladder, width),
    orientation: width > height ? 'landscape' : 'portrait',
    pointer,
  };
}

/**
 * Every name currently true: the active tier, both axis values, and each
 * matching mode. One set backs `is()`, the enter/leave signals and the diff,
 * so they can never disagree.
 */
export function activeNames(
  ctx: BreakpointContext,
  modes: ReadonlyMap<string, BreakpointMode>,
  ladder: NormalizedLadder,
): Set<string> {
  const active = new Set<string>([ctx.tier as string, ctx.orientation, ctx.pointer]);
  for (const [name, mode] of modes) {
    if (matchesMode(ctx, mode, ladder, name)) active.add(name);
  }
  return active;
}

/** Names that turned on and off between two active sets. */
export function diffNames(
  prev: ReadonlySet<string>,
  next: ReadonlySet<string>,
): { entered: string[]; left: string[] } {
  const entered: string[] = [];
  const left: string[] = [];
  for (const name of next) if (!prev.has(name)) entered.push(name);
  for (const name of prev) if (!next.has(name)) left.push(name);
  return { entered, left };
}

/**
 * Mobile-first cascade: the entry for the current tier, else the nearest
 * defined tier below it, else the lowest defined entry. A non-empty map
 * therefore never yields undefined. An explicit `undefined` value counts as
 * absent, which is what makes partial maps ergonomic.
 *
 * An unknown tier behaves like the bottom of the ladder (index -1), so the
 * first loop is skipped and the lowest defined entry wins.
 */
export function resolveValue<T>(
  ladder: NormalizedLadder,
  tier: BreakpointNameLike,
  map: Partial<Record<string, T>>,
): T | undefined {
  const idx = ladder.names.indexOf(tier as string);
  for (let i = idx; i >= 0; i--) {
    const value = map[ladder.names[i]];
    if (value !== undefined) return value;
  }
  for (let i = 0; i < ladder.names.length; i++) {
    const value = map[ladder.names[i]];
    if (value !== undefined) return value;
  }
  return undefined;
}
