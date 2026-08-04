import { IApplication } from '../core';
import { Signal } from '../signals';
import { isDev, KeyboardKey, Logger } from '../utils';
import type { IPlugin } from './Plugin';
import { Plugin } from './Plugin';

export type KeyboardEventType = 'keydown' | 'keyup';
export type KeyboardEventDetail = { event: KeyboardEvent; key: string };
export type KeySignal = Signal<(detail: KeyboardEventDetail) => void>;

export interface IKeyboardPlugin extends IPlugin {
  enabled: boolean;
  readonly keysDown: Set<string>;

  onKeyDown(key?: KeyboardKey): KeySignal;

  onKeyUp(key?: KeyboardKey): KeySignal;

  isKeyDown(key: string): boolean;
}

export function normalizeKey(key: string | undefined): string {
  if (key === undefined) {
    key = '*undefined*';
  } else if (key === ' ') {
    key = 'Space';
  } else if (key.length === 1) {
    key = key.toUpperCase();
  }
  return key;
}

export class KeyboardPlugin extends Plugin implements IKeyboardPlugin {
  public readonly id: string = 'keyboard';
  // global signals
  public onGlobalKeyDown: Signal<(detail: KeyboardEventDetail) => void> = new Signal();
  public onGlobalKeyUp: Signal<(detail: KeyboardEventDetail) => void> = new Signal();

  private _keyDownSignals: Map<string | undefined, KeySignal> = new Map();
  private _keyUpSignals: Map<string | undefined, KeySignal> = new Map();

  private _keysDown: Set<string> = new Set();

  // Dev-only guard: warn once if key events arrive with no consumers connected.
  private _warnedNoConsumers = false;

  get keysDown() {
    return this._keysDown;
  }

  private _enabled: boolean = true;

  public get enabled(): boolean {
    return this._enabled;
  }

  public set enabled(value: boolean) {
    this._enabled = value;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public initialize(_options: any, _app: IApplication): void {
    // track which keys are down
    this.listen(document, 'keydown', this._handleKeyDown as EventListener);
    this.listen(document, 'keyup', this._handleKeyUp as EventListener);
  }

  public onKeyDown(key?: KeyboardKey): KeySignal {
    return this._checkAndAddSignal(key || undefined, 'keydown');
  }

  public onKeyUp(key?: KeyboardKey): KeySignal {
    return this._checkAndAddSignal(key || undefined, 'keyup');
  }

  public isKeyDown(key: KeyboardKey): boolean {
    return this._keysDown.has(key);
  }

  _update() {
    //
  }

  protected getCoreSignals(): string[] {
    return ['onGlobalKeyDown', 'onGlobalKeyUp'];
  }

  protected getCoreFunctions(): string[] {
    return ['onKeyDown', 'onKeyUp', 'isKeyDown'];
  }

  private _handleKeyDown(e: KeyboardEvent): void {
    const key = normalizeKey(e.key);
    this._keysDown.add(key);
    this.onGlobalKeyDown.emit({ event: e, key: e.key });
  }

  private _handleKeyUp(e: KeyboardEvent): void {
    const key = normalizeKey(e.key);
    this._keysDown.delete(key);
    // DX guard: a key arrived but nothing consumes it (no KeyboardControls / no
    // onKeyDown|onKeyUp subscribers). Almost always an Application subclass whose
    // postInitialize() skipped framework wiring, or controls never connected.
    if (isDev && !this._warnedNoConsumers && this._keyUpSignals.size === 0 && this._keyDownSignals.size === 0) {
      this._warnedNoConsumers = true;
      Logger.warn(
        'KeyboardPlugin received a key event but no consumers are connected, so keyboard ' +
          'actions will not fire. Ensure the InputPlugin controls are connected — e.g. an ' +
          'Application subclass overriding postInitialize() must not skip framework wiring, ' +
          'or call app.controls.connect().',
      );
    }
    this.onGlobalKeyUp.emit({ event: e, key: e.key });
  }

  /**
   * Check if the signal exists and add it if it doesn't
   * Also, if this is the first signal, start listening for the event
   * @param {string} key
   * @param {KeyboardEventType} eventType
   * @returns {KeySignal}
   * @private
   */
  private _checkAndAddSignal(key: string | undefined, eventType: KeyboardEventType): KeySignal {
    const signalMap = eventType === 'keydown' ? this._keyDownSignals : this._keyUpSignals;

    if (!signalMap.size) {
      this._listen(eventType);
    }

    key = normalizeKey(key);

    if (!signalMap.has(key)) {
      signalMap.set(key, new Signal<(detail: KeyboardEventDetail) => void>());
    }

    return signalMap.get(key) as KeySignal;
  }

  private _listen(eventType: KeyboardEventType): void {
    this.listen(document, eventType, this._handleEvent as EventListener);
  }

  private _handleEvent(event: KeyboardEvent): void {
    if (!this._enabled) {
      return;
    }
    const signalMap = event.type === 'keydown' ? this._keyDownSignals : this._keyUpSignals;
    const key = normalizeKey(event.key);
    signalMap.get('*undefined*')?.emit({ event, key });
    signalMap.get(key)?.emit({ event, key });
  }
}
