import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('isTauri', () => {
  beforeEach(() => {
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    vi.resetModules();
  });

  it('is false in the default test env', async () => {
    const { isTauri } = await import('./platform');
    expect(isTauri).toBe(false);
  });

  it('is true when window.__TAURI_INTERNALS__ is defined before a fresh import', async () => {
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    vi.resetModules();
    const { isTauri } = await import('./platform');
    expect(isTauri).toBe(true);
  });
});
