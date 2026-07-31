import { describe, expect, it } from 'vitest';

// The mirror of importOrder.uiFirst.test.ts: `mixins` is imported BEFORE any ui
// module. See that file for why both orders have to be pinned.
import { Factory } from './mixins';
import { Button } from './ui/Button';
import { UICanvas } from './ui/UICanvas';

describe('import order: mixins first', () => {
  it('resolves the mixins the ui classes are built from', () => {
    expect(typeof Factory).toBe('function');
  });

  it('constructs the ui classes', () => {
    expect(typeof UICanvas).toBe('function');
    expect(typeof Button).toBe('function');
  });
});
