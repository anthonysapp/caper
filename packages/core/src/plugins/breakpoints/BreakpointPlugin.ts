import type { IApplication } from '../../core';
import { Signal, type SignalConnection, type SignalOrder } from '../../signals';
import { Logger, type Orientation, type Size } from '../../utils';
import type { IPlugin } from '../Plugin';
import { Plugin } from '../Plugin';
import type { NormalizedLadder } from './evaluate';
import {
  activeNames,
  buildContext,
  diffNames,
  matchesMode,
  normalizeTiers,
  resolveStop,
  resolveValue,
} from './evaluate';
import type {
  BreakpointChangeDetail,
  BreakpointContext,
  BreakpointMode,
  BreakpointNameLike,
  BreakpointPluginOptions,
  BreakpointTierName,
  Pointer,
} from './types';
import { defaultBreakpoints } from './types';

const AXIS_NAMES = new Set<string>(['portrait', 'landscape', 'coarse', 'fine']);
const ZERO: Size = { width: 0, height: 0 };

export interface IBreakpointPlugin extends IPlugin<BreakpointPluginOptions> {
  readonly onBreakpointChanged: Signal<(detail: BreakpointChangeDetail) => void>;
  readonly onChange: Signal<(detail: BreakpointChangeDetail) => void>;
  readonly current: BreakpointNameLike;
  readonly size: Size;
  readonly width: number;
  readonly height: number;
  readonly orientation: Orientation;
  readonly pointer: Pointer;
  is(name: BreakpointNameLike): boolean;
  atLeast(value: BreakpointNameLike | number): boolean;
  below(value: BreakpointNameLike | number): boolean;
  between(lower: BreakpointNameLike | number, upper: BreakpointNameLike | number): boolean;
  matches(mode: BreakpointMode): boolean;
  value<T>(map: Partial<Record<BreakpointTierName, T>>): T | undefined;
  define(name: string, mode: BreakpointMode): void;
  undefine(name: string): void;
  onEnter(name: BreakpointNameLike, callback: () => void, order?: SignalOrder): SignalConnection;
  onLeave(name: BreakpointNameLike, callback: () => void, order?: SignalOrder): SignalConnection;
  when(name: BreakpointNameLike, callback: () => void, order?: SignalOrder): SignalConnection;
}

/**
 * Named responsive state derived from the renderer size.
 *
 * Declare tiers and modes in `caper.config.ts`; the plugin re-evaluates on
 * every resize but only emits when a name actually flips.
 *
 * @example
 * ```ts
 * const bp = app.breakpoints;
 *
 * const columns = bp.value({ mobile: 1, tablet: 2, desktop: 3 });
 * if (bp.is('stacked')) { ... }
 *
 * // run now, and again on every entry into the mode
 * this.addSignalConnection(bp.when('stacked', () => this.relayout()));
 * ```
 *
 * Listen to `app.onResize` or `bp.onChange` — never `app.webEvents.onResize`,
 * which fires ahead of this plugin and so reports a stale tier.
 */
export class BreakpointPlugin extends Plugin<BreakpointPluginOptions> implements IBreakpointPlugin {
  public readonly id = 'breakpoints';

  /**
   * Named to match its `ICoreSignals` key — `registerCoreSignals` copies
   * `this[name]` into the registry under the same string.
   */
  public readonly onBreakpointChanged = new Signal<(detail: BreakpointChangeDetail) => void>();

  private _ladder: NormalizedLadder;
  private _modes = new Map<string, BreakpointMode>();
  private _ctx: BreakpointContext;
  private _active: Set<string> = new Set();
  private _enter = new Map<string, Signal<() => void>>();
  private _leave = new Map<string, Signal<() => void>>();
  private _pointer: Pointer = 'fine';
  private _pointerQuery: MediaQueryList | null = null;
  private _warnedListenerNames = new Set<string>();

  /** Fluent alias for {@link onBreakpointChanged}. */
  get onChange(): Signal<(detail: BreakpointChangeDetail) => void> {
    return this.onBreakpointChanged;
  }

  get current(): BreakpointNameLike {
    return this._ctx.tier;
  }

  get size(): Size {
    return { width: this._ctx.width, height: this._ctx.height };
  }

  get width(): number {
    return this._ctx.width;
  }

  get height(): number {
    return this._ctx.height;
  }

  get orientation(): Orientation {
    return this._ctx.orientation;
  }

  get pointer(): Pointer {
    return this._ctx.pointer;
  }

  async initialize(options: Partial<BreakpointPluginOptions> = {}) {
    // Seed a safe default ladder and context before validating the user's
    // tiers below. `normalizeTiers` throws on an invalid ladder, and
    // `Application.registerPlugin` swallows a rejected `initialize` and
    // continues — leaving `_ladder`/`_ctx` unset would turn every later
    // accessor into an unrelated TypeError instead of surfacing the real
    // cause (spec §11).
    this._ladder = normalizeTiers({ ...defaultBreakpoints });
    this._ctx = buildContext(ZERO, this._ladder, this._pointer);

    this._options = {
      tiers: options.tiers ?? { ...defaultBreakpoints },
      modes: options.modes ?? {},
    };
    this._ladder = normalizeTiers(this._options.tiers!);
    for (const [name, mode] of Object.entries(this._options.modes!)) {
      this._modes.set(name, mode);
    }
    this._initPointer();
    this._ctx = buildContext(ZERO, this._ladder, this._pointer);
    this._active = activeNames(this._ctx, this._modes, this._ladder);
  }

