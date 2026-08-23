import { dim, green, red, yellow } from 'kleur/colors';

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * `caper doctor` — one-shot health report for a Caper app.
 *
 * Answers the recurring agent questions: which caper is active, is it current,
 * are generated types fresh, and are the agent pointers installed.
 */

const START_MARKER = '<!-- caper:agent-start -->';
const END_MARKER = '<!-- caper:agent-end -->';

const readInstalledVersion = () => {
  const url = new URL('../package.json', import.meta.url);
  const pkgPath = url.protocol === 'file:' ? fileURLToPath(url.href) : path.resolve(process.cwd(), 'package.json');
  return JSON.parse(fs.readFileSync(pkgPath, 'utf-8')).version;
};

const rel = (cwd, p) => {
  const r = path.relative(cwd, p);
  return r.startsWith('..') ? r : `.${path.sep}${r}`;
};

const newestMtime = (dirOrFile) => {
  if (!fs.existsSync(dirOrFile)) return null;
  const stat = fs.statSync(dirOrFile);
  if (stat.isFile()) return stat.mtime;
  if (!stat.isDirectory()) return null;
  let newest = null;
  for (const entry of fs.readdirSync(dirOrFile)) {
    if (entry === 'node_modules' || entry === '.git') continue;
    const childNewest = newestMtime(path.join(dirOrFile, entry));
    if (childNewest && (!newest || childNewest > newest)) newest = childNewest;
  }
  return newest;
};

const compareVersions = (a, b) => {
  const ap = a.split('.').map(Number);
  const bp = b.split('.').map(Number);
  for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
    const av = ap[i] ?? 0;
    const bv = bp[i] ?? 0;
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  return 0;
};

const npmLatestVersion = (pkg, timeoutMs = 5000) =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    execFile('npm', ['view', pkg, 'version'], { timeout: timeoutMs }, (err, stdout) => {
      clearTimeout(timer);
      resolve(err || !stdout ? null : stdout.trim());
    });
  });

const readJson = (file) => {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
};

/** tsconfig.json is JSON with comments and trailing commas often enough to matter. */
const readJsonc = (file) => {
  if (!fs.existsSync(file)) return null;
  try {
    const raw = fs
      .readFileSync(file, 'utf-8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:"'\\])\/\/.*$/gm, '$1')
      .replace(/,(\s*[}\]])/g, '$1');
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const push = (checks, id, status, label, hint) => {
  checks.push({ id, status, label, ...(hint ? { hint } : {}) });
};

/**
 * Resolve a tsconfig `extends` entry to an absolute config file path,
 * TypeScript-style: relative specs resolve against the extending config's
 * directory, everything else resolves node-module-style (bare package name,
 * `+ .json`, `+ /tsconfig.json`) rooted at that same config file so an app's
 * own node_modules is used. Returns null (never throws) when nothing resolves.
 */
const resolveExtendsSpec = (spec, fromConfigFile) => {
  const fromDir = path.dirname(fromConfigFile);
  const isRelative = spec.startsWith('./') || spec.startsWith('../') || path.isAbsolute(spec);

  if (isRelative) {
    const base = path.isAbsolute(spec) ? spec : path.resolve(fromDir, spec);
    if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
    const withJson = base.endsWith('.json') ? base : `${base}.json`;
    return fs.existsSync(withJson) ? withJson : null;
  }

  const require = createRequire(fromConfigFile);
  const candidates = [spec, `${spec}.json`, `${spec}/tsconfig.json`];
  for (const candidate of candidates) {
    try {
      return require.resolve(candidate);
    } catch {
      // try the next candidate
    }
  }
  // Some bare specs are effectively relative paths, or node-module resolution
  // fails for other plausible reasons — fall back to filesystem paths relative
  // to the extending config's directory before giving up.
  for (const candidate of candidates) {
    const asPath = path.resolve(fromDir, candidate);
    if (fs.existsSync(asPath) && fs.statSync(asPath).isFile()) return asPath;
  }
  return null;
};

/**
 * Effective `compilerOptions` for a tsconfig, walking `extends` (string or
 * array, TS 5 style) like `tsc` does: the own config's fields override
 * wholesale, later array entries beat earlier ones, and each base can itself
 * extend further (recursion). Cycle-guarded per ancestor chain and depth
 * capped; unreadable/unresolvable bases are silently skipped so doctor never
 * crashes on a weird config.
 */
