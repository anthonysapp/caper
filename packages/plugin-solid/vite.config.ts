import path from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

import { selfAlias, solidJsx } from './jsxPlugin.mjs';

export default defineConfig({
  resolve: {
    alias: selfAlias,
  },
  build: {
    outDir: './lib',
    sourcemap: true,
    lib: {
      formats: ['es'],
      entry: path.resolve(__dirname, 'src/index.ts'),
      fileName: () => `caper-plugin-solid.mjs`,
    },
    rollupOptions: {
      external: ['pixi.js', 'gsap', 'solid-js', '@caperjs/core'], // External dependencies
    },
  },
  plugins: [solidJsx(), dts()],
});
