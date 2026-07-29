import type { IApplication } from '../../core';
import { Signal } from '../../signals';
import type { IPlugin } from '../Plugin';
import { Plugin } from '../Plugin';
import type { GestureFrame, PointerSample } from './gestureMath';
import { computeFrame, frameDelta } from './gestureMath';
import type { GestureChangeDetail, GestureEndDetail, GesturePluginOptions, GestureStartDetail } from './types';
import { defaultGestureOptions } from './types';

type GestureState = 'idle' | 'pending' | 'active';

/** Below this, `totalScale` is reported as `1` rather than dividing by a near-zero spread. */
const SPREAD_EPSILON = 0.01;

export interface IGesturePlugin extends IPlugin<GesturePluginOptions> {
  readonly onGestureStart: Signal<(detail: GestureStartDetail) => void>;
  readonly onGestureChange: Signal<(detail: GestureChangeDetail) => void>;
  readonly onGestureEnd: Signal<(detail: GestureEndDetail) => void>;
  readonly isActive: boolean;
  readonly pointerCount: number;
}

/**
 * Multi-touch gesture recognizer: pinch zoom and two-finger pan combined
 * into one gesture, the way map apps work. There is no mode and no toggle —
 * a pinch that also drifts pans, a two-finger drag that also spreads zooms.
 *
 * One finger is never a camera gesture; games are expected to use it for
 * aim/build/UI as normal. Rotation is deliberately not recognised.
 *
 * Listens on raw DOM pointer events — `pointerdown` on `app.canvas`,
 * `pointermove`/`pointerup`/`pointercancel` on `window` — rather than PixiJS
 * federated events, so it sees every pointer regardless of scene-graph hit
 * testing, and lift-outside is always seen.
 *
 * @example
 * ```ts
 * app.signal.onGestureChange.connect(({ dx, dy, scale, centerX, centerY }) => {
 *   camera.pinchZoomAt(scale, centerX, centerY);
 *   camera.panBy(dx, dy);
 * });
 * ```
 */
export class GesturePlugin extends Plugin<GesturePluginOptions> implements IGesturePlugin {
  public readonly id = 'gesture';

  public readonly onGestureStart = new Signal<(detail: GestureStartDetail) => void>();
  public readonly onGestureChange = new Signal<(detail: GestureChangeDetail) => void>();
  public readonly onGestureEnd = new Signal<(detail: GestureEndDetail) => void>();

  private _pointers = new Map<number, PointerSample>();
  private _state: GestureState = 'idle';
  private _startFrame: GestureFrame | null = null;
  private _lastFrame: GestureFrame | null = null;
  private _canvas: HTMLCanvasElement | null = null;
  private _previousTouchAction = '';

  get isActive(): boolean {
    return this._state === 'active';
  }

  get pointerCount(): number {
    return this._pointers.size;
  }

  async initialize(options: Partial<GesturePluginOptions> = {}, app: IApplication): Promise<void> {
    this._options = { ...defaultGestureOptions, ...options };
    if (!this._options.enabled) return;

    const canvas = app.canvas as HTMLCanvasElement;
    this._canvas = canvas;
    if (this._options.preventDefault) {
      this._previousTouchAction = canvas.style.touchAction;
      canvas.style.touchAction = 'none';
    }

    canvas.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('pointercancel', this._onPointerCancel);
  }

  public destroy(): void {
    if (this._canvas) {
      this._canvas.removeEventListener('pointerdown', this._onPointerDown);
      if (this._options.preventDefault) {
        this._canvas.style.touchAction = this._previousTouchAction;
      }
      this._canvas = null;
    }
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('pointercancel', this._onPointerCancel);

    this._pointers.clear();
    this._state = 'idle';
    this._startFrame = null;
    this._lastFrame = null;

    this.onGestureStart.disconnectAll();
    this.onGestureChange.disconnectAll();
    this.onGestureEnd.disconnectAll();
    super.destroy();
  }

