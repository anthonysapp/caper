import { describe, expect, it } from 'vitest';
import { caper } from '../index.mjs';
import { defaultPwaOptions, pwaRuntimeSnippet } from './pwa.mjs';

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

  it('does not leak autoRegister into vite-plugin-pwa options', () => {
    // autoRegister is caper's, not the plugin's — passing it through would warn.
    const plugins = caper({ pwa: { autoRegister: false } }).flat();
    expect(plugins.map((p) => p.name)).toContain('vite-plugin-pwa');
  });
});
