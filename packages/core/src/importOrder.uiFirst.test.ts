import { describe, expect, it } from 'vitest';

// Entry order guard: a `ui` module is imported BEFORE anything from `mixins`.
// The factory method table (`mixins/factory/const`) references every ui/display
// class, and every ui/display class extends a mixin — so the two sides import
// each other. If either side goes back through a barrel, whichever module is
// mid-evaluation hands out an undefined binding and the class body throws
// ("Factory is not a function" / "Class extends value undefined").
// Vitest gives each test file a fresh module registry, so this file pins the
// ui-first order and importOrder.mixinsFirst.test.ts pins the other one.
import { UICanvas } from './ui/UICanvas';
import { Button } from './ui/Button';
import { Factory } from './mixins';

describe('import order: ui first', () => {
  it('resolves the mixins the ui classes are built from', () => {
    expect(typeof Factory).toBe('function');
  });

  it('constructs the ui classes', () => {
    expect(typeof UICanvas).toBe('function');
    expect(typeof Button).toBe('function');
  });
});
