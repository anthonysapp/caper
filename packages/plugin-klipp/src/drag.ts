type Pointer = { pointerId: number; global: { x: number; y: number } };
type Wheel = { deltaY: number };
type DragTarget = {
  on(name: string, listener: (event: any) => void): unknown;
  off(name: string, listener: (event: any) => void): unknown;
};

/** One pointer at a time; keep a completed drag visible through Pixi's following pointertap. */
export function createDrag(target: DragTarget, callbacks: { onDrag(dx: number, dy: number): void; onWheel(deltaY: number): void }) {
  let press: { id: number; startX: number; startY: number; x: number; y: number; moved: boolean } | null = null;
  const down = (event: Pointer) => {
    if (press) return;
    press = { id: event.pointerId, startX: event.global.x, startY: event.global.y,
      x: event.global.x, y: event.global.y, moved: false };
  };
  const move = (event: Pointer) => {
    if (!press || press.id !== event.pointerId) return;
    if (!press.moved && Math.hypot(event.global.x - press.startX, event.global.y - press.startY) < 6) return;
    const dx = event.global.x - press.x;
    const dy = event.global.y - press.y;
    press.moved = true;
    press.x = event.global.x;
    press.y = event.global.y;
    callbacks.onDrag(dx, dy);
  };
  const up = (event: Pointer) => {
    if (!press || press.id !== event.pointerId) return;
    const ended = press;
    queueMicrotask(() => {
      if (press === ended) press = null;
    });
  };
  const wheel = (event: Wheel) => callbacks.onWheel(event.deltaY);
  target.on('pointerdown', down);
  target.on('globalpointermove', move);
  target.on('pointerup', up);
  target.on('pointerupoutside', up);
  target.on('pointercancel', up);
  target.on('wheel', wheel);
  return {
    get dragging() { return press?.moved ?? false; },
    destroy() {
      target.off('pointerdown', down);
      target.off('globalpointermove', move);
      target.off('pointerup', up);
      target.off('pointerupoutside', up);
      target.off('pointercancel', up);
      target.off('wheel', wheel);
      press = null;
    },
  };
}
