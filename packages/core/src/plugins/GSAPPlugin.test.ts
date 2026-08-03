import { describe, expect, it, vi } from 'vitest';

// GSAPPlugin.ts extends Plugin.ts, which transitively imports Application → Pixi display graph. Stub it.
vi.mock('../core', () => ({
  coreFunctionRegistry: {},
  coreSignalRegistry: {},
}));
vi.mock('../core/Application', () => ({
  Application: { getInstance: () => ({}) },
}));

import { GSAPPlugin } from './GSAPPlugin';

class TestGSAPPlugin extends GSAPPlugin {
  public createGlobalContextPublic(): void {
    this.createGlobalContext();
  }
}

describe('GSAPPlugin', () => {
  it('clearGlobal() does not throw and empties the global context', () => {
    const plugin = new TestGSAPPlugin();
    plugin.createGlobalContextPublic();

    plugin.addAnimation({} as never);
    expect(plugin.getContext('__caper_global')?.size).toBe(1);

    expect(() => plugin.clearGlobal()).not.toThrow();
    expect(plugin.getContext('__caper_global')?.size).toBe(0);
  });
});
