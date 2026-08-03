import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Signal } from '../../signals';

// Controls → KeyboardControls / VirtualControls reach for the Application singleton.
const mocks = vi.hoisted(() => ({ app: null as any }));

vi.mock('../../core/Application', () => ({
  Application: { getInstance: () => mocks.app },
}));

import type { IButton } from '../../ui';
import { Controls } from './Controls';

type FakeApp = {
  ticker: { add: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
  actionContext: string;
  actionsPlugin: { getActions: () => Record<string, { context: string; input: string[] }> };
  signal: { onActionContextChanged: Signal<() => void> };
  keyboard: {
    keysDown: Set<string>;
    onKeyDown: () => Signal<(detail: any) => void>;
    onKeyUp: () => Signal<(detail: any) => void>;
  };
  action: ReturnType<typeof vi.fn>;
};

let app: FakeApp;
let keyDown: Signal<(detail: any) => void>;
let keyUp: Signal<(detail: any) => void>;
let actions: Record<string, { context: string; input: string[] }>;

function pressKey(key: string) {
  app.keyboard.keysDown.add(key);
  keyDown.emit({ event: { key }, key });
}

function makeButton(id: string): IButton {
  return {
    id,
    onDown: new Signal<() => void>(),
    onUp: new Signal<() => void>(),
    onUpOutside: new Signal<() => void>(),
    onDestroy: new Signal<() => void>(),
  } as unknown as IButton;
}

beforeEach(() => {
  keyDown = new Signal();
  keyUp = new Signal();
  actions = {
    move_left: { context: '*', input: [] },
    jump: { context: '*', input: [] },
  };
  app = {
    ticker: { add: vi.fn(), remove: vi.fn() },
    actionContext: 'default',
    actionsPlugin: { getActions: () => actions },
    signal: { onActionContextChanged: new Signal<() => void>() },
    keyboard: {
      keysDown: new Set<string>(),
      onKeyDown: () => keyDown,
      onKeyUp: () => keyUp,
    },
    action: vi.fn(),
  };
  mocks.app = app;
});

describe('Controls teardown', () => {
  it('destroys configured control schemes without throwing and removes ticker callbacks', () => {
    const controls = new Controls();
    controls.initialize({
      keyboard: { down: { move_left: 'A' } },
      touch: { down: { jump: 'btn-a' } },
    } as any);
    controls.connect();

    expect(app.ticker.add).toHaveBeenCalledTimes(2);
    expect(() => controls.destroy()).not.toThrow();
    expect(app.ticker.remove).toHaveBeenCalledTimes(2);
  });
});

describe('Controls combinations', () => {
  it('reports a keyboard combination active when both keys are down', () => {
    const controls = new Controls();
    controls.initialize({ keyboard: { down: { move_left: ['A+B'] } } } as any);
    controls.connect();

    expect(controls.isActionActive('move_left')).toBe(false);

    pressKey('A');
    expect(controls.isActionActive('move_left')).toBe(false);

    pressKey('B');
    expect(controls.isActionActive('move_left')).toBe(true);
  });

  it('reports a virtual button combination active when both buttons are down', () => {
    const controls = new Controls();
    controls.initialize({ touch: { down: { jump: ['btn-a+btn-b'] } } } as any);
    controls.connect();

    const a = makeButton('btn-a');
    const b = makeButton('btn-b');
    controls.virtual.addButton(a);
    controls.virtual.addButton(b);

    a.onDown.emit();
    expect(controls.isActionActive('jump')).toBe(false);

    b.onDown.emit();
    expect(controls.isActionActive('jump')).toBe(true);
  });
});

describe('Controls with an unmapped action in the scheme', () => {
  it('does not throw on initialize or on an action context change', () => {
    const controls = new Controls();

    expect(() =>
      controls.initialize({
        keyboard: { down: { not_an_action: 'A' } },
        touch: { down: { not_an_action: 'btn-a' }, up: { also_not_an_action: 'btn-b' } },
      } as any),
    ).not.toThrow();

    controls.connect();

    expect(() => app.signal.onActionContextChanged.emit()).not.toThrow();
  });
});

describe('VirtualControls.removeButton', () => {
  it('stops a removed button from driving action state', () => {
    const controls = new Controls();
    controls.initialize({ touch: { down: { jump: 'btn-a' } } } as any);
    controls.connect();

    const button = makeButton('btn-a');
    controls.virtual.addButton(button);
    controls.virtual.removeButton(button);

    button.onDown.emit();

    expect(controls.isActionActive('jump')).toBe(false);
  });
});
