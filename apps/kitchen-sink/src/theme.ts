/**
 * Caper brand palette, mirrored from the `--caper-*` CSS custom properties
 * in `src/css/styles.css`. Import from here when you need a brand color
 * inside a PixiJS scene (fills, strokes, Text tints) so the canvas and the
 * HTML shell stay in lockstep.
 *
 * Values are `0x`-prefixed numbers (Pixi's native form). The matching hex
 * strings live in `styles.css`; keep both in sync on any change.
 *
 * v2.1 — Pro-Retro Style Guide palette. Brighter Caper Green primary,
 * neutral charcoal chrome, Deep Coral accent for destructive/cancel.
 */
export const CaperColors = {
  /** Primary "Caper Green" — brighter, more saturated than v1 olive. */
  olive: 0xa4d65e,
  /** Highlight green — hover/active states, wordmark accent. */
  oliveHi: 0xb9e378,
  /** Deep shadow green — pressed state, stroke under pressure. */
  oliveLo: 0x4e7a23,

  /** App background — Deep Charcoal, warm but neutral. */
  ink: 0x1a1a1b,
  /** Panel/sidebar surface — slightly lighter than ink. */
  panel: 0x222224,
  /** Raised surfaces, hover states, active nav item. */
  panel2: 0x2b2b2d,
  /** Hairlines, dividers, 1px outlines — neutral grey. */
  line: 0x353537,

  /** Primary text — warm off-white. */
  text: 0xe8e8e6,
  /** Secondary text — nav default, meta rows, captions. */
  textDim: 0x888889,

  /** Deep Coral accent — cancel, destructive, secondary highlight. */
  coral: 0xf28b82,
  /** Coral hover tone. */
  coralHi: 0xf6a49d,
} as const;

export type CaperColorName = keyof typeof CaperColors;
