import { Camera3D, View3D as PixiView3D } from '@pixi/3d';
import type { View3DOptions } from '@pixi/3d';
import { Application, bindAllMethods, isMobile, WithLifecycle, WithSignals } from '@caperjs/core';
import type { Size } from '@caperjs/core';
import type { Ticker } from 'pixi.js';
import { fitFov } from './fit';
import { createFactory3D } from './factory3d';
import type { Factory3D } from './factory3d';
import { Owned3D, ownedByView } from './owned';
import type { Vec3 } from './props';
import { toVec3 } from './props';
import type { IPlugin3D } from './Plugin3D';
import { resolveQuality } from './quality';
import { assertRenderer3D } from './renderer';

type CameraProps = {
  position?: Vec3;
  lookAt?: Vec3;
  /** Vertical field of view in degrees. */
  fov?: number;
  near?: number;
  far?: number;
  /**
   * The aspect ratio (width / height) the scene is framed for, e.g. `16 / 9`. On a narrower view (a phone
   * held upright) the field of view grows so the sides stay in frame. Leave it out to keep `fov` fixed.
   */
  fitAspect?: number;
};

export interface View3DProps extends Omit<View3DOptions, 'camera'> {
  camera?: Camera3D | CameraProps;
  interactive?: boolean;
}

/** Something an add-on attaches to a view. The view drives it; games never call these. */
export interface View3DPart {
  /** Every frame the view updates (on app.ticker), after model clips. */
  update?(ticker: Ticker): void;
  /** Once when owned with the current size, then on every view resize. */
  resize?(size: Size): void;
  /** Before the view frees its nodes and resources, while the view is still usable. */
  destroy(): void;
}

export class View3D extends WithLifecycle(WithSignals(PixiView3D)) {
  readonly add: Factory3D;
  readonly make: Factory3D;
  private readonly owned = new Owned3D();
  private readonly parts = new Set<View3DPart>();
  private readonly fillsScreen: boolean;
  private readonly fit?: { fov: number; aspect: number };

  constructor(props: View3DProps = {}) {
    const app = Application.getInstance();
    assertRenderer3D(app.renderer);
    const plugin = app.getPlugin<IPlugin3D>('3d');
    const { camera, interactive = true, ...viewProps } = props;
    const fillsScreen = props.width === undefined && props.height === undefined;
    const quality = resolveQuality(plugin?.options.quality ?? 'auto', {
      isMobile,
      resolution: app.renderer.resolution,
    });
    super({
      ...quality,
      environment: { skyColor: 0xbcd4f0, groundColor: 0x6b6250, intensity: 0.7 },
      autoResize: fillsScreen,
      // 'static' picks 3D and takes taps over the whole view; 'none' lets them reach 2D behind it.
      // Never 'passive': it turns picking off and still blocks.
      eventMode: interactive ? 'static' : 'none',
      ...viewProps,
      ...(camera instanceof Camera3D ? { camera } : {}),
    });
    this.fillsScreen = fillsScreen;
    ownedByView.set(this, this.owned);
    bindAllMethods(this);
    this._initLifecycle({ autoResize: true, autoUpdate: true });
    if (!(camera instanceof Camera3D)) {
      this.camera.position = toVec3(camera?.position ?? [0, 1.5, 4]);
      this.camera.lookAt(toVec3(camera?.lookAt ?? [0, 0, 0]));
      if (camera?.fov !== undefined) this.camera.fov = camera.fov;
      if (camera?.near !== undefined) this.camera.near = camera.near;
      if (camera?.far !== undefined) this.camera.far = camera.far;
      if (camera?.fitAspect) this.fit = { fov: this.camera.fov, aspect: camera.fitAspect };
    }
    this.add = createFactory3D(this.root, this.owned, true, this);
    this.make = createFactory3D(this.root, this.owned, false, this);
    this.fitCamera();
  }

  /** For add-ons: the view updates `part` every frame, tells it about resizes, and destroys it with itself. */
  own<T extends View3DPart>(part: T): T {
    this.parts.add(part);
    part.resize?.(this.viewSize);
    return part;
  }

  added(): void {
    this.resize();
  }

  resize(_size?: Size): void {
    this.placeFullScreen();
    this.fitCamera();
    for (const part of this.parts) part.resize?.(this.viewSize);
  }

  update(_ticker?: Ticker | number): void {
    this.owned.update(this.app.ticker);
    for (const part of this.parts) part.update?.(this.app.ticker);
  }

  destroy(_options?: Parameters<PixiView3D['destroy']>[0] | boolean): void {
    for (const part of this.parts) part.destroy();
    this.parts.clear();
    // glTF sources share materials; destroying them crashes the next visit.
    super.destroy({ children: true });
    this.owned.destroy();
  }

  private fitCamera(): void {
    if (!this.fit) return;
    const { width, height } = this.viewSize;
    this.camera.fov = fitFov(this.fit.fov, width / height, this.fit.aspect);
  }

  private get viewSize(): Size {
    const size = this.fillsScreen ? this.app.size : this;
    return { width: size.width, height: size.height };
  }

  private placeFullScreen(): void {
    if (this.fillsScreen) this.position.set(-this.app.size.width / 2, -this.app.size.height / 2);
  }
}
