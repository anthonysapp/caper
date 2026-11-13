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
/**
 * Plugin methods added to every factory. Augment from a plugin with:
 *
 * declare module '@caperjs/core' {
 *   interface FactoryMethodOverrides { view3d: (props?: View3DProps) => View3D; }
 * }
 */
export interface FactoryMethodOverrides {}

let builtIns: Record<string, any> | null = null;
const contributed: Record<string, (...args: any[]) => any> = {};
let merged: Record<string, any> | null = null;

/** Called by `mixins/factory/const` as soon as the table is defined. */
export function setDefaultFactoryMethods(methods: Record<string, any>): void {
  builtIns = methods;
  merged = null;
}

/** Read the registered table. Throws if `const.ts` has not evaluated yet. */
export function getDefaultFactoryMethods(): Record<string, any> {
  if (!builtIns) {
    throw new Error(
      "[caper] The factory method table hasn't been initialized. Import '@caperjs/core' (or its factory module) " +
        'before deep-importing display/ui classes so the table is registered first.',
    );
  }
  if (!merged) merged = Object.assign({}, builtIns, contributed);
  return merged;
}

/** Register plugin methods, returning a disposer for this call's additions. */
export function registerFactoryMethods(methods: Partial<FactoryMethodOverrides>): () => void {
  getDefaultFactoryMethods();
  const entries = Object.entries(methods) as Array<[string, (...args: any[]) => any]>;
  for (const [name, method] of entries) {
    if (Object.hasOwn(builtIns!, name)) {
      throw new Error(`[caper] registerFactoryMethods: "${name}" is a built-in factory method and cannot be replaced. Pick another name.`);
    }
    if (typeof method !== 'function') {
      throw new Error(`[caper] registerFactoryMethods: "${name}" must be a function.`);
    }
    if (Object.hasOwn(contributed, name) && contributed[name] !== method) {
      throw new Error(`[caper] registerFactoryMethods: "${name}" is already registered by an earlier registerFactoryMethods() call. Each factory method name can be registered once.`);
    }
  }

  const added = entries.filter(([name]) => !Object.hasOwn(contributed, name));
  for (const [name, method] of added) contributed[name] = method;
  if (added.length > 0) merged = null;

  return () => {
    let changed = false;
    for (const [name, method] of added) {
      if (contributed[name] === method) {
        delete contributed[name];
        changed = true;
      }
    }
    if (changed) merged = null;
  };
}
