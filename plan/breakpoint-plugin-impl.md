# BreakpointPlugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-party `BreakpointPlugin` to `@caperjs/core` that turns raw resize events into named tiers, modes and axes, declared in `caper.config.ts` with generated intellisense.

**Architecture:** All decision logic lives in pure functions in `evaluate.ts` (no DOM, no app) and is unit-tested directly; `BreakpointPlugin.ts` is a thin stateful shell that feeds those functions the renderer size and fans results out over signals. Config reaches the plugin for free because `Application.registerPlugins` sources a default plugin's options from `this.config[plugin.id]`, and typed names reach the app via the same `caper-app.d.ts` codegen path `defineActions`/`defineData` already use.

**Tech Stack:** TypeScript, vitest (happy-dom, `globals: false`), `typed-signals` via `src/signals`, oxc AST parsing in `config/vite.mjs`.

**Design spec:** `plan/breakpoint-plugin.md` — read it before starting. Section references below (§N) point at it.

## Global Constraints

- All work is inside `packages/core` unless a task says otherwise. Run commands from `packages/core`.
- Tests: `pnpm test` (vitest run). Single file: `pnpm vitest run src/plugins/breakpoints/<file>.test.ts`.
- Lint: `pnpm lint`. Must pass before every commit.
- `globals: false` in vitest config — every test file imports `describe`, `it`, `expect` from `vitest` explicitly.
- Conventional commits (commitlint is installed at the repo root). Use `feat(breakpoints): …`, `test(breakpoints): …`, `chore(breakpoints): …`.
- Default ladder is exactly `{ mobile: 0, tablet: 768, desktop: 1024, wide: 1440 }`.
- Vocabulary is fixed (§2): **tier** = ordered ladder rung, **mode** = named boolean condition, **axis** = orientation/pointer. Direction words are `atLeast` / `below`. Do not reintroduce `queries`, `up`, or `down` anywhere, including comments.
- Internal code paths use `BreakpointNameLike` (not `BreakpointName`) — inside the framework `AppTypeOverrides` is empty, so `BreakpointName` narrows to the default tiers and would reject an app's custom names.
- No `any` in exported signatures.

---

## File Structure

**Created — `packages/core/src/plugins/breakpoints/`**

| File | Responsibility |
| --- | --- |
| `types.ts` | Public types, `defaultBreakpoints`, name-union resolution against `AppTypeOverrides` |
| `evaluate.ts` | Every decision: ladder normalization, tier resolution, mode matching, context building, active-set diffing, `value()` cascade. Pure — no DOM, no app, no signals |
| `evaluate.test.ts` | Unit spec for `evaluate.ts` (Tasks 1–4) |
| `methods.ts` | `defineBreakpoints()` — config-facing type helper only |
| `BreakpointPlugin.ts` | Lifecycle, signal fan-out, `define`/`undefine`, read API delegating to `evaluate.ts` |
| `BreakpointPlugin.test.ts` | Plugin-level spec (Task 5) |
| `index.ts` | Re-exports |

**Deviation from spec §4:** the spec lists one test file; this plan uses two (`evaluate.test.ts` for the pure layer, `BreakpointPlugin.test.ts` for the shell). The split keeps the pure tests free of the `vi.mock('../core')` stubbing that plugin tests need.

**Modified**

| File | Change |
| --- | --- |
| `src/plugins/defaults.ts` | Register the plugin after `resizer` |
| `src/plugins/index.ts` | `export * from './breakpoints'` |
| `src/core/Application.ts` | Lazy `get breakpoints()` |
| `src/core/interfaces/IApplication.ts` | `breakpoints: IBreakpointPlugin` |
| `src/core/interfaces/IApplicationOptions.ts` | `breakpoints: Partial<BreakpointsConfig>` |
| `src/core/interfaces/ICoreSignals.ts` | `onBreakpointChanged` |
| `config/vite.mjs` | Codegen in `generateTypes` + one warning in `runBuildTimeValidation` |
| `apps/kitchen-sink/…` | Worked example (Task 8) |

---

### Task 1: Types and the tier ladder

**Files:**
- Create: `packages/core/src/plugins/breakpoints/types.ts`
- Create: `packages/core/src/plugins/breakpoints/evaluate.ts`
- Test: `packages/core/src/plugins/breakpoints/evaluate.test.ts`

**Interfaces:**
- Consumes: `Orientation` from `../../utils` (defined in `utils/web.ts`), `Size` from `../../utils`, `AppTypeOverrides` from `../../utils`.
- Produces: `defaultBreakpoints`, `DefaultTierName`, `Pointer`, `BreakpointTierName`, `BreakpointModeName`, `BreakpointName`, `BreakpointNameLike`, `BreakpointContext`, `BreakpointMode`, `BreakpointsConfig`, `BreakpointPluginOptions`, `BreakpointChangeDetail`, `NormalizedLadder`, `normalizeTiers(tiers)`, `resolveTier(ladder, width)`.

- [ ] **Step 1: Write `types.ts`**

This file is types only — no runtime logic beyond the default ladder constant.

```ts
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
```

- [ ] **Step 2: Write the failing tests for the ladder**

