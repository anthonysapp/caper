import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Container as PIXIContainer } from 'pixi.js';

// UICanvas transitively imports Application → Pixi display graph. Stub it — the
// pure padding helper needs none of it. The "element reordering" describe block
// below constructs real UICanvas instances, which internally build FlexContainer
// and Container children; those classes read `Application.getInstance()` for
// their own `app` getter (independent of UICanvas's own `app` override), so the
// stub needs a minimal shape (`config.useLayout`) satisfying their constructors too.
vi.mock('../core/Application', async () => {
  const { Signal } = await import('../signals');
  const fakeApp = {
    config: { useLayout: true },
    renderer: { layout: undefined },
    ticker: { addOnce: () => {} },
    onResize: new Signal(),
  };
  return { Application: { getInstance: () => fakeApp } };
});

// Registers the factory method table `Factory()` (part of Container's mixin
// chain) reads from — must be imported before any display/ui class is
// constructed. See importOrder.containerFirst.test.ts.
import '../mixins/factory/const';
import { Signal } from '../signals';
import { computeEffectivePadding, UICanvas } from './UICanvas';

const zero = { top: 0, right: 0, bottom: 0, left: 0 };

describe('computeEffectivePadding', () => {
  it('adds the safe area to the configured padding', () => {
    expect(
      computeEffectivePadding({ top: 10, right: 10, bottom: 10, left: 10 }, { ...zero, top: 44, bottom: 34 }),
    ).toEqual({ top: 54, right: 10, bottom: 44, left: 10 });
  });

  it('returns the configured padding when there is no safe area', () => {
    expect(computeEffectivePadding({ top: 10, right: 20, bottom: 30, left: 40 }, zero)).toEqual({
      top: 10,
      right: 20,
      bottom: 30,
      left: 40,
    });
  });

  it('does not compound when applied repeatedly to the same base padding', () => {
    const base = { top: 10, right: 10, bottom: 10, left: 10 };
    const safeArea = { ...zero, top: 44 };
    computeEffectivePadding(base, safeArea);
    expect(computeEffectivePadding(base, safeArea).top).toBe(54);
  });
});

describe('UICanvas element reordering', () => {
  let app: any;
  let originalAppDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    app = {
      config: { useLayout: true },
      size: { width: 800, height: 600 },
      onResize: new Signal<() => void>(),
      ticker: { addOnce: vi.fn() },
    };
    originalAppDescriptor = Object.getOwnPropertyDescriptor(UICanvas.prototype, 'app');
    Object.defineProperty(UICanvas.prototype, 'app', { get: () => app, configurable: true });
  });

  afterEach(() => {
    if (originalAppDescriptor) {
      Object.defineProperty(UICanvas.prototype, 'app', originalAppDescriptor);
    } else {
      delete (UICanvas.prototype as any).app;
    }
  });

  function addThree(canvas: UICanvas) {
    const a = new PIXIContainer({ label: 'a' });
    const b = new PIXIContainer({ label: 'b' });
    const c = new PIXIContainer({ label: 'c' });
    canvas.addElement(a, { align: 'top left' });
    canvas.addElement(b, { align: 'top left' });
    canvas.addElement(c, { align: 'top left' });
    const container = (canvas as any)._childMap.get(a);
    return { a, b, c, container };
  }

  it('reorderElement moves an element within its region', () => {
    const canvas = new UICanvas({});
    const { a, b, c, container } = addThree(canvas);

    canvas.reorderElement(a, 2);

    expect(container.children.indexOf(a)).toBeGreaterThanOrEqual(0);
    expect([b, c, a].every((child, i) => container.children[i] === child)).toBe(true);
  });

  it('bringToFront moves an element to the last index in its region', () => {
    const canvas = new UICanvas({});
    const { a, b, c, container } = addThree(canvas);

    canvas.bringToFront(a);

    expect([b, c, a].every((child, i) => container.children[i] === child)).toBe(true);
  });

  it('sendToBack moves an element to the first index in its region', () => {
    const canvas = new UICanvas({});
    const { a, b, c, container } = addThree(canvas);

    canvas.sendToBack(c);

    expect([c, a, b].every((child, i) => container.children[i] === child)).toBe(true);
  });

  it('reorderElement throws when the child was never added via addElement', () => {
    const canvas = new UICanvas({});
    const neverAdded = new PIXIContainer({ label: 'never-added' });

    expect(() => canvas.reorderElement(neverAdded, 0)).toThrow(/Cannot reorder element/);
    expect(() => canvas.reorderElement(neverAdded, 0)).toThrow(/not added via addElement/);
  });

  it('bringToFront and sendToBack throw when the child was never added via addElement', () => {
    const canvas = new UICanvas({});
    const neverAdded = new PIXIContainer({ label: 'never-added' });

    expect(() => canvas.bringToFront(neverAdded)).toThrow(/Cannot reorder element/);
    expect(() => canvas.sendToBack(neverAdded)).toThrow(/Cannot reorder element/);
  });

  it('setChildIndex throws a guard error instead of the old Pixi passthrough', () => {
    const canvas = new UICanvas({});
    const { a } = addThree(canvas);

    expect(() => canvas.setChildIndex(a, 0)).toThrow(/Do not call setChildIndex/);
  });
});
