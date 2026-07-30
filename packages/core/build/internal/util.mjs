/**
 * Small shared pieces for caper's build plugins: the logger they all report
 * through, and two timing helpers used by the file watchers.
 *
 * `cwd` is read once at module load, which is fine for what uses it (logging and
 * relative-path trimming) but not for anything that resolves project files —
 * those take vite's resolved `root` instead. See `build/defaults.mjs`.
 */
import process from 'node:process';
import { createLogger } from 'vite';

export const env = process.env.NODE_ENV;
export const cwd = process.cwd();

export const logger = createLogger('caper-config');

export const DTS_FILE_NAME = 'caper-app.d.ts';
export const ASSET_DTS_FILE_NAME = 'caper-assets.d.ts';

export const debounce = (func, wait) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
};

export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Function to generate TypeScript types from the manifest
