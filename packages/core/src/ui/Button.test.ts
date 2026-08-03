import { describe, expect, it, vi } from 'vitest';

// Button transitively imports Application → Pixi display graph. Stub it — these
// tests drive the press-state machine directly and never touch the app singleton.
vi.mock('../core/Application', () => ({
  Application: { getInstance: () => ({}) },
}));

import { Button } from './Button';
import { Signal } from '../signals';

/**
 * Builds a Button instance without running the real constructor (which drags in
 * Factory/Interactive/Focusable mixin construction and a real Pixi Sprite). Only
 * the fields the handlers under test actually touch are hand-initialized.
 */
function makeButton() {
  const button = Object.create(Button.prototype) as Button;

  // Pixi's Container (via eventemitter3) normally initializes these in its own
  // constructor, which this hand-rolled instance never runs; `on`/`off` throw
  // without them.
  (button as any)._events = Object.create(null);
  (button as any)._eventsCount = 0;

  (button as any).config = {
    id: 'button',
    textures: { default: '' },
    sheet: undefined,
    enabled: true,
    cursor: 'default',
    disabledCursor: 'not-allowed',
  };

  (button as any)._enabled = true;
  button.isDown = false;
  button.isOver = false;
  (button as any)._pointerId = undefined;
  (button as any).isKeyDown = false;
  (button as any).cursor = 'default';
  (button as any).focusEnabled = true;

  (button as any).view = { texture: undefined };
  (button as any).make = { texture: vi.fn(() => 'texture') };

  button.onDown = new Signal();
  button.onUp = new Signal();
  button.onUpOutside = new Signal();
  button.onOut = new Signal();
  button.onOver = new Signal();
  button.onClick = new Signal();
  button.onEnabled = new Signal();
  button.onDisabled = new Signal();
  button.onKeyboardEvent = new Signal();
  button.onDestroy = new Signal();

  return button;
}

describe('Button press-state machine', () => {
  it('recovers from a press that is disabled mid-press', () => {
    const button = makeButton();
    const onDown = vi.fn();
    button.onDown.connect(onDown);

    (button as any).handlePointerDown({ pointerId: 1 });
    expect(button.isDown).toBe(true);

    button.enabled = false;
    expect(button.isDown).toBe(false);
    expect((button as any)._pointerId).toBeUndefined();

    button.enabled = true;
    (button as any).handlePointerDown({ pointerId: 2 });

    expect(onDown).toHaveBeenCalledTimes(2);
    expect(button.isDown).toBe(true);
  });

  it('clears press state on pointerupoutside while disabled and does not emit onUpOutside', () => {
    const button = makeButton();
    const onUpOutside = vi.fn();
    button.onUpOutside.connect(onUpOutside);

    // Arm a stale press, then disable without going through the enabled setter,
    // to exercise the handler's own cleanup path directly.
    button.isDown = true;
    (button as any)._pointerId = 1;
    (button as any)._enabled = false;

    (button as any).handlePointerUpOutside({ pointerId: 1 });

    expect(button.isDown).toBe(false);
    expect((button as any)._pointerId).toBeUndefined();
    expect(onUpOutside).not.toHaveBeenCalled();
  });

  it('removes the window pointerup listener on destroy', () => {
    const button = makeButton();
    (button as any).handlePointerDown({ pointerId: 1 });

    // Stub out the real mixin chain's destroy() (Focusable → Interactive →
    // WithSignals → Factory → real Pixi Container.destroy) so this test isolates
    // Button.destroy()'s own added cleanup without needing a fully-constructed
    // Container underneath.
    const superDestroy = vi
      .spyOn(Object.getPrototypeOf(Button.prototype), 'destroy')
      .mockImplementation(() => {});
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    button.destroy();

    expect(removeSpy).toHaveBeenCalledWith('pointerup', (button as any).handlePointerUpOutside);
    expect(superDestroy).toHaveBeenCalled();
    expect(button.isDown).toBe(false);
    expect((button as any)._pointerId).toBeUndefined();

    removeSpy.mockRestore();
    superDestroy.mockRestore();
  });

  it('does not click after a cancelled press (disabled then re-enabled)', () => {
    const button = makeButton();
    const onClick = vi.fn();
    button.onClick.connect(onClick);

    (button as any).handlePointerDown({ pointerId: 1 });
    button.enabled = false;
    button.enabled = true;

    (button as any).handleClick();

    expect(onClick).not.toHaveBeenCalled();
  });

  it('clicks normally after a press', () => {
    const button = makeButton();
    const onClick = vi.fn();
    button.onClick.connect(onClick);

    (button as any).handlePointerDown({ pointerId: 1 });
    (button as any).handleClick();

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('still clicks for a synthetic keyboard activation (no pointerId)', () => {
    const button = makeButton();
    const onClick = vi.fn();
    button.onClick.connect(onClick);

    // Mimics FocusManagerPlugin's synthetic pointerdown on Enter/Space keydown.
    (button as any).handlePointerDown({ type: 'pointerdown' });
    (button as any).handleClick();

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
