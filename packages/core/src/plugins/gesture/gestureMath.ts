/**
 * Pure multi-touch gesture math — centroid, spread and frame-to-frame deltas.
 * No Pixi/caper imports so it stays trivially unit-testable.
 */

export interface PointerSample {
  id: number;
  x: number;
  y: number;
}

export interface GestureFrame {
  centerX: number;
  centerY: number;
  /** Mean distance from the centroid across all tracked pointers. */
  spread: number;
}

/** Below this, `frameDelta` treats the previous spread as unusable and returns `scale: 1`. */
const SPREAD_EPSILON = 0.01;

/**
 * Centroid and mean radial spread of a set of pointers. For two pointers,
 * `spread` is half the pair distance; since only the *ratio* between two
 * frames is ever used, this generalises to 3+ fingers for free.
 */
export function computeFrame(pointers: PointerSample[]): GestureFrame {
  const count = pointers.length;
  if (count === 0) return { centerX: 0, centerY: 0, spread: 0 };

  let sumX = 0;
  let sumY = 0;
  for (const p of pointers) {
    sumX += p.x;
    sumY += p.y;
  }
  const centerX = sumX / count;
  const centerY = sumY / count;

  let sumDist = 0;
  for (const p of pointers) {
    sumDist += Math.hypot(p.x - centerX, p.y - centerY);
  }
  const spread = sumDist / count;

  return { centerX, centerY, spread };
}

/**
 * Centroid translation and spread ratio between two frames. `scale` is
 * guarded to `1` when `prev.spread` is too small to divide by, so a
 * near-zero starting spread can't produce a huge or infinite jump.
 */
export function frameDelta(prev: GestureFrame, next: GestureFrame): { dx: number; dy: number; scale: number } {
  const dx = next.centerX - prev.centerX;
  const dy = next.centerY - prev.centerY;
  const scale = prev.spread < SPREAD_EPSILON ? 1 : next.spread / prev.spread;
  return { dx, dy, scale };
}
