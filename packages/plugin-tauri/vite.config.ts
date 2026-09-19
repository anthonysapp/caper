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
      fileName: () => `caper-plugin-tauri.mjs`,
    },
    rollupOptions: {
      // External dependencies. The @tauri-apps/* entries are only ever reached
      // through `await import(...)` behind an `isTauri` guard, so a web bundle
      // never executes them — but they must stay external either way.
      external: [
        '@caperjs/core',
        'pixi.js',
        '@tauri-apps/api/window',
        '@tauri-apps/api/event',
        '@tauri-apps/plugin-store',
      ],
    },
  },
  plugins: [dts()],
});