Create `evaluate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { defaultBreakpoints } from './types';
import { normalizeTiers, resolveTier } from './evaluate';

describe('normalizeTiers', () => {
  it('sorts by stop regardless of key order', () => {
    const ladder = normalizeTiers({ desktop: 1024, mobile: 0, tablet: 768 });
    expect(ladder.names).toEqual(['mobile', 'tablet', 'desktop']);
    expect(ladder.stops).toEqual([0, 768, 1024]);
    expect(ladder.byName.tablet).toBe(768);
  });

  it('throws on an empty ladder', () => {
    expect(() => normalizeTiers({})).toThrow(/at least one tier/i);
  });

  it('throws when the lowest tier does not start at 0', () => {
    expect(() => normalizeTiers({ small: 320, large: 1024 })).toThrow(/must start at 0/i);
  });

  it('throws on duplicate stops', () => {
    expect(() => normalizeTiers({ a: 0, b: 768, c: 768 })).toThrow(/same stop/i);
  });

  it('throws on a negative or non-finite stop', () => {
    expect(() => normalizeTiers({ a: 0, b: -1 })).toThrow(/invalid stop/i);
    expect(() => normalizeTiers({ a: 0, b: Number.NaN })).toThrow(/invalid stop/i);
  });
});

describe('resolveTier', () => {
  const ladder = normalizeTiers({ ...defaultBreakpoints });

  it('resolves each boundary exactly', () => {
    expect(resolveTier(ladder, 0)).toBe('mobile');
    expect(resolveTier(ladder, 767)).toBe('mobile');
    expect(resolveTier(ladder, 768)).toBe('tablet');
    expect(resolveTier(ladder, 1023)).toBe('tablet');
    expect(resolveTier(ladder, 1024)).toBe('desktop');
    expect(resolveTier(ladder, 1439)).toBe('desktop');
    expect(resolveTier(ladder, 1440)).toBe('wide');
    expect(resolveTier(ladder, 99999)).toBe('wide');
  });

  it('clamps below the lowest stop to the lowest tier', () => {
    expect(resolveTier(ladder, -50)).toBe('mobile');
  });

  it('works with a custom ladder', () => {
    const custom = normalizeTiers({ tiny: 0, huge: 2200 });
    expect(resolveTier(custom, 2199)).toBe('tiny');
    expect(resolveTier(custom, 2200)).toBe('huge');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm vitest run src/plugins/breakpoints/evaluate.test.ts`
Expected: FAIL — `Failed to resolve import "./evaluate"`.

- [ ] **Step 4: Write `evaluate.ts` (ladder half only)**

```ts
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run src/plugins/breakpoints/evaluate.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 6: Lint and commit**

```bash
pnpm lint
git add packages/core/src/plugins/breakpoints/
git commit -m "feat(breakpoints): add types and tier ladder resolution"
```

---

### Task 2: Mode matching

**Files:**
- Modify: `packages/core/src/plugins/breakpoints/evaluate.ts` (append)
- Test: `packages/core/src/plugins/breakpoints/evaluate.test.ts` (append)

**Interfaces:**
- Consumes: `NormalizedLadder`, `resolveTier` (Task 1); `BreakpointContext`, `BreakpointMode` (Task 1).
- Produces: `resolveStop(ladder, value)` → `number | undefined`; `matchesMode(ctx, mode, ladder, label?)` → `boolean`.

`resolveStop` is the single place a tier name becomes a pixel value — it backs `atLeast`/`below` in both mode bodies and the plugin's own methods, which is what guarantees the two agree.

- [ ] **Step 1: Write the failing tests**

Append to `evaluate.test.ts`:

```ts
import { matchesMode, resolveStop } from './evaluate';
import type { BreakpointContext } from './types';

const ladder = normalizeTiers({ ...defaultBreakpoints });

function ctx(overrides: Partial<BreakpointContext> = {}): BreakpointContext {
  return {
    width: 800,
    height: 600,
    aspect: 800 / 600,
    tier: 'tablet',
    orientation: 'landscape',
    pointer: 'fine',
    ...overrides,
  };
}

describe('resolveStop', () => {
  it('passes numbers through', () => {
    expect(resolveStop(ladder, 880)).toBe(880);
  });

  it('resolves a tier name to its stop', () => {
    expect(resolveStop(ladder, 'tablet')).toBe(768);
  });

  it('returns undefined for an unknown name', () => {
    expect(resolveStop(ladder, 'nope')).toBeUndefined();
  });
});

