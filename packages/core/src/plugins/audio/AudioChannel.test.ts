import { describe, expect, it, vi } from 'vitest';
import { AudioChannel } from './AudioChannel';
import { AudioInstance } from './AudioInstance';
import { IAudioManagerPlugin } from './AudioManagerPlugin';

function createManager(overrides: Record<string, unknown> = {}) {
  return {
    muted: false,
    masterVolume: 1,
    onChannelMuted: { emit: vi.fn() },
    onChannelVolumeChanged: { emit: vi.fn() },
    app: { ticker: { addOnce: (fn: () => void) => fn() } },
    ...overrides,
  } as unknown as IAudioManagerPlugin;
}

function createMedia() {
  return {
    volume: 1,
    muted: false,
    paused: false,
    on: vi.fn(),
    off: vi.fn(),
    play: vi.fn(),
    stop: vi.fn(),
  };
}

describe('AudioChannel', () => {
  it('mutes every concurrent instance of the same alias', () => {
    const manager = createManager();
    const channel = new AudioChannel('sfx', manager);

    const instance1 = channel.add('boom', new AudioInstance('boom', channel, manager));
    const media1 = createMedia();
    instance1.media = media1 as never;

    const instance2 = channel.add('boom', new AudioInstance('boom', channel, manager));
    const media2 = createMedia();
    instance2.media = media2 as never;

    channel.muted = true;

    expect(media1.muted).toBe(true);
    expect(media2.muted).toBe(true);
  });

  it('removeInstance drops just that instance; removing an unknown instance/id is a no-op', () => {
    const manager = createManager();
    const channel = new AudioChannel('sfx', manager);

    const instance1 = channel.add('boom', new AudioInstance('boom', channel, manager));
    const instance2 = channel.add('boom', new AudioInstance('boom', channel, manager));

    channel.removeInstance(instance1);
    expect(channel.instances).toEqual([instance2]);

    const untracked = new AudioInstance('boom', channel, manager);
    expect(() => channel.removeInstance(untracked)).not.toThrow();
    expect(channel.instances).toEqual([instance2]);

    expect(channel.remove('does-not-exist')).toBeUndefined();
    expect(channel.instances).toEqual([instance2]);
  });

  it('folds channel mute into effective volume and restores it on unmute', () => {
    const manager = createManager();
    const channel = new AudioChannel('sfx', manager);
    channel.volume = 0.5;

    const instance = channel.add('boom', new AudioInstance('boom', channel, manager));
    const media = createMedia();
    instance.media = media as never;

    channel.muted = true;
    instance.volume = 0.8;
    expect(media.volume).toBe(0);

    channel.muted = false;
    expect(media.volume).toBeCloseTo(0.8 * 0.5 * 1);
  });

  it('remove(id) stops all instances tracked under that alias', () => {
    const manager = createManager();
    const channel = new AudioChannel('sfx', manager);

    const instance1 = channel.add('boom', new AudioInstance('boom', channel, manager));
    const media1 = createMedia();
    instance1.media = media1 as never;

    const instance2 = channel.add('boom', new AudioInstance('boom', channel, manager));
    const media2 = createMedia();
    instance2.media = media2 as never;

    channel.remove('boom');

    expect(media1.stop).toHaveBeenCalled();
    expect(media2.stop).toHaveBeenCalled();
    expect(channel.instances).toEqual([]);
  });
});
