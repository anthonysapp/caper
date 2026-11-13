import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ register: vi.fn(() => vi.fn()) }));
vi.mock('@caperjs/core', () => ({
  Plugin: class { disposers: Array<() => void> = []; addDisposer(fn: () => void) { this.disposers.push(fn); } },
}));
vi.mock('@caperjs/plugin-3d', () => ({ registerFactory3DMethods: h.register }));

import PluginKlipp from './PluginKlipp';

describe('PluginKlipp', () => {
  it('registers one stable factory function and retains its disposer', () => {
    const plugin = new PluginKlipp() as PluginKlipp & { disposers: Array<() => void> };
    plugin.initialize();
    plugin.initialize();
    expect(h.register).toHaveBeenCalledTimes(2);
    expect(h.register.mock.calls[0][0].cameraRig).toBe(h.register.mock.calls[1][0].cameraRig);
    expect(plugin.disposers).toHaveLength(2);
    expect(plugin.disposers[0]).toBeTypeOf('function');
  });
});
