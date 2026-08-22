// A "gliding" signal: same read shape as any other accessor, but it eases toward
// its source instead of snapping to it. The binding stays declarative —
// `x={slid()}` — and nothing in the view knows an animation is running.

import gsap from 'gsap';
import { createEffect, createSignal, on, onCleanup, untrack } from 'solid-js';

/**
 * Follow `source` smoothly.
 *
 * Must be called inside a reactive owner (a component body or a `compose()`),
 * because it registers an `onCleanup` to kill its animation.
 *
 * ```ts
 * const barWidth = animated(() => hp() / 100);
 * <graphics scale={{ x: barWidth(), y: 1 }} />
 * ```
 */
export function animated(source: () => number, opts?: { duration?: number; ease?: string }): () => number {
  const start = untrack(source);
  const [value, setValue] = createSignal(start);

  // gsap animates plain object properties, so the accessor's current value lives
  // on this proxy and is mirrored into the signal on every frame.
  const proxy = { v: start };

  const animateTo = gsap.quickTo(proxy, 'v', {
    duration: opts?.duration ?? 0.35,
    ease: opts?.ease ?? 'power2.out',
    onUpdate: () => setValue(proxy.v),
  });

  // `defer: true` skips the initial run, so mounting doesn't animate from nowhere.
  createEffect(on(source, (next) => animateTo(next), { defer: true }));

  onCleanup(() => animateTo.tween.kill());

  return value;
}
