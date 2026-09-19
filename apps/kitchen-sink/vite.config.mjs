import { caper } from '@caperjs/core/vite';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [
    caper({
      // Kitchen-sink art is authored at 1x, so opt out of caper's retina-first
      // default resolutions (which treat sources as 2x and would render this art
      // at half size). This was .assetpack.mjs, which had to build its pipes at
      // import time and so could not see whether vite was doing a production
      // build — losing cache-busting and production compression with it.
      assets: { resolutions: { default: 1, low: 0.5 } },
      // Compiles `src/solid-demo/**/*.tsx` through `@caperjs/solid`'s universal
      // (Pixi) renderer.
      solid: true,
    }),
  ],
  resolve: {
    // Workspace source, not the built lib — these aliases are why the app picks
    // up framework edits without a rebuild. They merge with caper's own `@`
    // alias rather than replacing it.
    alias: {
      '@caperjs/core': path.resolve(__dirname, '../../packages/core/src'),
      '@caperjs/plugin-crunch': path.resolve(__dirname, '../../packages/plugin-crunch/src'),
      '@caperjs/plugin-google-analytics': path.resolve(__dirname, '../../packages/plugin-google-analytics/src'),
      '@caperjs/plugin-rive': path.resolve(__dirname, '../../packages/plugin-rive/src'),
      '@caperjs/plugin-rollbar': path.resolve(__dirname, '../../packages/plugin-rollbar/src'),
      '@caperjs/plugin-firebase': path.resolve(__dirname, '../../packages/plugin-firebase/src'),
      '@caperjs/plugin-tauri': path.resolve(__dirname, '../../packages/plugin-tauri/src'),
      // Also where babel-preset-solid's universal output imports its runtime
      // from. The `/jsx` subpath is types-only and `/vite` resolves in node
      // config context, so neither goes through this alias.
      '@caperjs/solid': path.resolve(__dirname, '../../packages/plugin-solid/src'),
    },
  },
});
