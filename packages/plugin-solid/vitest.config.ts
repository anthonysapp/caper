import { defineConfig } from 'vitest/config';

export default defineConfig({
  // solid-js ships a non-reactive `server` build under the `node` export
  // condition, which is what vitest would pick by default — signals would set
  // once and never update. Force the browser/development build and inline it so
  // these conditions actually apply (externalized deps are resolved by node).
  resolve: {
    conditions: ['development', 'browser'],
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
    globals: false,
    server: {
      deps: {
        inline: [/solid-js/],
      },
    },
  },
});
