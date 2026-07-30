/**
 * The conventional source directories, in one place.
 *
 * These are a contract, not a preference: `internal/discovery.mjs` only crawls
 * these paths, so a project that puts its scenes elsewhere has no scenes as far
 * as caper is concerned. `defaults.mjs` derives its `optimizeDeps.entries` from
 * the same constant, so the dep scanner and the discovery crawl can never
 * disagree about where an app's code lives.
 *
 * Root-relative and POSIX-separated — callers `path.resolve(root, dir)`, and
 * vite's glob layer wants forward slashes on every platform.
 */
export const SOURCE_DIRS = {
  scenes: 'src/scenes',
  plugins: 'src/plugins',
  popups: 'src/popups',
  entities: 'src/entities',
  ui: 'src/ui',
  locales: 'src/locales',
};

/** The project's caper config, resolved the one way every plugin resolves it. */
export const CAPER_CONFIG_FILE = 'caper.config.ts';

/** The runtime entry `plugins/runtime.mjs` globs for. */
export const APP_ENTRY_FILE = 'src/main.ts';
