import { describe, expect, it } from 'vitest';
import { bindAllMethods } from './bind';

/**
 * `bindAllMethods` walks up the prototype chain binding every method, and stops
 * at the first class marked with `__caper_method_binding_root`. The marker MUST
 * be `static`: the walk tests it with
 * `hasOwnProperty(prototype.constructor, ...)`, and an instance field never
 * lands on the constructor — so declaring it non-static silently disables the
 * guard and the walk runs all the way to `Object.prototype`, binding (and
 * copying onto every instance) every method of the base class. For a caper
 * `Container` that base is PixiJS's `Container`: ~70 extra bound closures and
 * own properties per display object.
 */

/** Stands in for the foreign base we must NOT bind into (i.e. PixiJS). */
class Foreign {
  foreignMethod(): unknown {
    return this;
  }
}

class Root extends Foreign {
  private static readonly __caper_method_binding_root = true;

  rootMethod(): unknown {
    return this;
  }
}

class Leaf extends Root {
  constructor() {
    super();
    bindAllMethods(this);
  }

  leafMethod(): unknown {
    return this;
  }
}

/** The pre-fix declaration: an instance field, which the guard cannot see. */
class BrokenRoot extends Foreign {
  private readonly __caper_method_binding_root = true;

  rootMethod(): unknown {
    return this;
  }
}

class BrokenLeaf extends BrokenRoot {
  constructor() {
    super();
    bindAllMethods(this);
  }
}

describe('bindAllMethods', () => {
  it('binds methods declared at and below the leaf', () => {
    const leaf = new Leaf();
    const { leafMethod, rootMethod } = leaf;

    expect(leafMethod()).toBe(leaf);
    expect(rootMethod()).toBe(leaf);
  });

  it('stops at the static root marker, leaving the foreign base unbound', () => {
    const leaf = new Leaf();
    const { foreignMethod } = leaf;

    // Detached and never bound — strict-mode `this` is undefined.
    expect(foreignMethod()).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(leaf, 'foreignMethod')).toBe(false);
  });

  it('does not copy the foreign base onto the instance', () => {
    const leaf = new Leaf();
    const own = Object.getOwnPropertyNames(leaf).filter((k) => typeof (leaf as never)[k] === 'function');

    expect(own).toContain('leafMethod');
    expect(own).toContain('rootMethod');
    expect(own).not.toContain('foreignMethod');
  });

  it('a NON-static marker fails to stop the walk (the bug this guards)', () => {
    const broken = new BrokenLeaf();

    // The guard never fires, so the foreign base gets bound and copied on.
    expect(Object.prototype.hasOwnProperty.call(broken, 'foreignMethod')).toBe(true);
    expect(broken.foreignMethod()).toBe(broken);
  });

  it('subclasses do not re-trigger the guard via an inherited static', () => {
    // `hasOwnProperty` is own-only, so `Leaf` inheriting Root's static does not
    // stop the walk before Leaf's own methods are collected.
    expect(Object.prototype.hasOwnProperty.call(Leaf, '__caper_method_binding_root')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(Root, '__caper_method_binding_root')).toBe(true);
  });
});
