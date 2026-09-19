import { bold, cyan, dim, green, red, yellow } from 'kleur/colors';

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
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

  return { dev, build, addDev };
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

  writeJson(pkgPath, patchPackageScripts(pkg), detectIndent(pkgRaw));

  if (opts.icon) {
    run(EXEC_RUNNER[pm], ['tauri', 'icon', opts.icon], { cwd });
  }

  return { status: 'ok', name, title, identifier, port, pm };
}

function printUsage() {
  console.error(red('Usage: caper native init [--identifier <id>] [--port <n>] [--icon <png>]'));
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

  printUsage();
  process.exit(1);
}
