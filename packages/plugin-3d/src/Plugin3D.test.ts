import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  app: { renderer: { name: 'webgpu', lighting3d: {} } },
  factory: {} as Record<string, any>,
}));

vi.mock('@caperjs/core', () => ({
  Plugin: class {
    protected _options: any;
    private disposers: Array<() => void> = [];
    get options() {
      return this._options;
    }
    addDisposer(fn: () => void) {
      this.disposers.push(fn);
    }
    destroy() {
      for (const fn of this.disposers.splice(0)) fn();
    }
  },
  WithSignals: (Base: any) => Base,
  WithLifecycle: (Base: any) => Base,
  bindAllMethods: () => undefined,
  Application: { getInstance: () => h.app },
  isMobile: false,
  registerFactoryMethods: (methods: Record<string, any>) => {
    Object.assign(h.factory, methods);
    return () => {
      for (const name of Object.keys(methods)) delete h.factory[name];
    };
  },
}));

import Plugin3D from './Plugin3D';

beforeEach(() => {
  h.factory = {};
});

describe('Plugin3D', () => {
  it('defaults quality, registers the view factory, and removes it on destroy', () => {
    const plugin = new Plugin3D();
    plugin.initialize({}, h.app as any);
    expect(plugin.options).toEqual({ quality: 'auto' });
    expect(h.factory.view3d).toBeTypeOf('function');
    plugin.destroy();
    expect(h.factory.view3d).toBeUndefined();
  });

  it('merges quality and rejects Canvas after initialization', () => {
    const plugin = new Plugin3D();
    plugin.initialize({ quality: 'low' }, h.app as any);
    expect(plugin.options.quality).toBe('low');
    expect(() => plugin.postInitialize({ renderer: { name: 'canvas' } } as any)).toThrow(/Canvas/);
    plugin.destroy();
  });
});
