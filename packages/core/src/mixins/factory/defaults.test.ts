import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('factory method registration', () => {
  let defaults: typeof import('./defaults');
  const builtIn = () => ({});

  beforeEach(async () => {
    vi.resetModules();
    defaults = await import('./defaults');
    defaults.setDefaultFactoryMethods({ sprite: builtIn });
  });

  it('merges built-ins and contributions and changes identity only when the table changes', () => {
    const original = defaults.getDefaultFactoryMethods();
    const widget = () => ({} as never);
    const dispose = defaults.registerFactoryMethods({ widget });
    const merged = defaults.getDefaultFactoryMethods();
    expect(merged).toEqual({ sprite: builtIn, widget });
    expect(merged).toBe(defaults.getDefaultFactoryMethods());
    expect(merged).not.toBe(original);
    dispose();
    expect(defaults.getDefaultFactoryMethods()).not.toBe(merged);
    expect(defaults.getDefaultFactoryMethods()).toEqual({ sprite: builtIn });
    dispose();
  });

  it('rejects built-in collisions and different duplicate functions', () => {
    expect(() => defaults.registerFactoryMethods({ sprite: () => ({}) } as never)).toThrow(/"sprite" is a built-in factory method/);
    defaults.registerFactoryMethods({ widget: () => ({} as never) });
    expect(() => defaults.registerFactoryMethods({ widget: () => ({} as never) })).toThrow(/"widget" is already registered/);
  });

  it('treats the same function as a no-op', () => {
    const widget = () => ({} as never);
    const dispose = defaults.registerFactoryMethods({ widget });
    const merged = defaults.getDefaultFactoryMethods();
    const duplicateDispose = defaults.registerFactoryMethods({ widget });
    expect(defaults.getDefaultFactoryMethods()).toBe(merged);
    duplicateDispose();
    expect(defaults.getDefaultFactoryMethods()).toBe(merged);
    dispose();
    expect(defaults.getDefaultFactoryMethods().widget).toBeUndefined();
  });

  it('validates every name before registering anything', () => {
    expect(() => defaults.registerFactoryMethods({ widget: () => ({}), sprite: () => ({}) } as never)).toThrow(/sprite/);
    expect(defaults.getDefaultFactoryMethods().widget).toBeUndefined();
    expect(() => defaults.registerFactoryMethods({ widget: 1 as never })).toThrow(/widget/);
  });

  it('disposes only names added by its own call', () => {
    const widget = () => ({} as never);
    const other = () => ({} as never);
    const first = defaults.registerFactoryMethods({ widget });
    defaults.registerFactoryMethods({ widget, other } as never);
    first();
    expect(defaults.getDefaultFactoryMethods().widget).toBeUndefined();
    expect(defaults.getDefaultFactoryMethods().other).toBe(other);
  });
});

it('rejects registration before built-ins are set', async () => {
  vi.resetModules();
  const defaults = await import('./defaults');
  expect(() => defaults.registerFactoryMethods({ widget: () => ({} as never) })).toThrow(/hasn't been initialized/);
});
