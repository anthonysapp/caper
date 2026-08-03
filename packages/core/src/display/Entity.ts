import { Container } from './Container';

/**
 * Optional convenience base class for entities discovered from
 * `src/entities/`. The factory system (`this.add.entity(id, props)`) does
 * **not** require entities to extend this class — any class with a
 * single-options-object constructor works. `Entity<Props>` just gives you
 * typed prop storage and a conventional lifecycle for free.
 *
 * **Lifecycle** (inherited from Container):
 *
 *   1. `constructor(props)` — Container's constructor runs first, then props
 *      are stashed on `this.props`. Don't reference `this.app` yet.
 *   2. **addChild** — the factory auto-adds the instance to the calling
 *      Container; Pixi emits an `added` event.
 *   3. `added()` — override this to build the display tree using
 *      `this.props`. Safe to use `this.app`, `this.add.*`, and any asset.
 *      Runs after construction, after stage attachment.
 *
 * @example
 * ```ts
 * import { defineEntity, Entity } from '@caperjs/core';
 *
 * type ActorProps = { color?: number; x?: number; y?: number };
 *
 * export const entity = defineEntity({ id: 'actor' });
 *
 * export default class Actor extends Entity<ActorProps> {
 *   added() {
 *     this.x = this.props.x ?? 0;
 *     this.y = this.props.y ?? 0;
 *     this.add.graphics().circle(0, 0, 50).fill(this.props.color ?? 0xffffff);
 *   }
 * }
 * ```
 *
 * Then from a scene:
 * ```ts
 * this.add.entity('actor', { color: 0xff0000, x: 50, y: 100 });
 * ```
 */
export class Entity<Props = void> extends Container {
  /** Props passed into the factory call. Populated before `added()` fires. */
  public readonly props: Props;

  constructor(props?: Props) {
    super();
    this.props = (props ?? ({} as Props)) as Props;
  }
}
