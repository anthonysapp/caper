import { bindAllMethods, Logger } from '../../../utils';
import type { ControlsActionMap, JoystickControlsScheme, TouchControlsMap, TouchControlsScheme } from '../types';

import { JoystickDirection } from '..';
import { Application } from '../../../core/Application';
import { WithSignals } from '../../../mixins/signals';
import type { SignalConnection } from '../../../signals';
import type { IButton, IJoystick } from '../../../ui';
import type { Action } from '../../actions';
import { AbstractControls } from '../AbstractControls';

export class VirtualControls extends WithSignals(AbstractControls) {
  protected scheme: Partial<TouchControlsMap>;
  private _buttons: Set<IButton> = new Set();
  private _joystickMap: Partial<JoystickControlsScheme>;
  private _buttonDownMap: Partial<TouchControlsScheme>;
  private _buttonUpMap: Partial<TouchControlsScheme>;
  private _combinations: string[][] = [];
  private _singleDownButtons: Set<string> = new Set();
  private _activeJoystickDirections: Map<JoystickDirection, Action> = new Map();
  private _activeButtonDownIds: Map<string, Action> = new Map();
  private _activeButtonUpIds: Map<string, Action> = new Map();
  private _combinationsMap: Map<string[], Action> = new Map();
  private _buttonConnections: Map<IButton, SignalConnection[]> = new Map();
  private _warnedMissingActions: Set<string> = new Set();

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

  get app() {
    return Application.getInstance();
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
    this._buttonDownMap = scheme.down || {};
    this._buttonUpMap = scheme.up || {};
    this._joystickMap = scheme.joystick || {};
    this.app.signal.onActionContextChanged.connect(this._sortActions);
    this._sortActions();
  }

  public connect() {
    this.app.ticker.add(this._update);
  }

  public destroy(): void {
    this.app.ticker.remove(this._update);
    super.destroy();
  }

  isActionActive(action: Action): boolean {
    const buttonAction = this.scheme['down']?.[action] ?? null;
    if (buttonAction) {
      if (Array.isArray(buttonAction)) {
        return buttonAction.some((input) => this._isInputActive(input));
      } else {
        return this._isInputActive(buttonAction);
      }
    } else {
      const joystickAction = this.scheme['joystick']?.[action] ?? null;
      if (this._joystick && joystickAction) {
        if (Array.isArray(joystickAction)) {
          return joystickAction.includes(this._joystick.direction);
        } else {
          return joystickAction === this._joystick?.direction;
        }
      }
    }
    return false;
  }

  /** A single button id, or a `+` separated combination requiring every input to be down. */
  private _isInputActive(input: string): boolean {
    if (input.includes('+')) {
      return input.split('+').every((id) => this._singleDownButtons.has(id) || this._joystick?.direction === id);
    }
    return this._singleDownButtons.has(input);
  }

  private _warnMissingAction(key: string) {
    if (this._warnedMissingActions.has(key)) {
      return;
    }
    this._warnedMissingActions.add(key);
    Logger.warn(`VirtualControls: scheme references unknown action "${key}"`);
  }

  private _sortActions() {
    const actions = this.app.actionsPlugin.getActions();
    this._combinations = [];
    this._combinationsMap.clear();
    this._activeJoystickDirections.clear();
    this._activeButtonDownIds.clear();
    this._activeButtonUpIds.clear();

    let buttons = Object.keys(this._buttonDownMap);
    buttons.forEach((key) => {
      const item = this._buttonDownMap[key];
      const action = actions[key];
      if (!action) {
        this._warnMissingAction(key);
        return;
      }
      if (
        action.context !== '*' &&
        action.context !== this.app.actionContext &&
        !action.context.includes(this.app.actionContext)
      ) {
        return;
      }
      let input = item;
      if (input) {
        if (!Array.isArray(input)) {
          input = [input];
        }
        input.forEach((inputString) => {
          if (inputString.includes('+')) {
            const combo = inputString.split('+');
            this._combinations.push(combo);
            this._combinationsMap.set(combo, key as Action);
          } else {
            this._activeButtonDownIds.set(inputString, key as Action);
          }
        });
      }
    });

    // sort them from the largest to smallest
    this._combinations.sort((a, b) => b.length - a.length);

    buttons = Object.keys(this._buttonUpMap);
    buttons.forEach((key) => {
      const item = this._buttonUpMap[key];
      const action = actions[key];
      if (!action) {
        this._warnMissingAction(key);
        return;
      }
      if (
        action.context !== '*' &&
        action.context !== this.app.actionContext &&
        !action.context.includes(this.app.actionContext)
      ) {
        return;
      }
      this._activeButtonUpIds.set(item as string, key as Action);
    });

    const joystickActions = Object.keys(this._joystickMap);
    joystickActions.forEach((key) => {
      const item = this._joystickMap[key];
      let input = item;
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
    const action = this._activeButtonUpIds.get(button.id!);
    if (action) {
      this.app.action(action, {
        combination: false,
        inputState: 'up',
        button: button.id!,
      });
    }
  }

  private _update() {
    const joystickDirection = this._joystick?.direction ?? null;
    const buttonsDown = this._singleDownButtons;
    const eliminated = new Set<string>();
    // this._combinations is already sorted from largest to smallest
    for (let i = 0; i < this._combinations.length; i++) {
      const combination = this._combinations[i];
      // check if all of the keys in the combination are down
      if (combination.some((key) => eliminated.has(key))) {
        continue;
      }
      if (combination.every((key) => buttonsDown.has(key) || joystickDirection === key)) {
        combination.forEach((key) => eliminated.add(key));
        // send the action
        const action = this._combinationsMap.get(combination);
        if (action) {
          this.app.action(action, {
            button: combination,
            combination: true,
            inputState: 'down',
          });
        }
      }
    }

    // order doesn't matter here
    this._singleDownButtons.forEach((id) => {
      if (eliminated.has(id)) {
        return;
      }
      if (buttonsDown.has(id)) {
        const action = this._activeButtonDownIds.get(id);
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
