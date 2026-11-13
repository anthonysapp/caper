import { CaperColors } from '@/theme';
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

/** A floating cube that turns slowly. `pop()` kicks it and moves it to its next colour. */
export default class SpinCube extends Entity3D<SpinCubeProps> {
  mesh: Mesh3D;
  taps = 0;
  private colors: number[];
  private kick = 0;
  private time = Math.random() * 10;

  added() {
    this.colors = this.props.colors ?? [CaperColors.coral, CaperColors.text, CaperColors.olive];
    // The mesh is the tap target. A 3D parent only hears its children's events when it is
    // 'static' too, so set it here and scenes can listen on the entity.
    this.eventMode = 'static';
    this.mesh = this.add.mesh({
      geometry: 'box',
      material: this.make.material({ color: this.colors[0], roughness: 0.5 }),
      eventMode: 'static',
      cursor: 'pointer',
    });
  }

  pop() {
    this.taps++;
    this.kick = 1;
    (this.mesh.material as Material3D).baseColor = this.colors[this.taps % this.colors.length];
  }

  update() {
    const dt = this.app.ticker.deltaMS / 1000;
    this.time += dt;
    this.kick *= Math.exp(-6 * dt);
    this.rotation.y += (0.5 + this.kick * 14) * dt;
    this.mesh.position.y = Math.sin(this.time * 1.4) * 0.12 + this.kick * 0.5;
    this.mesh.scale.set(1 + this.kick * 0.25);
  }
}
