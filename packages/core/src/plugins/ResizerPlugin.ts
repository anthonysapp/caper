import { Graphics } from 'pixi.js';

import { Container } from '../display/Container';
import type { Size } from '../utils';
import type { IPlugin } from './Plugin';
import { Plugin } from './Plugin';

/**
 * Interface for Resizer module.
 */
export interface IResizerPlugin extends IPlugin {
  readonly size: Size;
  readonly scale: number;
  /** Device safe-area insets, in logical render units (already scaled like `size`). */
  readonly safeArea: { top: number; right: number; bottom: number; left: number };
  resize(): Promise<Size>;
}

/**
 * Configuration options for the Resizer plugin
 */
export type ResizerPluginOptions = {
  /** Whether to scroll the window to the top when resizing */
  autoScroll: boolean;
  /** The minimum width at which the renderer will resize. Also controls aspect ratio in letterbox mode */
  minWidth: number;
  /** The minimum height of the canvas. Also controls aspect ratio in letterbox mode */
  minHeight: number;
  /** Whether to letterbox the canvas to maintain aspect ratio */
  letterbox: boolean;
  /** Whether to center the canvas (particularly useful in letterbox mode) */
  center: boolean;
  /** Whether to draw debug information for visualizing canvas bounds */
  debug: boolean;
  /** Whether to measure the device safe-area insets (notch / status bar / gesture bar) */
  useSafeArea: boolean;
};

/**
 * Default options for Resizer module.
 */
const defaultOptions: ResizerPluginOptions = {
  autoScroll: false,
  minWidth: 0,
  minHeight: 0,
  letterbox: false,
  center: false,
  debug: false,
  useSafeArea: true,
};

export class ResizerPlugin extends Plugin<ResizerPluginOptions> implements IResizerPlugin {
  public readonly id = 'resizer';
  private _debugContainer: Container;
  private _gfx: Graphics;
  private _size: Size;
  private _scale: number;
  private _resizeId: number | null;
  private _safeArea = { top: 0, right: 0, bottom: 0, left: 0 };
  private _safeAreaProbe: HTMLDivElement | null = null;

  get size(): Size {
    return this._size;
  }

  get scale(): number {
    return this._scale;
  }

  get safeArea(): { top: number; right: number; bottom: number; left: number } {
    return this._safeArea;
  }

  /**
   * Initializes the Resizer module.
   */
  async initialize(options: Partial<ResizerPluginOptions>) {
    this._options = { ...defaultOptions, ...options };
  }

  /**
   * Post-initialization of the Resizer module.
   * when this is called, the renderer is already created, and the dom element has been appended
   */
  async postInitialize() {
    this.resize();
  }

  public destroy(): void {
    if (this._safeAreaProbe) {
      this._safeAreaProbe.remove();
      this._safeAreaProbe = null;
    }
    super.destroy();
  }

  /**
   * Measures the device safe-area insets in CSS pixels, via a hidden probe element
   * padded with `env(safe-area-inset-*)`. The probe is created once and reused.
   * Browsers without env() support (and happy-dom) report empty strings, which fall back to 0.
   */
  _measureSafeAreaCssPx(): { top: number; right: number; bottom: number; left: number } {
    if (!this._safeAreaProbe) {
      const probe = document.createElement('div');
      probe.style.cssText =
        'position:fixed; top:0; left:0; width:0; height:0; visibility:hidden; pointer-events:none;' +
        'padding-top:env(safe-area-inset-top, 0px); padding-right:env(safe-area-inset-right, 0px);' +
        'padding-bottom:env(safe-area-inset-bottom, 0px); padding-left:env(safe-area-inset-left, 0px);';
      document.body.appendChild(probe);
      this._safeAreaProbe = probe;
    }

    const style = getComputedStyle(this._safeAreaProbe);
    return {
      top: parseFloat(style.paddingTop) || 0,
      right: parseFloat(style.paddingRight) || 0,
      bottom: parseFloat(style.paddingBottom) || 0,
      left: parseFloat(style.paddingLeft) || 0,
    };
  }

  async resize(): Promise<Size> {
    this._cancelResize!();
    return new Promise((resolve) => {
      this._resizeId = requestAnimationFrame(() => {
        this._resize();
        resolve(this._size);
      });
    });
  }

  _cancelResize = (): void => {
    if (this._resizeId) {
      cancelAnimationFrame(this._resizeId);
      this._resizeId = null;
    }
  };

