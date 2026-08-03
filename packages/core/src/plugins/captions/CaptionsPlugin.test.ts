import { Assets } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';

// CaptionsPlugin -> Plugin.ts transitively imports Application → Pixi display graph. Stub it.
vi.mock('../../core', () => ({
  coreFunctionRegistry: {},
  coreSignalRegistry: {},
}));
vi.mock('../../core/Application', () => ({
  Application: { getInstance: () => ({}) },
}));

import { CaptionsPlugin } from './CaptionsPlugin';

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
