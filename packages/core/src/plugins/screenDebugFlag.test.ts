import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { shouldEnableScreenDebug } from './screenDebugFlag';

describe('shouldEnableScreenDebug', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, '', '/');
    window.localStorage.clear();
  });

  it('enables and persists from the query string', () => {
    window.history.replaceState({}, '', '/?caper-screen-debug=1');
    expect(shouldEnableScreenDebug()).toBe(true);
    expect(window.localStorage.getItem('caper:screen-debug')).toBe('1');
  });

  it('disables and clears persistence from the query string', () => {
    window.localStorage.setItem('caper:screen-debug', '1');
    window.history.replaceState({}, '', '/?caper-screen-debug=0');
    expect(shouldEnableScreenDebug()).toBe(false);
    expect(window.localStorage.getItem('caper:screen-debug')).toBeNull();
  });

  it('enables from a persisted key without a query value', () => {
    window.localStorage.setItem('caper:screen-debug', '1');
    expect(shouldEnableScreenDebug()).toBe(true);
  });

  it('stays disabled without a query value or persisted key', () => {
    expect(shouldEnableScreenDebug()).toBe(false);
  });

  it('falls back to the query value when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('unavailable');
    });
    window.history.replaceState({}, '', '/?caper-screen-debug=true');
    expect(shouldEnableScreenDebug()).toBe(true);
  });
});
