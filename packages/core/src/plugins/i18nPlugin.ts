import { Assets } from 'pixi.js';
import { Signal } from '../signals';
import type { AppTypeOverrides, ImportListItem, ImportListItemModule } from '../utils';
import { getDynamicModuleFromImportListItem, Logger } from '../utils';
import type { IPlugin } from './Plugin';
import { Plugin } from './Plugin';

/**
 * Flattened dot-path keys for the project's reference locale (e.g. 'foo',
 * 'obj.nested'). Generated from `src/locales/<reference>.ts` by the Vite
 * plugin. Falls back to `string` when no locales are discovered.
 *
 * `(string & {})` preserves autocomplete for known keys while still
 * accepting dynamic strings like `t(\`errors.\${code}\`)`.
 */
export type LocaleKey = AppTypeOverrides extends { LocaleKeys: infer K extends string }
  ? K | (string & {})
  : string;

/**
 * Base keys that have plural leaves (i.e. a `<base>.other` entry exists in the
 * reference locale). These are the keys `tCount()` accepts.
 *
 * `(string & {})` preserves autocomplete for known keys while still
 * accepting dynamic strings.
 */
export type PluralLocaleKey = AppTypeOverrides extends { LocaleKeys: infer K extends string }
  ? (K extends `${infer B}.other` ? B : never) | (string & {})
  : string;

/**
 * Type definition for i18n dictionary.
 */
export type i18nDict = Record<string, any>;

/**
 * Type definition for i18n translation parameters.
 */
export type i18nTParams = { variant?: number | 'random' } & Record<string, any>;

/**
 * Type definition for i18n import list item.
 */
type i18nImportListItem<T> = {
  id: string;
  namedExport?: string;
  options?: any;
  module?: ImportListItemModule<T>;
} & {
  json?: string;
};

/**
 * Type definition for i18n options.
 */
export type i18nOptions = {
  defaultLocale: string;
  locales: string[];
  loadAll: boolean;
  files: i18nImportListItem<i18nDict>[];
};

/**
 * Default options for i18n module.
 */
const defaultOptions: i18nOptions = {
  defaultLocale: 'en',
  locales: ['en'],
  loadAll: false,
  files: [],
};

/**
 * Interface for i18n module.
 */
export interface Ii18nPlugin extends IPlugin {
  readonly locale: string;
  readonly locales: string[];
  onLocaleChanged: Signal<(locale: string) => void>;

  setLocale(localeId: string): Promise<string>;

  loadLocale(localeId: string): Promise<void>;

  t(key: LocaleKey, params?: i18nTParams, locale?: string): string;

  tCount(key: PluralLocaleKey, count: number, params?: i18nTParams, locale?: string): string;

  parse(input: string, locale?: string): string;
}

/**
 * Resolves a dot-path (e.g. `'obj.nested.value'`) against a dictionary
 * object. Returns `undefined` if any segment is missing or if a non-object
 * is traversed mid-path.
 */
