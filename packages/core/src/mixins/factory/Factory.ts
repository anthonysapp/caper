import { Container as PIXIContainer } from 'pixi.js';
// Type-only: `typeof defaultFactoryMethods` is erased at compile time, so this
// import adds no runtime edge back into the table (which imports every ui and
// display class, all of which extend this mixin). The value is read lazily,
// inside the constructor, via the import-free registration slot in ./defaults.
import type { defaultFactoryMethods } from './const';
import { getDefaultFactoryMethods } from './defaults';
import { createFactoryMethods } from './methods';

export interface IFactory<T extends typeof defaultFactoryMethods = typeof defaultFactoryMethods> extends PIXIContainer {
  add: T;
  make: T;
}

export function Factory<T extends typeof defaultFactoryMethods = typeof defaultFactoryMethods>(
  extensions?: Partial<T>,
): new () => IFactory<T> {
  return class ExtendedContainer extends PIXIContainer implements IFactory<T> {
    add: T;
    make: T;

    constructor() {
      super();
      // Merge into a copy — assigning into the shared table would leak this
      // class's extensions into every other Factory() in the app.
      extensions = Object.assign({}, getDefaultFactoryMethods(), extensions);
      this.make = createFactoryMethods(extensions, this, false);
      this.add = createFactoryMethods(extensions, this, true);
    }
  };
}
