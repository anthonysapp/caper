// import { withPWA } from '@caperjs/core/config/vite';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  resolve: {
    alias: {
      '@caperjs/core': path.resolve(__dirname, '../../packages/core/src'),
      '@caperjs/plugin-crunch': path.resolve(__dirname, '../../packages/plugin-crunch/src'),
      '@caperjs/plugin-google-analytics': path.resolve(__dirname, '../../packages/plugin-google-analytics/src'),
      '@caperjs/plugin-rive': path.resolve(__dirname, '../../packages/plugin-rive/src'),
      '@caperjs/plugin-rollbar': path.resolve(__dirname, '../../packages/plugin-rollbar/src'),
      '@caperjs/plugin-firebase': path.resolve(__dirname, '../../packages/plugin-firebase/src'),
    },
  },
});
