import { caper } from '@caperjs/core/vite';
import { defineConfig } from 'vite';

/**
 * Caper contributes its plugins and its config defaults through `caper()`, and
 * only fills in what this file leaves unset — so anything you set here wins.
 *
 * Options:
 *   caper({ assets: { ... } })  AssetPack overrides, merged over caper's defaults
 *                               (`assets: false` turns the asset pipeline off)
 *   caper({ pwa: { manifest } }) makes the game installable, service worker included
 */
export default defineConfig({
  plugins: [caper()],
});
