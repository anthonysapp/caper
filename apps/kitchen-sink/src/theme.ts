/**
 * Caper brand palette, mirrored from the `--caper-*` CSS custom properties
 * in `src/css/styles.css`. Import from here when you need a brand color
 * inside a PixiJS scene (fills, strokes, Text tints) so the canvas and the
 * HTML shell stay in lockstep.
 *
 * Values are `0x`-prefixed numbers (Pixi's native form). The matching hex
 * strings live in `styles.css`; keep both in sync on any change.
 */
export const CaperColors = {
  /** Primary olive — mid tone from the logo body. */
  olive: 0x6fa83a,
  /** Highlight olive — active states, wordmark accent, hover glows. */
  oliveHi: 0x8fc94b,
  /** Deep shadow olive — darker half of the logo, strokes under pressure. */
  oliveLo: 0x3b5e1c,

  /** App background — near-black with a warm green undertone. */
  ink: 0x0e1410,
  /** Sidebar + panel surface. */
  panel: 0x18201a,
  /** Raised surfaces, hover states, active nav item. */
  panel2: 0x222c23,
  /** Hairlines, dividers, 1px outlines. */
  line: 0x2e3a2f,

  /** Primary text — warm off-white. */
  text: 0xe8eee4,
  /** Secondary text — nav default, meta rows, captions. */
  textDim: 0x8a9588,

  /** Error / fail-loud surfaces. */
  danger: 0xe06b5a,
} as const;

export type CaperColorName = keyof typeof CaperColors;
