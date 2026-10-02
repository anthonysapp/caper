import { bold, cyan, dim, green, red, yellow } from 'kleur/colors';

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

/**
 * `caper native init` — one-shot Tauri v2 scaffolding for a Caper app: adds
 * `@tauri-apps/cli`, runs `tauri init --ci` with a pinned identifier/port,
 * then patches the generated `tauri.conf.json` and the app's own
 * `package.json` scripts. `caper` deliberately does NOT wrap `tauri dev` /
 * `tauri build` — same rule as `dev`/`build` in `cli.mjs`.
 */

const IDENTIFIER_RE = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*)+$/;
const PLACEHOLDER_IDENTIFIER = 'com.tauri.dev';
const DEFAULT_IDENTIFIER_PREFIX = 'dev.caper.';

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

/** Returns a new tauri.conf.json: sets `identifier` and window 0's title/size; leaves the rest untouched. */
export function patchTauriConfig(conf, { identifier, title }) {
  const windows = Array.isArray(conf.app?.windows) ? [...conf.app.windows] : [];
  windows[0] = { ...(windows[0] ?? {}), title, width: 1280, height: 720 };

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
function defaultRun(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} exited with code ${result.status}`);
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
 * @param {{ run?: typeof defaultRun }} [deps]
 */
export async function initNative(cwd, opts = {}, { run = defaultRun } = {}) {
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
  const title = opts.title ?? name;
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
    name,
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

  const tauriConfPath = path.join(srcTauriDir, 'tauri.conf.json');
  const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf-8'));
  writeJson(tauriConfPath, patchTauriConfig(tauriConf, { identifier, title }), 2);

  // Re-read: the package manager rewrote package.json when it added @tauri-apps/cli,
  // and patching the copy read above would silently drop that devDependency.
  const freshPkgRaw = fs.readFileSync(pkgPath, 'utf-8');
  writeJson(pkgPath, patchPackageScripts(JSON.parse(freshPkgRaw)), detectIndent(freshPkgRaw));

  if (opts.icon) {
    run(EXEC_RUNNER[pm], ['tauri', 'icon', opts.icon], { cwd });
  }

  return { status: 'ok', name, title, identifier, port, pm };
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

  const delimiter = platform === 'win32' ? ';' : ':';
  const pathDirs = (env.PATH ?? '').split(delimiter).filter(Boolean);
  const rustupDir = pathDirs.find((dir) => exists(path.join(dir, 'rustup')));
  const rustcDir = pathDirs.find((dir) => exists(path.join(dir, 'rustc')));
  // A rustc in /opt/homebrew/bin is always Homebrew's plain `rust` formula: rustup's
  // formula is keg-only, so its proxies never land there (though `rustup` itself may).
  const shadowed = rustupDir && rustcDir === HOMEBREW_BIN;
  let PATH = env.PATH;
  if (!rustupDir || shadowed) {
    const candidates = [...(darwin ? [HOMEBREW_RUSTUP_BIN] : []), path.join(homedir, '.cargo/bin')];
    const candidate = candidates.find((dir) => exists(path.join(dir, 'rustup'))) ?? rustupDir;
    if (candidate) PATH = [candidate, ...pathDirs].join(delimiter);
    else missing.push('rustup');
  }

  const resolved = { ...env };
  if (androidHome) resolved.ANDROID_HOME = androidHome;
  if (ndkHome) resolved.NDK_HOME = ndkHome;
  if (javaHome) resolved.JAVA_HOME = javaHome;
  if (PATH !== undefined) resolved.PATH = PATH;
  return { env: resolved, missing };
}

/** The `ANDROID_RUST_TARGETS` absent from `rustup target list --installed` output. */
export function missingRustTargets(installedOutput) {
  const installed = new Set(String(installedOutput ?? '').split(/\s+/).filter(Boolean));
  return ANDROID_RUST_TARGETS.filter((target) => !installed.has(target));
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

/** Returns a new package.json: adds `native:android:dev`/`native:android:build` scripts only where absent. */
export function patchAndroidScripts(pkg) {
  const scripts = { ...(pkg.scripts ?? {}) };
  if (!('native:android:dev' in scripts)) scripts['native:android:dev'] = 'tauri android dev';
  if (!('native:android:build' in scripts)) scripts['native:android:build'] = 'tauri android build';
  return { ...pkg, scripts };
}

/** The default injectable `exec`: a synchronous child process whose stdout is returned as a string. */
function defaultExec(cmd, args, opts = {}) {
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
 * `build.rs`, hides the system bars in `MainActivity.kt`, and adds
 * `native:android:*` scripts. No console output; the CLI wrapper below owns
 * presentation. Idempotent: a second run makes zero `run` calls and zero writes.
 *
 * @param {string} cwd
 * @param {object} [opts] unused today; kept for symmetry with `initNative`
 * @param {{ run?: typeof defaultRun, exec?: typeof defaultExec, env?: Record<string, string>, platform?: string, homedir?: string, exists?: (p: string) => boolean, listDir?: (p: string) => string[] }} [deps]
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

  const pkgRaw = fs.readFileSync(pkgPath, 'utf-8');
  const pkg = JSON.parse(pkgRaw);
  const patchedPkg = patchAndroidScripts(pkg);
  const addedScripts = Object.keys(patchedPkg.scripts).filter((name) => !(name in (pkg.scripts ?? {})));
  if (addedScripts.length) {
    writeJson(pkgPath, patchedPkg, detectIndent(pkgRaw));
  }

  const buildRsPatched = buildRsPlan === 'write';
  return {
    status: 'ok',
    changed: addedTargets.length > 0 || ranAndroidInit || buildRsPatched || mainActivityPatched || addedScripts.length > 0,
    addedTargets,
    ranAndroidInit,
    buildRsPatched,
    mainActivityPatched,
    addedScripts,
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

function printUsage() {
  console.error(red('Usage: caper native init [--identifier <id>] [--port <n>] [--icon <png>]'));
  console.error(red('       caper native plugin'));
  console.error(red('       caper native android'));
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
    if (result.addedScripts.length) console.log(`  ${yellow('scripts:')} ${result.addedScripts.join(', ')}`);
  }
  for (const warning of result.warnings) console.log(yellow(`  ⚠ ${warning}`));

  console.log('\n  Next:');
  console.log(`    ${cyan('pnpm native:android:dev')}  ${dim('# on a device or emulator')}`);
  console.log(`    ${cyan('pnpm native:android:build --debug --apk --target aarch64')}`);
  console.log(`  Those scripts need NDK_HOME and JAVA_HOME exported in your shell:`);
  console.log(`    export NDK_HOME="${result.env.NDK_HOME}"`);
  console.log(`    export JAVA_HOME="${result.env.JAVA_HOME}"`);
  if (result.env.rustupBin) {
    console.log(`  and rustup's Rust ahead of any other on PATH (plain Homebrew rust has no Android targets):`);
    console.log(`    export PATH="${result.env.rustupBin}:$PATH"`);
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
    await runAndroid();
    return;
  }

  printUsage();
  process.exit(1);
}
