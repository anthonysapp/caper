import { Application, FlexContainer } from '@caperjs/core';
import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { createRoot, createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { catalog } from './catalog';
import { createElement, createTextNode, insert, insertNode, render, setProp, spread } from './renderer';

/**
 * FlexContainer and the flex re-measure workaround both read the Application
 * singleton. Only the handful of members they touch are stubbed.
 */
function stubApplication() {
  const ticker = { add: vi.fn(), remove: vi.fn(), addOnce: vi.fn() };
  const layout = { update: vi.fn(), _updateSize: vi.fn(), updateLayout: vi.fn() };
  (Application as any).instance = {
    config: { useLayout: true },
    ticker,
    renderer: { layout },
  };
  return { ticker, layout };
}

let app: ReturnType<typeof stubApplication>;

beforeEach(() => {
  app = stubApplication();
});

afterEach(() => {
  (Application as any).instance = undefined;
});

describe('createElement', () => {
  it('constructs every catalog tag', () => {
    expect(createElement('container')).toBeInstanceOf(Container);
    expect(createElement('sprite')).toBeInstanceOf(Sprite);
    expect(createElement('text')).toBeInstanceOf(Text);
    expect(createElement('graphics')).toBeInstanceOf(Graphics);
    expect(createElement('flexContainer')).toBeInstanceOf(FlexContainer);
  });

  it('throws on an unknown tag, listing the known ones', () => {
    expect(() => createElement('nope')).toThrow(/Unknown element <nope>/);
    for (const tag of Object.keys(catalog)) {
      expect(() => createElement('nope')).toThrow(new RegExp(tag));
    }
  });

  it('creates text with events off', () => {
    expect(createElement('text').eventMode).toBe('none');
  });
});

describe('insertNode / removeNode', () => {
  it('appends when there is no anchor', () => {
    const parent = createElement('container');
    const a = createElement('sprite');
    const b = createElement('sprite');
    insertNode(parent, a);
    insertNode(parent, b);
    expect(parent.children).toEqual([a, b]);
  });

  it('inserts before the anchor', () => {
    const parent = createElement('container');
    const a = createElement('sprite');
    const b = createElement('sprite');
    const c = createElement('sprite');
    insertNode(parent, a);
    insertNode(parent, b);
    insertNode(parent, c, b);
    expect(parent.children).toEqual([a, c, b]);
  });

  it('schedules a flex re-measure when the parent is a FlexContainer', () => {
    const parent = createElement('flexContainer');
    const child = createElement('text');
    insertNode(parent, child);

    // FlexContainer defers its own layout pass through the ticker too, so drain
    // everything that got queued rather than assuming a single callback.
    expect(app.ticker.addOnce).toHaveBeenCalled();
    expect(app.layout._updateSize).not.toHaveBeenCalled();
    for (const [fn] of app.ticker.addOnce.mock.calls) fn();

    expect(app.layout._updateSize).toHaveBeenCalledWith(parent);
    expect(app.layout.updateLayout).toHaveBeenCalledWith(parent);
  });

  it('removes and destroys the child', () => {
    const parent = createElement('container');
    const child = createElement('container');
    const grandchild = createElement('sprite');
    insertNode(child, grandchild);
    insertNode(parent, child);

    // `removeNode` is not part of the exported runtime; it is reached through the
    // reconciler, so drive it with a signal that swaps the child out.
    const [show, setShow] = createSignal(true);
    const holder = createElement('container');
    createRoot(() => insert(holder, () => (show() ? child : null)));
    expect(holder.children).toEqual([child]);

    setShow(false);
    expect(holder.children).toEqual([]);
    expect(child.destroyed).toBe(true);
    expect(grandchild.destroyed).toBe(true);
  });
});

describe('setProperty', () => {
  it('expands a number into both axes of a point prop', () => {
    const node = createElement('sprite');
    setProp(node, 'scale', 2);
    expect(node.scale.x).toBe(2);
    expect(node.scale.y).toBe(2);
  });

  it('accepts { x, y } objects', () => {
    const node = createElement('sprite');
    setProp(node, 'position', { x: 10, y: 20 });
    setProp(node, 'scale', { x: 3, y: 4 });
    setProp(node, 'pivot', { x: 5, y: 6 });
    expect([node.x, node.y]).toEqual([10, 20]);
    expect([node.scale.x, node.scale.y]).toEqual([3, 4]);
    expect([node.pivot.x, node.pivot.y]).toEqual([5, 6]);
  });

  it('sets anchor on sprites and text', () => {
    const sprite = createElement('sprite') as Sprite;
    const text = createElement('text') as Text;
    setProp(sprite, 'anchor', 0.5);
    setProp(text, 'anchor', { x: 0, y: 1 });
    expect([sprite.anchor.x, sprite.anchor.y]).toEqual([0.5, 0.5]);
    expect([text.anchor.x, text.anchor.y]).toEqual([0, 1]);
  });

  it('passes unknown props straight through', () => {
    const node = createElement('container');
    setProp(node, 'alpha', 0.25);
    setProp(node, 'visible', false);
    setProp(node, 'x', 12);
    expect(node.alpha).toBe(0.25);
    expect(node.visible).toBe(false);
    expect(node.x).toBe(12);
  });

  it('re-measures a flex child when a plain prop changes', () => {
    const parent = createElement('flexContainer');
    const child = createElement('text');
    insertNode(parent, child);
    app.layout._updateSize.mockClear();

    setProp(child, 'text', 'hello');

    expect(app.layout._updateSize).toHaveBeenCalledWith(parent);
    expect(app.layout.updateLayout).toHaveBeenCalledWith(parent);
  });

  it('wires on* props as listeners and enables events', () => {
    const node = createElement('text');
    const first = vi.fn();
    setProp(node, 'onPointerTap', first);

    expect(node.listenerCount('pointertap')).toBe(1);
    expect(node.eventMode).toBe('static');

    node.emit('pointertap' as any, 'evt' as any);
    expect(first).toHaveBeenCalledTimes(1);

    const second = vi.fn();
    setProp(node, 'onPointerTap', second, first);
    expect(node.listenerCount('pointertap')).toBe(1);

    node.emit('pointertap' as any, 'evt' as any);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('lets an explicit eventMode prop win over the text default', () => {
    const node = createElement('text');
    setProp(node, 'eventMode', 'static');
    expect(node.eventMode).toBe('static');
  });

  describe('draw', () => {
    it('invokes the callback with the graphics node', () => {
      const node = createElement('graphics') as Graphics;
      const draw = vi.fn();
      setProp(node, 'draw', draw);
      expect(draw).toHaveBeenCalledWith(node);
    });

    it('clears before re-running a changed callback', () => {
      const node = createElement('graphics') as Graphics;
      const clear = vi.spyOn(node, 'clear');
      const first = vi.fn();
      const second = vi.fn();

      setProp(node, 'draw', first);
      setProp(node, 'draw', second, first);

      expect(clear).toHaveBeenCalledTimes(2);
      expect(first).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledWith(node);
    });

    it('throws when the target is not a graphics node', () => {
      const node = createElement('container');
      expect(() => setProp(node, 'draw', () => {})).toThrow(/only valid on <graphics>/);
    });
  });
});

describe('text nodes', () => {
  it('creates JSX text nodes with events off and updates them in place', () => {
    const node = createTextNode('hello') as Text;
    expect(node).toBeInstanceOf(Text);
    expect(node.text).toBe('hello');
    expect(node.eventMode).toBe('none');
  });

  it('distinguishes JSX text nodes from <text> elements', () => {
    expect((createTextNode('hello') as any).__isTextNode).toBe(true);
    expect((createElement('text') as any).__isTextNode).toBeUndefined();
  });

  it('replaces the text of an existing JSX text node rather than remounting', () => {
    const parent = createElement('container');
    const [label, setLabel] = createSignal('one');
    createRoot(() => insert(parent, () => label()));

    const node = parent.children[0] as Text;
    expect(node.text).toBe('one');

    setLabel('two');
    expect(parent.children[0]).toBe(node);
    expect(node.text).toBe('two');
  });
});

describe('render', () => {
  it('keeps props reactive and stops updating after dispose', () => {
    const root = createElement('container');
    const [alpha, setAlpha] = createSignal(0.25);

    const dispose = render(() => {
      const node = createElement('sprite');
      spread(
        node,
        {
          get alpha() {
            return alpha();
          },
        },
        true,
      );
      return node;
    }, root);

    const node = root.children[0] as Sprite;
    expect(node.alpha).toBe(0.25);

    setAlpha(0.5);
    expect(node.alpha).toBe(0.5);

    dispose();
    setAlpha(1);
    expect(node.alpha).toBe(0.5);
  });
});
