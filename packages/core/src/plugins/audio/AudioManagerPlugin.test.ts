import { sound } from '@pixi/sound';
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

  it('caches a resolved sound id under the original id so probing is not repeated', () => {
    const exists = vi.spyOn(sound, 'exists').mockImplementation((id: string) => id === 'foo.mp3');
    const manager = new AudioManagerPlugin();

    const resolved = (manager as any)._verifySoundId('foo');
    expect(resolved).toBe('foo.mp3');
    expect(((manager as any)._idMap as Map<string, string>).get('foo')).toBe('foo.mp3');

    exists.mockClear();
    expect((manager as any)._verifySoundId('foo')).toBe('foo.mp3');
    expect(exists).not.toHaveBeenCalled();

    exists.mockRestore();
  });
});
