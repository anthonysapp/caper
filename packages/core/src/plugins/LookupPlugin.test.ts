import { describe, expect, it, vi } from 'vitest';

// LookupPlugin -> Plugin.ts transitively imports Application → Pixi display graph. Stub it.
vi.mock('../core', () => ({
  coreFunctionRegistry: {} as Record<string, unknown>,
  coreSignalRegistry: {} as Record<string, unknown>,
}));
vi.mock('../core/Application', () => ({
  Application: { getInstance: () => ({}) },
}));

import { coreFunctionRegistry } from '../core';
import { LookupPlugin } from './LookupPlugin';

describe('LookupPlugin', () => {
  it('registers getChildAtPath (and its siblings) in the core function registry', () => {
    const plugin = new LookupPlugin();
    plugin.registerCoreFunctions();

    expect((coreFunctionRegistry as Record<string, unknown>).getChildAtPath).toBe(plugin.getChildAtPath);
  });
});
