import { afterEach, describe, expect, it, vi } from 'vitest';

// Plugin.ts transitively imports Application → Pixi display graph. Stub it.
vi.mock('../core', () => ({
  coreFunctionRegistry: {},
  coreSignalRegistry: {},
}));
vi.mock('../core/Application', () => ({
  Application: { getInstance: () => ({}) },
}));

import { Logger } from '../utils';
import type { i18nDict } from './i18nPlugin';
import { i18nPlugin } from './i18nPlugin';

/** Build an initialized plugin holding `dict` for the `en` locale. */
async function setup(dict: i18nDict) {
  const plugin = new i18nPlugin();
  await plugin.initialize({ defaultLocale: 'en', locales: ['en'] });
  // `_dicts` is private and normally filled by loadLocale(); inject directly.
  (plugin as unknown as { _dicts: Record<string, i18nDict> })._dicts = { en: dict };
  return plugin;
}

/** Silence the expected Logger.error calls for missing keys. */
function muteErrors() {
  return vi.spyOn(Logger, 'error').mockImplementation(() => undefined);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('i18nPlugin.t', () => {
  it('returns the key itself when the key is missing', async () => {
    const error = muteErrors();
    const plugin = await setup({ hello: 'Hello' });
    expect(plugin.t('nope.missing')).toBe('nope.missing');
    expect(error).toHaveBeenCalled();
  });

  it('returns the key itself when no dictionary is loaded', async () => {
    const error = muteErrors();
    const plugin = await setup({ hello: 'Hello' });
    expect(plugin.t('hello', undefined, 'fr')).toBe('hello');
    expect(error).toHaveBeenCalled();
  });

  it('resolves variants to index 0 with no params', async () => {
    const plugin = await setup({ greet: '[Hi|Hello|Yo] there' });
    expect(plugin.t('greet')).toBe('Hi there');
  });

  it('never leaves brackets in the output', async () => {
    const plugin = await setup({ greet: '[Hi|Hello] [friend|pal]' });
    expect(plugin.t('greet')).not.toMatch(/[[\]]/);
    expect(plugin.t('greet', { variant: 'random' })).not.toMatch(/[[\]]/);
  });

  it('applies a numeric variant to every group', async () => {
    const plugin = await setup({ greet: '[Hi|Hello] [friend|pal]' });
    expect(plugin.t('greet', { variant: 1 })).toBe('Hello pal');
  });

  it('clamps a numeric variant to each group last item', async () => {
    const plugin = await setup({ greet: '[Hi|Hello|Yo] [friend|pal]' });
    expect(plugin.t('greet', { variant: 5 })).toBe('Yo pal');
  });

  it('picks each random variant independently', async () => {
    const plugin = await setup({ greet: '[a|b] [a|b]' });
    const random = vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.9);
    expect(plugin.t('greet', { variant: 'random' })).toBe('a b');
    expect(random).toHaveBeenCalledTimes(2);
  });

  it('interpolates placeholders after variant resolution', async () => {
    const plugin = await setup({ greet: '[Hi|Hello] {name}' });
    expect(plugin.t('greet', { variant: 1, name: 'Ada' })).toBe('Hello Ada');
  });
});

describe('i18nPlugin.tCount', () => {
  const dict: i18nDict = {
    apples: {
      one: '{count} apple',
      other: '{count} apples',
    },
    fish: {
      other: '{count} fish',
    },
    guests: {
      one: '[Just one|One] guest, {host}',
      other: '{count} guests, {host}',
    },
  };

  it('resolves the one category for en', async () => {
    const plugin = await setup(dict);
    expect(plugin.tCount('apples', 1)).toBe('1 apple');
  });

  it('resolves the other category for en', async () => {
    const plugin = await setup(dict);
    expect(plugin.tCount('apples', 2)).toBe('2 apples');
  });

  it('falls back to .other when the category leaf is missing', async () => {
    const plugin = await setup(dict);
    expect(plugin.tCount('fish', 1)).toBe('1 fish');
  });

  it('passes extra params through and still resolves variants', async () => {
    const plugin = await setup(dict);
    expect(plugin.tCount('guests', 1, { host: 'Ada' })).toBe('Just one guest, Ada');
    expect(plugin.tCount('guests', 3, { host: 'Ada' })).toBe('3 guests, Ada');
  });

  it('returns the .other key when nothing resolves', async () => {
    muteErrors();
    const plugin = await setup(dict);
    expect(plugin.tCount('pears', 2)).toBe('pears.other');
  });
});
