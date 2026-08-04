import { Assets, Container } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

// CaptionsPlugin -> Plugin.ts transitively imports Application → Pixi display graph. Stub it.
vi.mock('../../core', () => ({
  coreFunctionRegistry: {},
  coreSignalRegistry: {},
}));
const { appMock } = vi.hoisted(() => ({ appMock: {} as any }));
vi.mock('../../core/Application', () => ({
  Application: { getInstance: () => appMock },
}));

import { Signal } from '../../signals';
import { CaptionsPlugin } from './CaptionsPlugin';

class FakeCaptionsRenderer extends Container {
  updateSettings() {}
  resize() {}
}

describe('CaptionsPlugin', () => {
  it('loadLocale returns early when the locale is already loaded', async () => {
    const load = vi.spyOn(Assets, 'load').mockResolvedValue({});
    const plugin = new CaptionsPlugin();
    (plugin as any)._locale = 'en';
    (plugin as any)._dicts = { en: { hello: 'hello' } };
    (plugin as any)._options = { files: [{ id: 'en', json: 'en.json' }] };

    await plugin.loadLocale('en');

    expect(load).not.toHaveBeenCalled();
    load.mockRestore();
  });

  it('loadLocale still loads the current locale when its dictionary is missing', async () => {
    const load = vi.spyOn(Assets, 'load').mockResolvedValue({ a: 1 });
    const plugin = new CaptionsPlugin();
    (plugin as any)._locale = 'en';
    (plugin as any)._options = { files: [{ id: 'en', json: 'en.json' }] };

    await plugin.loadLocale('en');

    expect(load).toHaveBeenCalledWith('en.json');
    load.mockRestore();
  });
});

describe('CaptionsPlugin destroy', () => {
  afterEach(() => {
    for (const key of Object.keys(appMock)) delete appMock[key];
  });

  it('stops handling voiceover signals after destroy', () => {
    appMock.voiceover = {
      onVoiceOverStart: new Signal<(vo: any) => void>(),
      onVoiceOverPaused: new Signal<() => void>(),
      onVoiceOverResumed: new Signal<() => void>(),
      onVoiceOverComplete: new Signal<(vo: any) => void>(),
      onVoiceOverStopped: new Signal<() => void>(),
    };
    appMock.i18n = { onLocaleChanged: new Signal<() => void>() };
    appMock.stage = { addChild: vi.fn() };
    appMock.ticker = { add: vi.fn(), remove: vi.fn() };
    appMock.scenes = { onSceneChangeStart: new Signal<() => void>() };
    appMock.size = { width: 800 };

    const plugin = new CaptionsPlugin();
    (plugin as any)._options = { renderer: FakeCaptionsRenderer };
    (plugin as any)._originalOptions = { maxWidth: 0.8 };
    (plugin as any)._locale = 'en';
    (plugin as any)._dicts = { en: {} };

    const spy = vi.spyOn(plugin as any, '_handleVoiceOverStart');
    plugin.postInitialize(appMock as any);

    appMock.voiceover.onVoiceOverStart.emit({ id: 'x' });
    expect(spy).toHaveBeenCalledTimes(1);

    plugin.destroy();
    appMock.voiceover.onVoiceOverStart.emit({ id: 'x' });

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