function resolveLocalePath(dict: i18nDict, key: string): unknown {
  if (key in dict) return dict[key];
  if (!key.includes('.')) return undefined;
  let cur: unknown = dict;
  for (const segment of key.split('.')) {
    if (cur && typeof cur === 'object' && segment in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }
  return cur;
}

/**
 * i18n module class.
 */
export class i18nPlugin extends Plugin<i18nOptions> implements Ii18nPlugin {
  public readonly id = 'i18n';
  public onLocaleChanged: Signal<(locale: string) => void> = new Signal<(locale: string) => void>();

  private _dicts: Record<string, i18nDict> = {};

  private _locale: string;

  /**
   * Getter for locale.
   */
  get locale(): string {
    return this._locale;
  }

  get locales(): string[] {
    return this._options.locales;
  }

  /**
   * Initializes the i18n module.
   * sets the default locale and loads the locale files.
   * @param app The application instance.
   * @param options The i18n options.
   * @returns Promise<void>
   */
  public async initialize(options: Partial<i18nOptions>): Promise<void> {
    this._options = { ...defaultOptions, ...options };
    this._locale = this._options.defaultLocale;
    if (this._options.loadAll && this._options.files.length > 0) {
      const files = this._options.files.filter((file) => this._options.locales.includes(file.id));
      for (const file of files) {
        await this.loadLocale(file.id);
      }
    } else if (this._options.files.length > 0) {
      await this.loadLocale(this._locale);
    }
  }

  /**
   * Sets the locale.
   * If the locale is not loaded, it will load it first.
   * @param localeId The locale id to set.
   * @returns Promise<string>
   */

  async setLocale(localeId: string) {
    this._locale = localeId;
    await this._loadAndSetLocale(localeId);
    return this._locale;
  }

  /**
   * Translates a key into a string.
   * If the key is not found (or no dictionary is loaded), it returns the key itself, so a typo
   * renders visibly on screen instead of blanking the UI.
   * If the key is found, it will replace any placeholders in the string with the values from the params object.
   * Every `[a|b|c]` group in the string is resolved, whether or not params were passed:
   * `variant: 'random'` picks a random item per group, `variant: <number>` picks that index for every
   * group (clamped to the group's last item), and with no variant param index 0 is used. Brackets never
   * survive into the output.
   * @param key The key to translate.
   * @param params The parameters to replace in the string.
   * @param locale The locale to use for translation.
   * @returns The translated string.
   */

  t(key: LocaleKey, params?: i18nTParams, locale: string = this._locale): string {
    const dict = this._dicts[locale];
    if (!dict) {
      Logger.error(`i18n:: No dictionary loaded for current locale: ${locale}`);
      return key as string;
    }
    // Dot-path resolution: `t('obj.nested')` walks the dict tree. Flat keys
    // still work (including keys that literally contain dots, via the
    // short-circuit in resolveLocalePath).
    const resolved = resolveLocalePath(dict, key as string);
    let str = typeof resolved === 'string' ? resolved : undefined;

    if (!str) {
      Logger.error(`i18n:: No result found for the key ${key} in the locale: ${this._locale}`);
      return key as string;
    }

    // Resolve every `[a|b|c]` group, whether or not params were passed, so brackets
    // never leak into the rendered string.
    const variant = params?.variant;
    str = str.replace(/\[(.*?)\]/g, (_match, group: string) => {
      // Split the group by the "|" character to get an array of variations.
      const items = group.split('|');

      if (variant === 'random') {
        return items[Math.floor(Math.random() * items.length)];
      }

      // A number picks that index for every group, clamped to the group's last item.
      const num = typeof variant === 'number' ? Math.min(Math.max(variant, 0), items.length - 1) : 0;
      return items[num];
    });

    if (params) {
      // Iterate over all params to replace placeholders in the string.
      for (const f in params) {
        // Create a regular expression to match the placeholder for the current param.
        const re = new RegExp(`{${f}}`, 'g');

        //Replace all occurences of the placeholder with the value of the param.
        str = str.replace(re, String(params[f]));
      }
    }

    /**
     * Return the final translated string.
     */
    return str;
  }

  /**
   * Translates a key into a string (alias for t)
   * @param key The key to translate.
   * @param params The parameters to replace in the string.
   * @param locale The locale to use for translation.
   * @returns The translated string.
   */
  translate(key: LocaleKey, params?: i18nTParams, locale: string = this._locale): string {
    return this.t(key, params, locale);
  }

  /**
   * Translates a pluralised key using the locale's own plural rules.
   * The CLDR plural category for `count` (`one`, `other`, `few`, ...) is resolved against
   * `<key>.<category>`, falling back to `<key>.other` when that leaf does not exist.
   * `count` is passed through as a param, so `{count}` interpolates and variants still apply.
   * @param key The base key holding the plural leaves.
   * @param count The count used to pick the plural category.
   * @param params Additional parameters to replace in the string.
   * @param locale The locale to use for translation.
   * @returns The translated string.
   */
  tCount(key: PluralLocaleKey, count: number, params?: i18nTParams, locale: string = this._locale): string {
    const category = new Intl.PluralRules(locale).select(count);
    const dict = this._dicts[locale];
    let pluralKey = `${key}.${category}`;
    if (!dict || typeof resolveLocalePath(dict, pluralKey) !== 'string') {
      pluralKey = `${key}.other`;
    }
    return this.t(pluralKey, { count, ...params }, locale);
  }

  /**
   * Parses the input string and replaces anything in between {} braces, assuming it is a key in the dictionary.
   * @param {string} input
   * @param locale
   * @returns {string}
   */
  parse(input: string, locale: string = this._locale): string {
    const dict = this._dicts[locale];
    if (!dict) {
      Logger.error(`i18n:: No dictionary loaded for current locale: ${this._locale}`);
      return '';
    }
    let str = input;
    const matches = str.match(/{(.*?)}/g);
    if (matches) {
      matches.forEach((match) => {
        const key = match.slice(1, -1);
        if (dict[key]) {
          str = str.replace(match, dict[key]);
        }
      });
    }
    return str;
  }

  /**
   * Loads a locale.
   * @param localeId The locale id to load.
   * @returns Promise<void>
   */
  async loadLocale(localeId: string) {
    const file = this._options.files.find((file) => localeId === file.id);
    if (!file) {
      Logger.error(`i18n:: Could not find locale file for ${localeId}`);
      return;
    }
    this._dicts[localeId] = file.json
      ? await Assets.load(file.json)
      : await getDynamicModuleFromImportListItem(file as ImportListItem<i18nDict>);
  }

  protected getCoreFunctions(): string[] {
    return ['t', 'translate', 'tCount', 'setLocale'];
  }

  protected getCoreSignals(): string[] {
    return ['onLocaleChanged'];
  }

  /**
   * Loads and sets a locale.
   * If the locale is not loaded, it will load it first.
   * @param localeId The locale id to load and set.
   */
  private async _loadAndSetLocale(localeId: string) {
    if (!this._dicts[localeId]) {
      await this.loadLocale(localeId);
    }
    this.onLocaleChanged.emit(localeId);
  }
}
