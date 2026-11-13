import { Plugin, registerFactoryMethods } from '@caperjs/core';
import type { IApplication, IPlugin } from '@caperjs/core';
import { View3D } from './View3D';
import type { View3DProps } from './View3D';
import type { Quality3D } from './quality';
import { assertRenderer3D } from './renderer';

export interface Plugin3DOptions {
  quality: Quality3D;
}
export interface IPlugin3D extends IPlugin<Plugin3DOptions> {}

declare module '@caperjs/core' {
  interface FactoryMethodOverrides {
    view3d: (props?: View3DProps) => View3D;
  }
}

// One stable function, so a re-run `initialize` registers the same method again (a no-op) instead of colliding.
const view3d = (props?: View3DProps) => new View3D(props);

export class Plugin3D extends Plugin<Plugin3DOptions> implements IPlugin3D {
  id = '3d';

  initialize(options: Partial<Plugin3DOptions> = {}): void {
    this._options = { quality: 'auto', ...options };
    this.addDisposer(registerFactoryMethods({ view3d }));
  }

  postInitialize(app: IApplication): void {
    assertRenderer3D(app.renderer);
  }
}

export default Plugin3D;
