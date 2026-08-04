import { bindAllMethods } from '../../../utils';
import { normalizeKey, type KeyboardEventDetail } from '../../KeyboardPlugin';
import { AbstractControls } from '../AbstractControls';
import { evaluateCombinations } from '../controlsCore';
import type { ControlsActionMap, KeyboardControlsMap } from '../types';

export class KeyboardControls extends AbstractControls {
  protected scheme: Partial<KeyboardControlsMap>;
  protected readonly logLabel = 'KeyboardControls';
  private _singleDownKeys: Set<string> = new Set();

  constructor() {
    super();
    bindAllMethods(this);
  }

  public initialize(scheme: Partial<KeyboardControlsMap>): void {
    super.initialize(scheme as Partial<ControlsActionMap>);
  }

  public connect() {
    this.addSignalConnection(
      this.app.keyboard.onKeyDown().connect(this._handleKeyDown),
      this.app.keyboard.onKeyUp().connect(this._handleKeyUp),
    );

    super.connect();
  }

  protected isInputDown(id: string): boolean {
    return this._singleDownKeys.has(id);
  }

  private _handleKeyDown(detail: KeyboardEventDetail): void {
    const key = normalizeKey(detail.event.key);
    this._singleDownKeys.add(key);
  }

  private _handleKeyUp(detail: KeyboardEventDetail): void {
    const key = normalizeKey(detail.event.key);
    this._singleDownKeys.delete(key);

    const action = this.activeUpInputs.get(key);
    if (action) {
      this.app.action(action, { combination: false, inputState: 'up', key });
    }
  }

  protected _update() {
    if (!this.app.keyboard) {
      return;
    }
    const keysDown = this.app.keyboard.keysDown;
    if (keysDown.size === 0) {
      return;
    }

    // this.combinations is already sorted from largest to smallest
    const { fired, eliminated } = evaluateCombinations(this.combinations, (key) => keysDown.has(key));
    fired.forEach((combination) => {
      const action = this.combinationsMap.get(combination);
      if (action) {
        this.app.action(action, {
          key: combination,
          combination: true,
          inputState: 'down',
        });
      }
    });

    // order doesn't matter here
    this._singleDownKeys.forEach((key) => {
      if (eliminated.has(key)) {
        return;
      }
      if (keysDown.has(key)) {
        const action = this.activeDownInputs.get(key);
        if (action) {
          this.app.action(action, { key, combination: false, inputState: 'down' });
        }
      }
    });
  }
}