describe('matchesMode', () => {
  it('matches an empty condition', () => {
    expect(matchesMode(ctx(), {}, ladder)).toBe(true);
  });

  it('matches a single tier', () => {
    expect(matchesMode(ctx({ tier: 'tablet' }), { tier: 'tablet' }, ladder)).toBe(true);
    expect(matchesMode(ctx({ tier: 'mobile' }), { tier: 'tablet' }, ladder)).toBe(false);
  });

  it('matches tier membership in an array', () => {
    const mode = { tier: ['mobile', 'tablet'] };
    expect(matchesMode(ctx({ tier: 'mobile' }), mode, ladder)).toBe(true);
    expect(matchesMode(ctx({ tier: 'tablet' }), mode, ladder)).toBe(true);
    expect(matchesMode(ctx({ tier: 'desktop' }), mode, ladder)).toBe(false);
  });

  it('resolves atLeast/below by tier name identically to the raw stop', () => {
    const byName = matchesMode(ctx({ width: 768 }), { atLeast: 'tablet' }, ladder);
    const byPx = matchesMode(ctx({ width: 768 }), { atLeast: 768 }, ladder);
    expect(byName).toBe(true);
    expect(byPx).toBe(byName);

    expect(matchesMode(ctx({ width: 767 }), { atLeast: 'tablet' }, ladder)).toBe(false);
    expect(matchesMode(ctx({ width: 767 }), { below: 'tablet' }, ladder)).toBe(true);
    expect(matchesMode(ctx({ width: 768 }), { below: 'tablet' }, ladder)).toBe(false);
  });

  it('is false when a stop name is unknown', () => {
    expect(matchesMode(ctx(), { atLeast: 'nope' }, ladder)).toBe(false);
    expect(matchesMode(ctx(), { below: 'nope' }, ladder)).toBe(false);
  });

  it('ANDs every key', () => {
    const mode = { atLeast: 'tablet' as const, orientation: 'landscape' as const };
    expect(matchesMode(ctx({ width: 900, orientation: 'landscape' }), mode, ladder)).toBe(true);
    expect(matchesMode(ctx({ width: 900, orientation: 'portrait' }), mode, ladder)).toBe(false);
    expect(matchesMode(ctx({ width: 400, orientation: 'landscape' }), mode, ladder)).toBe(false);
  });

  it('matches the pointer and height keys', () => {
    expect(matchesMode(ctx({ pointer: 'coarse' }), { pointer: 'coarse' }, ladder)).toBe(true);
    expect(matchesMode(ctx({ pointer: 'fine' }), { pointer: 'coarse' }, ladder)).toBe(false);
    expect(matchesMode(ctx({ height: 600 }), { minHeight: 600 }, ladder)).toBe(true);
    expect(matchesMode(ctx({ height: 599 }), { minHeight: 600 }, ladder)).toBe(false);
    expect(matchesMode(ctx({ height: 600 }), { maxHeight: 600 }, ladder)).toBe(true);
    expect(matchesMode(ctx({ height: 601 }), { maxHeight: 600 }, ladder)).toBe(false);
  });

  it('supports a predicate', () => {
    expect(matchesMode(ctx({ width: 800, height: 600 }), (c) => c.aspect > 1, ladder)).toBe(true);
    expect(matchesMode(ctx(), () => false, ladder)).toBe(false);
  });

  it('treats a throwing predicate as false', () => {
    const boom = () => {
      throw new Error('boom');
    };
    expect(matchesMode(ctx(), boom, ladder, 'boom')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/plugins/breakpoints/evaluate.test.ts`
Expected: FAIL — `matchesMode is not a function` / no export named `resolveStop`.

- [ ] **Step 3: Implement**

Append to `evaluate.ts`, and add `Logger` to the imports at the top:

```ts
import { Logger } from '../../utils';
import type { BreakpointContext, BreakpointMode, BreakpointNameLike } from './types';
```

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/plugins/breakpoints/evaluate.test.ts`
Expected: PASS — 20 tests.

- [ ] **Step 5: Lint and commit**

```bash
pnpm lint
git add packages/core/src/plugins/breakpoints/
git commit -m "feat(breakpoints): add mode matching and stop resolution"
```

---

### Task 3: Context building and active-set diffing

**Files:**
- Modify: `packages/core/src/plugins/breakpoints/evaluate.ts` (append)
- Test: `packages/core/src/plugins/breakpoints/evaluate.test.ts` (append)

**Interfaces:**
- Consumes: `NormalizedLadder`, `resolveTier`, `matchesMode` (Tasks 1–2).
- Produces: `buildContext(size, ladder, pointer)` → `BreakpointContext`; `activeNames(ctx, modes, ladder)` → `Set<string>`; `diffNames(prev, next)` → `{ entered: string[]; left: string[] }`.

`activeNames` is what makes the flat namespace real: tier, orientation, pointer and every matching mode land in one set, so `is()`, `onEnter` and the diff all read from a single source.

- [ ] **Step 1: Write the failing tests**

Append to `evaluate.test.ts`:

```ts
import { activeNames, buildContext, diffNames } from './evaluate';
import type { BreakpointMode } from './types';

describe('buildContext', () => {
  it('derives tier, orientation and aspect', () => {
    const c = buildContext({ width: 1000, height: 500 }, ladder, 'fine');
    expect(c.tier).toBe('tablet');
    expect(c.orientation).toBe('landscape');
    expect(c.aspect).toBe(2);
    expect(c.pointer).toBe('fine');
  });

  it('treats equal width and height as portrait', () => {
    expect(buildContext({ width: 600, height: 600 }, ladder, 'fine').orientation).toBe('portrait');
  });

  it('survives a zero size without dividing by zero', () => {
    const c = buildContext({ width: 0, height: 0 }, ladder, 'fine');
    expect(c.tier).toBe('mobile');
    expect(c.orientation).toBe('portrait');
    expect(c.aspect).toBe(0);
  });
});

describe('activeNames', () => {
  const modes = new Map<string, BreakpointMode>([
    ['stacked', { below: 880 }],
    ['roomy', { atLeast: 'desktop' }],
  ]);

  it('collects tier, axes and matching modes into one set', () => {
    const c = buildContext({ width: 800, height: 600 }, ladder, 'coarse');
    expect(activeNames(c, modes, ladder)).toEqual(new Set(['tablet', 'landscape', 'coarse', 'stacked']));
  });

  it('drops modes that stop matching', () => {
    const c = buildContext({ width: 1200, height: 600 }, ladder, 'fine');
    expect(activeNames(c, modes, ladder)).toEqual(new Set(['desktop', 'landscape', 'fine', 'roomy']));
  });
});

describe('diffNames', () => {
  it('reports an empty diff when nothing changed', () => {
    const a = new Set(['tablet', 'landscape']);
    expect(diffNames(a, new Set(['tablet', 'landscape']))).toEqual({ entered: [], left: [] });
  });

  it('reports a tier change', () => {
    const d = diffNames(new Set(['tablet']), new Set(['desktop']));
    expect(d.entered).toEqual(['desktop']);
    expect(d.left).toEqual(['tablet']);
  });

  it('reports an orientation change', () => {
    const d = diffNames(new Set(['tablet', 'portrait']), new Set(['tablet', 'landscape']));
    expect(d.entered).toEqual(['landscape']);
    expect(d.left).toEqual(['portrait']);
  });

  it('reports a mode flip independently of the tier', () => {
    const d = diffNames(new Set(['tablet', 'stacked']), new Set(['tablet']));
    expect(d.entered).toEqual([]);
    expect(d.left).toEqual(['stacked']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/plugins/breakpoints/evaluate.test.ts`
Expected: FAIL — no exports named `buildContext`, `activeNames`, `diffNames`.

- [ ] **Step 3: Implement**

Append to `evaluate.ts`. Add `Size` to the type imports from `../../utils` and `Pointer` to the type imports from `./types`.

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/plugins/breakpoints/evaluate.test.ts`
Expected: PASS — 29 tests.

- [ ] **Step 5: Lint and commit**

```bash
pnpm lint
git add packages/core/src/plugins/breakpoints/
git commit -m "feat(breakpoints): add context building and active-set diffing"
```

---

### Task 4: The `value()` cascade

**Files:**
- Modify: `packages/core/src/plugins/breakpoints/evaluate.ts` (append)
- Test: `packages/core/src/plugins/breakpoints/evaluate.test.ts` (append)

**Interfaces:**
- Consumes: `NormalizedLadder` (Task 1).
- Produces: `resolveValue<T>(ladder, tier, map)` → `T | undefined`.

- [ ] **Step 1: Write the failing tests**

Append to `evaluate.test.ts`:

```ts
import { resolveValue } from './evaluate';

describe('resolveValue', () => {
  it('takes an exact hit', () => {
    expect(resolveValue(ladder, 'tablet', { mobile: 1, tablet: 2, desktop: 3 })).toBe(2);
  });

  it('falls down to the nearest defined tier below', () => {
    expect(resolveValue(ladder, 'desktop', { mobile: 1, tablet: 2 })).toBe(2);
    expect(resolveValue(ladder, 'tablet', { mobile: 1, desktop: 3 })).toBe(1);
  });

  it('falls up to the lowest defined entry when nothing is below', () => {
    expect(resolveValue(ladder, 'mobile', { desktop: 3, wide: 4 })).toBe(3);
  });

  it('handles a single-entry map from any tier', () => {
    expect(resolveValue(ladder, 'wide', { tablet: 2 })).toBe(2);
    expect(resolveValue(ladder, 'mobile', { tablet: 2 })).toBe(2);
  });

  it('returns undefined for an empty map', () => {
    expect(resolveValue(ladder, 'tablet', {})).toBeUndefined();
  });

  it('treats an explicit undefined value as absent', () => {
    expect(resolveValue(ladder, 'tablet', { mobile: 1, tablet: undefined })).toBe(1);
  });

  it('falls back to the lowest entry when the tier is not on the ladder', () => {
    expect(resolveValue(ladder, 'bogus', { mobile: 1 })).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/plugins/breakpoints/evaluate.test.ts`
Expected: FAIL — no export named `resolveValue`.

- [ ] **Step 3: Implement**

Append to `evaluate.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/plugins/breakpoints/evaluate.test.ts`
Expected: PASS — 36 tests.

- [ ] **Step 5: Lint and commit**

```bash
pnpm lint
git add packages/core/src/plugins/breakpoints/
git commit -m "feat(breakpoints): add the value() cascade resolver"
```

---

### Task 5: The plugin

**Files:**
- Create: `packages/core/src/plugins/breakpoints/BreakpointPlugin.ts`
- Create: `packages/core/src/plugins/breakpoints/index.ts`
- Test: `packages/core/src/plugins/breakpoints/BreakpointPlugin.test.ts`

**Interfaces:**
- Consumes: everything from `evaluate.ts` and `types.ts` (Tasks 1–4); `Plugin`/`IPlugin` from `../Plugin`; `Signal`/`SignalConnection`/`SignalOrder` from `../../signals`.
- Produces: `IBreakpointPlugin`, `BreakpointPlugin`. Read API: `current`, `size`, `width`, `height`, `orientation`, `pointer`, `is`, `atLeast`, `below`, `between`, `matches`, `value`. Mutation: `define`, `undefine`. Signals: `onBreakpointChanged` (registry name), `onChange` (alias getter), `onEnter`, `onLeave`, `when`.

**Two things to get right:**

1. The signal property must be named `onBreakpointChanged`, because `Plugin.registerCoreSignals` copies `this[name]` into `coreSignalRegistry[name]` — property name and registry key are the same string. `onChange` is a getter alias so the fluent `bp.onChange` form from the spec still works.
2. `postInitialize` connects at `'highest'` priority so `bp.current` is already updated when normal-priority scene handlers run (spec §5).

- [ ] **Step 1: Write the failing tests**

Create `BreakpointPlugin.test.ts`. Mock the core module the same way `Plugin.test.ts` does, and give the plugin a fake app with a real `onResize` signal:

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../core', () => ({
  coreFunctionRegistry: {},
  coreSignalRegistry: {},
}));

import { Signal } from '../../signals';
import type { Size } from '../../utils';
import { BreakpointPlugin } from './BreakpointPlugin';

function makeApp() {
  const onResize = new Signal<(size: Size) => void>();
  return { onResize, size: { width: 800, height: 600 } as Size };
}

/** Build an initialized plugin bound to a fake app. */
async function setup(options = {}, size: Size = { width: 800, height: 600 }) {
  const app = makeApp();
  app.size = size;
  const plugin = new BreakpointPlugin();
  // `Plugin.app` reads Application.getInstance(); override for the test.
  Object.defineProperty(plugin, 'app', { get: () => app, configurable: true });
  await plugin.initialize(options);
  await plugin.postInitialize(app as never);
  return { app, plugin, resize: (s: Size) => app.onResize.emit(s) };
}

describe('BreakpointPlugin', () => {
  it('uses the default ladder and evaluates on postInitialize', async () => {
    const { plugin } = await setup();
    expect(plugin.current).toBe('tablet');
    expect(plugin.orientation).toBe('landscape');
  });

  it('accepts a custom ladder that replaces the defaults', async () => {
    const { plugin } = await setup({ tiers: { tiny: 0, huge: 2200 } });
    expect(plugin.current).toBe('tiny');
    expect(plugin.is('mobile')).toBe(false);
  });

  it('throws on an invalid ladder', async () => {
    const plugin = new BreakpointPlugin();
    await expect(plugin.initialize({ tiers: { a: 320 } })).rejects.toThrow(/must start at 0/i);
  });

  it('updates on resize', async () => {
    const { plugin, resize } = await setup();
    resize({ width: 1200, height: 800 });
    expect(plugin.current).toBe('desktop');
  });

  it('emits onChange only when something flips', async () => {
    const { plugin, resize } = await setup();
    const spy = vi.fn();
    plugin.onChange.connect(spy);

    resize({ width: 810, height: 600 }); // same tier, same axes
    expect(spy).not.toHaveBeenCalled();

    resize({ width: 1200, height: 800 });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toMatchObject({
      current: 'desktop',
      previous: 'tablet',
      entered: ['desktop'],
      left: ['tablet'],
    });
  });

  it('fires enter and leave for tiers and modes', async () => {
    const { plugin, resize } = await setup({ modes: { stacked: { below: 880 } } });
    const entered = vi.fn();
    const left = vi.fn();
    plugin.onEnter('desktop', entered);
    plugin.onLeave('stacked', left);

    expect(plugin.is('stacked')).toBe(true);
    resize({ width: 1200, height: 800 });

    expect(entered).toHaveBeenCalledTimes(1);
    expect(left).toHaveBeenCalledTimes(1);
    expect(plugin.is('stacked')).toBe(false);
  });

  it('when() runs immediately if already matching', async () => {
    const { plugin, resize } = await setup();
    const fn = vi.fn();
    plugin.when('tablet', fn);
    expect(fn).toHaveBeenCalledTimes(1);

    resize({ width: 1200, height: 800 });
    resize({ width: 800, height: 600 });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('when() does not run immediately if not matching', async () => {
    const { plugin } = await setup();
    const fn = vi.fn();
    plugin.when('desktop', fn);
    expect(fn).not.toHaveBeenCalled();
  });

  it('define() evaluates immediately and emits enter', async () => {
    const { plugin } = await setup();
    const fn = vi.fn();
    plugin.onEnter('narrow', fn);
    plugin.define('narrow', { below: 'desktop' });
    expect(plugin.is('narrow')).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('undefine() emits leave and forgets the mode', async () => {
    const { plugin } = await setup({ modes: { stacked: { below: 880 } } });
    const fn = vi.fn();
    plugin.onLeave('stacked', fn);
    plugin.undefine('stacked');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(plugin.is('stacked')).toBe(false);
  });

  it('atLeast and below are exact complements', async () => {
    const { plugin } = await setup();
    for (const name of ['mobile', 'tablet', 'desktop', 'wide']) {
      expect(plugin.atLeast(name)).toBe(!plugin.below(name));
    }
    expect(plugin.between('tablet', 'desktop')).toBe(true);
    expect(plugin.between('desktop', 'wide')).toBe(false);
  });

  it('value() resolves against the current tier', async () => {
    const { plugin, resize } = await setup();
    const map = { mobile: 1, tablet: 2, desktop: 3 };
    expect(plugin.value(map)).toBe(2);
    resize({ width: 400, height: 800 });
    expect(plugin.value(map)).toBe(1);
  });

  it('is() returns false and warns for an unknown name', async () => {
    const { plugin } = await setup();
    expect(plugin.is('nonsense')).toBe(false);
  });

  it('a normal-priority onResize listener sees the updated tier', async () => {
    const { app, plugin, resize } = await setup();
    let seen: string | undefined;
    app.onResize.connect(() => {
      seen = plugin.current as string;
    });
    resize({ width: 1200, height: 800 });
    expect(seen).toBe('desktop');
  });

  it('destroy() disconnects enter/leave listeners', async () => {
    const { plugin, resize } = await setup();
    const fn = vi.fn();
    plugin.onEnter('desktop', fn);
    plugin.destroy();
    resize({ width: 1200, height: 800 });
    expect(fn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/plugins/breakpoints/BreakpointPlugin.test.ts`
Expected: FAIL — `Failed to resolve import "./BreakpointPlugin"`.

- [ ] **Step 3: Implement `BreakpointPlugin.ts`**

```ts
import { Signal, type SignalConnection, type SignalOrder } from '../../signals';
import { Logger, type Orientation, type Size } from '../../utils';
import type { IPlugin } from '../Plugin';
import { Plugin } from '../Plugin';
import type { NormalizedLadder } from './evaluate';
import { activeNames, buildContext, diffNames, matchesMode, normalizeTiers, resolveStop, resolveValue } from './evaluate';
import type {
  BreakpointChangeDetail,
  BreakpointContext,
  BreakpointMode,
  BreakpointNameLike,
  BreakpointPluginOptions,
  BreakpointTierName,
  Pointer,
} from './types';
import { defaultBreakpoints } from './types';

const AXIS_NAMES = new Set<string>(['portrait', 'landscape', 'coarse', 'fine']);
const ZERO: Size = { width: 0, height: 0 };

export interface IBreakpointPlugin extends IPlugin<BreakpointPluginOptions> {
  readonly onBreakpointChanged: Signal<(detail: BreakpointChangeDetail) => void>;
  readonly onChange: Signal<(detail: BreakpointChangeDetail) => void>;
  readonly current: BreakpointNameLike;
  readonly size: Size;
  readonly width: number;
  readonly height: number;
  readonly orientation: Orientation;
  readonly pointer: Pointer;
  is(name: BreakpointNameLike): boolean;
  atLeast(value: BreakpointNameLike | number): boolean;
  below(value: BreakpointNameLike | number): boolean;
  between(lower: BreakpointNameLike | number, upper: BreakpointNameLike | number): boolean;
  matches(mode: BreakpointMode): boolean;
  value<T>(map: Partial<Record<BreakpointTierName, T>>): T | undefined;
  define(name: string, mode: BreakpointMode): void;
  undefine(name: string): void;
  onEnter(name: BreakpointNameLike, callback: () => void, order?: SignalOrder): SignalConnection;
  onLeave(name: BreakpointNameLike, callback: () => void, order?: SignalOrder): SignalConnection;
  when(name: BreakpointNameLike, callback: () => void, order?: SignalOrder): SignalConnection;
}

/**
 * Named responsive state derived from the renderer size.
 *
 * Declare tiers and modes in `caper.config.ts`; the plugin re-evaluates on
 * every resize but only emits when a name actually flips.
 *
 * @example
 * ```ts
 * const bp = app.breakpoints;
 *
 * const columns = bp.value({ mobile: 1, tablet: 2, desktop: 3 });
 * if (bp.is('stacked')) { ... }
 *
 * // run now, and again on every entry into the mode
 * this.addSignalConnection(bp.when('stacked', () => this.relayout()));
 * ```
 *
 * Listen to `app.onResize` or `bp.onChange` — never `app.webEvents.onResize`,
 * which fires ahead of this plugin and so reports a stale tier.
 */
export class BreakpointPlugin extends Plugin<BreakpointPluginOptions> implements IBreakpointPlugin {
  public readonly id = 'breakpoints';

  /**
   * Named to match its `ICoreSignals` key — `registerCoreSignals` copies
   * `this[name]` into the registry under the same string.
   */
  public readonly onBreakpointChanged = new Signal<(detail: BreakpointChangeDetail) => void>();

  private _ladder: NormalizedLadder;
  private _modes = new Map<string, BreakpointMode>();
  private _ctx: BreakpointContext;
  private _active: Set<string> = new Set();
  private _enter = new Map<string, Signal<() => void>>();
  private _leave = new Map<string, Signal<() => void>>();
  private _pointer: Pointer = 'fine';
  private _pointerQuery: MediaQueryList | null = null;

  /** Fluent alias for {@link onBreakpointChanged}. */
  get onChange(): Signal<(detail: BreakpointChangeDetail) => void> {
    return this.onBreakpointChanged;
  }

  get current(): BreakpointNameLike {
    return this._ctx.tier;
  }

  get size(): Size {
    return { width: this._ctx.width, height: this._ctx.height };
  }

  get width(): number {
    return this._ctx.width;
  }

  get height(): number {
    return this._ctx.height;
  }

  get orientation(): Orientation {
    return this._ctx.orientation;
  }

  get pointer(): Pointer {
    return this._ctx.pointer;
  }

  async initialize(options: Partial<BreakpointPluginOptions> = {}) {
    this._options = {
      tiers: options.tiers ?? { ...defaultBreakpoints },
      modes: options.modes ?? {},
    };
    this._ladder = normalizeTiers(this._options.tiers!);
    for (const [name, mode] of Object.entries(this._options.modes!)) {
      this._modes.set(name, mode);
    }
    this._initPointer();
    this._ctx = buildContext(ZERO, this._ladder, this._pointer);
    this._active = activeNames(this._ctx, this._modes, this._ladder);
  }

  /**
   * `'highest'` priority so `current` is already updated when normal-priority
   * scene resize handlers run.
   */
  async postInitialize() {
    this._evaluate(this.app.size ?? ZERO);
    this.addSignalConnection(this.app.onResize.connect(this._evaluate, 'highest'));
  }

  public destroy(): void {
    this._pointerQuery?.removeEventListener('change', this._onPointerChange);
    this._pointerQuery = null;
    for (const signal of this._enter.values()) signal.disconnectAll();
    for (const signal of this._leave.values()) signal.disconnectAll();
    this._enter.clear();
    this._leave.clear();
    this.onBreakpointChanged.disconnectAll();
    super.destroy();
  }

  public is(name: BreakpointNameLike): boolean {
    if (!this._isKnown(name as string)) {
      Logger.warn(`[breakpoints] unknown name '${name}'. Known: ${this._knownNames().join(', ')}.`);
      return false;
    }
    return this._active.has(name as string);
  }

  public atLeast(value: BreakpointNameLike | number): boolean {
    const stop = resolveStop(this._ladder, value);
    return stop !== undefined && this._ctx.width >= stop;
  }

  public below(value: BreakpointNameLike | number): boolean {
    const stop = resolveStop(this._ladder, value);
    return stop !== undefined && this._ctx.width < stop;
  }

  public between(lower: BreakpointNameLike | number, upper: BreakpointNameLike | number): boolean {
    return this.atLeast(lower) && this.below(upper);
  }

  public matches(mode: BreakpointMode): boolean {
    return matchesMode(this._ctx, mode, this._ladder);
  }

  public value<T>(map: Partial<Record<BreakpointTierName, T>>): T | undefined {
    return resolveValue(this._ladder, this._ctx.tier, map as Partial<Record<string, T>>);
  }

  public define(name: string, mode: BreakpointMode): void {
    this._modes.set(name, mode);
    this._evaluate(this.size);
  }

  public undefine(name: string): void {
    if (!this._modes.delete(name)) return;
    this._evaluate(this.size);
  }

  public onEnter(name: BreakpointNameLike, callback: () => void, order?: SignalOrder): SignalConnection {
    return this._signal(this._enter, name as string).connect(callback, order);
  }

  public onLeave(name: BreakpointNameLike, callback: () => void, order?: SignalOrder): SignalConnection {
    return this._signal(this._leave, name as string).connect(callback, order);
  }

  /** Run now if already matching, then on every subsequent entry. */
  public when(name: BreakpointNameLike, callback: () => void, order?: SignalOrder): SignalConnection {
    if (this._active.has(name as string)) callback();
    return this.onEnter(name, callback, order);
  }

  protected getCoreSignals(): string[] {
    return ['onBreakpointChanged'];
  }

  /**
   * Re-derive state from a size. Emits leave before enter — a scene tears the
   * old layout down before the new one goes up — and `onChange` last.
   */
  private _evaluate = (size: Size): void => {
    const next = buildContext(size ?? ZERO, this._ladder, this._pointer);
    const nextActive = activeNames(next, this._modes, this._ladder);
    const { entered, left } = diffNames(this._active, nextActive);
    const previous = this._ctx.tier;

    this._ctx = next;
    this._active = nextActive;

    if (entered.length === 0 && left.length === 0) return;

    for (const name of left) this._leave.get(name)?.emit();
    for (const name of entered) this._enter.get(name)?.emit();

    this.onBreakpointChanged.emit({
      current: next.tier,
      previous,
      entered,
      left,
      size: { width: next.width, height: next.height },
    });
  };

  private _onPointerChange = (e: MediaQueryListEvent): void => {
    this._pointer = e.matches ? 'coarse' : 'fine';
    this._evaluate(this.size);
  };

  private _initPointer(): void {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      this._pointer = 'fine';
      return;
    }
    this._pointerQuery = window.matchMedia('(pointer: coarse)');
    this._pointer = this._pointerQuery.matches ? 'coarse' : 'fine';
    this._pointerQuery.addEventListener('change', this._onPointerChange);
  }

  private _signal(store: Map<string, Signal<() => void>>, name: string): Signal<() => void> {
    let signal = store.get(name);
    if (!signal) {
      signal = new Signal<() => void>();
      store.set(name, signal);
    }
    return signal;
  }

  private _isKnown(name: string): boolean {
    return name in this._ladder.byName || this._modes.has(name) || AXIS_NAMES.has(name);
  }

  private _knownNames(): string[] {
    return [...this._ladder.names, ...this._modes.keys(), ...AXIS_NAMES];
  }
}
```

- [ ] **Step 4: Write `index.ts`**

```ts
export * from './BreakpointPlugin';
export * from './evaluate';
export * from './methods';
export * from './types';
```

`methods.ts` does not exist yet — create it as part of Task 6, or add the export line then. If running this task standalone, omit the `methods` line and add it in Task 6.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run src/plugins/breakpoints/BreakpointPlugin.test.ts`
Expected: PASS — 15 tests.

Then run the whole suite to confirm nothing else broke:
Run: `pnpm test`
Expected: PASS.

- [ ] **Step 6: Lint and commit**

```bash
pnpm lint
git add packages/core/src/plugins/breakpoints/
git commit -m "feat(breakpoints): add BreakpointPlugin with signals and read API"
```

---

### Task 6: Framework wiring

**Files:**
- Create: `packages/core/src/plugins/breakpoints/methods.ts`
- Modify: `packages/core/src/plugins/breakpoints/index.ts`
- Modify: `packages/core/src/plugins/defaults.ts`
- Modify: `packages/core/src/plugins/index.ts`
- Modify: `packages/core/src/core/Application.ts`
- Modify: `packages/core/src/core/interfaces/IApplication.ts`
- Modify: `packages/core/src/core/interfaces/IApplicationOptions.ts`
- Modify: `packages/core/src/core/interfaces/ICoreSignals.ts`

**Interfaces:**
- Consumes: `BreakpointPlugin`, `IBreakpointPlugin`, `BreakpointMode`, `BreakpointsConfig` (Tasks 1, 5).
- Produces: `defineBreakpoints(config)`; `app.breakpoints`; `config.breakpoints`; `app.signals.onBreakpointChanged`.

No new tests — this is wiring, covered by `pnpm test` staying green plus a typecheck. The behaviour it enables is verified live in Task 8.

- [ ] **Step 1: Write `methods.ts`**

Mirrors `plugins/actions/methods.ts`: a pass-through whose only job is inferring literal key types.

```ts
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
  const M extends Record<string, BreakpointMode<keyof T & string>> = Record<string, never>,
>(config: { tiers: T; modes?: M }): { tiers: T; modes: M } {
  return { tiers: config.tiers, modes: (config.modes ?? {}) as M };
}
```

- [ ] **Step 2: Add the `methods` export to `breakpoints/index.ts`**

```ts
export * from './BreakpointPlugin';
export * from './evaluate';
export * from './methods';
export * from './types';
```

- [ ] **Step 3: Register the plugin in `defaults.ts`**

Add the import alongside the others, then insert the entry **immediately after the `resizer` entry** so the resizer's size exists first:

```ts
import { BreakpointPlugin } from './breakpoints';
```

```ts
  {
    id: 'resizer',
    module: ResizerPlugin,
    namedExport: 'ResizerPlugin',
  },
  {
    id: 'breakpoints',
    module: BreakpointPlugin,
    namedExport: 'BreakpointPlugin',
  },
```

- [ ] **Step 4: Export from `plugins/index.ts`**

Add, keeping the file's alphabetical ordering:

```ts
export * from './breakpoints';
```

- [ ] **Step 5: Add the config key to `IApplicationOptions.ts`**

Add to the type imports from `'../../plugins'`: `BreakpointsConfig`. Then add the field next to `resizer`:

```ts
  breakpoints: Partial<BreakpointsConfig>;
```

- [ ] **Step 6: Add the accessor to `Application.ts`**

Import `IBreakpointPlugin` alongside `IResizerPlugin` (line ~24), then mirror the existing `resizer` accessor (lines 327–333):

```ts
  protected _breakpoints: IBreakpointPlugin;

  public get breakpoints(): IBreakpointPlugin {
    if (!this._breakpoints) {
      this._breakpoints = this.getPlugin<IBreakpointPlugin>('breakpoints');
    }
    return this._breakpoints;
  }
```

- [ ] **Step 7: Add to `IApplication.ts` and `ICoreSignals.ts`**

`IApplication.ts` — next to the existing `resizer` member:

```ts
  breakpoints: IBreakpointPlugin;
```

`ICoreSignals.ts` — add the import and the entry:

```ts
import type { BreakpointChangeDetail } from '../../plugins';
```

```ts
  // BreakpointPlugin;
  onBreakpointChanged: Signal<(detail: BreakpointChangeDetail) => void>;
```

- [ ] **Step 8: Typecheck, test, lint**

```bash
pnpm build
pnpm test
pnpm lint
```
Expected: all pass. `pnpm build` runs `vite build`, which typechecks the package — if it reports a circular-import warning between `core/interfaces` and `plugins/breakpoints`, resolve it the way `ResizerPluginOptions` already is (a `import type` from `'../../plugins'`, never a value import).

- [ ] **Step 9: Commit**

```bash
git add packages/core/src packages/core/src/plugins/breakpoints/
git commit -m "feat(breakpoints): register the plugin and expose app.breakpoints"
```

---

### Task 7: Codegen — typed names in `caper-app.d.ts`

**Files:**
- Modify: `packages/core/config/vite.mjs` — `generateTypes()` (starts line 941) and `runBuildTimeValidation()` (starts line 784)

**Interfaces:**
- Consumes: `defineBreakpoints` (Task 6) as the AST marker to look for.
- Produces: `AppTypeOverrides.Breakpoints` and `AppTypeOverrides.BreakpointModes` in the generated `caper-app.d.ts`, which is what makes `BreakpointTierName`/`BreakpointModeName` (Task 1) resolve to the app's own names.

**Approach:** follow the `defineData` path exactly — detect by callee name, capture the identifier, emit a `typeof` pointer. No AST value extraction, so spreads and computed members cannot desync the union from the runtime object.

- [ ] **Step 1: Detect the `defineBreakpoints` export**

In `generateTypes`, next to the existing `let dataSchemaName = '';` declarations (~line 973), add:

```js
    let breakpointsName = '';
```

Then inside the `for (const node of ast.body)` loop, in the same block that finds the data schema (~line 984), add:

```js
        // Find breakpoints (detect by callee, like defineData — more robust
        // than matching on the variable name).
        const bpDecl = node.declaration.declarations.find(
          (d) => d.init?.type === AST_NODE_TYPES.CallExpression && d.init.callee.name === 'defineBreakpoints',
        );
        if (bpDecl && bpDecl.id.type === AST_NODE_TYPES.Identifier) {
          breakpointsName = bpDecl.id.name;
        }
```

- [ ] **Step 2: Import the symbol into the generated file**

In the `configParts` block (~line 1113), add alongside the `actions` / `contexts` pushes:

```js
      if (breakpointsName) {
        configParts.push(breakpointsName);
      }
```

- [ ] **Step 3: Emit the two type aliases and the overrides**

In the returned template literal, add after the `// Locale keys` block:

```js
${
  breakpointsName
    ? `// Breakpoints
type AppBreakpoints = keyof (typeof ${breakpointsName})['tiers'] & string;
type AppBreakpointModes = keyof (typeof ${breakpointsName})['modes'] & string;`
    : ''
}
```

And inside the `interface AppTypeOverrides {` block, after `LocaleKeys: AppLocaleKeys;`:

```js
${breakpointsName ? `    Breakpoints: AppBreakpoints;\n    BreakpointModes: AppBreakpointModes;` : ''}
```

Two overrides rather than one because `value()` must accept tiers only while `is()`/`when()` take either. Their **absence** is what makes the framework fall back to the default ladder — so never emit them with a placeholder value.

- [ ] **Step 4: Add the build-time warning**

In `runBuildTimeValidation`, add a check: if the config object has a `breakpoints` property but the caller reports no `defineBreakpoints` export, warn. Pass `breakpointsName` in as a new field on the existing argument object:

```js
  // Breakpoints declared in config but not via defineBreakpoints() — the
  // names will work at runtime but get no intellisense.
  if (!breakpointsName && configObject?.type === AST_NODE_TYPES.ObjectExpression) {
    const hasKey = configObject.properties.some(
      (p) => p.type === AST_NODE_TYPES.Property && p.key?.name === 'breakpoints',
    );
    if (hasKey) {
      logger.warn(
        `[caper] caper.config.ts sets \`breakpoints\` but no \`defineBreakpoints()\` export was found — breakpoint names will not be type-checked. Wrap the object: \`export const breakpoints = defineBreakpoints({ ... })\`.`,
      );
    }
  }
```

Update the `runBuildTimeValidation({ ... })` call site (~line 1055) to pass `breakpointsName`, and the function's destructured parameter list to accept it.

- [ ] **Step 5: Verify against kitchen-sink**

There is no unit-test harness for `vite.mjs`; verification is running it. Temporarily add to `apps/kitchen-sink/caper.config.ts`:

```ts
export const breakpoints = defineBreakpoints({
  tiers: { mobile: 0, tablet: 768, desktop: 1024, wide: 1440 },
  modes: { stacked: { below: 880 } },
});
```

and `breakpoints,` inside `defineConfig({ … })`. Import `defineBreakpoints` from `@caperjs/core`.

```bash
cd apps/kitchen-sink && pnpm dev
```

Then inspect the generated file:

```bash
grep -A 3 "// Breakpoints" apps/kitchen-sink/src/types/caper-app.d.ts
grep -E "Breakpoints:|BreakpointModes:" apps/kitchen-sink/src/types/caper-app.d.ts
```

Expected output contains:

```ts
type AppBreakpoints = keyof (typeof breakpoints)['tiers'] & string;
type AppBreakpointModes = keyof (typeof breakpoints)['modes'] & string;
```

and, inside `AppTypeOverrides`:

```ts
    Breakpoints: AppBreakpoints;
    BreakpointModes: AppBreakpointModes;
```

Then remove the `breakpoints` key from the config, restart the dev server, and confirm **neither** override is emitted and the warning does not fire (no `breakpoints` key, no `defineBreakpoints`). Re-add only the config key without the export and confirm the warning **does** fire. Restore the full form afterwards — Task 8 keeps it.

- [ ] **Step 6: Commit**

```bash
git add packages/core/config/vite.mjs
git commit -m "feat(breakpoints): generate typed tier and mode names into caper-app.d.ts"
```

---

### Task 8: Worked example in kitchen-sink

**Files:**
- Modify: `apps/kitchen-sink/caper.config.ts` (keep the Task 7 block)
- Create: `apps/kitchen-sink/src/scenes/Breakpoints.ts`

**Interfaces:**
- Consumes: everything above — `defineBreakpoints`, `app.breakpoints`, `value`, `when`, `is`.
- Produces: nothing other tasks depend on. This is the acceptance test.

**Follow the conventions of the existing kitchen-sink scenes** — read two neighbours in `apps/kitchen-sink/src/scenes/` before writing, and match how they declare their scene config, build their view, and register in the group order (`sceneGroupOrder` in `caper.config.ts`).

- [ ] **Step 1: Build the demo scene**

The scene must exercise all three concepts so the example doubles as documentation:

- a text readout bound to `bp.onChange`, printing `current`, `orientation`, `pointer`, and which modes are active
- a column count from `bp.value({ mobile: 1, tablet: 2, desktop: 3, wide: 4 })`, laying out that many boxes
- a layout switch via `bp.when('stacked', …)`, registered with `this.addSignalConnection(...)` so teardown is automatic

```ts
// Sketch of the responsive wiring — fit it to the scene conventions you find.
const bp = this.app.breakpoints;

this.addSignalConnection(
  bp.onChange.connect(() => this._refresh()),
);

private _refresh() {
  const columns = bp.value({ mobile: 1, tablet: 2, desktop: 3, wide: 4 }) ?? 1;
  this._readout.text = [
    `tier: ${bp.current}`,
    `orientation: ${bp.orientation}`,
    `pointer: ${bp.pointer}`,
    `stacked: ${bp.is('stacked')}`,
    `columns: ${columns}`,
  ].join('\n');
  this._layoutBoxes(columns);
}
```

- [ ] **Step 2: Verify live**

```bash
cd apps/kitchen-sink && pnpm dev
```

Navigate to the scene and drag the window from narrow to wide. Confirm:

1. The readout tier changes at exactly 768 / 1024 / 1440.
2. The column count follows `value()`.
3. `stacked` flips at 880, independently of the tier.
4. Dragging **within** one tier does not re-run the refresh — add a temporary `console.log` in `_refresh` and confirm it fires once per flip, not once per frame. Remove the log afterwards.

- [ ] **Step 3: Verify the intellisense**

In the editor, inside the demo scene:

1. `bp.is('` — autocomplete offers the kitchen-sink tier names *and* `stacked`.
2. `bp.value({ ` — autocomplete offers tier names only.
3. `bp.value({ stacked: 1 })` — a type error.
4. `bp.is('typo')` — compiles (the `string & {}` escape hatch) but returns false with a console warning at runtime.

- [ ] **Step 4: Full verification and commit**

```bash
cd packages/core && pnpm test && pnpm lint && pnpm build
```
Expected: all pass.

```bash
git add apps/kitchen-sink
git commit -m "docs(breakpoints): add a kitchen-sink worked example"
```

---

## Done criteria

- `pnpm test` green in `packages/core`, including 36 `evaluate.test.ts` and 15 `BreakpointPlugin.test.ts` assertions.
- `pnpm lint` and `pnpm build` clean.
- `app.breakpoints` available with no config; default ladder active.
- `caper.config.ts` tiers and modes drive both runtime behaviour and autocomplete.
- Kitchen-sink demo behaves as described in Task 8 Step 2.
