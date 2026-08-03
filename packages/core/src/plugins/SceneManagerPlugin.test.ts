import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Signal } from '../signals';

const mockApp = vi.hoisted(() => ({
  config: {} as Record<string, unknown>,
  onPause: null as any,
  onResume: null as any,
}));

// SceneManagerPlugin transitively imports Application → Pixi display graph. Stub it.
vi.mock('../core', () => ({
  coreFunctionRegistry: {},
  coreSignalRegistry: {},
}));
vi.mock('../core/Application', () => ({
  Application: { getInstance: () => mockApp, containerElement: null },
}));

import { SceneManagerPlugin } from './SceneManagerPlugin';

describe('SceneManagerPlugin destroy', () => {
  let plugin: SceneManagerPlugin;

  beforeEach(() => {
    mockApp.config = { showSceneDebugMenu: false, useHash: true };
    mockApp.onPause = new Signal<(config: any) => void>();
    mockApp.onResume = new Signal<(config: any) => void>();
    (globalThis as any).Caper = { get: () => [] };
    plugin = new SceneManagerPlugin();
  });

  afterEach(() => {
    delete (globalThis as any).Caper;
    window.location.hash = '';
  });

  it('stops responding to hashchange after destroy', async () => {
    await plugin.initialize({}, mockApp as never);
    const spy = vi.spyOn(plugin, 'getSceneFromHash').mockReturnValue(null);

    window.dispatchEvent(new Event('hashchange'));
    expect(spy).toHaveBeenCalledTimes(1);

    plugin.destroy();
    window.dispatchEvent(new Event('hashchange'));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('stops forwarding pause/resume to the current scene after destroy', async () => {
    await plugin.initialize({}, mockApp as never);
    const onPause = vi.fn();
    const onResume = vi.fn();
    plugin.currentScene = { onPause, onResume } as never;

    mockApp.onPause.emit({});
    mockApp.onResume.emit({});
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(onResume).toHaveBeenCalledTimes(1);

    plugin.destroy();
    mockApp.onPause.emit({});
    mockApp.onResume.emit({});
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('removes the debug menu from the DOM after destroy', async () => {
    mockApp.config = { showSceneDebugMenu: true };
    await plugin.initialize({}, mockApp as never);
    expect(document.getElementById('scene-debug')).not.toBeNull();

    plugin.destroy();
    expect(document.getElementById('scene-debug')).toBeNull();
  });
});
