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
      fileName: () => `caper-plugin-firebase.mjs`,
    },
    rollupOptions: {
      external: ['pixi.js', '@caper-engine/core', 'firebase/app', 'firebase/firestore'], // External dependencies
    },
  },
  plugins: [dts()],
});
