import { describe, expect, it } from 'vitest';

// Entry order guard: the `display` barrel is the FIRST module imported. Same
// cycle as importOrder.containerFirst.test.ts, entered through the barrel.
import { Container, Scene } from './display';
import { Factory } from './mixins';
import { Toast } from './ui/Toast';

describe('import order: display barrel first', () => {
  it('resolves the mixin the display classes are built from', () => {
    expect(typeof Factory).toBe('function');
  });

  it('resolves the display and ui classes', () => {
    expect(typeof Container).toBe('function');
    expect(typeof Scene).toBe('function');
    expect(typeof Toast).toBe('function');
  });
});
