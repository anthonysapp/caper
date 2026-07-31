import { describe, expect, it } from 'vitest';

// Entry order guard: `display/Container` is the FIRST module imported. Container
// extends `Factory()`, and the factory method table (`mixins/factory/const`)
// imports every display/ui class — so an eager edge from Factory to the table
// re-enters display/ui mid-evaluation and the class bodies throw
// ("Class extends value undefined"). The table now registers itself into the
// import-free slot in `mixins/factory/defaults` instead.
// See importOrder.uiFirst.test.ts for why each order needs its own file.
import { Container } from './display/Container';
import { getDefaultFactoryMethods } from './mixins/factory/defaults';
import { Factory } from './mixins';
import { Toast } from './ui/Toast';

describe('import order: display/Container first', () => {
  it('resolves the mixin Container is built from', () => {
    expect(typeof Factory).toBe('function');
  });

  it('resolves the display and ui classes', () => {
    expect(typeof Container).toBe('function');
    expect(typeof Toast).toBe('function');
  });

  it('registers the factory method table once the factory barrel evaluates', () => {
    const methods = getDefaultFactoryMethods();
    expect(typeof methods).toBe('object');
    expect(typeof methods.container).toBe('function');
    expect(typeof methods.sprite).toBe('function');
    expect(typeof methods.button).toBe('function');
  });
});
