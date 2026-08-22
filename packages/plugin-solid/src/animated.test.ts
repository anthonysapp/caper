import gsap from 'gsap';
import { createRoot, createSignal } from 'solid-js';
import { beforeAll, describe, expect, it } from 'vitest';

import { animated } from './animated';

// GSAP normally advances its root timeline from requestAnimationFrame, which
// happy-dom fires on a real clock — nothing to assert against. Detach the root
// from the ticker once and step it by hand instead, so every test owns time.
let now = 0;

beforeAll(() => {
  gsap.ticker.remove(gsap.updateRoot);
  now = gsap.ticker.time;
});

function advance(seconds: number) {
  now += seconds;
  gsap.updateRoot(now);
}

/**
 * Mount `animated` in its own reactive owner. Solid flushes effects only once
 * the root body returns, so the source has to be driven from outside — inside,
 * the deferred effect would not be listening yet.
 */
function mount(initial: number, opts?: { duration?: number; ease?: string }) {
  const [source, setSource] = createSignal(initial);
  let shown!: () => number;
  const dispose = createRoot((d) => {
    shown = animated(source, opts);
    return d;
  });
  return { shown: () => shown(), setSource, dispose };
}

describe('animated', () => {
  it('starts at the source value and does not animate on mount', () => {
    const { shown, dispose } = mount(100);

    expect(shown()).toBe(100);
    advance(1);
    expect(shown()).toBe(100);

    dispose();
  });

  it('glides toward a new source value and settles on it', () => {
    const { shown, setSource, dispose } = mount(0);

    setSource(100);
    // Still at the old value: no frame has rendered yet.
    expect(shown()).toBe(0);

    advance(0.1);
    const mid = shown();
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(100);

    // Default duration is 0.35s.
    advance(0.5);
    expect(shown()).toBe(100);

    dispose();
  });

  it('honours a custom duration', () => {
    const { shown, setSource, dispose } = mount(0, { duration: 2, ease: 'none' });

    setSource(100);

    advance(1);
    expect(shown()).toBeCloseTo(50, 1);

    advance(1.1);
    expect(shown()).toBe(100);

    dispose();
  });

  it('stops animating once its owner is disposed', () => {
    const { shown, setSource, dispose } = mount(0);

    setSource(100);
    advance(0.1);
    const mid = shown();
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(100);

    dispose();
    advance(1);
    expect(shown()).toBe(mid);
  });
});
