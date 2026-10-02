import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // the plugin listens on `document` and falls back to `localStorage` off-native
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
    globals: false,
  },
});