  _resizeInternal(w: number, h: number, minWidth: number, minHeight: number, letterbox: boolean) {
    const aspectRatio = minWidth / minHeight;
    let canvasWidth = w;
    let canvasHeight = h;

    if (letterbox) {
      if (minWidth < minHeight) {
        canvasWidth = canvasHeight * aspectRatio;
      } else {
        canvasHeight = canvasWidth / aspectRatio;
      }
    }

    const scaleX = canvasWidth < minWidth ? minWidth / canvasWidth : 1;
    const scaleY = canvasHeight < minHeight ? minHeight / canvasHeight : 1;
    const scale = scaleX > scaleY ? scaleX : scaleY;
    const width = Math.floor(canvasWidth * scale);
    const height = Math.floor(canvasHeight * scale);

    return { width, height, aspectRatio };
  }
  /**
   * Resizes the application based on window size and module options.
   */

  _resize() {
    const minWidth = this._options.minWidth;
    const minHeight = this._options.minHeight;
    const letterbox = this._options.letterbox;
    const center = this._options.center;

    let canvasWidth = minWidth;
    let canvasHeight = minHeight;

    if (this.app.config.resizeToContainer) {
      const canvas = this.app.renderer.canvas;
      const el = canvas?.parentElement;
      const bounds = el?.getBoundingClientRect();
      if (bounds) {
        canvasWidth = bounds.width;
        canvasHeight = bounds.height;
      }
    }

    const { width, height, aspectRatio } = this._resizeInternal(
      canvasWidth,
      canvasHeight,
      minWidth,
      minHeight,
      letterbox,
    );

    // Calculate renderer and canvas sizes based on current dimensions
    const scaleX = canvasWidth < minWidth ? minWidth / canvasWidth : 1;
    const scaleY = canvasHeight < minHeight ? minHeight / canvasHeight : 1;
    const scale = scaleX > scaleY ? scaleX : scaleY;

    this._scale = scale;

    // Safe-area insets are measured in CSS pixels; the renderer's logical size is
    // CSS pixels * scale, so the insets have to be scaled the same way.
    if (this._options.useSafeArea) {
      const insets = this._measureSafeAreaCssPx();
      this._safeArea = {
        top: insets.top * scale,
        right: insets.right * scale,
        bottom: insets.bottom * scale,
        left: insets.left * scale,
      };
    } else {
      this._safeArea = { top: 0, right: 0, bottom: 0, left: 0 };
    }

    // Update canvas style dimensions and scroll window up to avoid issues on mobile resize
    if (letterbox) {
      if (canvasWidth > canvasHeight) {
        // Calculate dimensions based on width
        let styleWidth = canvasWidth;
        let styleHeight = canvasWidth / aspectRatio;

        // Constrain height if it exceeds container
        if (styleHeight > canvasHeight) {
          styleHeight = canvasHeight;
          styleWidth = styleHeight * aspectRatio;
        }

        this.app.renderer.canvas.style.width = `${styleWidth}px`;
        this.app.renderer.canvas.style.height = `${styleHeight}px`;
      } else {
        // Calculate dimensions based on height
        let styleHeight = canvasHeight;
        let styleWidth = canvasHeight * aspectRatio;

        // Constrain width if it exceeds container
        if (styleWidth > canvasWidth) {
          styleWidth = canvasWidth;
          styleHeight = styleWidth / aspectRatio;
        }

        this.app.renderer.canvas.style.height = `${styleHeight}px`;
        this.app.renderer.canvas.style.width = `${styleWidth}px`;
      }
      if (center) {
        this.app.renderer.canvas.style.position = 'absolute';
        this.app.renderer.canvas.style.left = '50%';
        this.app.renderer.canvas.style.top = '50%';
        this.app.renderer.canvas.style.transform = `translate3d(-50%, -50%, 0)`;
      }
    } else {
      this.app.renderer.canvas.style.width = `${canvasWidth}px`;
      this.app.renderer.canvas.style.height = `${canvasHeight}px`;
    }

    if (this._options.autoScroll) {
      window?.scrollTo(0, 0);
    }

    // Update renderer and navigation screens dimensions
    this.app.renderer.resize(width, height);
    this._size = { width, height };

    if (this._options.debug) {
      this._drawDebug();
    }
  }

  /**
   * Draws debug information if debug option is enabled.
   */
  private _drawDebug() {
    if (!this._debugContainer) {
      this._debugContainer = this.app.stage.addChild(new Container());
      this._gfx = this._debugContainer.add.graphics();
    }

    this._gfx.clear();
    this._gfx.rect(0, 0, this._size.width, this._size.height);
    this._gfx.stroke({ width: 4, color: 0x000fff });
  }
}
