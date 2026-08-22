// The package compiles its own `.tsx` through the exact stack a consumer app is
// told to use — same `vite-plugin-solid` options, same `moduleName`. Dogfooding:
// if this configuration stops working, every app using `@caperjs/solid` breaks.
//
// Shared by `vite.config.ts` (the lib build) and `vitest.config.ts` (vitest runs
// on vite's transform pipeline, so it needs the same plugin).

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import solid from 'vite-plugin-solid';

const root = path.dirname(fileURLToPath(import.meta.url));

/** `vite-plugin-solid`, configured for the Pixi universal renderer. */
export function solidJsx() {
  return solid({
    include: ['**/*.tsx'],
    hot: false,
    solid: { generate: 'universal', moduleName: '@caperjs/solid' },
  });
}

/**
 * The runtime import babel inserts names the published package. Inside the
 * package itself that has to land on our own source, or the build would treat
 * `@caperjs/solid` as an external dependency of itself.
 */
export const selfAlias = {
  '@caperjs/solid': path.resolve(root, 'src/index.ts'),
};
