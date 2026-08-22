import gsap from 'gsap';
import PixiPlugin from 'gsap/PixiPlugin';
import * as PIXI from 'pixi.js';
import { Container } from 'pixi.js';
import { createSignal } from 'solid-js';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { AnimatedShow } from './AnimatedShow';
import { createElement, render } from './renderer';

// GSAP normally advances its root timeline from requestAnimationFrame, which
// happy-dom fires on a real clock — nothing to assert against. Detach the root
// from the ticker once and step it by hand instead, so every test owns time.
let now = 0;

beforeAll(() => {
  // Caper's GSAPPlugin does this at app bootstrap; nothing bootstraps here, and
  // `AnimatedShow` animates through `pixi: {...}` vars. PixiPlugin looks for
  // `window.PIXI`, which no bundled app has — hence the explicit handover.
  gsap.registerPlugin(PixiPlugin);
  PixiPlugin.registerPIXI(PIXI);
  gsap.ticker.remove(gsap.updateRoot);
  now = gsap.ticker.time;
});

function advance(seconds: number) {
  now += seconds;
  gsap.updateRoot(now);
}

/** Mount an `<AnimatedShow>` into a detached container and hand back the seams. */
function mount(initial: boolean, props: { enter?: gsap.TweenVars; exit?: gsap.TweenVars } = {}) {
  const stage = createElement('container');
  const [open, setOpen] = createSignal(initial);

  const dispose = render(
    () => (
      <AnimatedShow when={open} enter={props.enter} exit={props.exit}>
        <sprite />
      </AnimatedShow>
    ),
    stage,
  );

  const wrapper = stage.children[0] as Container;
  return { stage, wrapper, setOpen, dispose, childCount: () => wrapper.children.length };
}

describe('AnimatedShow', () => {
  it('mounts children and animates them in when it opens', () => {
    const { wrapper, setOpen, childCount, dispose } = mount(false);
    expect(childCount()).toBe(0);

    setOpen(true);
    expect(childCount()).toBe(1);
    expect(wrapper.alpha).toBe(0);
    expect(wrapper.scale.x).toBeCloseTo(0.85, 5);

    // Default enter runs for 0.25s.
    advance(0.4);
    expect(wrapper.alpha).toBe(1);
    expect(wrapper.scale.x).toBeCloseTo(1, 5);
    expect(wrapper.scale.y).toBeCloseTo(1, 5);

    dispose();
  });

  it('keeps children mounted through the exit, then unmounts them', () => {
    const { wrapper, setOpen, childCount, dispose } = mount(true);
    expect(childCount()).toBe(1);

    setOpen(false);
    expect(childCount()).toBe(1);

    // Default exit runs for 0.2s.
    advance(0.1);
    expect(childCount()).toBe(1);
    expect(wrapper.alpha).toBeGreaterThan(0);
    expect(wrapper.alpha).toBeLessThan(1);

    advance(0.2);
    expect(childCount()).toBe(0);

    dispose();
  });

  it('cancels the pending unmount when it re-opens mid-exit', () => {
    const { wrapper, setOpen, childCount, dispose } = mount(true);

    setOpen(false);
    advance(0.1);
    expect(childCount()).toBe(1);

    setOpen(true);
    expect(childCount()).toBe(1);

    // Long past the point the exit would have finished and unmounted.
    advance(0.1);
    expect(childCount()).toBe(1);
    advance(1);
    expect(childCount()).toBe(1);
    expect(wrapper.alpha).toBe(1);

    dispose();
  });

  it('disposes cleanly mid-animation', () => {
    const { wrapper, setOpen, dispose } = mount(false);

    setOpen(true);
    advance(0.1);
    // Still in flight: moved off the start, not yet parked on the end value.
    // (The default `back.out` ease overshoots, so "not 1" is the honest check.)
    const mid = wrapper.alpha;
    expect(mid).toBeGreaterThan(0);
    expect(mid).not.toBe(1);

    expect(() => dispose()).not.toThrow();
    expect(() => advance(1)).not.toThrow();
    // Cleanup killed the animation, so the node is frozen where it stood.
    expect(wrapper.alpha).toBe(mid);
  });

  it("runs a custom exit's own onComplete before unmounting", () => {
    let childrenWhenCalled = -1;
    const onComplete = vi.fn(() => {
      childrenWhenCalled = wrapper.children.length;
    });
    const { wrapper, setOpen, childCount, dispose } = mount(true, {
      exit: { pixi: { alpha: 0 }, duration: 0.5, onComplete },
    });

    setOpen(false);
    advance(0.3);
    expect(onComplete).not.toHaveBeenCalled();
    expect(childCount()).toBe(1);

    advance(0.3);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(childrenWhenCalled).toBe(1);
    expect(childCount()).toBe(0);
    expect(wrapper.alpha).toBe(0);

    dispose();
  });
});
