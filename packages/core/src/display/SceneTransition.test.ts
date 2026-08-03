import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// Registers the factory method table `Factory()` (part of Container's mixin
// chain) reads from — must be imported before any display/ui class is
// constructed. See importOrder.containerFirst.test.ts.
import '../mixins/factory/const';
import { Signal } from '../signals';
import { SceneTransition } from './SceneTransition';

describe('SceneTransition asset signal wiring', () => {
  let app: {
    assets: {
      onLoadStart: Signal<() => void>;
      onLoadProgress: Signal<(progress: number) => void>;
      onLoadComplete: Signal<() => void>;
    };
  };
  let originalAppDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    app = {
      assets: {
        onLoadStart: new Signal<() => void>(),
        onLoadProgress: new Signal<(progress: number) => void>(),
        onLoadComplete: new Signal<() => void>(),
      },
    };
    // Container.app is a getter; override it on the prototype so the
    // constructor picks up the fake app before the instance even exists.
    originalAppDescriptor = Object.getOwnPropertyDescriptor(SceneTransition.prototype, 'app');
    Object.defineProperty(SceneTransition.prototype, 'app', { get: () => app, configurable: true });
  });

  afterEach(() => {
    if (originalAppDescriptor) {
      Object.defineProperty(SceneTransition.prototype, 'app', originalAppDescriptor);
    } else {
      delete (SceneTransition.prototype as any).app;
    }
  });

  it('routes progress ticks to handleLoadProgress and completion to handleLoadComplete', () => {
    const progressSpy = vi.spyOn(SceneTransition.prototype as any, 'handleLoadProgress');
    const completeSpy = vi.spyOn(SceneTransition.prototype as any, 'handleLoadComplete');

    const transition = new SceneTransition();
    void transition;

    app.assets.onLoadProgress.emit(0.5);

    expect(progressSpy).toHaveBeenCalledTimes(1);
    expect(completeSpy).not.toHaveBeenCalled();

    app.assets.onLoadComplete.emit();

    expect(completeSpy).toHaveBeenCalledTimes(1);
    expect(progressSpy).toHaveBeenCalledTimes(1);
  });
});
