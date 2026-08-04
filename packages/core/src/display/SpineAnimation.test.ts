import { Container as PIXIContainer } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Registers the factory method table `Factory()` (part of SpineAnimation's mixin
// chain) reads from — must be imported before any display/ui class is
// constructed. See importOrder.containerFirst.test.ts.
import '../mixins/factory/const';
import { Signal } from '../signals';
import type { Size } from '../utils';
import { SpineAnimation } from './SpineAnimation';

class FakeSpine extends PIXIContainer {
  public autoUpdate = true;
  public state = {
    data: { skeletonData: { animations: [{ name: 'idle' }] } },
    addListener: vi.fn(),
    removeListener: vi.fn(),
    getCurrent: () => null,
    setAnimation: vi.fn(),
  };
}

class TestSpineAnimation extends SpineAnimation {
  public resizeCalls: (Size | undefined)[] = [];

  public resize(size?: Size) {
    this.resizeCalls.push(size);
  }
}

describe('SpineAnimation lifecycle', () => {
  let app: { onResize: Signal<(size: Size) => void>; actions: () => Signal<() => void> };
  let originalAppDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    app = {
      onResize: new Signal<(size: Size) => void>(),
      actions: () => new Signal<() => void>(),
    };
    (window as any).Spine = { from: () => new FakeSpine() };
    // `app` is a getter on the mixin prototype; shadow it on SpineAnimation's
    // own prototype so the constructor picks up the fake app.
    originalAppDescriptor = Object.getOwnPropertyDescriptor(SpineAnimation.prototype, 'app');
    Object.defineProperty(SpineAnimation.prototype, 'app', { get: () => app, configurable: true });
  });

  afterEach(() => {
    if (originalAppDescriptor) {
      Object.defineProperty(SpineAnimation.prototype, 'app', originalAppDescriptor);
    } else {
      delete (SpineAnimation.prototype as any).app;
    }
    delete (window as any).Spine;
  });

  it('routes app resizes to resize() once it has been added to the stage', () => {
    const animation = new TestSpineAnimation();

    // not on the stage yet — nothing is connected
    app.onResize.emit({ width: 10, height: 20 });
    expect(animation.resizeCalls).toEqual([]);

    new PIXIContainer().addChild(animation);
    app.onResize.emit({ width: 100, height: 50 });

    expect(animation.resizeCalls).toEqual([{ width: 100, height: 50 }]);
  });

  it('disconnects resize when removed from the stage', () => {
    const animation = new TestSpineAnimation();
    const parent = new PIXIContainer();
    parent.addChild(animation);

    parent.removeChild(animation);
    app.onResize.emit({ width: 100, height: 50 });

    expect(animation.resizeCalls).toEqual([]);
  });
});
