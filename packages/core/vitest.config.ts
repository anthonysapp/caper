import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    // `build/` is the Vite preset and its plugins — plain .mjs, tested here so a
    // config-level regression (the kind that shipped duplicate plugins) fails a
    // test rather than a downstream build.
    include: ['src/**/*.test.ts', 'build/**/*.test.mjs'],
    globals: false,
  },
});
