// import { withPWA } from '@caper-engine/core/config/vite';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  resolve: {
    alias: {
      '@caper-engine/core': path.resolve(__dirname, '../../packages/core/src'),
      '@caper-engine/plugin-crunch': path.resolve(__dirname, '../../packages/plugin-crunch/src'),
      '@caper-engine/plugin-google-analytics': path.resolve(__dirname, '../../packages/plugin-google-analytics/src'),
      '@caper-engine/plugin-rive': path.resolve(__dirname, '../../packages/plugin-rive/src'),
      '@caper-engine/plugin-rollbar': path.resolve(__dirname, '../../packages/plugin-rollbar/src'),
      '@caper-engine/plugin-firebase': path.resolve(__dirname, '../../packages/plugin-firebase/src'),
    },
  },
});