  protected getCoreSignals(): string[] {
    return ['onGestureStart', 'onGestureChange', 'onGestureEnd'];
  }

  private _onPointerDown = (e: PointerEvent): void => {
    if (!this._options.pointerTypes!.includes(e.pointerType)) return;

    const before = this._state;
    const hadTwoOrMore = this._pointers.size >= 2;
    this._pointers.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY });

    if (this._state === 'idle' && this._pointers.size === 2) {
      const frame = computeFrame([...this._pointers.values()]);
      this._startFrame = frame;
      this._lastFrame = frame;
      this._state = 'pending';
    } else if (this._state !== 'idle' && hadTwoOrMore) {
      // a 3rd+ finger joined mid-gesture — rebase without emitting so it doesn't jump the frame
      this._lastFrame = computeFrame([...this._pointers.values()]);
    }

    this._maybePreventDefault(e, before, this._state);
  };

  private _onPointerMove = (e: PointerEvent): void => {
    if (!this._pointers.has(e.pointerId)) return;
    this._pointers.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY });

    const before = this._state;

    if (this._pointers.size >= 2) {
      const next = computeFrame([...this._pointers.values()]);

      if (this._state === 'pending') {
        const delta = frameDelta(this._lastFrame!, next);
        const spreadDelta = Math.abs(next.spread - this._lastFrame!.spread);
        const centroidDelta = Math.hypot(delta.dx, delta.dy);
        if (spreadDelta >= this._options.pinchThreshold! || centroidDelta >= this._options.panThreshold!) {
          this._lastFrame = next; // rebase — discard the threshold slack, no jump
          this._state = 'active';
          this.onGestureStart.emit({
            centerX: next.centerX,
            centerY: next.centerY,
            pointerCount: this._pointers.size,
          });
        }
      } else if (this._state === 'active') {
        const delta = frameDelta(this._lastFrame!, next);
        const totalScale = this._computeTotalScale(next);
        this._lastFrame = next;
        this.onGestureChange.emit({
          centerX: next.centerX,
          centerY: next.centerY,
          dx: delta.dx,
          dy: delta.dy,
          scale: delta.scale,
          totalScale,
          pointerCount: this._pointers.size,
        });
      }
    }

    this._maybePreventDefault(e, before, this._state);
  };

  private _onPointerUp = (e: PointerEvent): void => {
    this._endPointer(e);
  };

  private _onPointerCancel = (e: PointerEvent): void => {
    this._endPointer(e);
  };

  private _endPointer(e: PointerEvent): void {
    if (!this._pointers.has(e.pointerId)) return;

    const before = this._state;
    this._pointers.delete(e.pointerId);

    if (this._pointers.size < 2) {
      if (this._state === 'active' && this._lastFrame) {
        this.onGestureEnd.emit({
          centerX: this._lastFrame.centerX,
          centerY: this._lastFrame.centerY,
          totalScale: this._computeTotalScale(this._lastFrame),
        });
      }
      this._state = 'idle';
      this._startFrame = null;
      this._lastFrame = null;
    } else if (this._state !== 'idle') {
      // a finger lifted but 2+ remain — rebase without emitting so it doesn't jump the frame
      this._lastFrame = computeFrame([...this._pointers.values()]);
    }

    this._maybePreventDefault(e, before, this._state);
  }

  private _computeTotalScale(frame: GestureFrame): number {
    if (!this._startFrame || this._startFrame.spread < SPREAD_EPSILON) return 1;
    return frame.spread / this._startFrame.spread;
  }

  /** Preventable only for tracked pointer events while a gesture is pending or active. */
  private _maybePreventDefault(e: PointerEvent, before: GestureState, after: GestureState): void {
    if (this._options.preventDefault && (before !== 'idle' || after !== 'idle')) {
      e.preventDefault();
    }
  }
}
