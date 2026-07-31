import { describe, expect, it } from 'vitest';

// Entry order guard: `ui/Toast` is the FIRST module imported. Toast is the class
// the old cycle crashed on — the factory method table pulls in `ui/Toaster`,
// which pulls in Toast, whose `extends WithSignals(Container)` ran while
// Container was still mid-evaluation. See importOrder.uiFirst.test.ts.
import { Toast } from './ui/Toast';
import { Container } from './display/Container';
import { Factory } from './mixins';

describe('import order: ui/Toast first', () => {
  it('resolves the mixin Toast is built from', () => {
    expect(typeof Factory).toBe('function');
  });

  it('resolves the display and ui classes', () => {
    expect(typeof Container).toBe('function');
    expect(typeof Toast).toBe('function');
  });
});
