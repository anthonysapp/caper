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
      fileName: () => `caper-plugin-klipp.mjs`,
    },
    rollupOptions: {
      // Caper, the 3D plugin, Pixi, Pixi 3D and klipp are supplied by the consuming app.
      external: ['@caperjs/core', '@caperjs/plugin-3d', '@pixi/3d', '@pmndrs/klipp', 'pixi.js'],
    },
  },
  plugins: [dts()],
});
