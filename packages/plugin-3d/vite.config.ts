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
      fileName: () => `caper-plugin-3d.mjs`,
    },
    rollupOptions: {
      // Caper, Pixi, and Pixi 3D are supplied by the consuming app.
      external: ['@caperjs/core', '@pixi/3d', 'pixi.js'],
    },
  },
  plugins: [dts()],
});
