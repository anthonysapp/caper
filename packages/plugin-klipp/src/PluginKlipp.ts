import { Plugin } from '@caperjs/core';
import { registerFactory3DMethods } from '@caperjs/plugin-3d';
import type { View3D } from '@caperjs/plugin-3d';
import { CameraRig, type CameraRigProps } from './CameraRig';

declare module '@caperjs/plugin-3d' {
  interface Factory3DOverrides { cameraRig: (props?: CameraRigProps) => CameraRig }
}

const cameraRig = (view: View3D, props?: CameraRigProps) => new CameraRig(view, props);

export class PluginKlipp extends Plugin {
  id = 'klipp';
  initialize(): void { this.addDisposer(registerFactory3DMethods({ cameraRig })); }
}

export default PluginKlipp;
