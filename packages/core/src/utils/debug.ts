import { Graphics, Text } from 'pixi.js';

// --- Color palette ---
export const DebugColors = {
  bounds: 0x00ffff, // cyan — container bounds
  innerBounds: 0x00ff00, // green — content/child bounds
  outerBounds: 0xff0000, // red — outer/padding bounds
  direction: 0xffff00, // yellow — flow direction indicators
  gap: 0xff00ff, // magenta — gap/spacing fills
  region: 0x0078ff, // blue — grid regions
} as const;

export const DebugAlpha = {
  stroke: 0.6,
  fill: 0.1,
  fillActive: 0.2,
  crosshair: 0.5,
} as const;

/**
 * Creates a Graphics object pre-configured for debug overlays.
 * Non-interactive, excluded from layout, labeled for identification.
 */
export function createDebugGraphics(label?: string): Graphics {
  const g = new Graphics();
  g.eventMode = 'none';
  g.interactiveChildren = false;
  g.layout = false;
  g.label = label ?? 'DebugGraphics';
  return g;
}

/**
 * Creates a small monospace Text label for debug overlays.
 * Dark stroke ensures readability over any background.
 */
export function createDebugLabel(text: string, color: number = DebugColors.bounds): Text {
  const label = new Text({
    text,
    style: {
      fontFamily: 'monospace',
      fontSize: 10,
      fill: color,
      stroke: { color: 0x000000, width: 2 },
    },
  });
  label.eventMode = 'none';
  label.layout = false;
  label.label = 'DebugLabel';
  return label;
}

// --- Registry ---
// Tracks active debug items. A future DebugPanel can iterate
// getDebugRegistry() to render a color → label legend.
type DebugEntry = { label: string; color: number };
const _registry = new Map<string, DebugEntry>();

export function registerDebug(id: string, label: string, color: number): void {
  _registry.set(id, { label, color });
}

export function unregisterDebug(id: string): void {
  _registry.delete(id);
}

export function getDebugRegistry(): ReadonlyMap<string, DebugEntry> {
  return _registry;
}