  /**
   * `'highest'` priority so `current` is already updated when normal-priority
   * scene resize handlers run.
   */
  async postInitialize(_app: IApplication) {
    this._evaluate(this.app.size ?? ZERO);
    this.addSignalConnection(this.app.onResize.connect(this._evaluate, 'highest'));
  }

  public destroy(): void {
    this._pointerQuery = null;
    for (const signal of this._enter.values()) signal.disconnectAll();
    for (const signal of this._leave.values()) signal.disconnectAll();
    this._enter.clear();
    this._leave.clear();
    this.onBreakpointChanged.disconnectAll();
    super.destroy();
  }

  public is(name: BreakpointNameLike): boolean {
    if (!this._isKnown(name as string)) {
      Logger.warn(`[breakpoints] unknown name '${name}'. Known: ${this._knownNames().join(', ')}.`);
      return false;
    }
    return this._active.has(name as string);
  }

  public atLeast(value: BreakpointNameLike | number): boolean {
    const stop = resolveStop(this._ladder, value);
    return stop !== undefined && this._ctx.width >= stop;
  }

  public below(value: BreakpointNameLike | number): boolean {
    const stop = resolveStop(this._ladder, value);
    return stop !== undefined && this._ctx.width < stop;
  }

  public between(lower: BreakpointNameLike | number, upper: BreakpointNameLike | number): boolean {
    return this.atLeast(lower) && this.below(upper);
  }

  public matches(mode: BreakpointMode): boolean {
    return matchesMode(this._ctx, mode, this._ladder);
  }

  public value<T>(map: Partial<Record<BreakpointTierName, T>>): T | undefined {
    return resolveValue(this._ladder, this._ctx.tier, map as Partial<Record<string, T>>);
  }

  public define(name: string, mode: BreakpointMode): void {
    this._modes.set(name, mode);
    this._evaluate(this.size);
  }

  public undefine(name: string): void {
    if (!this._modes.delete(name)) return;
    this._evaluate(this.size);
  }

  public onEnter(name: BreakpointNameLike, callback: () => void, order?: SignalOrder): SignalConnection {
    this._warnIfUnknown(name as string);
    return this._signal(this._enter, name as string).connect(callback, order);
  }

  public onLeave(name: BreakpointNameLike, callback: () => void, order?: SignalOrder): SignalConnection {
    this._warnIfUnknown(name as string);
    return this._signal(this._leave, name as string).connect(callback, order);
  }

  /** Run now if already matching, then on every subsequent entry. */
  public when(name: BreakpointNameLike, callback: () => void, order?: SignalOrder): SignalConnection {
    if (this._active.has(name as string)) callback();
    return this.onEnter(name, callback, order);
  }

  protected getCoreSignals(): string[] {
    return ['onBreakpointChanged'];
  }

  /**
   * Re-derive state from a size. Emits leave before enter — a scene tears the
   * old layout down before the new one goes up — and `onChange` last.
   */
  private _evaluate = (size: Size): void => {
    const next = buildContext(size ?? ZERO, this._ladder, this._pointer);
    const nextActive = activeNames(next, this._modes, this._ladder);
    const { entered, left } = diffNames(this._active, nextActive);
    const previous = this._ctx.tier;

    this._ctx = next;
    this._active = nextActive;

    if (entered.length === 0 && left.length === 0) return;

    for (const name of left) this._leave.get(name)?.emit();
    for (const name of entered) this._enter.get(name)?.emit();

    this.onBreakpointChanged.emit({
      current: next.tier,
      previous,
      entered,
      left,
      size: { width: next.width, height: next.height },
    });
  };

  private _onPointerChange = (e: MediaQueryListEvent): void => {
    this._pointer = e.matches ? 'coarse' : 'fine';
    this._evaluate(this.size);
  };

  private _initPointer(): void {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      this._pointer = 'fine';
      return;
    }
    this._pointerQuery = window.matchMedia('(pointer: coarse)');
    this._pointer = this._pointerQuery.matches ? 'coarse' : 'fine';
    this.listen(this._pointerQuery, 'change', this._onPointerChange as EventListener);
  }

  private _signal(store: Map<string, Signal<() => void>>, name: string): Signal<() => void> {
    let signal = store.get(name);
    if (!signal) {
      signal = new Signal<() => void>();
      store.set(name, signal);
    }
    return signal;
  }

  private _isKnown(name: string): boolean {
    return name in this._ladder.byName || this._modes.has(name) || AXIS_NAMES.has(name);
  }

  /**
   * `onEnter`/`onLeave` (and `when`, which delegates to `onEnter`) still
   * connect a live signal for an unknown name — it may be `define`d later
   * (§8) — but warn once per name so a typo doesn't silently create a
   * listener nothing will ever emit.
   */
  private _warnIfUnknown(name: string): void {
    if (this._isKnown(name) || this._warnedListenerNames.has(name)) return;
    this._warnedListenerNames.add(name);
    Logger.warn(`[breakpoints] unknown name '${name}'. Known: ${this._knownNames().join(', ')}.`);
  }

  private _knownNames(): string[] {
    return [...this._ladder.names, ...this._modes.keys(), ...AXIS_NAMES];
  }
}
