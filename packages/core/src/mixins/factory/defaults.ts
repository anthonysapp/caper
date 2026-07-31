/**
 * Registration slot for the factory method table.
 *
 * This module deliberately has ZERO imports. `mixins/factory/const` builds the
 * table (and to do so imports every ui/display class), while `Factory()` — which
 * every one of those classes extends — needs the table at construct time. A
 * direct import either way closes the cycle and hands out an undefined binding
 * to whichever module is mid-evaluation. Routing through this import-free slot
 * breaks the edge: `const.ts` pushes the table in when it evaluates, `Factory`
 * pulls it out lazily, inside the constructor.
 */
let defaults: Record<string, any> | null = null;

/** Called by `mixins/factory/const` as soon as the table is defined. */
export function setDefaultFactoryMethods(methods: Record<string, any>): void {
  defaults = methods;
}

/** Read the registered table. Throws if `const.ts` has not evaluated yet. */
export function getDefaultFactoryMethods(): Record<string, any> {
  if (!defaults) {
    throw new Error(
      "[caper] The factory method table hasn't been initialized. Import '@caperjs/core' (or its factory module) " +
        'before deep-importing display/ui classes so the table is registered first.',
    );
  }
  return defaults;
}
