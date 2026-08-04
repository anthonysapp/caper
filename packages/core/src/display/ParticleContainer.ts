import { DestroyOptions, ParticleContainerOptions, ParticleContainer as PIXIParticleContainer, Ticker } from 'pixi.js';

import { WithLifecycle } from '../mixins/lifecycle';
import { WithSignals } from '../mixins/signals';
import { Signal } from '../signals';
import type { AppTypeOverrides, Size } from '../utils';
import { bindAllMethods } from '../utils';

/**
 * Configuration for the ParticleContainer class.
 */
export interface ParticleContainerConfig extends ParticleContainerOptions {
  autoResize: boolean;
  autoUpdate: boolean;
  priority: number;
}

export const ParticleContainerConfigKeys: (keyof ParticleContainerConfig)[] = ['autoResize', 'autoUpdate', 'priority'];

const defaultConfig: ParticleContainerConfig = { autoResize: true, autoUpdate: true, priority: 0 };

export interface IParticleContainer {
  app: AppTypeOverrides['App'];

  onDestroy: Signal<() => void>;

  destroy(options?: DestroyOptions): void;

  added(): Promise<void> | void;

  removed(): Promise<void> | void;

  resize(size?: Size): void;

  update(ticker?: Ticker | number): void;
}

/**
 * The ParticleContainer class extends PIXI's ParticleContainer with Caper's
 * shared lifecycle (the `added` / `removed` / `resize` / `update` hooks and
 * their auto-connections) and signal-connection tracking. It does not get the
 * Factory mixin — a particle container holds particles, not display children.
 */
export class ParticleContainer extends WithLifecycle(WithSignals(PIXIParticleContainer)) implements IParticleContainer {
  /**
   * The constructor for the ParticleContainer class.
   * @param config - The configuration for the container.
   */
  constructor(config: Partial<ParticleContainerConfig> = {}) {
    super(config);
    const { autoResize, autoUpdate, priority }: ParticleContainerConfig = { ...defaultConfig, ...config };
    // Bind all methods of this class to the current instance.
    bindAllMethods(this);
    // Wire up the shared lifecycle (adds the 'added' / 'removed' listeners).
    this._initLifecycle({ autoResize, autoUpdate, resizePriority: priority, updatePriority: priority });
  }
}
