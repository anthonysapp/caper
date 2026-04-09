import { Container, defineEntity } from '@caper/core';

export const entity = defineEntity({
  id: 'player',
  active: true,
});

export default class Player extends Container {}
