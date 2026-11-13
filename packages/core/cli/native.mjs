import { bold, cyan, dim, green, red, yellow } from 'kleur/colors';

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { resolveOrientation } from '../src/utils/orientation.js';

/**
 * `caper native init` — one-shot Tauri v2 scaffolding for a Caper app: adds
 * `@tauri-apps/cli`, runs `tauri init --ci` with a pinned identifier/port,
 * then patches the generated `tauri.conf.json` and the app's own
 * `package.json` scripts. `caper` does not wrap `tauri dev` / `tauri build`
 * (same rule as `dev`/`build` in `cli.mjs`); it wraps only the Android and iOS
 * ones (`caper native android|ios dev|build`), because their environment
 * (NDK_HOME, JAVA_HOME, a rustup-first PATH, pnpm detection for Xcode's build
 * script) is the hard part.
 */

const IDENTIFIER_RE = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*)+$/;
const PLACEHOLDER_IDENTIFIER = 'com.tauri.dev';
const DEFAULT_IDENTIFIER_PREFIX = 'dev.caper.';

/** A window/app title from a package name: strip an npm scope, split on `-`/`_`/`.`, capitalize each word. */
export function displayTitle(packageName) {
  return String(packageName ?? '')
    .replace(/^@[^/]+\//, '')
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

/** Strip an npm scope, lowercase, collapse non `[a-z0-9]` runs to `-`, trim `-`. */
export function appSlug(packageName) {
  return String(packageName ?? '')
    .replace(/^@[^/]+\//, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** `dev.caper.<slug>`, guaranteed to satisfy `isValidIdentifier`. */
export function defaultIdentifier(slug) {
  let segment = String(slug ?? '')
    .toLowerCase()
    // No hyphens: Apple allows them, but the same identifier becomes the Android
    // (Java) package name, where they are illegal.
    .replace(/[^a-z0-9]+/g, '')
    .replace(/^[^a-z]+/, ''); // the segment itself must start with a letter
  if (!segment) segment = 'app';
  return `${DEFAULT_IDENTIFIER_PREFIX}${segment}`;
}

/** Reverse-DNS shape Tauri requires, rejecting its own placeholder identifier. */
export function isValidIdentifier(identifier) {
  return typeof identifier === 'string' && identifier !== PLACEHOLDER_IDENTIFIER && IDENTIFIER_RE.test(identifier);
}

function hashSlug(slug) {
  let hash = 0;
  for (const ch of String(slug ?? '')) {
    hash = (hash * 31 + ch.codePointAt(0)) | 0;
  }
  return Math.abs(hash);
}

/** Stable integer in 3100-3999 derived from `slug`; never 3000. */
export function defaultPort(slug) {
  return 3100 + (hashSlug(slug) % 900);
}

/** Validate a user-supplied `--port`: an integer between 1024 and 65535. */
export function parsePort(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1024 || n > 65535) {
    throw new Error(`--port must be an integer between 1024 and 65535 (got ${JSON.stringify(raw)})`);
  }
  return n;
}

const LOCKFILES = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lockb', 'bun'],
  ['package-lock.json', 'npm'],
];

/** `'pnpm' | 'yarn' | 'bun' | 'npm'` by lockfile, walking up to the workspace root. */
export function packageManagerFor(dir) {
  let current = path.resolve(dir);
  for (;;) {
    for (const [file, pm] of LOCKFILES) {
      if (fs.existsSync(path.join(current, file))) return pm;
    }
    const parent = path.dirname(current);
    if (parent === current) return 'npm';
    current = parent;
  }
}

// Package manager used to exec a locally-installed bin (`vite`, `tauri`, …)
// without a run/exec subcommand of its own.
const EXEC_RUNNER = { pnpm: 'pnpm', yarn: 'yarn', bun: 'bunx', npm: 'npx' };

/** `{ dev, build, addDev }` argv builders for `pm`, pinning `vite`'s dev port. */
export function commandsFor(pm, port) {
  const dev = { cmd: EXEC_RUNNER[pm], args: ['vite', '--port', String(port)] };

  // A bare `vite build`, deliberately NOT the app's own `build` script. Those
  // scripts often clean first (kitchen-sink's did: `rimraf dist .assetpack .cache`),
  // and `.cache` is Vite's dev dep cache: a native build wiped it out from under a
  // running dev server, which then 504'd every pre-bundled dependency. Nothing
  // needs cleaning any more — Vite empties `dist`, and the assetpack output
  // marker handles a dev/production switch. An app with extra build steps edits
  // `build.beforeBuildCommand` in `src-tauri/tauri.conf.json`.
  const build = { cmd: EXEC_RUNNER[pm], args: ['vite', 'build'] };

  const addDev = (pkg) => ({
    cmd: pm,
    args: pm === 'npm' ? ['install', '-D', pkg] : ['add', '-D', pkg],
  });

  const add = (...pkgs) => ({
    cmd: pm,
    args: pm === 'npm' ? ['install', ...pkgs] : ['add', ...pkgs],
  });

  return { dev, build, addDev, add };
}

function renderCommand({ cmd, args }) {
  return [cmd, ...args].join(' ');
}

/** The `caper.config.ts` orientation values, and the `android:screenOrientation` each one becomes. */
export const ANDROID_SCREEN_ORIENTATION = Object.freeze({ portrait: 'portrait', landscape: 'sensorLandscape' });

/** The default injectable `loadConfig`: the subset of `caper.config.ts` the native commands read. */
async function defaultLoadConfig(cwd) {
  // Imported lazily: build/ pulls in the oxc parser and vite, which only these commands need.
  const { readConfigOrientation } = await import('../build/internal/buildFlags.mjs');
  return { orientation: readConfigOrientation(cwd) };
}

/**
 * The orientation lock from `caper.config.ts` through `loadConfig` (either form
 * of `orientation`, normalized by `resolveOrientation`), or a warning when it
 * can't be read: a broken or unusual config must never stop a native command.
 *
 * @returns {Promise<{ orientation?: 'portrait' | 'landscape', warning?: string }>}
 */
export async function readOrientation(cwd, loadConfig = defaultLoadConfig) {
  try {
    return { orientation: resolveOrientation((await loadConfig(cwd))?.orientation)?.lock };
  } catch (err) {
    return { warning: `could not read caper.config.ts orientation (${err.message}), so orientation was skipped.` };
  }
}

/** Returns a new tauri.conf.json: sets `identifier` and window 0's title/size; leaves the rest untouched. */
export function patchTauriConfig(conf, { identifier, title, orientation }) {
  const windows = Array.isArray(conf.app?.windows) ? [...conf.app.windows] : [];
  // 450x800 keeps a portrait window, title bar included, on a 13" laptop screen.
  const size = orientation === 'portrait' ? { width: 450, height: 800 } : { width: 1280, height: 720 };
  windows[0] = { ...(windows[0] ?? {}), title, ...size };

  return {
    ...conf,
    identifier,
    app: {
      ...conf.app,
      windows,
    },
  };
}

/** Returns a new package.json: adds `native:dev`/`native:build` scripts only where absent. */
export function patchPackageScripts(pkg) {
  const scripts = { ...(pkg.scripts ?? {}) };
  if (!('native:dev' in scripts)) scripts['native:dev'] = 'tauri dev';
  if (!('native:build' in scripts)) scripts['native:build'] = 'tauri build';
  return { ...pkg, scripts };
}

/**
 * Window permissions `@caperjs/plugin-tauri` needs in `src-tauri/capabilities/default.json`
 * (native fullscreen + quit). `tauri add store` handles the store plugin's own permission.
 */
export const TAURI_PLUGIN_PERMISSIONS = Object.freeze([
  'core:window:allow-set-fullscreen',
  'core:window:allow-is-fullscreen',
  'core:window:allow-close',
]);

/** Returns a new capabilities object with each of `permissions` missing from `capabilities.permissions` appended; object-form entries and order are untouched. */
export function patchCapabilities(capabilities, permissions) {
  const existing = Array.isArray(capabilities.permissions) ? [...capabilities.permissions] : [];
  const existingStrings = new Set(existing.filter((p) => typeof p === 'string'));
  const missing = permissions.filter((p) => !existingStrings.has(p));

  return {
    ...capabilities,
    permissions: [...existing, ...missing],
  };
}

/** The subset of `names` present in neither `pkg.dependencies` nor `pkg.devDependencies`. */
export function missingDeps(pkg, names) {
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  return names.filter((name) => !(name in deps));
}

/** The default injectable `run`: a synchronous, inherited-stdio child process that throws on non-zero exit. */
export function defaultRun(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw Object.assign(new Error(`${cmd} ${args.join(' ')} exited with code ${result.status}`), { status: result.status });
  }
  return result;
}

function detectIndent(raw) {
  const match = raw.match(/\n([ \t]+)\S/);
  return match ? match[1] : 2;
}

function writeJson(file, data, indent) {
  const trailingNewline = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8').endsWith('\n') : true;
  fs.writeFileSync(file, JSON.stringify(data, null, indent) + (trailingNewline ? '\n' : ''), 'utf-8');
}

/**
 * The I/O core of `caper native init`. No console output — the CLI wrapper
 * below owns presentation. Every external command goes through `run` so
 * tests can stub it.
 *
 * @param {string} cwd
 * @param {{ identifier?: string, port?: number, icon?: string }} [opts]
 * @param {{ run?: typeof defaultRun, loadConfig?: typeof defaultLoadConfig }} [deps]
 */
export async function initNative(cwd, opts = {}, { run = defaultRun, loadConfig = defaultLoadConfig } = {}) {
  const pkgPath = path.join(cwd, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    throw new Error('no package.json found in this directory.');
  }
  const pkgRaw = fs.readFileSync(pkgPath, 'utf-8');
  const pkg = JSON.parse(pkgRaw);

  const srcTauriDir = path.join(cwd, 'src-tauri');
  if (fs.existsSync(srcTauriDir)) {
    return { status: 'already-initialized' };
  }

  // `readAppIdentity` (build/defaults.mjs) prefers `npm_package_*` env vars,
  // which correctly reflect the *app* when a preset runs as its build script
  // but not here — `caper native init` isn't invoked that way, and those env
  // vars can instead reflect an unrelated ancestor process (e.g. a monorepo
  // task runner). Read the name straight from the package.json we already have.
  const name = pkg.name ?? 'app';
  const title = opts.title ?? displayTitle(name);
  const slug = appSlug(pkg.name ?? name);

  const identifier = opts.identifier ?? defaultIdentifier(slug);
  if (!isValidIdentifier(identifier)) {
    throw new Error(
      `"${identifier}" is not a valid identifier. Expected a reverse-DNS shape like "dev.caper.my-game", not "${PLACEHOLDER_IDENTIFIER}".`,
    );
  }

  const port = opts.port !== undefined ? parsePort(opts.port) : defaultPort(slug);
  const pm = packageManagerFor(cwd);
  const { dev, build, addDev } = commandsFor(pm, port);

  const appDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (!appDeps['@tauri-apps/cli']) {
    const { cmd, args } = addDev('@tauri-apps/cli@^2');
    run(cmd, args, { cwd });
  }

  const initArgs = [
    'tauri',
    'init',
    '--ci',
    '--app-name',
    title,
    '--window-title',
    title,
    '--frontend-dist',
    '../dist',
    '--dev-url',
    `http://localhost:${port}`,
    '--before-dev-command',
    renderCommand(dev),
    '--before-build-command',
    renderCommand(build),
  ];
  run(EXEC_RUNNER[pm], initArgs, { cwd });

  const warnings = [];
  const { orientation, warning } = await readOrientation(cwd, loadConfig);
  if (warning) warnings.push(warning);

  const tauriConfPath = path.join(srcTauriDir, 'tauri.conf.json');
  const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf-8'));
  writeJson(tauriConfPath, patchTauriConfig(tauriConf, { identifier, title, orientation }), 2);

  // Re-read: the package manager rewrote package.json when it added @tauri-apps/cli,
  // and patching the copy read above would silently drop that devDependency.
  const freshPkgRaw = fs.readFileSync(pkgPath, 'utf-8');
  writeJson(pkgPath, patchPackageScripts(JSON.parse(freshPkgRaw)), detectIndent(freshPkgRaw));

  if (opts.icon) {
    run(EXEC_RUNNER[pm], ['tauri', 'icon', opts.icon], { cwd });
  }

  return { status: 'ok', name, title, identifier, port, pm, orientation, warnings };
}

/**
 * The I/O core of `caper native plugin` — wires an already-`native init`'d app
 * up for `@caperjs/plugin-tauri`: adds its JS deps, runs `tauri add store`
 * (Rust crate + registration + permission + `@tauri-apps/plugin-store`), and
 * patches in the window permissions the plugin needs. No console output — the
 * CLI wrapper below owns presentation. Idempotent: a second run makes zero
 * `run` calls and zero writes.
 *
 * @param {string} cwd
 * @param {object} [opts] unused today; kept for symmetry with `initNative`
 * @param {{ run?: typeof defaultRun }} [deps]
 */
export async function addNativePlugin(cwd, opts = {}, { run = defaultRun } = {}) {
  const pkgPath = path.join(cwd, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    throw new Error('no package.json found in this directory.');
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

  const srcTauriDir = path.join(cwd, 'src-tauri');
  const tauriConfPath = path.join(srcTauriDir, 'tauri.conf.json');
  if (!fs.existsSync(srcTauriDir) || !fs.existsSync(tauriConfPath)) {
    throw new Error('no src-tauri/ found — run `caper native init` first.');
  }

  const pm = packageManagerFor(cwd);
  const { add } = commandsFor(pm, 0);

  const addedDeps = missingDeps(pkg, ['@caperjs/plugin-tauri', '@tauri-apps/api']);
  if (addedDeps.length) {
    const specs = addedDeps.map((name) => (name === '@tauri-apps/api' ? `${name}@^2` : name));
    const { cmd, args } = add(...specs);
    run(cmd, args, { cwd });
  }

  const cargoTomlPath = path.join(srcTauriDir, 'Cargo.toml');
  const cargoToml = fs.existsSync(cargoTomlPath) ? fs.readFileSync(cargoTomlPath, 'utf-8') : '';
  const ranTauriAddStore = !cargoToml.includes('tauri-plugin-store');
  if (ranTauriAddStore) {
    run(EXEC_RUNNER[pm], ['tauri', 'add', 'store'], { cwd });
  }

  const capabilitiesPath = path.join(srcTauriDir, 'capabilities/default.json');
  if (!fs.existsSync(capabilitiesPath)) {
    throw new Error(`src-tauri/capabilities/default.json is missing.`);
  }
  const capabilitiesRaw = fs.readFileSync(capabilitiesPath, 'utf-8');
  let capabilities;
  try {
    capabilities = JSON.parse(capabilitiesRaw);
  } catch {
    throw new Error('src-tauri/capabilities/default.json is not valid JSON.');
  }
  const patched = patchCapabilities(capabilities, TAURI_PLUGIN_PERMISSIONS);
  const capabilitiesChanged = JSON.stringify(patched) !== JSON.stringify(capabilities);
  if (capabilitiesChanged) {
    writeJson(capabilitiesPath, patched, 2);
  }

  return {
    status: 'ok',
    changed: addedDeps.length > 0 || ranTauriAddStore || capabilitiesChanged,
    addedDeps,
    ranTauriAddStore,
    capabilitiesChanged,
  };
}

/** Rust targets `tauri android` builds for. */
export const ANDROID_RUST_TARGETS = Object.freeze([
  'aarch64-linux-android',
  'armv7-linux-androideabi',
  'i686-linux-android',
  'x86_64-linux-android',
]);

const MAC_ANDROID_SDK = 'Library/Android/sdk';
const MAC_STUDIO_JBR = '/Applications/Android Studio.app/Contents/jbr/Contents/Home';
const HOMEBREW_RUSTUP_BIN = '/opt/homebrew/opt/rustup/bin';
const HOMEBREW_BIN = '/opt/homebrew/bin';

function compareDottedVersions(a, b) {
  const ap = a.split('.').map(Number);
  const bp = b.split('.').map(Number);
  for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
    const diff = (ap[i] ?? 0) - (bp[i] ?? 0);
    if (diff) return diff;
  }
  return 0;
}

/**
 * Where `rustup` is on `pathDirs`, and whether Homebrew's plain `rust` formula wins `rustc`.
 * A rustc in /opt/homebrew/bin is always that formula: rustup's formula is keg-only, so its
 * proxies never land there (though `rustup` itself may).
 */
export function rustToolchainOnPath(pathDirs, exists) {
  const rustupDir = pathDirs.find((dir) => exists(path.join(dir, 'rustup')));
  const rustcDir = pathDirs.find((dir) => exists(path.join(dir, 'rustc')));
  return { rustupDir, shadowed: Boolean(rustupDir && rustcDir === HOMEBREW_BIN) };
}

/**
 * `env.PATH` with rustup's toolchain proxies first (Homebrew's plain `rustc` can't add
 * targets; keg-only rustup isn't on PATH), and whether rustup was found at all.
 */
function rustupFirstPath({ env, platform, homedir, exists }) {
  const delimiter = platform === 'win32' ? ';' : ':';
  const pathDirs = (env.PATH ?? '').split(delimiter).filter(Boolean);
  const { rustupDir, shadowed } = rustToolchainOnPath(pathDirs, exists);
  if (rustupDir && !shadowed) return { PATH: env.PATH, rustupFound: true };
  const candidates = [...(platform === 'darwin' ? [HOMEBREW_RUSTUP_BIN] : []), path.join(homedir, '.cargo/bin')];
  const candidate = candidates.find((dir) => exists(path.join(dir, 'rustup'))) ?? rustupDir;
  return candidate ? { PATH: [candidate, ...pathDirs].join(delimiter), rustupFound: true } : { PATH: env.PATH, rustupFound: false };
}

/**
 * The env every Android child process needs: `ANDROID_HOME`, `NDK_HOME`,
 * `JAVA_HOME`, and a `PATH` whose rustup toolchain proxies win (Homebrew's
 * plain `rustc` can't add targets; keg-only rustup isn't on PATH). Pure: all
 * filesystem access goes through `exists` / `listDir`.
 *
 * @returns {{ env: Record<string, string>, missing: string[] }} `env` is the full child env
 */
export function resolveAndroidEnv({ env = {}, platform, homedir, exists, listDir }) {
  const darwin = platform === 'darwin';
  const missing = [];

  let androidHome = env.ANDROID_HOME ?? env.ANDROID_SDK_ROOT;
  if (!androidHome && darwin && exists(path.join(homedir, MAC_ANDROID_SDK))) {
    androidHome = path.join(homedir, MAC_ANDROID_SDK);
  }
  if (!androidHome) missing.push('ANDROID_HOME');

  let ndkHome = env.NDK_HOME;
  if (!ndkHome && androidHome) {
    const versions = listDir(path.join(androidHome, 'ndk'))
      .filter((name) => /^\d+(\.\d+)*$/.test(name))
      .sort(compareDottedVersions);
    if (versions.length) ndkHome = path.join(androidHome, 'ndk', versions[versions.length - 1]);
  }
  if (!ndkHome) missing.push('NDK_HOME');

  let javaHome = env.JAVA_HOME;
  if (!javaHome && darwin && exists(MAC_STUDIO_JBR)) javaHome = MAC_STUDIO_JBR;
  if (!javaHome) missing.push('JAVA_HOME');

  const { PATH, rustupFound } = rustupFirstPath({ env, platform, homedir, exists });
  if (!rustupFound) missing.push('rustup');

  const resolved = { ...env };
  if (androidHome) resolved.ANDROID_HOME = androidHome;
  if (ndkHome) resolved.NDK_HOME = ndkHome;
  if (javaHome) resolved.JAVA_HOME = javaHome;
  if (PATH !== undefined) resolved.PATH = PATH;
  return { env: resolved, missing };
}

/** The `targets` (the Android ones by default) absent from `rustup target list --installed` output. */
export function missingRustTargets(installedOutput, targets = ANDROID_RUST_TARGETS) {
  const installed = new Set(String(installedOutput ?? '').split(/\s+/).filter(Boolean));
  return targets.filter((target) => !installed.has(target));
}

const PAGE_SIZE_MARKER = 'max-page-size=16384';
const SYSTEM_BARS_MARKER = 'WindowInsetsCompat.Type.systemBars()';

const BUILD_RS_TEMPLATE = `fn main() {
    // Android 15+ devices can use 16 KB memory pages, and Google Play requires apps
    // to support them. NDK r27 and older link with 4 KB segment alignment (r28+
    // defaults to 16 KB), which makes Android warn "not 16 KB compatible" at launch.
    // Set it here rather than through rustflags in .cargo/config.toml: the Tauri CLI
    // drives cargo with its own RUSTFLAGS, which replace config rustflags outright.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("android") {
        println!("cargo:rustc-link-arg=-Wl,-z,${PAGE_SIZE_MARKER}");
    }
    tauri_build::build()
}
`;

const stripWhitespace = (s) => s.replace(/\s+/g, '');

/** `'skip'` (16 KB link arg present), `'write'` (missing or Tauri's stock file), or `'warn'` (customized). */
export function planBuildRs(content) {
  if (content === null || content === undefined) return 'write';
  if (content.includes(PAGE_SIZE_MARKER)) return 'skip';
  return stripWhitespace(content) === 'fnmain(){tauri_build::build()}' ? 'write' : 'warn';
}

const STOCK_MAIN_ACTIVITY_BODIES = new Set(
  [
    'class MainActivity : TauriActivity()',
    'class MainActivity : TauriActivity() {}',
    'class MainActivity : TauriActivity() { override fun onCreate(savedInstanceState: Bundle?) { enableEdgeToEdge() super.onCreate(savedInstanceState) } }',
    'class MainActivity : TauriActivity() { override fun onCreate(savedInstanceState: Bundle?) { super.onCreate(savedInstanceState) enableEdgeToEdge() } }',
  ].map(stripWhitespace),
);

/** `'skip'` (bars already hidden), `'write'` (Tauri's stock template), or `'warn'` (customized). */
export function planMainActivity(content) {
  if (content.includes(SYSTEM_BARS_MARKER)) return 'skip';
  const body = content
    .split('\n')
    .filter((line) => !/^\s*(package|import)\s/.test(line))
    .join('\n');
  return STOCK_MAIN_ACTIVITY_BODIES.has(stripWhitespace(body)) ? 'write' : 'warn';
}

/** The immersive MainActivity (system bars hidden), under `packageLine` taken from the generated file. */
export function renderMainActivity(packageLine) {
  return `${packageLine}

import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    hideSystemBars()
  }

  // Games own the whole screen: hide the status bar and the navigation bar (the
  // home pill / back-home-recents buttons), which otherwise draw on top of the
  // game. A swipe from the edge brings them back for a moment. Android restores
  // the bars whenever the window regains focus (dialogs, app switching), so
  // re-hide them then.
  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) hideSystemBars()
  }

  private fun hideSystemBars() {
    val controller = WindowCompat.getInsetsController(window, window.decorView)
    controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    controller.hide(${SYSTEM_BARS_MARKER})
  }
}
`;
}

/**
 * The first `MainActivity.kt` under `<genAndroidDir>/app/src/main/java/`, or
 * `null`. Searched rather than derived from the identifier: Tauri mangles
 * dashes and other characters when it turns the identifier into a package path.
 */
export function findMainActivity(genAndroidDir) {
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isFile() && entry.name === 'MainActivity.kt') return full;
      if (entry.isDirectory()) {
        const found = walk(full);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(path.join(genAndroidDir, 'app/src/main/java'));
}

/** Where `tauri android init` writes the app manifest, relative to `src-tauri/`. */
export const ANDROID_MANIFEST = 'gen/android/app/src/main/AndroidManifest.xml';

const MAIN_ACTIVITY_TAG_RE = /<activity\b[^>]*\bandroid:name="\.MainActivity"[^>]*>/;
const SCREEN_ORIENTATION_RE = /(\bandroid:screenOrientation=")([^"]*)(")/;

/** The MainActivity's `android:screenOrientation` in an AndroidManifest.xml, or `undefined`. */
export function readManifestOrientation(xml) {
  return String(xml ?? '').match(MAIN_ACTIVITY_TAG_RE)?.[0].match(SCREEN_ORIENTATION_RE)?.[2];
}

/**
 * Sets `android:screenOrientation` on the `.MainActivity` element for a
 * `caper.config.ts` orientation (see `ANDROID_SCREEN_ORIENTATION`), replacing a
 * different value or adding the attribute under `android:name` with its
 * indentation. Returns `xml` itself when nothing changes, including when
 * `orientation` is unset or there is no MainActivity element.
 */
export function patchManifestOrientation(xml, orientation) {
  const value = ANDROID_SCREEN_ORIENTATION[orientation];
  const tag = value ? xml.match(MAIN_ACTIVITY_TAG_RE)?.[0] : undefined;
  if (!tag) return xml;

  let patched;
  if (SCREEN_ORIENTATION_RE.test(tag)) {
    patched = tag.replace(SCREEN_ORIENTATION_RE, `$1${value}$3`);
  } else {
    patched = tag.replace(/(\s+)(android:name="\.MainActivity")/, `$1$2$1android:screenOrientation="${value}"`);
  }
  return patched === tag ? xml : xml.replace(tag, patched);
}

const ANDROID_SCRIPTS = Object.freeze({
  'native:android:dev': { old: 'tauri android dev', value: 'caper native android dev' },
  'native:android:build': { old: 'tauri android build', value: 'caper native android build' },
});

/**
 * Returns a new package.json: adds `native:android:dev`/`native:android:build` scripts (routed through
 * `caper native android dev|build`) where absent, and upgrades the old bare `tauri android ...` values.
 * Any other value is left alone.
 */
export function patchAndroidScripts(pkg) {
  const scripts = { ...(pkg.scripts ?? {}) };
  for (const [name, { old, value }] of Object.entries(ANDROID_SCRIPTS)) {
    if (!(name in scripts) || scripts[name] === old) scripts[name] = value;
  }
  return { ...pkg, scripts };
}

/** Tauri's generated Gradle wrapper jar, relative to the app root. */
export const GRADLE_WRAPPER_JAR = 'src-tauri/gen/android/gradle/wrapper/gradle-wrapper.jar';

/** Whether git ignores `rel` in `cwd` (`git check-ignore -q` exits 0 when it does). False outside a repo. */
function isGitIgnored(cwd, rel, exec) {
  try {
    exec('git', ['check-ignore', '-q', rel], { cwd, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** The default injectable `exec`: a synchronous child process whose stdout is returned as a string. */
export function defaultExec(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf-8', ...opts });
}

function defaultListDir(dir) {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

const ANDROID_MISSING_HELP = {
  NDK_HOME: 'NDK_HOME: install an NDK with Android Studio (SDK Manager > SDK Tools > NDK), or export NDK_HOME="$ANDROID_HOME/ndk/<version>".',
  JAVA_HOME: 'JAVA_HOME: install Android Studio (it bundles a JDK), or export JAVA_HOME to a JDK 17+.',
  rustup: 'rustup: install Rust through rustup (https://rustup.rs or `brew install rustup`). Homebrew\'s plain `rust` cannot add Android targets.',
};

/**
 * The I/O core of `caper native android`: the Android steps from
 * docs/wiki/native-tauri.md: installs the Rust targets, runs
 * `tauri android init --ci`, adds the 16 KB page-alignment link arg to
 * `build.rs`, hides the system bars in `MainActivity.kt`, locks the
 * MainActivity to `caper.config.ts`'s `orientation` in `AndroidManifest.xml`
 * (only when it is set), and adds `native:android:*` scripts. No console
 * output; the CLI wrapper below owns presentation. Idempotent: a second run
 * makes zero `run` calls and zero writes.
 *
 * @param {string} cwd
 * @param {object} [opts] unused today; kept for symmetry with `initNative`
 * @param {{ run?: typeof defaultRun, exec?: typeof defaultExec, env?: Record<string, string>, platform?: string, homedir?: string, exists?: (p: string) => boolean, listDir?: (p: string) => string[], loadConfig?: typeof defaultLoadConfig }} [deps]
 */
export async function androidNative(
  cwd,
  opts = {},
  {
    run = defaultRun,
    exec = defaultExec,
    env = process.env,
    platform = process.platform,
    homedir = os.homedir(),
    exists = fs.existsSync,
    listDir = defaultListDir,
    loadConfig = defaultLoadConfig,
  } = {},
) {
  const pkgPath = path.join(cwd, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    throw new Error('no package.json found in this directory.');
  }
  const srcTauriDir = path.join(cwd, 'src-tauri');
  if (!fs.existsSync(path.join(srcTauriDir, 'tauri.conf.json'))) {
    throw new Error('no src-tauri/ found — run `caper native init` first.');
  }

  const resolved = resolveAndroidEnv({ env, platform, homedir, exists, listDir });
  const blocking = resolved.missing.filter((name) => name in ANDROID_MISSING_HELP);
  if (blocking.length) {
    throw new Error(`the Android toolchain is incomplete:\n${blocking.map((name) => `  - ${ANDROID_MISSING_HELP[name]}`).join('\n')}`);
  }
  const childOpts = { cwd, env: resolved.env };
  const warnings = [];

  const addedTargets = missingRustTargets(exec('rustup', ['target', 'list', '--installed'], childOpts));
  if (addedTargets.length) {
    run('rustup', ['target', 'add', ...addedTargets], childOpts);
  }

  const genAndroidDir = path.join(srcTauriDir, 'gen/android');
  const ranAndroidInit = !fs.existsSync(genAndroidDir);
  if (ranAndroidInit) {
    const pm = packageManagerFor(cwd);
    run(EXEC_RUNNER[pm], ['tauri', 'android', 'init', '--ci'], childOpts);
  }

  const buildRsPath = path.join(srcTauriDir, 'build.rs');
  const buildRsPlan = planBuildRs(fs.existsSync(buildRsPath) ? fs.readFileSync(buildRsPath, 'utf-8') : null);
  if (buildRsPlan === 'write') {
    fs.writeFileSync(buildRsPath, BUILD_RS_TEMPLATE, 'utf-8');
  } else if (buildRsPlan === 'warn') {
    warnings.push(
      `src-tauri/build.rs is customized, so it was left alone. Add the Android link arg \`-Wl,-z,${PAGE_SIZE_MARKER}\` by hand (see docs/wiki/native-tauri.md, "Android").`,
    );
  }

  let mainActivityPatched = false;
  const mainActivityPath = findMainActivity(genAndroidDir);
  if (!mainActivityPath) {
    warnings.push('could not find MainActivity.kt under src-tauri/gen/android/app/src/main/java/, so the system bars are not hidden.');
  } else {
    const content = fs.readFileSync(mainActivityPath, 'utf-8');
    const plan = planMainActivity(content);
    if (plan === 'write') {
      const packageLine = content.split('\n').find((line) => /^\s*package\s/.test(line))?.trim() ?? '';
      fs.writeFileSync(mainActivityPath, renderMainActivity(packageLine), 'utf-8');
      mainActivityPatched = true;
    } else if (plan === 'warn') {
      warnings.push(
        `${path.relative(cwd, mainActivityPath)} is customized, so it was left alone. Hide \`${SYSTEM_BARS_MARKER}\` by hand (see docs/wiki/native-tauri.md, "Android").`,
      );
    }
  }

  // Unset means no lock: the manifest is left alone, never rewritten to "unspecified".
  let orientationPatched = false;
  const { orientation, warning: orientationWarning } = await readOrientation(cwd, loadConfig);
  if (orientationWarning) warnings.push(orientationWarning);
  if (orientation) {
    const manifestPath = path.join(srcTauriDir, ANDROID_MANIFEST);
    const xml = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath, 'utf-8') : null;
    const patched = xml === null ? null : patchManifestOrientation(xml, orientation);
    if (patched === null || readManifestOrientation(patched) !== ANDROID_SCREEN_ORIENTATION[orientation]) {
      warnings.push(
        `could not find the MainActivity in src-tauri/${ANDROID_MANIFEST}, so the ${orientation} orientation was not applied. Set android:screenOrientation="${ANDROID_SCREEN_ORIENTATION[orientation]}" on it by hand.`,
      );
    } else if (patched !== xml) {
      fs.writeFileSync(manifestPath, patched, 'utf-8');
      orientationPatched = true;
    }
  }

  const pkgRaw = fs.readFileSync(pkgPath, 'utf-8');
  const pkg = JSON.parse(pkgRaw);
  const patchedPkg = patchAndroidScripts(pkg);
  const addedScripts = Object.keys(patchedPkg.scripts).filter((name) => patchedPkg.scripts[name] !== pkg.scripts?.[name]);
  if (addedScripts.length) {
    writeJson(pkgPath, patchedPkg, detectIndent(pkgRaw));
  }

  // Tauri generates a Gradle wrapper jar that must be committed, or a fresh clone cannot build the APK.
  // Many .gitignore templates ignore *.jar, so add an exception for this one file.
  let gitignorePatched = false;
  if (fs.existsSync(path.join(cwd, GRADLE_WRAPPER_JAR)) && isGitIgnored(cwd, GRADLE_WRAPPER_JAR, exec)) {
    const gitignorePath = path.join(cwd, '.gitignore');
    const current = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf-8') : '';
    const separator = current === '' || current.endsWith('\n') ? '' : '\n';
    fs.writeFileSync(
      gitignorePath,
      `${current}${separator}\n# Tauri Android: the Gradle wrapper jar must be committed, or fresh clones cannot build.\n!${GRADLE_WRAPPER_JAR}\n`,
      'utf-8',
    );
    gitignorePatched = true;
    if (isGitIgnored(cwd, GRADLE_WRAPPER_JAR, exec)) {
      warnings.push(`${GRADLE_WRAPPER_JAR} is still ignored by git (a parent folder is ignored?); add it with \`git add -f\`.`);
    }
  }

  const buildRsPatched = buildRsPlan === 'write';
  return {
    status: 'ok',
    changed:
      addedTargets.length > 0 ||
      ranAndroidInit ||
      buildRsPatched ||
      mainActivityPatched ||
      orientationPatched ||
      addedScripts.length > 0 ||
      gitignorePatched,
    addedTargets,
    ranAndroidInit,
    buildRsPatched,
    mainActivityPatched,
    orientation,
    orientationPatched,
    addedScripts,
    gitignorePatched,
    env: {
      ANDROID_HOME: resolved.env.ANDROID_HOME,
      NDK_HOME: resolved.env.NDK_HOME,
      JAVA_HOME: resolved.env.JAVA_HOME,
      // The dir prepended to PATH so rustup's toolchain wins, or undefined when PATH was already fine.
      rustupBin: resolved.env.PATH !== env.PATH ? resolved.env.PATH.split(platform === 'win32' ? ';' : ':')[0] : undefined,
    },
    warnings,
  };
}

/**
 * The I/O core of `caper native android dev|build`: runs `tauri android <mode> ...args` with the
 * resolved Android env (NDK_HOME, JAVA_HOME, rustup-first PATH), so the user's shell needs none of it.
 * Throws if the Android project or toolchain is missing; the `run` error (non-zero exit) propagates.
 *
 * @param {string} cwd
 * @param {'dev' | 'build'} mode
 * @param {string[]} args passed to tauri untouched
 * @param {{ run?: typeof defaultRun, env?: Record<string, string>, platform?: string, homedir?: string, exists?: (p: string) => boolean, listDir?: (p: string) => string[] }} [deps]
 */
export function runAndroidTauri(
  cwd,
  mode,
  args = [],
  { run = defaultRun, env = process.env, platform = process.platform, homedir = os.homedir(), exists = fs.existsSync, listDir = defaultListDir } = {},
) {
  if (!exists(path.join(cwd, 'src-tauri/gen/android'))) {
    throw new Error('no Android project, run `caper native android` first.');
  }
  const resolved = resolveAndroidEnv({ env, platform, homedir, exists, listDir });
  const blocking = resolved.missing.filter((name) => name in ANDROID_MISSING_HELP);
  if (blocking.length) {
    throw new Error(`the Android toolchain is incomplete:\n${blocking.map((name) => `  - ${ANDROID_MISSING_HELP[name]}`).join('\n')}`);
  }
  const pm = packageManagerFor(cwd);
  return run(EXEC_RUNNER[pm], ['tauri', 'android', mode, ...args], { cwd, env: resolved.env, stdio: 'inherit' });
}

/** Rust targets `tauri ios` builds for: devices, Apple Silicon Simulators, Intel Simulators. */
export const IOS_RUST_TARGETS = Object.freeze(['aarch64-apple-ios', 'aarch64-apple-ios-sim', 'x86_64-apple-ios']);

// The tools `tauri ios init` needs on PATH, and the Homebrew formula for each.
const IOS_TOOL_FORMULAS = Object.freeze({ pod: 'cocoapods', xcodegen: 'xcodegen' });

const CLT_DIR = '/Library/Developer/CommandLineTools';

/** Whether `xcode-select -p` output points at a full Xcode, not just the Command Line Tools. */
export function isFullXcode(xcodeSelectOutput) {
  const dir = String(xcodeSelectOutput ?? '').trim();
  return dir !== '' && !dir.startsWith(CLT_DIR);
}

/**
 * The env every iOS child process needs: a rustup-first `PATH` (as for Android) that
 * also reaches `pod` and `xcodegen` (appending /opt/homebrew/bin when only it has
 * them), and, for pnpm, an `npm_config_user_agent` starting with `pnpm/`: `tauri ios
 * init` reads it to write `pnpm tauri ios xcode-script` into the Xcode project
 * instead of a broken `node tauri`. Pure: all filesystem access goes through `exists`.
 *
 * @returns {{ env: Record<string, string>, missing: string[] }} `missing` may hold `rustup`, `pod`, `xcodegen`
 */
export function resolveIosEnv({ env = {}, platform, homedir, exists, pm }) {
  const missing = [];
  const delimiter = platform === 'win32' ? ';' : ':';
  let { PATH, rustupFound } = rustupFirstPath({ env, platform, homedir, exists });
  if (!rustupFound) missing.push('rustup');

  const pathDirs = (PATH ?? '').split(delimiter).filter(Boolean);
  let addHomebrewBin = false;
  for (const tool of Object.keys(IOS_TOOL_FORMULAS)) {
    if (pathDirs.some((dir) => exists(path.join(dir, tool)))) continue;
    if (exists(path.join(HOMEBREW_BIN, tool))) addHomebrewBin = true;
    else missing.push(tool);
  }
  if (addHomebrewBin) PATH = [...pathDirs, HOMEBREW_BIN].join(delimiter);

  const resolved = { ...env };
  if (PATH !== undefined) resolved.PATH = PATH;
  if (pm === 'pnpm' && !String(env.npm_config_user_agent ?? '').startsWith('pnpm/')) {
    resolved.npm_config_user_agent = 'pnpm/caper';
  }
  return { env: resolved, missing };
}

/** The `caper.config.ts` orientation values, and the `UISupportedInterfaceOrientations` each one becomes on iPhone and iPad. */
export const IOS_ORIENTATIONS = Object.freeze({
  portrait: Object.freeze({
    iphone: Object.freeze(['UIInterfaceOrientationPortrait']),
    ipad: Object.freeze(['UIInterfaceOrientationPortrait', 'UIInterfaceOrientationPortraitUpsideDown']),
  }),
  landscape: Object.freeze({
    iphone: Object.freeze(['UIInterfaceOrientationLandscapeLeft', 'UIInterfaceOrientationLandscapeRight']),
    ipad: Object.freeze(['UIInterfaceOrientationLandscapeLeft', 'UIInterfaceOrientationLandscapeRight']),
  }),
});

/** Where Caper's iOS plist keys live, relative to `src-tauri/`. Tauri merges it into the generated Info.plist on every `tauri ios dev|build`. */
export const INFO_IOS_PLIST = 'Info.ios.plist';

const PLIST_MARKER = '<!-- Managed by caper native ios: re-running it rewrites this file. Delete this line to keep your own edits. -->';

/**
 * Caper's `src-tauri/Info.ios.plist`: the status bar hidden, plus, when `orientation`
 * is set, the iPhone and iPad orientation locks and `UIRequiresFullScreen` (iPad
 * ignores the lock, and App Store validation rejects it, without it). The marker
 * comment sits right after the XML declaration, which must come first.
 */
export function renderInfoIosPlist(orientation) {
  const entries = [
    ['UIStatusBarHidden', '<true/>'],
    ['UIViewControllerBasedStatusBarAppearance', '<false/>'],
  ];
  const lock = IOS_ORIENTATIONS[orientation];
  if (lock) {
    const array = (values) => ['<array>', ...values.map((v) => `\t\t<string>${v}</string>`), '\t</array>'].join('\n');
    entries.push(
      ['UISupportedInterfaceOrientations', array(lock.iphone)],
      ['UISupportedInterfaceOrientations~ipad', array(lock.ipad)],
      ['UIRequiresFullScreen', '<true/>'],
    );
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    PLIST_MARKER,
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    ...entries.map(([key, value]) => `\t<key>${key}</key>\n\t${value}`),
    '</dict>',
    '</plist>',
    '',
  ].join('\n');
}

/** `'write'` (missing, or managed and out of date), `'skip'` (already current), or `'warn'` (the user's own file, no marker). */
export function planInfoIosPlist(content, orientation) {
  if (content === null || content === undefined) return 'write';
  if (!content.includes(PLIST_MARKER)) return 'warn';
  return content === renderInfoIosPlist(orientation) ? 'skip' : 'write';
}

const PLIST_ORIENTATIONS_RE = /<key>UISupportedInterfaceOrientations<\/key>\s*<array>([\s\S]*?)<\/array>/;

/** The iPhone orientation lock in a plist's `UISupportedInterfaceOrientations`, or `undefined` (no array, or mixed). */
export function readPlistOrientation(xml) {
  const body = String(xml ?? '').match(PLIST_ORIENTATIONS_RE)?.[1];
  if (!body) return undefined;
  const values = [...body.matchAll(/<string>\s*([^<]*?)\s*<\/string>/g)].map((m) => m[1]);
  if (!values.length) return undefined;
  if (values.every((v) => v.startsWith('UIInterfaceOrientationPortrait'))) return 'portrait';
  if (values.every((v) => v.startsWith('UIInterfaceOrientationLandscape'))) return 'landscape';
  return undefined;
}

/** Apple Developer Team IDs are ten uppercase letters or digits. */
export function isValidTeamId(team) {
  return typeof team === 'string' && /^[A-Z0-9]{10}$/.test(team);
}

/** Returns a new tauri.conf.json with `bundle.iOS.developmentTeam` set; the rest untouched. */
export function patchIosTeam(conf, team) {
  return {
    ...conf,
    bundle: {
      ...conf.bundle,
      iOS: { ...conf.bundle?.iOS, developmentTeam: team },
    },
  };
}

const IOS_SCRIPTS = Object.freeze({
  'native:ios:dev': { old: 'tauri ios dev', value: 'caper native ios dev' },
  'native:ios:build': { old: 'tauri ios build', value: 'caper native ios build' },
});

/**
 * Returns a new package.json: adds `native:ios:dev`/`native:ios:build` scripts (routed through
 * `caper native ios dev|build`) where absent, upgrading the old bare `tauri ios ...` values, and a
 * `tauri` script when absent (with npm, Xcode's Rust build step runs `npm run -- tauri`).
 */
export function patchIosScripts(pkg) {
  const scripts = { ...(pkg.scripts ?? {}) };
  for (const [name, { old, value }] of Object.entries(IOS_SCRIPTS)) {
    if (!(name in scripts) || scripts[name] === old) scripts[name] = value;
  }
  if (!('tauri' in scripts)) scripts.tauri = 'tauri';
  return { ...pkg, scripts };
}

/** The command in front of `tauri ios xcode-script` in a generated `project.yml` (`pnpm`, `npm run --`, `node`, ...), or `undefined`. */
export function xcodeScriptRunner(projectYml) {
  // Either `- script: <runner> tauri ...` or a `- script: |` block with the command on its own line.
  return String(projectYml ?? '').match(/^[ \t]*(?:-[ \t]*script:[ \t]*)?["']?([^\s|"'][^\n]*?)[ \t]+tauri ios xcode-script/m)?.[1];
}

const IOS_MISSING_HELP = {
  rustup: 'rustup: install Rust through rustup (https://rustup.rs or `brew install rustup`). Homebrew\'s plain `rust` cannot add iOS targets.',
  pod: 'pod: install CocoaPods (`brew install cocoapods`).',
  xcodegen: 'xcodegen: install XcodeGen (`brew install xcodegen`).',
};

const iosToolchainError = (names) => new Error(`the iOS toolchain is incomplete:\n${names.map((name) => `  - ${IOS_MISSING_HELP[name]}`).join('\n')}`);

/**
 * The I/O core of `caper native ios`: checks for full Xcode, installs CocoaPods
 * and XcodeGen with Homebrew when missing, installs the Rust targets, runs
 * `tauri ios init --ci`, writes `src-tauri/Info.ios.plist` (status bar hidden,
 * `caper.config.ts`'s orientation lock), sets the signing team when `team` is
 * given, and adds `native:ios:*` scripts. No console output; the CLI wrapper
 * below owns presentation. Idempotent: a second run makes zero `run` calls and
 * zero writes.
 *
 * @param {string} cwd
 * @param {{ team?: string }} [opts]
 * @param {{ run?: typeof defaultRun, exec?: typeof defaultExec, env?: Record<string, string>, platform?: string, homedir?: string, exists?: (p: string) => boolean, loadConfig?: typeof defaultLoadConfig }} [deps]
 */
export async function iosNative(
  cwd,
  opts = {},
  {
    run = defaultRun,
    exec = defaultExec,
    env = process.env,
    platform = process.platform,
    homedir = os.homedir(),
    exists = fs.existsSync,
    loadConfig = defaultLoadConfig,
  } = {},
) {
  const pkgPath = path.join(cwd, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    throw new Error('no package.json found in this directory.');
  }
  const srcTauriDir = path.join(cwd, 'src-tauri');
  const tauriConfPath = path.join(srcTauriDir, 'tauri.conf.json');
  if (!fs.existsSync(tauriConfPath)) {
    throw new Error('no src-tauri/ found — run `caper native init` first.');
  }
  if (opts.team !== undefined && !isValidTeamId(opts.team)) {
    throw new Error(`--team must be a 10-character Apple Team ID like ABCDE12345 (got ${JSON.stringify(opts.team)}).`);
  }
  if (platform !== 'darwin') {
    throw new Error('iOS builds need macOS with Xcode.');
  }

  let xcodeDir = '';
  try {
    xcodeDir = exec('xcode-select', ['-p']);
  } catch {
    // treated as no Xcode below
  }
  if (!isFullXcode(xcodeDir)) {
    throw new Error(
      'iOS builds need the full Xcode app, not just the Command Line Tools. Install Xcode from the App Store, then run `sudo xcode-select -s /Applications/Xcode.app`.',
    );
  }

  const pm = packageManagerFor(cwd);
  let resolved = resolveIosEnv({ env, platform, homedir, exists, pm });

  const installedTools = [];
  const missingTools = resolved.missing.filter((name) => name in IOS_TOOL_FORMULAS);
  if (missingTools.length) {
    const brewDir = [...(resolved.env.PATH ?? '').split(':').filter(Boolean), HOMEBREW_BIN].find((dir) => exists(path.join(dir, 'brew')));
    if (!brewDir) {
      const error = iosToolchainError(missingTools);
      error.message += '\n  Or install Homebrew (https://brew.sh) and re-run `caper native ios`.';
      throw error;
    }
    installedTools.push(...missingTools.map((name) => IOS_TOOL_FORMULAS[name]));
    run(path.join(brewDir, 'brew'), ['install', ...installedTools], { cwd, env: resolved.env });
    resolved = resolveIosEnv({ env, platform, homedir, exists, pm });
  }
  if (resolved.missing.length) {
    throw iosToolchainError(resolved.missing);
  }
  const childOpts = { cwd, env: resolved.env };
  const warnings = [];

  const addedTargets = missingRustTargets(exec('rustup', ['target', 'list', '--installed'], childOpts), IOS_RUST_TARGETS);
  if (addedTargets.length) {
    run('rustup', ['target', 'add', ...addedTargets], childOpts);
  }

  const genAppleDir = path.join(srcTauriDir, 'gen/apple');
  const ranIosInit = !fs.existsSync(genAppleDir);
  if (ranIosInit) {
    run(EXEC_RUNNER[pm], ['tauri', 'ios', 'init', '--ci'], childOpts);
    // Tauri exits 0 even when it gives up (e.g. it could not install CocoaPods).
    if (!fs.existsSync(genAppleDir)) {
      throw new Error('`tauri ios init` did not create src-tauri/gen/apple. Read its output above; a missing CocoaPods or XcodeGen is the usual cause.');
    }
  }

  const projectYmlPath = path.join(genAppleDir, 'project.yml');
  if (fs.existsSync(projectYmlPath) && xcodeScriptRunner(fs.readFileSync(projectYmlPath, 'utf-8')) === 'node') {
    warnings.push(
      'src-tauri/gen/apple/project.yml runs the Rust build with `node tauri`, which fails in Xcode. Delete src-tauri/gen/apple and re-run `caper native ios` (with npm, keep the `tauri` script in package.json).',
    );
  }

  const { orientation, warning: orientationWarning } = await readOrientation(cwd, loadConfig);
  if (orientationWarning) warnings.push(orientationWarning);
  const plistPath = path.join(srcTauriDir, INFO_IOS_PLIST);
  const plistPlan = planInfoIosPlist(fs.existsSync(plistPath) ? fs.readFileSync(plistPath, 'utf-8') : null, orientation);
  if (plistPlan === 'write') {
    fs.writeFileSync(plistPath, renderInfoIosPlist(orientation), 'utf-8');
  } else if (plistPlan === 'warn') {
    warnings.push(
      `src-tauri/${INFO_IOS_PLIST} has no caper marker, so it was left alone. Set UIStatusBarHidden${orientation ? ', the orientation keys and UIRequiresFullScreen' : ''} by hand (see docs/wiki/native-tauri.md, "iOS").`,
    );
  }

  const confRaw = fs.readFileSync(tauriConfPath, 'utf-8');
  const conf = JSON.parse(confRaw);
  let teamPatched = false;
  if (opts.team !== undefined && conf.bundle?.iOS?.developmentTeam !== opts.team) {
    writeJson(tauriConfPath, patchIosTeam(conf, opts.team), detectIndent(confRaw));
    teamPatched = true;
  }
  const team = env.APPLE_DEVELOPMENT_TEAM || opts.team || conf.bundle?.iOS?.developmentTeam || undefined;
  if (!team) {
    warnings.push(
      'no Apple Development Team set. The Simulator works without one; for a device, run `caper native ios --team <ID>` (find it at developer.apple.com > Account > Membership).',
    );
  }

  const pkgRaw = fs.readFileSync(pkgPath, 'utf-8');
  const pkg = JSON.parse(pkgRaw);
  const patchedPkg = patchIosScripts(pkg);
  const addedScripts = Object.keys(patchedPkg.scripts).filter((name) => patchedPkg.scripts[name] !== pkg.scripts?.[name]);
  if (addedScripts.length) {
    writeJson(pkgPath, patchedPkg, detectIndent(pkgRaw));
  }

  const plistPatched = plistPlan === 'write';
  return {
    status: 'ok',
    changed: installedTools.length > 0 || addedTargets.length > 0 || ranIosInit || plistPatched || teamPatched || addedScripts.length > 0,
    installedTools,
    addedTargets,
    ranIosInit,
    plistPatched,
    orientation,
    teamPatched,
    team,
    addedScripts,
    warnings,
  };
}

/**
 * The I/O core of `caper native ios dev|build`: runs `tauri ios <mode> ...args` with the resolved
 * iOS env (rustup-first PATH that reaches pod and xcodegen). Throws if the iOS project or toolchain
 * is missing; the `run` error (non-zero exit) propagates.
 *
 * @param {string} cwd
 * @param {'dev' | 'build'} mode
 * @param {string[]} args passed to tauri untouched
 * @param {{ run?: typeof defaultRun, env?: Record<string, string>, platform?: string, homedir?: string, exists?: (p: string) => boolean }} [deps]
 */
export function runIosTauri(cwd, mode, args = [], { run = defaultRun, env = process.env, platform = process.platform, homedir = os.homedir(), exists = fs.existsSync } = {}) {
  if (!exists(path.join(cwd, 'src-tauri/gen/apple'))) {
    throw new Error('no iOS project, run `caper native ios` first.');
  }
  const pm = packageManagerFor(cwd);
  const resolved = resolveIosEnv({ env, platform, homedir, exists, pm });
  if (resolved.missing.length) throw iosToolchainError(resolved.missing);
  return run(EXEC_RUNNER[pm], ['tauri', 'ios', mode, ...args], { cwd, env: resolved.env, stdio: 'inherit' });
}

function printUsage() {
  console.error(red('Usage: caper native init [--title <name>] [--identifier <id>] [--port <n>] [--icon <png>]'));
  console.error(red('       caper native plugin'));
  console.error(red('       caper native android [dev|build] [...tauri args]'));
  console.error(red('       caper native ios [--team <ID>]'));
  console.error(red('       caper native ios dev|build [...tauri args]'));
}

function parseInitArgs(args) {
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--identifier') {
      const next = args[++i];
      if (!next) throw new Error('Missing value for --identifier');
      opts.identifier = next;
    } else if (arg === '--port') {
      const next = args[++i];
      if (!next) throw new Error('Missing value for --port');
      opts.port = next;
    } else if (arg === '--icon') {
      const next = args[++i];
      if (!next) throw new Error('Missing value for --icon');
      opts.icon = next;
    } else if (arg === '--title') {
      const next = args[++i];
      if (!next) throw new Error('Missing value for --title');
      opts.title = next;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return opts;
}

async function runInit(args) {
  let opts;
  try {
    opts = parseInitArgs(args);
  } catch (err) {
    console.error(red(err.message));
    printUsage();
    process.exit(1);
  }

  let result;
  try {
    result = await initNative(process.cwd(), opts);
  } catch (err) {
    console.error(red(`caper native init: ${err.message}`));
    process.exit(1);
  }

  if (result.status === 'already-initialized') {
    console.log(yellow('src-tauri already exists — nothing to do.'));
    console.log(`  Run ${cyan('pnpm native:dev')} / ${cyan('pnpm native:build')}, or ${cyan('npx caper doctor')} to check your native toolchain.`);
    return;
  }

  console.log(green(bold('✓ Initialized Tauri')) + ` ${cyan('src-tauri/')}`);
  console.log(`  ${yellow('identifier:')} ${result.identifier}${result.identifier.startsWith(DEFAULT_IDENTIFIER_PREFIX) ? dim(' (placeholder — change before shipping)') : ''}`);
  console.log(`  ${yellow('dev port:')}   ${result.port}`);
  console.log(`  ${yellow('scripts:')}    native:dev, native:build`);
  if (result.orientation) console.log(`  ${yellow('window:')}     ${result.orientation === 'portrait' ? '450x800' : '1280x720'} (${result.orientation}, from caper.config.ts)`);
  for (const warning of result.warnings) console.log(yellow(`  ⚠ ${warning}`));
  console.log(`\n  Run ${cyan('npx caper doctor')} to check your native toolchain.`);
  console.log(`  The first ${cyan('native:build')} compiles Rust — expect a few minutes.`);
}

async function runPlugin() {
  let result;
  try {
    result = await addNativePlugin(process.cwd());
  } catch (err) {
    console.error(red(`caper native plugin: ${err.message}`));
    process.exit(1);
  }

  if (!result.changed) {
    console.log(yellow('Already wired up for @caperjs/plugin-tauri — nothing to do.'));
  } else {
    console.log(green(bold('✓ Wired up for')) + ` ${cyan('@caperjs/plugin-tauri')}`);
    if (result.addedDeps.length) console.log(`  ${yellow('added deps:')} ${result.addedDeps.join(', ')}`);
    if (result.ranTauriAddStore) console.log(`  ${yellow('ran:')} tauri add store`);
    if (result.capabilitiesChanged) console.log(`  ${yellow('capabilities:')} window permissions added to src-tauri/capabilities/default.json`);
  }

  console.log(`\n  Add to ${cyan('caper.config.ts')}:`);
  console.log(`    plugins: [..., 'tauri'],  ${dim("// or ['tauri', { pauseOnBlur: true }] to pass options")}`);
  console.log(`  Use it as your Store adapter id ${cyan('tauri')} for durable saves.`);
}

async function runAndroid() {
  let result;
  try {
    result = await androidNative(process.cwd());
  } catch (err) {
    console.error(red(`caper native android: ${err.message}`));
    process.exit(1);
  }

  if (!result.changed) {
    console.log(yellow('Already set up for Android. Nothing to do.'));
  } else {
    console.log(green(bold('✓ Set up for')) + ` ${cyan('Android')}`);
    if (result.addedTargets.length) console.log(`  ${yellow('rust targets:')} ${result.addedTargets.join(', ')}`);
    if (result.ranAndroidInit) console.log(`  ${yellow('ran:')} tauri android init --ci`);
    if (result.buildRsPatched) console.log(`  ${yellow('build.rs:')} 16 KB page alignment added to src-tauri/build.rs`);
    if (result.mainActivityPatched) console.log(`  ${yellow('MainActivity.kt:')} system bars hidden`);
    if (result.orientationPatched) {
      console.log(`  ${yellow('AndroidManifest.xml:')} ${result.orientation} orientation (android:screenOrientation="${ANDROID_SCREEN_ORIENTATION[result.orientation]}")`);
    }
    if (result.addedScripts.length) console.log(`  ${yellow('scripts:')} ${result.addedScripts.join(', ')}`);
    if (result.gitignorePatched) console.log(`  ${yellow('.gitignore:')} the Gradle wrapper jar is no longer ignored, commit it`);
  }
  for (const warning of result.warnings) console.log(yellow(`  ⚠ ${warning}`));

  console.log('\n  Next:');
  console.log(`    ${cyan('pnpm native:android:dev')}  ${dim('# on a device or emulator')}`);
  console.log(`    ${cyan('pnpm native:android:build --debug --apk --target aarch64')}`);
  console.log(`  Those scripts set NDK_HOME, JAVA_HOME and the rustup PATH themselves.`);
  console.log(`  To run ${cyan('tauri android')} directly, export these first:`);
  console.log(`    export NDK_HOME="${result.env.NDK_HOME}"`);
  console.log(`    export JAVA_HOME="${result.env.JAVA_HOME}"`);
  if (result.env.rustupBin) console.log(`    export PATH="${result.env.rustupBin}:$PATH"`);
}

async function runAndroidTauriCommand(mode, args) {
  try {
    runAndroidTauri(process.cwd(), mode, args);
  } catch (err) {
    // The child already printed its own output; add one red line, no stack.
    console.error(red(`caper native android ${mode}: ${err.message}`));
    process.exit(typeof err.status === 'number' ? err.status : 1);
  }
}

function parseIosArgs(args) {
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--team') {
      const next = args[++i];
      if (!next) throw new Error('Missing value for --team');
      opts.team = next;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return opts;
}

async function runIos(args) {
  let opts;
  try {
    opts = parseIosArgs(args);
  } catch (err) {
    console.error(red(err.message));
    printUsage();
    process.exit(1);
  }

  let result;
  try {
    result = await iosNative(process.cwd(), opts);
  } catch (err) {
    console.error(red(`caper native ios: ${err.message}`));
    process.exit(1);
  }

  if (!result.changed) {
    console.log(yellow('Already set up for iOS. Nothing to do.'));
  } else {
    console.log(green(bold('✓ Set up for')) + ` ${cyan('iOS')}`);
    if (result.installedTools.length) console.log(`  ${yellow('brew installed:')} ${result.installedTools.join(', ')}`);
    if (result.addedTargets.length) console.log(`  ${yellow('rust targets:')} ${result.addedTargets.join(', ')}`);
    if (result.ranIosInit) console.log(`  ${yellow('ran:')} tauri ios init --ci`);
    if (result.plistPatched) {
      console.log(`  ${yellow('Info.ios.plist:')} status bar hidden${result.orientation ? `, ${result.orientation} orientation` : ''}`);
    }
    if (result.teamPatched) console.log(`  ${yellow('tauri.conf.json:')} bundle.iOS.developmentTeam = ${result.team}`);
    if (result.addedScripts.length) console.log(`  ${yellow('scripts:')} ${result.addedScripts.join(', ')}`);
  }
  for (const warning of result.warnings) console.log(yellow(`  ⚠ ${warning}`));

  console.log('\n  Next:');
  console.log(`    ${cyan('pnpm native:ios:dev')}  ${dim('# pick a Simulator, or a device once a team is set')}`);
  console.log(`    ${cyan('pnpm native:ios:build')}`);
}

async function runIosTauriCommand(mode, args) {
  try {
    runIosTauri(process.cwd(), mode, args);
  } catch (err) {
    // The child already printed its own output; add one red line, no stack.
    console.error(red(`caper native ios ${mode}: ${err.message}`));
    process.exit(typeof err.status === 'number' ? err.status : 1);
  }
}

/**
 * CLI entry for `caper native`.
 *
 * @param {string[]} args
 */
export async function native(args) {
  if (args[0] === 'init') {
    await runInit(args.slice(1));
    return;
  }

  if (args[0] === 'plugin') {
    await runPlugin();
    return;
  }

  if (args[0] === 'android') {
    if (args[1] === 'dev' || args[1] === 'build') {
      await runAndroidTauriCommand(args[1], args.slice(2));
      return;
    }
    await runAndroid();
    return;
  }

  if (args[0] === 'ios') {
    if (args[1] === 'dev' || args[1] === 'build') {
      await runIosTauriCommand(args[1], args.slice(2));
      return;
    }
    await runIos(args.slice(1));
    return;
  }

  printUsage();
  process.exit(1);
}
