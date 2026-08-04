import type { ControlsActionMap } from '../..';
import { Application } from '../../core/Application';
import { WithSignals } from '../../mixins/signals';
import { Logger } from '../../utils';
import type { Action } from '../actions';
import { buildDownMaps, buildUpMap, isInputActive, type SchemeSection } from './controlsCore';

/**
 * Terminates the destroy chain — WithSignals' destroy() calls super.destroy().
 * Also the binding root: `bindAllMethods` in an adapter binds everything down
 * to here and stops, exactly like `Application` / `Plugin` / `Container`.
 */
class ControlsRoot {
  private static readonly __caper_method_binding_root = true;

  destroy(): void {}
}

/**
 * Shared machinery for every controls adapter: scheme storage, context-gated
 * down/up map building (rebuilt whenever the action context changes), the
 * `isActionActive` query and the ticker hookup. Adapters supply the scheme
 * sections, the "is this input down" predicates and the dispatch loop.
 */
export abstract class AbstractControls extends WithSignals(ControlsRoot) {
  protected scheme: any;
  /** `+` combinations, longest first — the update loop relies on that order. */
  protected combinations: string[][] = [];
  protected combinationsMap: Map<string[], Action> = new Map();
  protected activeDownInputs: Map<string, Action> = new Map();
  protected activeUpInputs: Map<string, Action> = new Map();
  private _warnedMissingActions: Set<string> = new Set();

  get app() {
    return Application.getInstance();
  }

  initialize(scheme: Partial<ControlsActionMap>) {
    this.scheme = scheme;
    this.addSignalConnection(this.app.signal.onActionContextChanged.connect(this._sortActions));
    this._sortActions();
  }

  public connect(): void {
    this.app.ticker.add(this._update);
  }

  public destroy(): void {
    this.app.ticker.remove(this._update);
    super.destroy();
  }

  isActionActive(action: Action): boolean {
    const input = this.scheme?.down?.[action] ?? null;
    if (!input) {
      return false;
    }
    if (Array.isArray(input)) {
      return input.some((item: string) => this._isInputActive(item));
    }
    return this._isInputActive(input);
  }

  /** The `down` section of the adapter's scheme. */
  protected get downSection(): SchemeSection | undefined {
    return this.scheme?.down;
  }

  /** The `up` section of the adapter's scheme. */
  protected get upSection(): SchemeSection | undefined {
    return this.scheme?.up;
  }

  /** Prefix for scheme warnings — a field, so minification cannot rename it away. */
  protected abstract readonly logLabel: string;

  /** Whether a single input is currently down. */
  protected abstract isInputDown(id: string): boolean;

  /** Whether an input counts as down *as part of a combination*. */
  protected isComboPartDown(id: string): boolean {
    return this.isInputDown(id);
  }

  /** Dispatch actions for the current input state — added to the ticker by {@link connect}. */
  protected abstract _update(): void;

  protected _isInputActive(input: string): boolean {
    return isInputActive(input, this.isInputDown, this.isComboPartDown);
  }

  /** Rebuild the down/up maps for the current action context. */
  protected _sortActions(): void {
    const actions = this.app.actionsPlugin.getActions();
    const context = this.app.actionContext as string;

    const { combinations, combinationsMap, singles } = buildDownMaps<Action>(
      this.downSection,
      actions,
      context,
      this._warnMissingAction,
    );
    this.combinations = combinations;
    this.combinationsMap = combinationsMap;
    this.activeDownInputs = singles;
    this.activeUpInputs = buildUpMap<Action>(this.upSection, actions, context, this._warnMissingAction);
  }

  protected _warnMissingAction(key: string): void {
    if (this._warnedMissingActions.has(key)) {
      return;
    }
    this._warnedMissingActions.add(key);
    Logger.warn(`${this.logLabel}: scheme references unknown action "${key}"`);
  }
}
