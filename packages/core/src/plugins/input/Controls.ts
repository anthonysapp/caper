import { IApplication } from '../../core';
import { Application } from '../../core/Application';
import { bindAllMethods } from '../../utils';
import { Action } from '../actions';
import { IControls, UserControls } from './interfaces';
import { KeyboardControls } from './keyboard';
import { VirtualControls } from './touch';

export class Controls implements IControls {
  keyboard: KeyboardControls;
  /** @deprecated Use {@link Controls.virtual} instead. */
  touch: VirtualControls;

  constructor() {
    bindAllMethods(this);
  }

  get app(): IApplication {
    return Application.getInstance();
  }

  /** Virtual on-screen buttons (joystick/buttons) — the same instance as {@link Controls.touch}. */
  get virtual(): VirtualControls {
    return this.touch;
  }

  destroy() {
    if (this.keyboard) {
      this.keyboard.destroy();
    }
    if (this.touch) {
      this.touch.destroy();
    }
  }

  isActionActive(action: Action): boolean {
    const isActive = this.keyboard?.isActionActive(action) || this.touch?.isActionActive(action) || false;
    return isActive;
  }

  initialize(scheme: UserControls) {
    if (scheme.keyboard) {
      this.keyboard = new KeyboardControls();
      this.keyboard.initialize(scheme.keyboard);
    }

    if (scheme.touch) {
      this.touch = new VirtualControls();
      this.touch.initialize(scheme.touch);
    }
  }

  public connect() {
    if (this.keyboard) {
      this.keyboard.connect();
    }
    if (this.touch) {
      this.touch.connect();
    }
  }
}