const resolveEffectiveCompilerOptions = (configFile, ancestors = new Set(), depth = 0) => {
  if (depth > 10) return {};

  let real;
  try {
    real = fs.realpathSync(configFile);
  } catch {
    real = configFile;
  }
  if (ancestors.has(real)) return {};

  const config = readJsonc(configFile);
  if (!config) return {};

  const nextAncestors = new Set(ancestors);
  nextAncestors.add(real);

  let inherited = {};
  if (config.extends) {
    const specs = Array.isArray(config.extends) ? config.extends : [config.extends];
    for (const spec of specs) {
      const resolved = resolveExtendsSpec(spec, configFile);
      if (!resolved) continue;
      const baseOptions = resolveEffectiveCompilerOptions(resolved, nextAncestors, depth + 1);
      inherited = { ...inherited, ...baseOptions };
    }
  }

  return { ...inherited, ...(config.compilerOptions ?? {}) };
};

export async function runChecks(cwd, { online = true } = {}) {
  const checks = [];
  const installedVersion = readInstalledVersion();
  const nodeModulesCaper = path.join(cwd, 'node_modules/@caperjs/core');

  push(checks, 'version', 'ok', `@caperjs/core ${installedVersion}`);

  if (online) {
    const latest = await npmLatestVersion('@caperjs/core');
    if (!latest) push(checks, 'npm', 'warn', 'latest on npm', 'lookup failed (offline?)');
    else if (compareVersions(installedVersion, latest) < 0) {
      push(checks, 'npm', 'warn', `latest on npm ${latest}`, 'pnpm update @caperjs/core@latest');
    } else push(checks, 'npm', 'ok', `latest on npm ${latest}`);
  }

  if (!fs.existsSync(nodeModulesCaper)) {
    push(checks, 'link', 'fail', '@caperjs/core not in node_modules', 'pnpm install');
  } else {
    let real;
    try {
      real = fs.realpathSync(nodeModulesCaper);
    } catch {
      push(checks, 'link', 'fail', 'node_modules/@caperjs/core is broken', 'pnpm install');
    }
    if (real) {
      if (real.startsWith(path.join(cwd, 'node_modules') + path.sep)) {
        push(checks, 'link', 'ok', 'registry build');
      } else {
        const buildFile = path.join(real, 'lib/caper.mjs');
        const label = `linked from ${rel(cwd, real)}`;
        if (!fs.existsSync(buildFile)) {
          push(checks, 'link', 'fail', label, 'pnpm build in linked package');
        } else {
          const srcMtime = newestMtime(path.join(real, 'src'));
          const stale = srcMtime && srcMtime > fs.statSync(buildFile).mtime;
          push(checks, 'link', stale ? 'warn' : 'ok', label, stale ? 'engine source edited after last build; run pnpm build there' : undefined);
        }
      }
    }
  }

  const appTypesFile = path.join(cwd, 'src/types/caper-app.d.ts');
  if (!fs.existsSync(appTypesFile)) {
    push(checks, 'app-types', 'fail', 'generated app types missing', 'npx caper types');
  } else {
    const sources = ['caper.config.ts', 'src/scenes', 'src/plugins', 'src/popups', 'src/entities', 'src/ui', 'src/locales'].map((s) => path.join(cwd, s));
    const newestSource = sources.reduce((best, s) => {
      const m = newestMtime(s);
      return m && (!best || m > best) ? m : best;
    }, null);
    const stale = newestSource && newestSource > fs.statSync(appTypesFile).mtime;
    push(checks, 'app-types', stale ? 'warn' : 'ok', stale ? 'generated app types stale' : 'generated app types fresh', stale ? 'npx caper types (or restart dev server)' : undefined);
  }

  const assetTypesFile = path.join(cwd, 'src/types/caper-assets.d.ts');
  const assetsManifest = path.join(cwd, 'public/assets/assets.json');
  if (fs.existsSync(assetTypesFile)) push(checks, 'asset-types', 'ok', 'generated asset types present');
  else push(checks, 'asset-types', 'warn', 'generated asset types missing', 'npx caper types (app may have assets: false)');
  if (fs.existsSync(assetsManifest)) push(checks, 'asset-manifest', 'ok', 'asset manifest present');
  else push(checks, 'asset-manifest', 'warn', 'asset manifest missing', 'asset pipeline has not run; npx caper types or pnpm dev once');

  const agentContext = ['AGENTS.md', 'CLAUDE.md'].find((name) => fs.existsSync(path.join(cwd, name)));
  if (!agentContext) {
    push(checks, 'agent', 'warn', 'agent context missing', 'npx caper agent init');
  } else {
    const contents = fs.readFileSync(path.join(cwd, agentContext), 'utf-8');
    const start = contents.indexOf(START_MARKER);
    const end = contents.indexOf(END_MARKER);
    if (start === -1 || end === -1 || end <= start) {
      push(checks, 'agent', 'warn', 'agent pointers not installed', 'npx caper agent init');
    } else {
      const block = contents.slice(start, end + END_MARKER.length);
      const versionMatch = block.match(/@caperjs\/core@(\d+\.\d+\.\d+)/);
      const skillMatch = block.match(/load the `caper` skill at `([^`]+)`/);
      const hints = [];
      if (versionMatch && versionMatch[1] !== installedVersion) {
        hints.push(`pointer is @caperjs/core@${versionMatch[1]}; re-run npx caper agent init`);
      }
      if (skillMatch) {
        if (!fs.existsSync(path.join(cwd, skillMatch[1].replace(/\//g, path.sep)))) {
          hints.push(`skill file missing at ${skillMatch[1]}; npx caper agent init`);
        }
      } else hints.push('skill path not found in pointer block; npx caper agent init');
      push(checks, 'agent', hints.length ? 'warn' : 'ok', 'agent pointers', hints.length ? hints.join('; ') : undefined);
    }
  }

  const peerDeps = ['pixi.js', 'gsap', '@pixi/sound', 'vite'];
  const required = new Set(['pixi.js', 'vite']);
  let peerStatus = 'ok';
  // Direct lookup rather than require.resolve: pixi.js's `exports` map does not
  // expose ./package.json, so resolve() throws even when it is installed.
  const peerResults = peerDeps.map((pkg) => {
    try {
      const pkgJsonPath = path.join(cwd, 'node_modules', pkg, 'package.json');
      return `${pkg}@${JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8')).version}`;
    } catch {
      if (required.has(pkg)) peerStatus = 'fail';
      else if (peerStatus === 'ok') peerStatus = 'warn';
      return `${pkg} missing`;
    }
  });
  push(checks, 'peers', peerStatus, `peer deps: ${peerResults.join(', ')}`, peerStatus !== 'ok' ? 'pnpm install' : undefined);

  // Solid JSX only typechecks with three tsconfig settings, and none of them can
  // be defaulted from caper's base config: `jsxFactory` is a type-lookup root
  // that exists because a transitive @types/react would otherwise shadow the
  // global JSX namespace. Apps without @caperjs/solid never see this check.
  const appPkg = readJson(path.join(cwd, 'package.json'));
  const appDeps = { ...appPkg?.dependencies, ...appPkg?.devDependencies };
  if (appDeps['@caperjs/solid']) {
    const tsconfigPath = path.join(cwd, 'tsconfig.json');
    const tsconfig = readJsonc(tsconfigPath);
    if (!tsconfig) {
      push(checks, 'solid-tsconfig', 'fail', 'solid tsconfig unreadable', 'tsconfig.json is missing or not parseable');
    } else {
      const compilerOptions = resolveEffectiveCompilerOptions(tsconfigPath);
      const missing = [];
      if (compilerOptions.jsx !== 'preserve') missing.push('"jsx": "preserve"');
      if (compilerOptions.jsxFactory !== 'CaperJSX.h') missing.push('"jsxFactory": "CaperJSX.h"');
      if (!compilerOptions.types?.includes('@caperjs/solid/jsx')) missing.push('"@caperjs/solid/jsx" in types');
      push(
        checks,
        'solid-tsconfig',
        missing.length ? 'fail' : 'ok',
        missing.length ? 'solid tsconfig incomplete' : 'solid tsconfig',
        missing.length ? `add ${missing.join(', ')} to tsconfig.json compilerOptions` : undefined,
      );
    }
  }

  const caches = ['.assetpack', '.cache', 'dist'].filter((name) => fs.existsSync(path.join(cwd, name)));
  push(checks, 'caches', 'ok', `caches${caches.length ? `: ${caches.join(', ')}` : ' clean'}`, caches.length ? 'rm -rf them on weird asset/name mismatches' : undefined);

  return checks;
}

export async function doctor(args) {
  const offline = args.includes('--offline');
  const json = args.includes('--json');
  const checks = await runChecks(process.cwd(), { online: !offline });

  if (json) {
    console.log(JSON.stringify(checks, null, 2));
  } else {
    for (const check of checks) {
      const symbol = check.status === 'ok' ? green('✓') : check.status === 'warn' ? yellow('⚠') : red('✗');
      console.log(`${symbol} ${check.label}${check.hint ? ` ${dim(check.hint)}` : ''}`);
    }
  }

  if (checks.some((c) => c.status === 'fail')) process.exit(1);
}
