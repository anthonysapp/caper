import { bindAllMethods } from '../../../utils';
import type { ControlsActionMap, JoystickControlsScheme, TouchControlsMap } from '../types';

import { JoystickDirection } from '..';
import type { SignalConnection } from '../../../signals';
import type { IButton, IJoystick } from '../../../ui';
import type { Action } from '../../actions';
import { AbstractControls } from '../AbstractControls';
import { evaluateCombinations } from '../controlsCore';

export class VirtualControls extends AbstractControls {
  protected scheme: Partial<TouchControlsMap>;
  protected readonly logLabel = 'VirtualControls';
  private _buttons: Set<IButton> = new Set();
  private _singleDownButtons: Set<string> = new Set();
  private _activeJoystickDirections: Map<JoystickDirection, Action> = new Map();
  private _buttonConnections: Map<IButton, SignalConnection[]> = new Map();

  constructor() {
    super();
    bindAllMethods(this);
  }

  private _joystick: IJoystick;

  get joystick(): IJoystick {
    return this._joystick;
  }

  set joystick(value: IJoystick) {
    this._joystick = value;
  }

  addButton(button: IButton) {
    if (!button || this._buttons.has(button)) {
      return;
    }
    const connections = [
      button.onDown.connect(() => this._handleButtonDown(button)),
      button.onUp.connect(() => this._handleButtonUp(button)),
      button.onUpOutside.connect(() => this._handleButtonUp(button)),
      button.onDestroy.connect(() => this.removeButton(button)),
    ];
    this.addSignalConnection(...connections);
    this._buttonConnections.set(button, connections);
    this._buttons.add(button);
  }

  removeButton(button: IButton) {
    if (!button || !this._buttons.has(button)) {
      return;
    }
    // signals disconnect by identity — disconnect the connections made in addButton
    this._buttonConnections.get(button)?.forEach((connection) => connection.disconnect());
    this._buttonConnections.delete(button);
    this._singleDownButtons.delete(button.id!);
    this._buttons.delete(button);
  }

  public initialize(scheme: Partial<TouchControlsMap>): void {
    super.initialize(scheme as Partial<ControlsActionMap>);
  }

  isActionActive(action: Action): boolean {
    const buttonAction = this.scheme['down']?.[action] ?? null;
    if (buttonAction) {
      return super.isActionActive(action);
    }
    const joystickAction = this.scheme['joystick']?.[action] ?? null;
    if (this._joystick && joystickAction) {
      if (Array.isArray(joystickAction)) {
        return joystickAction.includes(this._joystick.direction);
      } else {
        return joystickAction === this._joystick?.direction;
      }
    }
    return false;
  }

  protected isInputDown(id: string): boolean {
    return this._singleDownButtons.has(id);
  }

  /** A joystick direction can take part in a combination, but never stands alone. */
  protected isComboPartDown(id: string): boolean {
    return this._singleDownButtons.has(id) || this._joystick?.direction === id;
  }

  protected _sortActions(): void {
    super._sortActions();

    this._activeJoystickDirections.clear();
    const joystickMap: Partial<JoystickControlsScheme> = this.scheme.joystick || {};
    Object.keys(joystickMap).forEach((key) => {
      let input = joystickMap[key];
      if (input) {
        if (!Array.isArray(input)) {
          input = [input];
        }
        input.forEach((inputString) => {
          this._activeJoystickDirections.set(inputString as JoystickDirection, key as Action);
        });
      }
    });
  }

  private _handleButtonDown(button: IButton): void {
    this._singleDownButtons.add(button.id!);
  }

  private _handleButtonUp(button: IButton): void {
    this._singleDownButtons.delete(button.id!);
    const action = this.activeUpInputs.get(button.id!);
    if (action) {
      this.app.action(action, {
        combination: false,
        inputState: 'up',
        button: button.id!,
      });
    }
  }

  protected _update() {
    const joystickDirection = this._joystick?.direction ?? null;
    const buttonsDown = this._singleDownButtons;

    // this.combinations is already sorted from largest to smallest
    const { fired, eliminated } = evaluateCombinations(
      this.combinations,
      (key) => buttonsDown.has(key) || joystickDirection === key,
    );
    fired.forEach((combination) => {
      const action = this.combinationsMap.get(combination);
      if (action) {
        this.app.action(action, {
          button: combination,
          combination: true,
          inputState: 'down',
        });
      }
    });

    // order doesn't matter here
    this._singleDownButtons.forEach((id) => {
      if (eliminated.has(id)) {
        return;
      }
      if (buttonsDown.has(id)) {
        const action = this.activeDownInputs.get(id);
        if (action) {
          this.app.action(action, {
            button: id,
            combination: false,
            inputState: 'down',
          });
        }
      }
    });

    // joustick dir
    if (joystickDirection) {
      const action = this._activeJoystickDirections.get(joystickDirection);
      if (action) {
        this.app.action(action, {
          inputState: 'joystick',
        });
      }
    }
  }
}

/** @deprecated Use {@link VirtualControls} instead. */
export { VirtualControls as TouchControls };
