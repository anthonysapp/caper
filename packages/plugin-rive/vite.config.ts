import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import path from 'path';

export default defineConfig({
  build: {
    outDir: './lib',
    sourcemap: true,
    lib: {
      formats: ['es'],
      entry: path.resolve(__dirname, 'src/index.ts'),
      fileName: () => `caper-plugin-rive.mjs`,
    },
    rollupOptions: {
      external: ['@caper-engine/core', 'pixi.js', '@rive-app/canvas-advanced-lite'], // External dependencies
    },
  },
  plugins: [dts()],
});
