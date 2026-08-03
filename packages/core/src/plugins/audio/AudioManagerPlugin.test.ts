import { describe, expect, it, vi } from 'vitest';

// AudioManagerPlugin -> Plugin.ts transitively imports Application → Pixi display graph. Stub it.
vi.mock('../../core', () => ({
  coreFunctionRegistry: {},
  coreSignalRegistry: {},
}));
vi.mock('../../core/Application', () => ({
  Application: { getInstance: () => ({}) },
}));

import { AudioManagerPlugin } from './AudioManagerPlugin';

describe('AudioManagerPlugin', () => {
  it('destroy() disconnects onChannelMuted along with the other signals', () => {
    const manager = new AudioManagerPlugin();
    const handler = vi.fn();
    manager.onChannelMuted.connect(handler);

    manager.destroy();

    manager.onChannelMuted.emit({ channel: {} as never, muted: true });
    expect(handler).not.toHaveBeenCalled();
  });
});
