import { Logger } from '../../utils';
import { IAudioInstance } from './AudioInstance';
import { ChannelName, IAudioManagerPlugin } from './AudioManagerPlugin';

export interface IAudioChannel {
  name: string;
  muted: boolean;
  volume: number;
  instances: IAudioInstance[];

  add(id: string, instance: IAudioInstance): IAudioInstance;

  get(id: string): IAudioInstance | undefined;

  remove(id: string): IAudioInstance | undefined;

  removeInstance(instance: IAudioInstance): void;

  updateVolume(): void;

  restore(): void;

  destroy(): void;

  pause(): void;

  resume(): void;
}

export class AudioChannel<C extends ChannelName = ChannelName> {
  private _sounds: Map<string, IAudioInstance[]> = new Map<string, IAudioInstance[]>();

  constructor(
    public name: C,
    public manager: IAudioManagerPlugin<C>,
  ) {
    this.muted = this.manager.muted;
  }

  get instances(): IAudioInstance[] {
    return Array.from(this._sounds.values()).flat();
  }

  private _muted: boolean = false;

  get muted(): boolean {
    return this._muted;
  }

  set muted(value: boolean) {
    this._muted = value;
    this.manager.onChannelMuted.emit({ channel: this, muted: value });
    this._setMuted();
  }

  private _volume: number = 1.0;

  get volume(): number {
    return this._volume;
  }

  set volume(value: number) {
    this._volume = value;
    this.updateVolume();
  }

  add(id: string, instance: IAudioInstance): IAudioInstance {
    const bucket = this._sounds.get(id);
    if (bucket) {
      bucket.push(instance);
    } else {
      this._sounds.set(id, [instance]);
    }
    return instance;
  }

  get(id: string): IAudioInstance | undefined {
    const bucket = this._sounds.get(id);
    return bucket ? bucket[bucket.length - 1] : undefined;
  }

  remove(id: string): IAudioInstance | undefined {
    const bucket = this._sounds.get(id);
    if (!bucket) {
      return undefined;
    }
    const lastInstance = bucket[bucket.length - 1];
    // destroy() -> stop() -> emits onEnd, whose handler may call
    // removeInstance() and mutate `bucket` mid-iteration. Iterate a copy.
    [...bucket].forEach((instance) => instance.destroy());
    this._sounds.delete(id);
    return lastInstance;
  }

  /**
   * Removes a single instance from its alias bucket without stopping or
   * destroying it, for use when an instance has naturally reached the end
   * of its life. No-op if the instance is not currently tracked.
   */
  removeInstance(instance: IAudioInstance): void {
    const bucket = this._sounds.get(instance.id);
    if (!bucket) {
      return;
    }
    const index = bucket.indexOf(instance);
    if (index === -1) {
      return;
    }
    bucket.splice(index, 1);
    if (bucket.length === 0) {
      this._sounds.delete(instance.id);
    }
  }

  pause(): void {
    this._sounds.forEach((bucket) => {
      bucket.forEach((sound) => {
        try {
          sound.pause();
        } catch (error) {
          Logger.error('Error pausing sound', sound.id, error);
        }
      });
    });
  }

  resume(): void {
    this._sounds.forEach((bucket) => {
      bucket.forEach((sound) => {
        try {
          sound.resume();
        } catch (error) {
          Logger.error('Error resuming sound', sound.id, error);
        }
      });
    });
  }

  _setMuted(): void {
    this._sounds.forEach((bucket) => {
      bucket.forEach((sound) => {
        sound.muted = this._muted;
      });
    });
  }

  updateVolume() {
    this.manager.app.ticker.addOnce(() => {
      this._sounds.forEach((bucket) => {
        bucket.forEach((sound) => {
          sound.updateVolume();
        });
      });
      this.manager.onChannelVolumeChanged.emit({ channel: this, volume: this._volume });
    });
  }

  restore() {
    this.muted = this._muted;
    this.volume = this._volume;
  }

  destroy() {
    this._sounds.forEach((bucket) => {
      // destroy() -> stop() -> emits onEnd, whose handler may call
      // removeInstance() and mutate `bucket` mid-iteration. Iterate a copy.
      [...bucket].forEach((instance) => instance.destroy());
    });
    this._sounds.clear();
  }
}
