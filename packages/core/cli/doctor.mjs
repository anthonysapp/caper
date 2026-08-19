import { dim, green, red, yellow } from 'kleur/colors';

import { execFile } from 'node:child_process';
import fs from 'node:fs';
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

const push = (checks, id, status, label, hint) => {
  checks.push({ id, status, label, ...(hint ? { hint } : {}) });
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
