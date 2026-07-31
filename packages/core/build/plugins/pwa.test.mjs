import { describe, expect, it } from 'vitest';
import { caper } from '../index.mjs';
import { defaultPwaOptions, pwaRuntimeSnippet, resolvePwaOptions } from './pwa.mjs';

const names = (options) =>
  caper(options)
    .flat()
    .map((plugin) => plugin.name);

describe('pwa option', () => {
  it('adds no pwa plugins when absent', () => {
    expect(names().some((name) => name.includes('pwa'))).toBe(false);
  });

  it('adds vite-plugin-pwa when set', () => {
    expect(names({ pwa: {} })).toContain('vite-plugin-pwa');
  });

  it('leaves registration to the runtime, not an injected script', () => {
    // Two registration paths would register the worker twice.
    expect(defaultPwaOptions().injectRegister).toBe(false);
  });

  it('keeps the service worker out of dev unless SW_DEV is set', () => {
    const saved = process.env.SW_DEV;
    try {
      delete process.env.SW_DEV;
      expect(defaultPwaOptions().devOptions.enabled).toBe(false);
      process.env.SW_DEV = 'true';
      expect(defaultPwaOptions().devOptions.enabled).toBe(true);
    } finally {
      if (saved === undefined) delete process.env.SW_DEV;
      else process.env.SW_DEV = saved;
    }
  });
});

describe('update option', () => {
  it('prompts by default rather than reloading mid-game', () => {
    expect(defaultPwaOptions().registerType).toBe('prompt');
    expect(resolvePwaOptions({}).options.registerType).toBe('prompt');
  });

  it("maps update: 'auto' to autoUpdate", () => {
    expect(resolvePwaOptions({ update: 'auto' }).options.registerType).toBe('autoUpdate');
  });

  it("treats 'manual' as prompt — it differs only in who draws the UI", () => {
    expect(resolvePwaOptions({ update: 'manual' }).options.registerType).toBe('prompt');
  });

  it('lets an explicit registerType win over update', () => {
    expect(resolvePwaOptions({ update: 'auto', registerType: 'prompt' }).options.registerType).toBe('prompt');
  });

  it('does not leak update into vite-plugin-pwa options', () => {
    expect(resolvePwaOptions({ update: 'auto' }).options.update).toBeUndefined();
  });
});

/**
 * Workbox's RegExpRoute, verbatim: it execs the pattern against `url.href` (not
 * the pathname), and drops cross-origin hits that do not start at character 0.
 * Path-anchored `^\/assets\/…` patterns therefore never fire at all.
 */
const workboxMatches = (urlPattern, href, origin = 'https://example.com') => {
  const url = new URL(href);
  const result = urlPattern.exec(url.href);
  if (!result) return false;
  if (url.origin !== origin && result.index !== 0) return false;
  return true;
};

describe('asset manifest freshness', () => {
  it('never precaches assets.json', () => {
    // A precached manifest points at hashed files an atomic deploy has deleted.
    expect(defaultPwaOptions().workbox.globPatterns).not.toContain('assets/assets.json');
  });

  it('serves assets.json network-first, ahead of the CacheFirst asset rule', () => {
    const [first] = defaultPwaOptions().workbox.runtimeCaching;
    expect(first.handler).toBe('NetworkFirst');
    expect(workboxMatches(first.urlPattern, 'https://example.com/assets/assets.json')).toBe(true);
    expect(first.options.networkTimeoutSeconds).toBeGreaterThan(0);
  });
});

describe('runtime caching patterns', () => {
  const rule = (handler) => defaultPwaOptions().workbox.runtimeCaching.find((entry) => entry.handler === handler);

  it('matches real same-origin asset urls', () => {
    // Regression: these were anchored with `^\/assets\/`, which can never match
    // an href, so nothing was runtime-cached at all.
    const { urlPattern } = rule('CacheFirst');
    expect(workboxMatches(urlPattern, 'https://example.com/assets/audio/sfx/foo-abc123.ogg')).toBe(true);
    expect(workboxMatches(urlPattern, 'https://example.com/assets/required/hero-9f2a.webp')).toBe(true);
    expect(workboxMatches(urlPattern, 'https://example.com/assets/main-abc123.js')).toBe(false);
  });

  it('leaves cross-origin lookalikes to the network', () => {
    expect(workboxMatches(rule('CacheFirst').urlPattern, 'https://cdn.other.com/assets/audio/foo-abc123.ogg')).toBe(
      false,
    );
    expect(workboxMatches(rule('NetworkFirst').urlPattern, 'https://cdn.other.com/assets/assets.json')).toBe(false);
  });
});

describe('pwaRuntimeSnippet', () => {
  it('installs Caper.pwa and registers by default', () => {
    const code = pwaRuntimeSnippet({});
    expect(code).toContain("import { registerSW } from 'virtual:pwa-register'");
    expect(code).toContain('Caper.pwa =');
    expect(code).toContain('Caper.pwa.register();');
  });

  it('skips registration when autoRegister is false', () => {
    const code = pwaRuntimeSnippet({ autoRegister: false });
    expect(code).toContain('Caper.pwa =');
    expect(code).not.toContain('Caper.pwa.register();');
  });

  it('reads handlers off Caper.pwa at call time so apps can assign them late', () => {
    const code = pwaRuntimeSnippet({});
    expect(code).toContain('Caper.pwa.onNeedRefresh?.()');
    expect(code).toContain('Caper.pwa.onRegisterError?.(error)');
  });

  it('exposes applyUpdate backed by the registerSW return value', () => {
    const code = pwaRuntimeSnippet({});
    expect(code).toContain('updateSW = registerSW(');
    expect(code).toContain('applyUpdate()');
    expect(code).toContain('updateSW?.(true)');
    expect(code).toContain('Caper.pwa.updateAvailable = true');
  });

  it('shows the default update banner unless the app opts out', () => {
    expect(pwaRuntimeSnippet({})).toContain('onNeedRefresh: showUpdateBanner');
    expect(pwaRuntimeSnippet({ update: 'prompt' })).toContain('onNeedRefresh: showUpdateBanner');
    // autoUpdate reloads on its own — no banner to offer.
    expect(pwaRuntimeSnippet({ update: 'auto' })).toContain('onNeedRefresh: undefined');
  });

  it("installs no update UI in 'manual' mode — the game draws its own", () => {
    const code = pwaRuntimeSnippet({ update: 'manual' });
    expect(code).toContain('onNeedRefresh: undefined');
    expect(code).not.toContain('onNeedRefresh: showUpdateBanner');
    // updateAvailable still flips, so app.onPwaUpdateAvailable has something to say.
    expect(code).toContain('Caper.pwa.updateAvailable = true');
  });

  it('stashes the install prompt and exposes promptInstall', () => {
    const code = pwaRuntimeSnippet({});
    expect(code).toContain("addEventListener('beforeinstallprompt'");
    expect(code).toContain("addEventListener('appinstalled'");
    expect(code).toContain('async promptInstall()');
    expect(code).toContain('Caper.pwa.onCanInstall?.()');
    expect(code).toContain('Caper.pwa.onInstalled?.()');
  });

  it('does not leak autoRegister into vite-plugin-pwa options', () => {
    // autoRegister is caper's, not the plugin's — passing it through would warn.
    const plugins = caper({ pwa: { autoRegister: false } }).flat();
    expect(plugins.map((p) => p.name)).toContain('vite-plugin-pwa');
  });
});
