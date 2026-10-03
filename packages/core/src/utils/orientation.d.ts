/** The orientation a game is locked to. */
export type OrientationLock = 'portrait' | 'landscape';

/** `orientation.overlay` in `caper.config.ts`: restyle or replace the web "rotate your device" overlay. */
export interface OrientationOverlayOptions {
  /** Default: "Rotate your device" (portrait) / "Turn your device sideways" (landscape). */
  text?: string;
  /** CSS background. Default `#000`. */
  background?: string;
  /** CSS text color. Default `#fff`. */
  color?: string;
  /** CSS font family. Default: the system font. */
  fontFamily?: string;
  /** Class(es) added to the overlay so a game can style it with its own CSS. */
  className?: string;
  /** Build the whole overlay yourself; replaces the default element. Called once, when first shown. */
  element?: () => HTMLElement;
}

/**
 * `orientation` in `caper.config.ts`: a lock, or `{ lock, overlay }`. The string
 * form is shorthand for `{ lock }` with the default overlay. `overlay: false`
 * turns off the web overlay and its pause.
 */
export type OrientationConfig =
  | OrientationLock
  | {
      lock: OrientationLock;
      overlay?: false | OrientationOverlayOptions;
    };

/** `orientation` normalized by `resolveOrientation`. */
export interface ResolvedOrientation {
  lock: OrientationLock;
  /** `false` (no overlay, no pause) or the overlay options (`{}` for the default look). */
  overlay: false | OrientationOverlayOptions;
}

/**
 * `orientation` as `{ lock, overlay }`, or `null` when unset. The string form is
 * shorthand for `{ lock }`; a missing `overlay` means the default overlay (`{}`).
 * Throws a `TypeError` on anything else.
 */
export declare function resolveOrientation(orientation: unknown): ResolvedOrientation | null;
