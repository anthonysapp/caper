import { Application } from '@caperjs/core';
import { Graphics, Sprite } from 'pixi.js';
import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Composable, ComposableContainer, ComposableScene, type Composes } from './Composable';
import { createElement, insertNode, spread } from './renderer';

/**
 * Caper's `Container` reaches for the Application singleton on `added`,
 * `removed` and `destroy`. Only the members those paths touch are stubbed.
 */
function stubApplication() {
  const ticker = { add: vi.fn(), remove: vi.fn(), addOnce: vi.fn() };
  const layout = { update: vi.fn(), _updateSize: vi.fn(), updateLayout: vi.fn() };
  const onResize = { connect: vi.fn(() => ({ disconnect: vi.fn() })), disconnect: vi.fn() };
  (Application as any).instance = {
    config: { useLayout: true },
    ticker,
    onResize,
    animation: { killAll: vi.fn() },
    renderer: { layout },
  };
  return { ticker, layout, onResize };
}

beforeEach(() => {
  stubApplication();
});

afterEach(() => {
  (Application as any).instance = undefined;
});

/** A stand-in for the stage — a plain host node, not itself composable. */
function stage() {
  return createElement('container');
}

class Composed extends ComposableContainer implements Composes {
  public compose() {
    return createElement('sprite');
  }
}

describe('Composable', () => {
  it('mounts compose() on the first add, not at construction', () => {
    const view = new Composed();
    expect(view.children).toEqual([]);

    stage().addChild(view);

    expect(view.children).toHaveLength(1);
    expect(view.children[0]).toBeInstanceOf(Sprite);
  });

  it('mounts once — removing and re-adding does not duplicate the tree', () => {
    const parent = stage();
    const view = new Composed();

    parent.addChild(view);
    const mounted = view.children[0];

    parent.removeChild(view);
    parent.addChild(view);

    expect(view.children).toEqual([mounted]);
  });

  it('keeps props reactive after mount', () => {
    const [x, setX] = createSignal(0);

    class Moving extends ComposableContainer implements Composes {
      public compose() {
        const node = createElement('sprite');
        spread(
          node,
          {
            get x() {
              return x();
            },
          },
          true,
        );
        return node;
      }
    }

    const view = new Moving();
    stage().addChild(view);

    const node = view.children[0] as Sprite;
    expect(node.x).toBe(0);

    setX(25);
    expect(node.x).toBe(25);
  });

  it('disposes the solid root on destroy, so updates stop', () => {
    const [x, setX] = createSignal(0);

    class Moving extends ComposableContainer implements Composes {
      public compose() {
        const node = createElement('sprite');
        spread(
          node,
          {
            get x() {
              return x();
            },
          },
          true,
        );
        return node;
      }
    }

    const view = new Moving();
    stage().addChild(view);

    const node = view.children[0] as Sprite;
    setX(25);
    expect(node.x).toBe(25);

    expect(() => view.destroy()).not.toThrow();

    setX(99);
    expect(node.x).toBe(25);
  });

  it('destroys children without a double-destroy error', () => {
    const view = new Composed();
    stage().addChild(view);
    const node = view.children[0] as Sprite;

    expect(() => view.destroy({ children: true })).not.toThrow();
    expect(node.destroyed).toBe(true);
    expect(view.destroyed).toBe(true);
  });

  it('mounts a composed child that a composed parent inserts', () => {
    class Child extends ComposableContainer implements Composes {
      public compose() {
        return createElement('graphics');
      }
    }

    class Parent extends ComposableContainer implements Composes {
      public compose() {
        const root = createElement('container');
        insertNode(root, new Child());
        return root;
      }
    }

    const view = new Parent();
    stage().addChild(view);

    const root = view.children[0];
    const child = root.children[0] as Child;
    expect(child).toBeInstanceOf(Child);
    expect(child.children[0]).toBeInstanceOf(Graphics);
  });

  it('leaves a subclass without compose() completely alone', () => {
    class Plain extends ComposableContainer {}

    const view = new Plain();
    expect(() => stage().addChild(view)).not.toThrow();
    expect(view.children).toEqual([]);
    expect(() => view.destroy()).not.toThrow();
  });

  it('still mounts when a subclass overrides added() without calling super', () => {
    class Rude extends ComposableContainer implements Composes {
      public addedRan = false;

      public added() {
        this.addedRan = true;
      }

      public compose() {
        return createElement('sprite');
      }
    }

    const view = new Rude();
    stage().addChild(view);

    expect(view.addedRan).toBe(true);
    expect(view.children).toHaveLength(1);
    expect(view.children[0]).toBeInstanceOf(Sprite);
  });

  it('applies to any display base, including Scene', () => {
    class Screen extends ComposableScene implements Composes {
      public compose() {
        return createElement('sprite');
      }
    }

    const view = new Screen();
    stage().addChild(view);

    expect(view.children).toHaveLength(1);
    // `Scene.destroy()` takes no arguments — the mixin has to mirror that.
    expect(() => view.destroy()).not.toThrow();
  });

  it('is exported as a mixin usable on other bases', () => {
    expect(typeof Composable).toBe('function');
    expect(new (Composable(ComposableContainer))()).toBeInstanceOf(ComposableContainer);
  });
});
