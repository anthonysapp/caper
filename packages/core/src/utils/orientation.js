/**
 * The one normalizer for `caper.config.ts`'s `orientation`, shared by the
 * runtime `orientation` plugin, the native CLI, `caper doctor` and the PWA
 * default. Plain ESM with a hand-written `orientation.d.ts` beside it, so the
 * Node CLI (`cli/`, `build/`) can import it without a TypeScript step. Keep it
 * dependency-free and free of browser globals.
 */

const LOCKS = ['portrait', 'landscape'];

/**
 * `orientation` as `{ lock, overlay }`, or `null` when unset. The string form is
 * shorthand for `{ lock }`; a missing `overlay` means the default overlay (`{}`).
 * Throws on anything else.
 *
 * @param {unknown} orientation
 */
export function resolveOrientation(orientation) {
  if (orientation === undefined || orientation === null) return null;
  if (typeof orientation === 'string') {
    if (!LOCKS.includes(orientation)) {
      throw new TypeError(`orientation must be 'portrait' or 'landscape' (got ${JSON.stringify(orientation)})`);
    }
    return { lock: orientation, overlay: {} };
  }
  if (typeof orientation === 'object' && !Array.isArray(orientation)) {
    const { lock, overlay } = orientation;
    if (!LOCKS.includes(lock)) {
      throw new TypeError(`orientation.lock must be 'portrait' or 'landscape' (got ${JSON.stringify(lock)})`);
    }
    if (overlay !== undefined && overlay !== false && (overlay === null || typeof overlay !== 'object')) {
      throw new TypeError(`orientation.overlay must be false or an object (got ${JSON.stringify(overlay)})`);
    }
    return { lock, overlay: overlay ?? {} };
  }
  throw new TypeError(`orientation must be 'portrait', 'landscape', or { lock, overlay? } (got ${JSON.stringify(orientation)})`);
}
