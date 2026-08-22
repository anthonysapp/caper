// `<Show>` unmounts the instant its condition flips, which is fine for a scene
// graph and terrible for a popup. `<AnimatedShow>` keeps the node on stage until
// its exit animation finishes, so conditional UI can enter and leave gracefully
// without the caller writing a single imperative line.

import gsap from 'gsap';
import type { Container } from 'pixi.js';
import { createEffect, createMemo, createSignal, on, onCleanup, Show, untrack } from 'solid-js';

/** Where an entering node starts from, before it animates to `enter`. */
const ENTER_FROM: gsap.TweenVars = { pixi: { alpha: 0, scale: 0.85 } };
const ENTER_TO: gsap.TweenVars = { pixi: { alpha: 1, scale: 1 }, duration: 0.25, ease: 'back.out(1.7)' };
const EXIT_TO: gsap.TweenVars = { pixi: { alpha: 0, scale: 0.85 }, duration: 0.2, ease: 'power2.in' };

/**
 * Conditional UI with enter / exit animations.
 *
 * ```tsx
 * <AnimatedShow when={open}>
 *   <container>…</container>
 * </AnimatedShow>
 * ```
 *
 * Custom `enter` / `exit` are plain GSAP vars — put target properties in a
 * `pixi: {...}` block (`{ pixi: { y: 20, alpha: 0 }, duration: 0.3 }`).
 * There is no `fallback` — the whole point is that the node outlives the flag.
 *
 * Requires GSAP's PixiPlugin, which caper's `GSAPPlugin` registers during app
 * bootstrap. This package deliberately does not register it itself; outside a
 * booted `Application` (tests, standalone use) call
 * `gsap.registerPlugin(PixiPlugin)` yourself first.
 */
export function AnimatedShow(props: {
  when: boolean | (() => boolean);
  children: any;
  enter?: gsap.TweenVars;
  exit?: gsap.TweenVars;
}) {
  const open = createMemo(() => (typeof props.when === 'function' ? props.when() : props.when));
  // Trails `open`: goes true immediately, goes false only once the exit is done.
  const [mounted, setMounted] = createSignal(untrack(open));

  let wrapper: Container | undefined;
  let animation: gsap.core.Tween | undefined;

  const stop = () => {
    animation?.kill();
    animation = undefined;
  };

  createEffect(
    on(
      open,
      (isOpen) => {
        const node = wrapper;
        if (!node) return;
        // Killing first is what makes rapid toggling safe: the exit's
        // `onComplete` can no longer unmount a node that is entering again.
        stop();

        if (isOpen) {
          setMounted(true);
          gsap.set(node, ENTER_FROM);
          animation = gsap.to(node, props.enter ?? ENTER_TO);
        } else {
          const exit = props.exit ?? EXIT_TO;
          animation = gsap.to(node, {
            ...exit,
            onComplete: () => {
              (exit.onComplete as (() => void) | undefined)?.();
              setMounted(false);
            },
          });
        }
      },
      { defer: true },
    ),
  );

  onCleanup(stop);

  return (
    <container ref={(el: Container) => (wrapper = el)}>
      <Show when={mounted()}>{props.children}</Show>
    </container>
  );
}
