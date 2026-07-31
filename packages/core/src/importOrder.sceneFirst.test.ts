import { describe, expect, it } from 'vitest';

// Entry order guard: `display/Scene` is the FIRST module imported — the entry a
// game app actually uses. Scene extends Container, so it hits the same cycle.
// See importOrder.containerFirst.test.ts.
import { Scene } from './display/Scene';
import { Container } from './display/Container';
import { Factory } from './mixins';
import { Toast } from './ui/Toast';

describe('import order: display/Scene first', () => {
  it('resolves the mixin Scene is built from', () => {
    expect(typeof Factory).toBe('function');
  });

  it('resolves the display and ui classes', () => {
    expect(typeof Container).toBe('function');
    expect(typeof Scene).toBe('function');
    expect(typeof Toast).toBe('function');
  });
});
