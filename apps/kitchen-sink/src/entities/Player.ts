import { defineEntity, Entity } from '@caper-engine/core';

export const entity = defineEntity({
  id: 'player',
  active: true,
});

export type PlayerProps = {
  name?: string;
};

export default class Player extends Entity<PlayerProps> {
  added() {
    this.add.graphics().rect(-10, -10, 20, 20).fill(0x00ffff);
  }
}
