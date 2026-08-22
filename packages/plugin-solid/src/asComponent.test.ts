import { Application, Container } from '@caperjs/core';
import { Graphics, Sprite } from 'pixi.js';
import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { asComponent } from './asComponent';
import { ComposableContainer, type Composes } from './Composable';
import { createElement, type PixiNode, render } from './renderer';

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

/** Mount a component the way JSX would: into a host node, inside a solid root. */
function mount<T extends PixiNode>(component: () => T) {
  const root = createElement('container');
  const dispose = render(() => component(), root);
  return { root, node: root.children[0] as T, dispose };
}

/** An ordinary imperative display class that knows nothing about Solid. */
class Widget extends Container {}

/** Builds its own look up front — the case `skipChildren` protects. */
class SelfBuilt extends Container {
  constructor(config?: any) {
    super(config);
    this.add.graphics();
  }
}

describe('asComponent', () => {
  it('mounts the constructed instance and applies props', () => {
    const Widget$ = asComponent(Widget);
    const { root, node } = mount(() => Widget$({ x: 5, alpha: 0.5 }));

    expect(root.children).toHaveLength(1);
    expect(node).toBeInstanceOf(Widget);
    expect(node.x).toBe(5);
    expect(node.alpha).toBe(0.5);
  });

  it('keeps props reactive after mount', () => {
    const [x, setX] = createSignal(0);
    const Widget$ = asComponent(Widget);
    const { node, dispose } = mount(() =>
      Widget$({
        get x() {
          return x();
        },
      }),
    );

    expect(node.x).toBe(0);
    setX(25);
    expect(node.x).toBe(25);

    dispose();
    setX(99);
    expect(node.x).toBe(25);
  });

  it('constructs once, untracked — a signal read in the constructor is not a dependency', () => {
    const [label, setLabel] = createSignal('one');
    const built: string[] = [];

    class Reader extends Container {
      constructor() {
        super();
        built.push(label());
      }
    }

    const Reader$ = asComponent(Reader);
    const { node } = mount(() => Reader$({}));

    setLabel('two');

    expect(built).toEqual(['one']);
    expect(node).toBeInstanceOf(Reader);
  });

  it('hands the defaults to the constructor', () => {
    let received: unknown;

    class Configured extends Container {
      constructor(config?: { label?: string }) {
        super(config as any);
        received = config;
      }
    }

    const Configured$ = asComponent(Configured, { label: 'hp' });
    mount(() => Configured$({ x: 1 }));

    expect(received).toEqual({ label: 'hp' });
  });

  it('calls a ref prop with the instance', () => {
    let captured: Widget | undefined;
    const Widget$ = asComponent(Widget);
    const { node } = mount(() => Widget$({ ref: (el: Widget) => (captured = el) }));

    expect(captured).toBe(node);
  });

  describe('children', () => {
    it('leaves the class’s own children alone when no JSX children are passed', () => {
      const SelfBuilt$ = asComponent(SelfBuilt);
      const { node } = mount(() => SelfBuilt$({ x: 1 }));

      // `skipChildren` is what keeps solid's children pass — an
      // `insertExpression(node, undefined, …)` that ends in `cleanChildren` —
      // away from what the class built for itself. (solid 1.9 happens to also
      // bail out of that pass early when both values are `undefined`; the guard
      // is what the contract rests on, not that detail.)
      expect(node.children).toHaveLength(1);
      expect(node.children[0]).toBeInstanceOf(Graphics);
      expect(node.children[0].destroyed).toBe(false);
    });

    it('inserts JSX children when they are passed', () => {
      const Widget$ = asComponent(Widget);
      const child = createElement('sprite');
      const { node } = mount(() => Widget$({ children: child }));

      expect(node.children).toEqual([child]);
    });
  });

  it('still mounts a composed class’s own tree', () => {
    class Bar extends ComposableContainer implements Composes {
      public compose() {
        return createElement('sprite');
      }
    }

    const Bar$ = asComponent(Bar);
    const { node } = mount(() => Bar$({ x: 3 }));

    expect(node).toBeInstanceOf(Bar);
    expect(node.x).toBe(3);
    expect(node.children).toHaveLength(1);
    expect(node.children[0]).toBeInstanceOf(Sprite);
  });
});
