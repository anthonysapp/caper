/**
 * The Vite settings caper contributes, expressed as *defaults* rather than
 * overrides.
 *
 * `caperDefaults(userConfig, env)` returns a partial config containing only what
 * the project left unset. That shape matters: Vite deep-merges a plugin's
 * returned partial *over* the existing config, so returning values
 * unconditionally would silently beat the project's own. Filling only the gaps
 * means the project always wins, which is the whole point of the preset.
 *
 * Three merge rules, applied by `fillMissing`:
 *
 *  - **Plain objects recurse.** A project that sets `server.port` keeps its port
 *    and still gets `host` and `open`.
 *  - **Arrays are always contributed.** Vite concatenates them, which is what we
 *    want: a project adding to `resolve.dedupe` must not silently drop pixi from
 *    it, or two copies of pixi split its global registries.
 *  - **Everything else fills only when absent**, including functions like
 *    `manualChunks`.
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * App identity for the `__CAPER_APP_*` defines and the PWA manifest skeleton.
 *
 * `npm_package_*` is only set when a package manager runs the script, so a bare
 * `vite build` from a shell used to bake `undefined` into the bundle. Fall back
 * to reading package.json, which is where the env vars came from anyway.
 */
export function readAppIdentity() {
  const fromEnv = {
    name: process.env.npm_package_name,
    version: process.env.npm_package_version,
    description: process.env.npm_package_description,
  };
  if (fromEnv.name && fromEnv.version && fromEnv.description) return fromEnv;

  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
    return {
      name: fromEnv.name ?? pkg.name,
      version: fromEnv.version ?? pkg.version,
      description: fromEnv.description ?? pkg.description,
    };
  } catch {
    return fromEnv;
  }
}

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * The subset of `defaults` that `target` does not already specify. Returns
 * `undefined` when there is nothing to contribute, so callers can omit the key
 * entirely rather than merging an empty object.
 */
export function fillMissing(target, defaults) {
  const out = {};

  for (const [key, value] of Object.entries(defaults)) {
    if (value === undefined) continue;

    const current = target?.[key];

    if (Array.isArray(value)) {
      // Vite concatenates arrays on merge — always contribute.
      out[key] = value;
      continue;
    }

    if (isPlainObject(value)) {
      const nested = fillMissing(isPlainObject(current) ? current : undefined, value);
      if (nested !== undefined) out[key] = nested;
      continue;
    }

    if (current === undefined) out[key] = value;
  }

  return Object.keys(out).length ? out : undefined;
}

/**
 * Caper's own values, before any gap-filling.
 *
 * `root` is the project root vite will use — taken from the project's own config
 * when it sets one, so the `@` alias follows `vite --root somewhere/else`. It is
 * resolved here rather than at module load, which is what a module-level
 * `process.cwd()` would have baked in.
 */
export function caperDefaultValues(env, userConfig = {}) {
  const isServe = env.command === 'serve';
  const app = readAppIdentity();
  const root = userConfig.root ? path.resolve(userConfig.root) : process.cwd();

  return {
    cacheDir: '.cache',
    logLevel: 'info',
    publicDir: './public',
    // Dev serves from root; builds emit relative URLs so a bundle can be hosted
    // from a subdirectory.
    base: isServe ? '/' : './',
    server: {
      port: 3000,
      host: true,
      open: true,
    },
    preview: {
      host: true,
      port: 8080,
    },
    build: {
      sourcemap: env.mode === 'development',
      rolldownOptions: {
        external: ['caper-globals'],
        output: {
          // Rolldown requires manualChunks as a function (Rollup allowed an object).
          manualChunks(id) {
            if (id.includes('node_modules/gsap/')) return 'gsap';
          },
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(root, './src'),
      },
      // Force a single instance of each singleton lib. pixi keeps global
      // registries (extensions, TextureSource cache, Ticker.shared) and relies on
      // instanceof; two copies (via linked/transitive installs) split its state.
      dedupe: ['pixi.js', 'gsap', '@pixi/sound'],
    },
    // Don't prebundle @pixi/ui: esbuild inlines its own copy of pixi.js into the
    // dep chunk, giving two pixi instances — every cross-boundary
    // `instanceof Texture/Sprite` then fails. Served as source, its
    // `import "pixi.js"` resolves to the same optimized pixi as the app. Its
    // nested typed-signals dep (CJS) still needs prebundling for interop.
    optimizeDeps: {
      exclude: ['@pixi/ui'],
      include: ['@pixi/ui > typed-signals'],
    },
    define: {
      __CAPER_APP_NAME: JSON.stringify(app.name),
      __CAPER_APP_VERSION: JSON.stringify(app.version),
    },
  };
}

/** The partial config caper contributes for this project and command. */
export function caperDefaults(userConfig, env) {
  return fillMissing(userConfig, caperDefaultValues(env, userConfig)) ?? {};
}
