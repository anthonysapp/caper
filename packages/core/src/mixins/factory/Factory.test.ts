import { Container as PIXIContainer } from 'pixi.js';
import { describe, expect, it } from 'vitest';

// Evaluating the table registers it into ./defaults; Factory() reads it lazily.
import './const';
import { Factory } from './Factory';
import { getDefaultFactoryMethods, registerFactoryMethods } from './defaults';

declare module './defaults' {
  interface FactoryMethodOverrides {
    widget: () => PIXIContainer;
  }
}

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

  it('adds newly registered methods to new instances without leaking class extensions', () => {
    const Extended = Factory({ customThing: () => new PIXIContainer() } as any);
    new Extended();
    const dispose = registerFactoryMethods({ widget: () => new PIXIContainer() });
    try {
      const extended = new Extended();
      const widget: () => PIXIContainer = extended.add.widget;
      expect(typeof widget).toBe('function');
      const added = extended.add.widget();
      expect(added.parent).toBe(extended);
      const made = extended.make.widget();
      expect(made.parent).toBeNull();
      expect(typeof (extended.make as any).customThing).toBe('function');

      const plain = new (Factory())();
      expect(typeof plain.add.widget).toBe('function');
      expect((plain.make as any).customThing).toBeUndefined();
    } finally {
      dispose();
    }
    expect((new Extended().add as any).widget).toBeUndefined();
  });
});

describe('particleContainer factory', () => {
  it('passes Pixi constructor-only options such as dynamicProperties to the constructor', () => {
    const container = (getDefaultFactoryMethods() as any).particleContainer({
      dynamicProperties: { vertex: true, rotation: true, color: true },
      roundPixels: true,
    });
    const props = container._properties;
    expect(props.vertex.dynamic).toBe(true);
    expect(props.rotation.dynamic).toBe(true);
    expect(props.color.dynamic).toBe(true);
    expect(container.roundPixels).toBe(true);
  });
});
