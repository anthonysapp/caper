import { Container as PIXIContainer } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Signal } from '../signals';
import type { Size } from '../utils';
import { ParticleContainer } from './ParticleContainer';

class TestParticleContainer extends ParticleContainer {
  public resizeCalls: (Size | undefined)[] = [];
  public updateCalls = 0;

  public resize(size?: Size) {
    this.resizeCalls.push(size);
  }

  public update() {
    this.updateCalls++;
  }
}

describe('ParticleContainer lifecycle', () => {
  let app: {
    onResize: Signal<(size: Size) => void>;
    ticker: { add: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
  };
  let originalAppDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    app = {
      onResize: new Signal<(size: Size) => void>(),
      ticker: { add: vi.fn(), remove: vi.fn() },
    };
    // `app` is a getter on the mixin prototype; shadow it on ParticleContainer's
    // own prototype so the constructor picks up the fake app.
    originalAppDescriptor = Object.getOwnPropertyDescriptor(ParticleContainer.prototype, 'app');
    Object.defineProperty(ParticleContainer.prototype, 'app', { get: () => app, configurable: true });
  });

  afterEach(() => {
    if (originalAppDescriptor) {
      Object.defineProperty(ParticleContainer.prototype, 'app', originalAppDescriptor);
    } else {
      delete (ParticleContainer.prototype as any).app;
    }
  });

  it('routes app resizes to resize() once it has been added to the stage', () => {
    const particles = new TestParticleContainer();

    // not on the stage yet — nothing is connected
    app.onResize.emit({ width: 10, height: 20 });
    expect(particles.resizeCalls).toEqual([]);

    new PIXIContainer().addChild(particles);
    app.onResize.emit({ width: 100, height: 50 });

    expect(particles.resizeCalls).toEqual([{ width: 100, height: 50 }]);
  });

  it('does not connect resize() when autoResize is off', () => {
    const particles = new TestParticleContainer({ autoResize: false });
    new PIXIContainer().addChild(particles);

    app.onResize.emit({ width: 100, height: 50 });

    expect(particles.resizeCalls).toEqual([]);
  });

  it('adds update() to the ticker with the configured priority', () => {
    const particles = new TestParticleContainer({ priority: 5 });
    new PIXIContainer().addChild(particles);

    expect(app.ticker.add).toHaveBeenCalledWith(particles.update, particles, 5);
  });

  it('disconnects resize, the ticker and emits onDestroy on destroy', () => {
    const particles = new TestParticleContainer();
    new PIXIContainer().addChild(particles);

    const onDestroy = vi.fn();
    particles.onDestroy.connect(onDestroy);

    particles.destroy();

    expect(onDestroy).toHaveBeenCalledTimes(1);
    expect(app.ticker.remove).toHaveBeenCalledWith(particles.update, particles);

    app.onResize.emit({ width: 100, height: 50 });
    expect(particles.resizeCalls).toEqual([]);
  });

  it('disconnects resize and the ticker when removed from the stage', () => {
    const particles = new TestParticleContainer();
    const parent = new PIXIContainer();
    parent.addChild(particles);

    parent.removeChild(particles);
    app.onResize.emit({ width: 100, height: 50 });

    expect(particles.resizeCalls).toEqual([]);
    expect(app.ticker.remove).toHaveBeenCalledWith(particles.update, particles);
  });
});
