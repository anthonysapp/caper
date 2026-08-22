import { defineConfig } from 'vitest/config';

import { selfAlias, solidJsx } from './jsxPlugin.mjs';

export default defineConfig({
  // solid-js ships a non-reactive `server` build under the `node` export
  // condition, which is what vitest would pick by default — signals would set
  // once and never update. Force the browser/development build and inline it so
  // these conditions actually apply (externalized deps are resolved by node).
  resolve: {
    conditions: ['development', 'browser'],
    alias: selfAlias,
  },
  plugins: [solidJsx()],
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    passWithNoTests: true,
    globals: false,
    server: {
      deps: {
        inline: [/solid-js/],
      },
    },
  },
});
