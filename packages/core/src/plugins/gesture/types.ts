/** The shape of the `gesture:` key in `caper.config.ts`, and the plugin's resolved options. */
export interface GesturePluginOptions {
  /** @default true */
  enabled?: boolean;
  /** @default ['touch'] */
  pointerTypes?: string[];
  /** Pixels of spread change to cross before a pending gesture goes active. @default 8 */
  pinchThreshold?: number;
  /** Pixels of centroid movement to cross before a pending gesture goes active. @default 8 */
  panThreshold?: number;
  /** Also sets `canvas.style.touchAction = 'none'` while enabled. @default true */
  preventDefault?: boolean;
}

export const defaultGestureOptions: Required<GesturePluginOptions> = {
  enabled: true,
  pointerTypes: ['touch'],
  pinchThreshold: 8,
  panThreshold: 8,
  preventDefault: true,
};

export interface GestureStartDetail {
  /** Client CSS pixels. */
  centerX: number;
  /** Client CSS pixels. */
  centerY: number;
  pointerCount: number;
}

export interface GestureChangeDetail {
  /** Client CSS pixels. */
  centerX: number;
  /** Client CSS pixels. */
  centerY: number;
  /** Client-pixel delta since the previous frame. */
  dx: number;
  /** Client-pixel delta since the previous frame. */
  dy: number;
  /** Spread ratio since the previous frame. */
  scale: number;
  /** Spread ratio since the gesture started. */
  totalScale: number;
  pointerCount: number;
}

export interface GestureEndDetail {
  /** Client CSS pixels. */
  centerX: number;
  /** Client CSS pixels. */
  centerY: number;
  /** Spread ratio since the gesture started. */
  totalScale: number;
}
