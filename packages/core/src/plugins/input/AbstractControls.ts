import type { ControlsActionMap } from '../..';
import { IApplication } from '../../core';
import { Application } from '../../core/Application';

export class AbstractControls {
  protected scheme: any;

  get app(): IApplication {
    return Application.getInstance();
  }

  initialize(scheme: Partial<ControlsActionMap>) {
    this.scheme = scheme;
  }

  /**
   * Terminates the destroy chain — subclasses are built on WithSignals, whose destroy()
   * calls super.destroy().
   */
  destroy(): void {}
}
