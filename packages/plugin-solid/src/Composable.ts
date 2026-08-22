// The `compose()` contract: a display object declares its members by returning
// JSX, that tree is mounted ONCE the first time the object hits the stage, and
// signals do every update after that — no re-render, no diff.

import { Container, Constructor, Scene } from '@caperjs/core';
import type { DestroyOptions } from 'pixi.js';

import type { PixiNode } from './renderer';
import { render } from './renderer';

/**
 * What `compose()` hands back. `unknown` for now so this file stays JSX-free;
 * it becomes the real element type when `jsx.d.ts` lands.
 */
export type Composed = unknown;

/**
 * The optional contract a `Composable` subclass opts into. Declared separately
 * from the mixin (rather than merged onto it) so the mixin never claims a
 * `compose` member of its own — the runtime just checks for one.
 *
 * @example
 * ```tsx
 * class HealthBar extends ComposableContainer implements Composes {
 *   compose() {
 *     return <text text="100 HP" />;
 *   }
 * }
 * ```
 */
export interface Composes {
  compose(): Composed;
}

/**
 * Give a display class the `compose()` contract.
 *
 * The mixin adds no public members, so the returned constructor keeps `Base`'s
 * own type — `compose()` is declared by the subclass via {@link Composes}.
 *
 * @param Base - The display class to make composable.
 */
export function Composable<TBase extends Constructor<any>>(Base: TBase): TBase {
  return class extends Base {
    private __composeDispose?: () => void;
    private __composed = false;

    constructor(...args: any[]) {
      super(...args);
      // Mount off Pixi's native 'added' event rather than the `added()` hook:
      // subclasses routinely override `added()` without calling `super.added()`,
      // which would silently skip the mount. Core's own lifecycle listens to the
      // same event, so this coexists with it (and runs after it).
      this.once('added', this.__mountCompose);
    }

    destroy(options?: DestroyOptions): void {
      // Dispose the reactive graph first. Solid's disposal stops effects but does
      // not detach the nodes it created — `super.destroy()` handles those, so
      // there is no double-destroy path here.
      this.__composeDispose?.();
      this.__composeDispose = undefined;
      super.destroy(options);
    }

    private __mountCompose() {
      if (this.__composed) return;
      this.__composed = true;
      const host = this as Partial<Composes>;
      if (typeof host.compose !== 'function') return;
      // `Base` is only known as `Constructor<any>` here, so `this` has to be
      // asserted into the renderer's host-node type.
      this.__composeDispose = render(() => host.compose!() as PixiNode, this as unknown as PixiNode);
    }
  } as unknown as TBase;
}

/** A caper {@link Container} that can declare its members with JSX. */
export const ComposableContainer = Composable(Container);
export type ComposableContainer = InstanceType<typeof ComposableContainer>;

/** A caper {@link Scene} that can declare its members with JSX. */
export const ComposableScene = Composable(Scene);
export type ComposableScene = InstanceType<typeof ComposableScene>;
