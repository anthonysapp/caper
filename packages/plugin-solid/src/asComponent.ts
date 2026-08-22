// Lifting existing imperative display classes into JSX — the escape hatch that
// keeps the intrinsic catalog small.

import { untrack } from 'solid-js';

import type { PixiNode } from './renderer';
import { spread } from './renderer';

/**
 * Lift an existing imperative display class into a JSX component.
 *
 * The instance is constructed once (untracked, so constructor reads don't
 * subscribe to anything) and every prop is then applied through the renderer's
 * own `spread`, which gives them the same reactivity as an intrinsic element —
 * including `ref`.
 *
 * ```tsx
 * const Orbiter$ = asComponent(Orbiter);
 * <Orbiter$ x={40} y={80} />
 * ```
 *
 * @param Ctor - The display class to lift. Called as `new Ctor(defaults)`.
 * @param defaults - Config handed to the constructor on every mount.
 */
export function asComponent<TNode extends PixiNode, TConfig>(
  Ctor: new (config?: TConfig) => TNode,
  defaults?: TConfig,
): (props: Record<string, any>) => TNode {
  return (props) => {
    const node = untrack(() => new Ctor(defaults));
    // Skip the children pass when none were passed — otherwise Solid's spread
    // "clears" the node, which would wipe anything the class built for itself
    // (in `added()`, its own `compose()`, or the constructor).
    spread(node, props as any, !('children' in props));
    return node;
  };
}
