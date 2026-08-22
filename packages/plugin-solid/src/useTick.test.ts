import { Application } from '@caperjs/core';
import { createRoot } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useTick } from './useTick';

afterEach(() => {
  (Application as any).instance = undefined;
});

describe('useTick', () => {
  it('adds the callback to the ticker and removes it on cleanup', () => {
    const ticker = { add: vi.fn(), remove: vi.fn(), addOnce: vi.fn() };
    (Application as any).instance = { config: {}, ticker };

    const fn = vi.fn();
    const dispose = createRoot((d) => {
      useTick(fn);
      return d;
    });

    expect(ticker.add).toHaveBeenCalledWith(fn);
    expect(ticker.remove).not.toHaveBeenCalled();

    dispose();
    expect(ticker.remove).toHaveBeenCalledWith(fn);
  });
});
