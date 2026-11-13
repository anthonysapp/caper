import { expect, it } from 'vitest';
import { Model } from './Model';

it('names available clips when play has no player', () => {
  const model = Object.create(Model.prototype) as Model;
  Object.defineProperty(model, 'player', { value: undefined });
  expect(() => model.play('idle')).toThrow(/idle.*available clips|available clips.*idle/i);
});
