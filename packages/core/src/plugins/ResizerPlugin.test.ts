import { beforeEach, describe, expect, it, vi } from 'vitest';

// ResizerPlugin transitively imports Application → Pixi display graph. Stub it.
vi.mock('../core', () => ({
  coreFunctionRegistry: {},
  coreSignalRegistry: {},
}));

const mocks = vi.hoisted(() => ({
  app: {
    config: { resizeToContainer: false } as { resizeToContainer: boolean },
    renderer: {
      canvas: { style: {} as Record<string, string>, parentElement: null as unknown },
      resize: (_w: number, _h: number) => {},
    },
  },
}));

vi.mock('../core/Application', () => ({
  Application: { getInstance: () => mocks.app },
}));

import { ResizerPlugin } from './ResizerPlugin';

/** Shrinks the container below minWidth/minHeight so `_resize()` computes scale > 1. */
function useContainer(width: number, height: number) {
  mocks.app.config.resizeToContainer = true;
  mocks.app.renderer.canvas.parentElement = {
    getBoundingClientRect: () => ({ width, height }),
  };
}

describe('ResizerPlugin safe area', () => {
  let plugin: ResizerPlugin;

  beforeEach(async () => {
    mocks.app.config.resizeToContainer = false;
    mocks.app.renderer.canvas = { style: {}, parentElement: null };
    plugin = new ResizerPlugin();
  });

  it('reports zero insets before the first resize', () => {
    expect(plugin.safeArea).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });

  it('scales measured insets into logical render units', async () => {
    await plugin.initialize({ minWidth: 1000, minHeight: 1000 });
    useContainer(500, 500);
    plugin._measureSafeAreaCssPx = () => ({ top: 44, right: 0, bottom: 34, left: 12 });

    plugin._resize();

    expect(plugin.scale).toBe(2);
    expect(plugin.safeArea).toEqual({ top: 88, right: 0, bottom: 68, left: 24 });
  });

  it('passes measured insets through unscaled at scale 1', async () => {
    await plugin.initialize({ minWidth: 500, minHeight: 500 });
    plugin._measureSafeAreaCssPx = () => ({ top: 44, right: 0, bottom: 34, left: 12 });

    plugin._resize();

    expect(plugin.scale).toBe(1);
    expect(plugin.safeArea).toEqual({ top: 44, right: 0, bottom: 34, left: 12 });
  });

  it('reports zero insets when useSafeArea is off', async () => {
    await plugin.initialize({ minWidth: 500, minHeight: 500, useSafeArea: false });
    plugin._measureSafeAreaCssPx = () => ({ top: 44, right: 0, bottom: 34, left: 12 });

    plugin._resize();

    expect(plugin.safeArea).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });

  it('measures 0 when the browser does not support env()', async () => {
    await plugin.initialize({ minWidth: 500, minHeight: 500 });

    plugin._resize();

    expect(plugin.safeArea).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    plugin.destroy();
  });
});
