import { describe, expect, it, vi } from 'vitest';
import { createDrag } from './drag';

function target() {
  const listeners = new Map<string, (event: any) => void>();
  return {
    listeners,
    on(name: string, listener: (event: any) => void) { listeners.set(name, listener); },
    off(name: string) { listeners.delete(name); },
    emit(name: string, event: any) { listeners.get(name)?.(event); },
  };
}

const pointer = (pointerId: number, x: number, y: number) => ({ pointerId, global: { x, y } });

describe('createDrag', () => {
  it('waits for 6 pixels, tracks one pointer, and keeps dragging through pointertap dispatch', async () => {
    const view = target();
    const onDrag = vi.fn();
    const drag = createDrag(view, { onDrag, onWheel: vi.fn(), onPinch: vi.fn() });
    view.emit('pointerdown', pointer(1, 0, 0));
    view.emit('globalpointermove', pointer(2, 100, 100));
    view.emit('globalpointermove', pointer(1, 3, 4));
    expect(drag.dragging).toBe(false);
    expect(onDrag).not.toHaveBeenCalled();
    view.emit('globalpointermove', pointer(1, 6, 0));
    expect(onDrag).toHaveBeenCalledWith(6, 0);
    view.emit('globalpointermove', pointer(1, 9, 2));
    expect(onDrag).toHaveBeenLastCalledWith(3, 2);
    expect(drag.dragging).toBe(true);
    view.emit('pointerup', pointer(1, 9, 2));
    expect(drag.dragging).toBe(true);
    await Promise.resolve();
    expect(drag.dragging).toBe(false);
    drag.destroy();
    expect(view.listeners.size).toBe(0);
  });

  it('reports wheel and removes all six listeners', () => {
    const view = target();
    const onWheel = vi.fn();
    const drag = createDrag(view, { onDrag: vi.fn(), onWheel, onPinch: vi.fn() });
    expect(view.listeners.size).toBe(6);
    view.emit('wheel', { deltaY: 250 });
    expect(onWheel).toHaveBeenCalledWith(250);
    view.emit('pointerdown', pointer(1, 0, 0));
    view.emit('pointerupoutside', pointer(1, 0, 0));
    drag.destroy();
    expect(view.listeners.size).toBe(0);
  });

  it('frees the press on pointercancel so the next press can drag', async () => {
    const view = target();
    const onDrag = vi.fn();
    createDrag(view, { onDrag, onWheel: vi.fn(), onPinch: vi.fn() });
    view.emit('pointerdown', pointer(1, 0, 0));
    view.emit('pointercancel', pointer(1, 0, 0));
    await Promise.resolve();
    view.emit('pointerdown', pointer(2, 0, 0));
    view.emit('globalpointermove', pointer(2, 10, 0));
    expect(onDrag).toHaveBeenCalledWith(10, 0);
  });

  it('pinches apart and together without orbiting, ignores a third pointer, and stays dragging through release', async () => {
    const view = target();
    const onDrag = vi.fn();
    const onPinch = vi.fn();
    const drag = createDrag(view, { onDrag, onPinch, onWheel: vi.fn() });
    view.emit('pointerdown', pointer(1, 0, 0));
    view.emit('pointerdown', pointer(2, 10, 0));
    view.emit('pointerdown', pointer(3, 20, 0));
    expect(drag.dragging).toBe(true);
    view.emit('globalpointermove', pointer(3, 100, 0));
    view.emit('globalpointermove', pointer(2, 20, 0));
    view.emit('globalpointermove', pointer(1, 5, 0));
    expect(onPinch.mock.calls).toEqual([[10], [-5]]);
    expect(onDrag).not.toHaveBeenCalled();
    view.emit('pointerup', pointer(2, 20, 0));
    view.emit('pointerup', pointer(1, 5, 0));
    expect(drag.dragging).toBe(true);
    await Promise.resolve();
    expect(drag.dragging).toBe(false);
    drag.destroy();
    expect(view.listeners.size).toBe(0);
  });

  it('resets the remaining pointer baseline after a pinch and starts the next press at the threshold', async () => {
    const view = target();
    const onDrag = vi.fn();
    const onPinch = vi.fn();
    const drag = createDrag(view, { onDrag, onPinch, onWheel: vi.fn() });
    view.emit('pointerdown', pointer(1, 0, 0));
    view.emit('pointerdown', pointer(2, 10, 0));
    view.emit('globalpointermove', pointer(1, 4, 0));
    view.emit('pointercancel', pointer(2, 10, 0));
    view.emit('globalpointermove', pointer(1, 6, 0));
    expect(onDrag).toHaveBeenCalledExactlyOnceWith(2, 0);
    view.emit('pointercancel', pointer(1, 6, 0));
    expect(drag.dragging).toBe(true);
    await Promise.resolve();
    expect(drag.dragging).toBe(false);
    view.emit('pointerdown', pointer(4, 0, 0));
    view.emit('globalpointermove', pointer(4, 3, 0));
    expect(onDrag).toHaveBeenCalledTimes(1);
    view.emit('globalpointermove', pointer(4, 6, 0));
    expect(onDrag).toHaveBeenLastCalledWith(6, 0);
    drag.destroy();
  });

  it('ends a press from the canvas pointercancel, which Pixi does not forward to the view', async () => {
    const view = target();
    const canvas = target();
    const onDrag = vi.fn();
    const onPinch = vi.fn();
    const drag = createDrag(view, { onDrag, onPinch, onWheel: vi.fn() }, { addEventListener: canvas.on, removeEventListener: canvas.off });
    view.emit('pointerdown', pointer(1, 0, 0));
    view.emit('pointerdown', pointer(2, 10, 0));
    canvas.emit('pointercancel', { pointerId: 2 });
    canvas.emit('pointercancel', { pointerId: 1 });
    await Promise.resolve();
    expect(drag.dragging).toBe(false);
    view.emit('pointerdown', pointer(3, 0, 0));
    view.emit('globalpointermove', pointer(3, 10, 0));
    expect(onPinch).not.toHaveBeenCalled();
    expect(onDrag).toHaveBeenCalledWith(10, 0);
    drag.destroy();
    expect(canvas.listeners.size).toBe(0);
  });
});
