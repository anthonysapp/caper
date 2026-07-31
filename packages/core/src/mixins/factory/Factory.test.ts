import { Container as PIXIContainer } from 'pixi.js';
import { describe, expect, it } from 'vitest';

// Evaluating the table registers it into ./defaults; Factory() reads it lazily.
import './const';
import { Factory } from './Factory';
import { getDefaultFactoryMethods } from './defaults';

describe('Factory extensions', () => {
  it('does not leak extensions into the shared default table', () => {
    const Extended = Factory({ customThing: () => new PIXIContainer() } as any);
    const extended = new Extended() as any;
    expect(typeof extended.make.customThing).toBe('function');

    expect('customThing' in getDefaultFactoryMethods()).toBe(false);

    const Plain = Factory();
    const plain = new Plain() as any;
    expect(plain.make.customThing).toBeUndefined();
    expect(typeof plain.make.container).toBe('function');
  });
});
