import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Container, getEntityCtor } from '../../index';
import { defaultFactoryMethods } from './const';
import { _resetEntityRegistry } from './registry';

function register(id: string, module: unknown): void {
  (globalThis as unknown as { Caper: { get: (key: string) => unknown } }).Caper = {
    get: (key) => (key === 'entityList' ? [{ id, active: true, module }] : undefined),
  };
}

describe('entity factory', () => {
  beforeEach(() => {
    _resetEntityRegistry();
    delete (globalThis as unknown as { Caper?: unknown }).Caper;
  });

  it('builds a Pixi Container and places it', () => {
    class Actor extends Container {}
    register('actor', Actor);
    const actor = defaultFactoryMethods.entity('actor' as never, { x: 4, y: 7 } as never);
    expect(actor).toBeInstanceOf(Actor);
    expect((actor as Container).position).toMatchObject({ x: 4, y: 7 });
  });

  it('rejects a non-Container before calling its constructor', () => {
    const construct = vi.fn();
    class Other {
      constructor() { construct(); }
    }
    register('other', Other);
    expect(() => defaultFactoryMethods.entity('other' as never)).toThrow(
      "[caper] Entity 'other' is not a Pixi Container, so this.add.entity cannot build it. Use the factory of the system it belongs to.",
    );
    expect(construct).not.toHaveBeenCalled();
  });

  it('keeps the unknown-id error', () => {
    expect(() => defaultFactoryMethods.entity('missing' as never)).toThrow("Unknown entity id 'missing'");
  });

  it('exports the registry lookup from core', () => {
    class Actor extends Container {}
    register('actor', Actor);
    expect(getEntityCtor('actor')).toBe(Actor);
    expect(getEntityCtor('missing')).toBeUndefined();
  });
});
