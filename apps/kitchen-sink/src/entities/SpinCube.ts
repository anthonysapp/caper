import { defineEntity } from '@caperjs/core';
import { Entity3D } from '@caperjs/plugin-3d';
import type { Material3D, Mesh3D } from '@pixi/3d';

export const entity = defineEntity({
  id: 'spin-cube',
  active: true,
});

export type SpinCubeProps = {
  colors?: number[];
};

export default class SpinCube extends Entity3D<SpinCubeProps> {
  mesh: Mesh3D;
  taps = 0;

  added() {
    const colors = this.props.colors ?? [0xd9534f, 0x4a90d9, 0x6fbf5c, 0xf0ad4e];
    this.mesh = this.add.mesh({
      geometry: 'box',
      color: colors[0],
      eventMode: 'static',
      cursor: 'pointer',
    });
    const material = this.mesh.material as Material3D;
    let colorIndex = 0;
    this.mesh.on('pointertap', () => {
      this.taps++;
      colorIndex = (colorIndex + 1) % colors.length;
      material.baseColor = colors[colorIndex];
    });
  }

  update() {
    const dt = this.app.ticker.deltaTime;
    this.rotation.y += 0.02 * dt;
    this.rotation.x += 0.01 * dt;
  }
}
