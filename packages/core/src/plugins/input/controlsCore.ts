/**
 * Pure scheme processing shared by every controls adapter — context gating,
 * down/up map building and combination elimination. No caper/Pixi imports so
 * it stays trivially unit-testable, and so keyboard and virtual input can not
 * drift apart again.
 *
 * `A` is the adapter's action-id type; ids are plain object keys at runtime.
 */

/** One `down` / `up` / `joystick` block of a controls scheme. */
export interface SchemeSection {
  [actionId: string]: string | string[] | undefined;
}

/** The part of a registered action this module cares about. */
export interface ActionLike {
  context: string | string[];
}

/** The down-map trio: combinations (longest first), their action lookup, and single inputs. */
export interface DownMaps<A = string> {
  combinations: string[][];
  combinationsMap: Map<string[], A>;
  singles: Map<string, A>;
}

/**
 * Whether an action registered for `actionContext` may fire in `current`.
 * Matching is exact — a string context is compared with `===`, never with
 * `includes`, so `'game_over'` does not swallow `'game'`.
 */
export function contextAllows(actionContext: string | string[], current: string): boolean {
  if (actionContext === '*') {
    return true;
  }
  if (Array.isArray(actionContext)) {
    return actionContext.includes(current);
  }
  return actionContext === current;
}

/**
 * Build the down maps for a scheme section. Unknown actions are reported to
 * `warn` (once per action) and skipped; out-of-context actions are skipped
 * silently. Combinations are sorted largest first so the elimination pass in
 * {@link evaluateCombinations} prefers the most specific match.
 */
export function buildDownMaps<A = string>(
  section: SchemeSection | undefined,
  actions: Record<string, ActionLike | undefined>,
  currentContext: string,
  warn: (actionId: string) => void,
): DownMaps<A> {
  const combinations: string[][] = [];
  const combinationsMap = new Map<string[], A>();
  const singles = new Map<string, A>();

  forEachInput<A>(section, actions, currentContext, warn, (key, input) => {
    if (input.includes('+')) {
      const combo = input.split('+');
      combinations.push(combo);
      combinationsMap.set(combo, key);
    } else {
      singles.set(input, key);
    }
  });

  // sort them from the largest to smallest
  combinations.sort((a, b) => b.length - a.length);

  return { combinations, combinationsMap, singles };
}

/**
 * Build the up map for a scheme section — same gating and warning rules as
 * {@link buildDownMaps}, but every input is a single value.
 */
export function buildUpMap<A = string>(
  section: SchemeSection | undefined,
  actions: Record<string, ActionLike | undefined>,
  currentContext: string,
  warn: (actionId: string) => void,
): Map<string, A> {
  const map = new Map<string, A>();
  forEachInput<A>(section, actions, currentContext, warn, (key, input) => {
    map.set(input, key);
  });
  return map;
}

/**
 * Whether an input is active: a single input is tested with `isDown`, a `+`
 * separated combination requires every part to satisfy `isComboPartDown`
 * (which defaults to `isDown` — the virtual adapter uses the split to let a
 * joystick direction take part in a combination but not stand alone).
 */
export function isInputActive(
  input: string,
  isDown: (id: string) => boolean,
  isComboPartDown: (id: string) => boolean = isDown,
): boolean {
  if (input.includes('+')) {
    return input.split('+').every((id) => isComboPartDown(id));
  }
  return isDown(input);
}

/**
 * Walk combinations (already sorted largest first) and fire each one whose
 * inputs are all down and none of which a longer combination already claimed.
 * Returns the fired combinations plus the claimed inputs, so the caller can
 * skip them when dispatching single inputs.
 */
export function evaluateCombinations(
  combinations: string[][],
  isDown: (id: string) => boolean,
): { fired: string[][]; eliminated: Set<string> } {
  const fired: string[][] = [];
  const eliminated = new Set<string>();

  for (let i = 0; i < combinations.length; i++) {
    const combination = combinations[i];
    if (combination.some((id) => eliminated.has(id))) {
      continue;
    }
    if (combination.every((id) => isDown(id))) {
      combination.forEach((id) => eliminated.add(id));
      fired.push(combination);
    }
  }

  return { fired, eliminated };
}

/** Shared scheme walk: resolve the action, gate it, normalize its inputs. */
function forEachInput<A>(
  section: SchemeSection | undefined,
  actions: Record<string, ActionLike | undefined>,
  currentContext: string,
  warn: (actionId: string) => void,
  visit: (actionId: A, input: string) => void,
): void {
  if (!section) {
    return;
  }
  Object.keys(section).forEach((key) => {
    const action = actions[key];
    if (!action) {
      warn(key);
      return;
    }
    if (!contextAllows(action.context, currentContext)) {
      return;
    }
    const input = section[key];
    if (!input) {
      return;
    }
    const inputs = Array.isArray(input) ? input : [input];
    inputs.forEach((inputString) => visit(key as unknown as A, inputString));
  });
}
