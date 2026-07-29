import type { ActionsList, IActionsPlugin } from '../actions';
import { Action, DefaultActions } from '../actions';
import { Controls } from './Controls';

import { IApplication } from '../../core';
import { Signal } from '../../signals';
import type { IPlugin } from '../Plugin';
import { Plugin } from '../Plugin';
import { InputController, InputControllerTypes } from './constants';
import { UserControls } from './interfaces';

export type InputManagerOptions = {
  actions?: ActionsList;
  controls?: UserControls;
};

export interface IInputPlugin extends IPlugin<InputManagerOptions> {
  readonly controls: Controls;
  readonly lastUsedController: InputController | null;
  activeGamepads: Map<string, Gamepad>;
  activeControllers: Set<string>;
  options: InputManagerOptions;
  onGamepadConnected: Signal<(gamepad: Gamepad) => void>;
  onGamepadDisconnected: Signal<(gamepad: Gamepad) => void>;
  onControllerActivated: Signal<(controller: string) => void>;
  onControllerDeactivated: Signal<(controller: string) => void>;
  onControllerChanged: Signal<(controller: InputController) => void>;

  isControllerActive(controller: InputController): boolean;

  isGamepadActive(gamepad: Gamepad): boolean;

  isActionActive(action: Action): boolean;
}

const defaultOptions = {
  actions: DefaultActions,
};

export class InputPlugin extends Plugin<InputManagerOptions> implements IInputPlugin {
  public readonly id = 'input';

  // controls
  public readonly controls = new Controls();

  // properties
  public activeGamepads = new Map<string, Gamepad>();
  public activeControllers = new Set<string>([]);
  private _lastUsedController: InputController | null = null;
  private _canvas: HTMLCanvasElement | null = null;
  // signals
  public onGamepadConnected: Signal<(gamepad: Gamepad) => void> = new Signal<(gamepad: Gamepad) => void>();
  public onGamepadDisconnected: Signal<(gamepad: Gamepad) => void> = new Signal<(gamepad: Gamepad) => void>();
  public onControllerActivated: Signal<(controller: string) => void> = new Signal<(controller: string) => void>();
  public onControllerDeactivated: Signal<(controller: string) => void> = new Signal<(controller: string) => void>();
  public onControllerChanged: Signal<(controller: InputController) => void> = new Signal<
    (controller: InputController) => void
  >();

  get lastUsedController(): InputController | null {
    return this._lastUsedController;
  }

  isActionActive(action: Action): boolean {
    return this.controls.isActionActive(action);
  }

  async initialize(options: Partial<InputManagerOptions> = defaultOptions, app: IApplication): Promise<void> {
    this._options = { ...defaultOptions, ...options };

    app.stage.eventMode = 'static';
    this._canvas = app.canvas as HTMLCanvasElement;
    this._canvas.addEventListener('pointerdown', this._onPointerDown);
    this._canvas.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('gamepadconnected', this._onGamepadConnected);
    window.addEventListener('gamepaddisconnected', this._onGamepadDisconnected);

    if (this._options.controls) {
      this.controls.initialize(this._options.controls);
    }
  }

  public postInitialize(): void {
    if (this.controls) {
      this.controls.connect();
    }
  }

  destroy(): void {
    // unregister all event listeners
    if (this._canvas) {
      this._canvas.removeEventListener('pointerdown', this._onPointerDown);
      this._canvas.removeEventListener('pointermove', this._onPointerMove);
      this._canvas = null;
    }
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('gamepadconnected', this._onGamepadConnected);
    window.removeEventListener('gamepaddisconnected', this._onGamepadDisconnected);

    this.controls.destroy();

    this.onGamepadConnected.disconnectAll();
    this.onGamepadDisconnected.disconnectAll();
    this.onControllerActivated.disconnectAll();
    this.onControllerDeactivated.disconnectAll();
    this.onControllerChanged.disconnectAll();

    super.destroy();
  }

  isControllerActive(controller: InputController): boolean {
    return this.activeControllers.has(controller);
  }

  isGamepadActive(gamepad: Gamepad): boolean {
    return this.activeGamepads.has(gamepad.id);
  }

  protected getCoreSignals(): string[] {
    return [
      'onGamepadConnected',
      'onGamepadDisconnected',
      'onControllerActivated',
      'onControllerDeactivated',
      'onControllerChanged',
    ];
  }

  private _isInputControllerType(value: string): value is InputController {
    return (Object.values(InputControllerTypes) as string[]).includes(value);
  }

  private _activateController(inputController: string): void {
    const isNewController = !this.activeControllers.has(inputController);
    if (isNewController) {
      this.activeControllers.add(inputController);
    }

    // only the four InputControllerTypes values are valid "last used" values —
    // a raw gamepad device id (see _onGamepadConnected) must never land here
    if (this._isInputControllerType(inputController) && inputController !== this._lastUsedController) {
      this._lastUsedController = inputController;
      this.onControllerChanged.emit(inputController);
    }

    if (isNewController) {
      // emit the controller activated signal
      this.onControllerActivated.emit(inputController);
    }
  }

  private _deactivateController(inputController: InputController): void {
    const wasControllerActive = this.activeControllers.has(inputController);
    if (!wasControllerActive) {
      return;
    }
    this.activeControllers.delete(inputController);
    // emit the controller deactivated signal
    this.onControllerDeactivated.emit(inputController);
  }

  private _activateGamepad(gamepad: Gamepad): void {
    this.activeGamepads.set(gamepad.id, gamepad);
  }

  private _deactivateGamepad(gamepadId: string): void {
    this.activeGamepads.delete(gamepadId);
  }

  private _onPointerDown(event: PointerEvent): void {
    if (event.pointerType === 'touch') {
      this._activateController(InputControllerTypes.Touch);
    }
  }

  private _onPointerMove(event: PointerEvent): void {
    if (event.pointerType === 'mouse') {
      this._activateController(InputControllerTypes.Mouse);
    }
  }

  private _onKeyDown(): void {
    this._activateController(InputControllerTypes.Keyboard);
  }

  private _onGamepadConnected(event: GamepadEvent): void {
    this._activateController(InputControllerTypes.GamePad);
    // add the gamepad id just in case we need it (?)
    this._activateController(event.gamepad.id);
    this._activateGamepad(event.gamepad);
    // emit the gamepad connected signal
    this.onGamepadConnected.emit(event.gamepad);
  }

  private _onGamepadDisconnected(event: GamepadEvent): void {
    // remove the gamepad
    this._deactivateGamepad(event.gamepad.id);

    // pause the game any time there is a controller disconnect
    this.actionsPlugin.sendAction('pause');

    // emit the gamepad disconnected signal
    this.onGamepadDisconnected.emit(event.gamepad);

    // check if all gamepads are disconnected
    if (this.activeGamepads.size === 0) {
      this._deactivateController(InputControllerTypes.GamePad);
    }
  }

  get actionsPlugin(): IActionsPlugin {
    return this.app.getPlugin('actions') as IActionsPlugin;
  }
}
