import { describe, expect, it, vi } from 'vitest';

import { buildDownMaps, buildUpMap, contextAllows, evaluateCombinations, isInputActive } from './controlsCore';

const anywhere = { context: '*' as const };

describe('contextAllows', () => {
  it("allows every context for '*'", () => {
    expect(contextAllows('*', 'default')).toBe(true);
    expect(contextAllows('*', 'menu')).toBe(true);
  });

  it('matches a string context exactly', () => {
    expect(contextAllows('menu', 'menu')).toBe(true);
    expect(contextAllows('menu', 'game')).toBe(false);
  });

  it('does not treat a substring as a match', () => {
    expect(contextAllows('game_over', 'game')).toBe(false);
  });

  it('matches any member of an array context', () => {
    expect(contextAllows(['menu', 'game'], 'game')).toBe(true);
    expect(contextAllows(['menu', 'game'], 'pause')).toBe(false);
  });
});

describe('buildDownMaps', () => {
  it('splits singles from combinations and sorts combinations longest first', () => {
    const { combinations, combinationsMap, singles } = buildDownMaps(
      { jump: 'A', special: ['B+C', 'D+E+F'] },
      { jump: anywhere, special: anywhere },
      'default',
      vi.fn(),
    );

    expect([...singles]).toEqual([['A', 'jump']]);
    expect(combinations).toEqual([
      ['D', 'E', 'F'],
      ['B', 'C'],
    ]);
    expect(combinationsMap.get(combinations[0])).toBe('special');
    expect(combinationsMap.get(combinations[1])).toBe('special');
  });

  it('skips actions that are out of context', () => {
    const { singles } = buildDownMaps(
      { jump: 'A', pause: 'B' },
      { jump: anywhere, pause: { context: 'menu' } },
      'default',
      vi.fn(),
    );

    expect([...singles]).toEqual([['A', 'jump']]);
  });

  it('warns once per unknown action and skips it', () => {
    const warn = vi.fn();
    const { singles } = buildDownMaps({ nope: ['A', 'B'] }, {}, 'default', warn);

    expect(singles.size).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('nope');
  });

  it('handles a missing section', () => {
    const { combinations, singles } = buildDownMaps(undefined, {}, 'default', vi.fn());

    expect(combinations).toEqual([]);
    expect(singles.size).toBe(0);
  });
});

describe('buildUpMap', () => {
  it('normalizes a single input and an array of inputs', () => {
    const map = buildUpMap({ jump: 'A', pause: ['B', 'C'] }, { jump: anywhere, pause: anywhere }, 'default', vi.fn());

    expect([...map]).toEqual([
      ['A', 'jump'],
      ['B', 'pause'],
      ['C', 'pause'],
    ]);
  });

  it('skips out-of-context actions and warns once for unknown ones', () => {
    const warn = vi.fn();
    const map = buildUpMap(
      { jump: 'A', pause: 'B', nope: 'C' },
      { jump: anywhere, pause: { context: 'menu' } },
      'default',
      warn,
    );

    expect([...map]).toEqual([['A', 'jump']]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('nope');
  });
});

describe('isInputActive', () => {
  it('uses the down predicate for a single input', () => {
    const isDown = (id: string) => id === 'A';

    expect(isInputActive('A', isDown)).toBe(true);
    expect(isInputActive('B', isDown)).toBe(false);
  });

  it('requires every part of a combination', () => {
    const down = new Set(['A', 'B']);
    const isDown = (id: string) => down.has(id);

    expect(isInputActive('A+B', isDown)).toBe(true);
    expect(isInputActive('A+C', isDown)).toBe(false);
  });

  it('uses the combination predicate for combination parts only', () => {
    const isDown = (id: string) => id === 'A';
    const isComboPartDown = (id: string) => id === 'A' || id === 'joystick_up';

    expect(isInputActive('A+joystick_up', isDown, isComboPartDown)).toBe(true);
    expect(isInputActive('joystick_up', isDown, isComboPartDown)).toBe(false);
  });
});

describe('evaluateCombinations', () => {
  it('fires a combination whose inputs are all down and eliminates its inputs', () => {
    const combinations = [['A', 'B']];
    const { fired, eliminated } = evaluateCombinations(combinations, (id) => id === 'A' || id === 'B');

    expect(fired).toEqual([['A', 'B']]);
    expect([...eliminated]).toEqual(['A', 'B']);
  });

  it('does not fire a combination that shares an input with an already fired one', () => {
    const combinations = [
      ['A', 'B', 'C'],
      ['A', 'B'],
    ];
    const down = new Set(['A', 'B', 'C']);
    const { fired } = evaluateCombinations(combinations, (id) => down.has(id));

    expect(fired).toEqual([['A', 'B', 'C']]);
  });

  it('fires nothing when no combination is fully down', () => {
    const { fired, eliminated } = evaluateCombinations([['A', 'B']], (id) => id === 'A');

    expect(fired).toEqual([]);
    expect(eliminated.size).toBe(0);
  });
});
