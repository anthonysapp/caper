// `@caperjs/solid/vite` — the build-time half of the package.
//
// Apps never import this directly: `caper({ solid: true })` in `@caperjs/core`'s
// Vite preset resolves it from the app's own `node_modules`. Shipping it here
// keeps the dependency arrow pointing one way — core knows the specifier, not
// the package.

import solid from 'vite-plugin-solid';

/**
 * `vite-plugin-solid`, configured for Caper's universal (Pixi) renderer.
 *
 * @param {{ include?: string[] }} [options] `include` overrides which files are
 *   compiled as JSX (default `['**\/*.tsx']`).
 * @returns {import('vite').PluginOption}
 */
export function caperSolid(options = {}) {
  return solid({
    include: options.include ?? ['**/*.tsx'],
    hot: false,
    solid: { generate: 'universal', moduleName: '@caperjs/solid' },
  });
}

export default caperSolid;
