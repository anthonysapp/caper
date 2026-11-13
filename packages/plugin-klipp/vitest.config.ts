import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // happy-dom: Pixi and @pixi/3d touch the DOM when imported
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
    globals: false,
  },
});
