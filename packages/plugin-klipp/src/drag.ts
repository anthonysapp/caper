type Pointer = { pointerId: number; global: { x: number; y: number } };
type Wheel = { deltaY: number };
type DragTarget = {
  on(name: string, listener: (event: any) => void): unknown;
  off(name: string, listener: (event: any) => void): unknown;
};

/** The canvas. Pixi never forwards its `pointercancel` (a touch the browser took over), so it is heard here. */
type CancelSource = {
  addEventListener(name: 'pointercancel', listener: (event: { pointerId: number }) => void): unknown;
  removeEventListener(name: 'pointercancel', listener: (event: { pointerId: number }) => void): unknown;
};

type Press = { id: number; startX: number; startY: number; x: number; y: number; moved: boolean };

/** Keep a completed drag or pinch visible through Pixi's following pointertap. */
export function createDrag(target: DragTarget, callbacks: { onDrag(dx: number, dy: number): void; onPinch(delta: number): void; onWheel(deltaY: number): void }, canvas?: CancelSource) {
  let press: Press | null = null;
  let second: Press | null = null;
  let released = false;
  let release = 0;
  const down = (event: Pointer) => {
    if (second || press?.id === event.pointerId) return;
    const next = { id: event.pointerId, startX: event.global.x, startY: event.global.y,
      x: event.global.x, y: event.global.y, moved: false };
    if (press) second = next;
    else { press = next; released = false; release++; }
  };
  const move = (event: Pointer) => {
    if (!press) return;
    if (second) {
      const moved = press.id === event.pointerId ? press : second.id === event.pointerId ? second : null;
      if (!moved) return;
      const before = Math.hypot(press.x - second.x, press.y - second.y);
      moved.x = event.global.x;
      moved.y = event.global.y;
      callbacks.onPinch(Math.hypot(press.x - second.x, press.y - second.y) - before);
      return;
    }
    if (press.id !== event.pointerId) return;
    if (!press.moved && Math.hypot(event.global.x - press.startX, event.global.y - press.startY) < 6) return;
    const dx = event.global.x - press.x;
    const dy = event.global.y - press.y;
    press.moved = true;
    press.x = event.global.x;
    press.y = event.global.y;
    callbacks.onDrag(dx, dy);
  };
  const up = (event: { pointerId: number }) => {
    if (!press) return;
    if (second) {
      if (event.pointerId === press.id) press = second;
      else if (event.pointerId !== second.id) return;
      second = null;
      press.moved = true;
      press.startX = press.x;
      press.startY = press.y;
      return;
    }
    if (press.id !== event.pointerId) return;
    released = press.moved;
    press = null;
    const current = ++release;
    queueMicrotask(() => { if (release === current) released = false; });
  };
  const wheel = (event: Wheel) => callbacks.onWheel(event.deltaY);
  target.on('pointerdown', down);
  target.on('globalpointermove', move);
  target.on('pointerup', up);
  target.on('pointerupoutside', up);
  target.on('pointercancel', up);
  target.on('wheel', wheel);
  canvas?.addEventListener('pointercancel', up);
  return {
    get dragging() { return !!second || (press?.moved ?? false) || released; },
    destroy() {
      target.off('pointerdown', down);
      target.off('globalpointermove', move);
      target.off('pointerup', up);
      target.off('pointerupoutside', up);
      target.off('pointercancel', up);
      target.off('wheel', wheel);
      canvas?.removeEventListener('pointercancel', up);
      press = null;
      second = null;
      released = false;
      release++;
    },
  };
}
