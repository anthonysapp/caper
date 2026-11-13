// Compile-time proof, checked by `tsc --noEmit`. Never imported, so it ships no code.
import type { Container } from '@caperjs/core';
import type { View3D } from '@caperjs/plugin-3d';

export function entityIdsAreSplitByDimension(scene: Container, view: View3D) {
  scene.add.entity('actor');
  view.add.entity('spin-cube', { x: 1 });
  // @ts-expect-error a 3D entity id is not accepted by the 2D factory
  scene.add.entity('spin-cube');
  // @ts-expect-error a 2D entity id is not accepted by the 3D factory
  view.add.entity('actor');
}
