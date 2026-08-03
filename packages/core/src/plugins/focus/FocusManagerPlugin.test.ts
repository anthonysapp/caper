import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockApp = vi.hoisted(() => ({
  config: { focus: {} },
  renderer: {
    accessibility: {
      isActive: false,
      destroy: vi.fn(),
      postrender: vi.fn(),
      _deactivate: vi.fn(),
    },
  },
  scenes: { onSceneChangeStart: { connect: vi.fn() } },
  ticker: { addOnce: vi.fn(), add: vi.fn(), remove: vi.fn() },
}));

// FocusManagerPlugin transitively imports Application → Pixi display graph. Stub it.
vi.mock('../../core', () => ({
  coreFunctionRegistry: {},
  coreSignalRegistry: {},
}));
vi.mock('../../core/Application', () => ({
  Application: { getInstance: () => mockApp },
}));

import { FocusManagerPlugin } from './FocusManagerPlugin';

describe('FocusManagerPlugin destroy', () => {
  let plugin: FocusManagerPlugin;

  beforeEach(() => {
    plugin = new FocusManagerPlugin();
  });

  it('stops handling window keydown after destroy', () => {
    const spy = vi.spyOn(plugin as any, '_onKeyDown');
    plugin.initialize({}, mockApp as never);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(spy).toHaveBeenCalledTimes(1);

    plugin.destroy();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('stops handling window keyup after destroy', () => {
    const spy = vi.spyOn(plugin as any, '_onKeyUp');
    plugin.initialize({}, mockApp as never);

    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter' }));
    expect(spy).toHaveBeenCalledTimes(1);

    plugin.destroy();
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter' }));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('stops handling the capture-phase document mousemove after destroy', () => {
    const spy = vi.spyOn(plugin as any, '_onMouseMove');
    plugin.initialize({}, mockApp as never);
    (plugin as any)._activate();

    document.dispatchEvent(new MouseEvent('mousemove'));
    expect(spy).toHaveBeenCalledTimes(1);

    plugin.destroy();
    document.dispatchEvent(new MouseEvent('mousemove'));
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
