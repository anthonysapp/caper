import { Container3D } from '@pixi/3d';
import { bindAllMethods, WithLifecycle, WithSignals } from '@caperjs/core';
import { createFactory3D } from './factory3d';
import type { Factory3D } from './factory3d';
import { ownedByView } from './owned';
import type { Owned3D } from './owned';
import type { View3D } from './View3D';

type Listen<Self> = (event: string | symbol, fn: (...args: any[]) => void, context?: any) => Self;

/**
 * Base class for 3D entities: a `Container3D` with the Caper lifecycle (`added` / `removed` / `update`),
 * signals, and its own 3D factory. Declare one like any entity (`defineEntity` + default export under
 * `src/entities/`) and build it with `view.add.entity(id, props)`.
 *
 * Build parts in `added()`, not in the constructor: `this.add` / `this.make` belong to the view the entity is
 * in, so they work once it has been added to one. Parts are parented to the entity; the resources they
 * create are freed with the view, and model animations are driven by the view.
 * Adding a pointer listener makes a passive entity interactive so it hears taps on its parts.
 */
export class Entity3D<Props = void> extends WithLifecycle(WithSignals(Container3D)) {
  readonly props: Props;
  private factories?: { owned: Owned3D; add: Factory3D; make: Factory3D };

  constructor(props?: Props) {
    super();
    this.props = (props ?? {}) as Props;
    bindAllMethods(this);
    this._initLifecycle({ autoResize: false, autoUpdate: true });
  }

  // Fields, not methods, so `entity.on('pointertap', (e) => ...)` keeps upstream's per-event typing.
  override on: Container3D['on'] & Listen<this> = ((event: string | symbol, fn: (...args: any[]) => void, context?: any) => {
    this.enablePointerEvents(event);
    return super.on(event, fn, context);
  }) as Container3D['on'] & Listen<this>;

  override once: Container3D['once'] & Listen<this> = ((event: string | symbol, fn: (...args: any[]) => void, context?: any) => {
    this.enablePointerEvents(event);
    return super.once(event, fn, context);
  }) as Container3D['once'] & Listen<this>;

  /** Listening is the opt-in: a passive ancestor is skipped when a part's event bubbles. */
  private enablePointerEvents(event: string | symbol): void {
    if (typeof event === 'string' && /^(global)?(pointer|mouse|touch)|^(click|tap|wheel|right|contextmenu)/.test(event) && this.eventMode === 'passive') {
      this.eventMode = 'static';
    }
  }

  get add(): Factory3D {
    return this.resolveFactories().add;
  }

  get make(): Factory3D {
    return this.resolveFactories().make;
  }

  private resolveFactories(): { add: Factory3D; make: Factory3D } {
    const owned = this.view3d && ownedByView.get(this.view3d);
    if (!owned) {
      throw new Error(
        'This Entity3D is not in a View3D yet. Build its parts in added(), after view.add.entity(...) or view.add.existing(entity).',
      );
    }
    // Rebuilt only if the entity moved to another view.
    if (this.factories?.owned !== owned) {
      const view = this.view3d as View3D;
      this.factories = { owned, add: createFactory3D(this, owned, true, view), make: createFactory3D(this, owned, false, view) };
    }
    return this.factories;
  }
}
