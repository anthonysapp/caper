import { Application } from '@caperjs/core';
import type { Ticker } from 'pixi.js';
import { onCleanup } from 'solid-js';

/** Run `fn` every frame for the lifetime of the owning component. */
export function useTick(fn: (ticker: Ticker) => void) {
  const app = Application.getInstance();
  app.ticker.add(fn);
  onCleanup(() => app.ticker.remove(fn));
}
