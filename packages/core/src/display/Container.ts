import { DestroyOptions, Container as PIXIContainer, Sprite, Texture, Ticker } from 'pixi.js';
import { Animated } from '../mixins/animated';
import { Factory } from '../mixins/factory/Factory';
import { WithLifecycle } from '../mixins/lifecycle';
import { WithSignals } from '../mixins/signals';

import { Signal } from '../signals';
import { SignalOrder } from '../signals/Signal';
import type { AppTypeOverrides, PointLike, Size } from '../utils';
import { bindAllMethods } from '../utils';

/**
 * Configuration for the Container class.
 */
export type ContainerConfig = {
  autoResize: boolean;
  autoUpdate: boolean;
  priority: SignalOrder;
};

export const ContainerConfigKeys: (keyof ContainerConfig)[] = ['autoResize', 'autoUpdate', 'priority'];

const defaultConfig: ContainerConfig = { autoResize: true, autoUpdate: false, priority: 0 };

export type BackgroundConfig = {
  color: number;
  alpha: number;
  width: number;
  height: number;
  anchor: PointLike;
  autoResize: boolean;
};

/**
 * Interface for the Container class.
 */
export interface IContainer {
  app: AppTypeOverrides['App'];

  animationContext: string | undefined;

  onDestroy: Signal<() => void>;

  destroy(options?: DestroyOptions): void;

  added(): Promise<void> | void;

  removed(): Promise<void> | void;

  childAdded(child: PIXIContainer): Promise<void> | void;
  childRemoved(child: PIXIContainer): Promise<void> | void;

  resize(size?: Size): void;

  update(ticker?: Ticker | number): void;

  addColoredBackground(colorOrConfig?: number | Partial<BackgroundConfig>, alpha?: number): Sprite;
}

/**
 * The Container class extends the _Container class (which includes the Animated and Factory mixins) and implements the IContainer interface.
 * It represents a container for PIXI.js display objects.
 */
export class Container extends WithLifecycle(Animated(WithSignals(Factory()))) implements IContainer {
  protected __background: Sprite;

  protected _animationContext: string | undefined;
  public get animationContext(): string | undefined {
    return this._animationContext;
  }
  public set animationContext(value: string) {
    this._animationContext = value;
  }

  public static onGlobalChildAdded = new Signal<(child: PIXIContainer) => void>();
  public static onGlobalChildRemoved = new Signal<(child: PIXIContainer) => void>();

  public static childAdded(child: PIXIContainer) {
    Container.onGlobalChildAdded.emit(child);
  }

  public static childRemoved(child: PIXIContainer) {
    Container.onGlobalChildRemoved.emit(child);
  }

  /**
   * The constructor for the Container class.
   * @param config - The configuration for the container.
   */
  constructor(config: Partial<ContainerConfig> = {}) {
    super();
    const { autoResize, autoUpdate, priority }: ContainerConfig = { ...defaultConfig, ...config };
    // Bind all methods of this class to the current instance.
    bindAllMethods(this);
    // Wire up the shared lifecycle (adds the 'added' / 'removed' listeners).
    this._initLifecycle({ autoResize, autoUpdate, resizePriority: priority });
    this.on('childAdded', this._childAdded);
    this.on('childRemoved', this._childRemoved);
  }

  public addColoredBackground(colorOrConfig: number | Partial<BackgroundConfig> = 0x0, alpha: number = 1): Sprite {
    const defaultConfig = {
      color: 0x0,
      width: this.app.size.width,
      height: this.app.size.height,
      anchor: 0.5,
      alpha: 1,
      autoResize: true,
    };

    const opts: BackgroundConfig = Object.assign(
      defaultConfig,
      typeof colorOrConfig === 'number'
        ? {
            color: colorOrConfig,
            alpha: alpha,
          }
        : colorOrConfig,
    );

    this.__background = this.add.sprite({
      asset: Texture.WHITE,
      width: opts.width,
      height: opts.height,
      anchor: opts.anchor,
      tint: opts.color,
      alpha: opts.alpha,
      resolution: 2,
    });

    this.setChildIndex(this.__background, 0);

    if (opts.autoResize) {
      this.addSignalConnection(this.app.onResize.connect(this.__resizeBackground));
      this.__resizeBackground();
    }

    return this.__background;
  }

  public childAdded(child: PIXIContainer) {
    void child;
  }

  destroy(options?: DestroyOptions): void {
    this.app.animation.killAll(this.animationContext);
    super.destroy(options);
  }

  public childRemoved(child: PIXIContainer) {
    void child;
  }

  protected __resizeBackground() {
    this.__background.width = this.app.size.width;
    this.__background.height = this.app.size.height;
  }

  private _childAdded(child: PIXIContainer) {
    Container.childAdded(child);
    this.childAdded(child);
  }

  private _childRemoved(child: PIXIContainer) {
    Container.childRemoved(child);
    this.childRemoved(child);
  }

  protected addAnimation(
    anim: gsap.core.Tween | gsap.core.Timeline | (gsap.core.Tween | gsap.core.Timeline)[],
    contextId?: string,
  ): gsap.core.Tween | gsap.core.Timeline | (gsap.core.Tween | gsap.core.Timeline)[] {
    return this.app.addAnimation(anim, contextId ?? this.animationContext);
  }
}
