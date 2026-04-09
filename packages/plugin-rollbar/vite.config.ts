import path from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    outDir: './lib',
    sourcemap: true,
    lib: {
      formats: ['es'],
      entry: path.resolve(__dirname, 'src/index.ts'),
      fileName: () => `caper-plugin-rollbar.mjs`,
    },
    rollupOptions: {
      external: ['@caper/core', 'pixi.js', 'rollbar'], // External dependencies
    },
  },
  plugins: [dts()],
});
