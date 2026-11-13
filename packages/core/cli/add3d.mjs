import { bold, cyan, green, red } from 'kleur/colors';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { commandsFor, defaultExec, defaultRun, missingDeps, packageManagerFor } from './native.mjs';

const VERSION_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const SCENE_PATH = 'src/scenes/Sample3DScene.ts';

const SCENE = `import { defineScene, Scene } from '@caperjs/core';
import type { Mesh3D } from '@pixi/3d';

export const scene = defineScene({
  id: 'sample-3d',
});

// Made by \`caper add 3d\`. Built-in shapes only, so it runs with no model files.
// To show a model: put a .glb in an assets folder, preload its bundle, then
// view.add.model({ asset: 'its-name' }).
export default class Sample3DScene extends Scene {
  private cube?: Mesh3D;

  initialize() {
    const view = this.add.view3d({
      // fitAspect keeps the whole scene in frame on a phone held upright.
      camera: { position: [0, 2.5, 6], lookAt: [0, 0.75, 0], fitAspect: 4 / 3 },
    });
    view.add.light({ type: 'directional', intensity: 3, castShadow: true });
    view.add.mesh({
      geometry: 'plane',
      color: 0x7f8f6a,
      rotation: [-Math.PI / 2, 0, 0],
      scale: 12,
      castShadow: false,
    });
    this.cube = view.add.mesh({ geometry: 'box', color: 0xe85d5d, y: 1 });
    view.add.mesh({ geometry: 'sphere', color: 0x4a90d9, x: 2, y: 0.5 });
  }

  update() {
    if (this.cube) this.cube.rotation.y += 0.02 * this.app.ticker.deltaTime;
  }
}
`;

/** Read an installed package while walking upward through workspace node_modules. */
export function readInstalledPackage(cwd, name) {
  let current = path.resolve(cwd);
  for (;;) {
    const file = path.join(current, 'node_modules', name, 'package.json');
    try {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch {
      // Try the next workspace level.
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/** True for `1.2.3` / `1.2.3-beta.1` only: safe to print and to pass to a package manager. */
export function isPlainVersion(value) {
  return typeof value === 'string' && VERSION_RE.test(value);
}

function requireVersion(raw, name, stripRange = false) {
  const version = stripRange && typeof raw === 'string' ? raw.replace(/^[~^]/, '') : raw;
  if (!isPlainVersion(version)) {
    throw new Error(`Could not use ${name} version ${JSON.stringify(raw)}. Expected a version like 1.2.3.`);
  }
  return version;
}

/** Orders two plain versions; a prerelease sorts before its release. */
export function compareVersions(a, b) {
  const [mainA, preA] = a.split('-', 2);
  const [mainB, preB] = b.split('-', 2);
  const av = mainA.split('.').map(Number);
  const bv = mainB.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (av[i] !== bv[i]) return av[i] < bv[i] ? -1 : 1;
  }
  if (!preA && preB) return 1;
  if (preA && !preB) return -1;
  return preA === preB ? 0 : preA < preB ? -1 : 1;
}

// A file the app points elsewhere (a symlink) is the user's to edit: the command prints the step instead.
function isSymlink(file) {
  try { return fs.lstatSync(file).isSymbolicLink(); } catch { return false; }
}

function findUp(cwd, name) {
  let current = path.resolve(cwd);
  for (;;) {
    const file = path.join(current, name);
    if (fs.existsSync(file)) return file;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/** A text-only edit for pnpm's release-age exception list. Unknown YAML shapes are left alone. */
export function patchReleaseAgeExclude(yamlText, spec) {
  const lines = yamlText.split('\n');
  const keyIndex = lines.findIndex((line) => /^minimumReleaseAgeExclude:/.test(line));
  if (keyIndex === -1) {
    const prefix = !yamlText || yamlText.endsWith('\n') ? yamlText : `${yamlText}\n`;
    return { text: `${prefix}minimumReleaseAgeExclude:\n  - '${spec}'\n`, changed: true };
  }
  if (lines[keyIndex] !== 'minimumReleaseAgeExclude:') return null;

  let itemIndent = null;
  let lastItem = -1;
  for (let i = keyIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || /^\s*#/.test(line)) continue;
    if (!/^\s/.test(line)) break;
    const match = /^(\s+)-\s+(.+?)\s*$/.exec(line);
    if (!match || (itemIndent !== null && match[1] !== itemIndent)) return null;
    itemIndent = match[1];
    lastItem = i;
    const item = match[2].replace(/^(['"])(.*)\1$/, '$2');
    if (item === spec) return { text: yamlText, changed: false };
  }
  if (lastItem === -1) return null;
  lines.splice(lastItem + 1, 0, `${itemIndent}- '${spec}'`);
  return { text: lines.join('\n'), changed: true };
}

// Mask comments without changing offsets or newlines, so bracket matching still
// works when plugin entries contain nested arrays or comments.
function maskComments(text) {
  let result = '';
  let quote = null;
  let comment = null;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (comment === 'line') {
      if (char === '\n') { comment = null; result += '\n'; } else result += ' ';
      continue;
    }
    if (comment === 'block') {
      if (char === '*' && next === '/') { result += '  '; i++; comment = null; }
      else result += char === '\n' ? '\n' : ' ';
      continue;
    }
    if (quote) {
      result += char;
      if (char === '\\') { result += next ?? ''; i++; }
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '/' && next === '/') { result += '  '; i++; comment = 'line'; continue; }
    if (char === '/' && next === '*') { result += '  '; i++; comment = 'block'; continue; }
    if (char === "'" || char === '"' || char === '`') quote = char;
    result += char;
  }
  return result;
}

function matchingBracket(text, start) {
  let depth = 0;
  let quote = null;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      if (char === '\\') i++;
      else if (char === quote) quote = null;
    } else if (char === "'" || char === '"' || char === '`') quote = char;
    else if (char === '[') depth++;
    else if (char === ']' && --depth === 0) return i;
  }
  return -1;
}

function splitTopLevel(text) {
  const entries = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      if (char === '\\') i++;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') quote = char;
    else if ('[{('.includes(char)) depth++;
    else if (']})'.includes(char)) depth--;
    else if (char === ',' && depth === 0) { entries.push(text.slice(start, i).trim()); start = i + 1; }
  }
  entries.push(text.slice(start).trim());
  return entries;
}

function pluginsArrayStart(text) {
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      if (char === '\\') i++;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') { quote = char; continue; }
    if (!text.startsWith('plugins', i) || /[\w$]/.test(text[i - 1] ?? '')) continue;
    let j = i + 'plugins'.length;
    if (/[\w$]/.test(text[j] ?? '')) continue;
    while (/\s/.test(text[j] ?? '')) j++;
    if (text[j++] !== ':') continue;
    while (/\s/.test(text[j] ?? '')) j++;
    if (text[j] === '[') return j;
  }
  return -1;
}

/** The 3D entry state inside the first active `plugins: [...]` array. */
export function read3dConfig(text) {
  const source = maskComments(text);
  const open = pluginsArrayStart(source);
  if (open === -1) return 'no-plugins-array';
  const close = matchingBracket(source, open);
  if (close === -1) return 'no-plugins-array';
  const entries = splitTopLevel(source.slice(open + 1, close));
  let listed = false;
  for (const entry of entries) {
    if (/^(['"])3d\1$/.test(entry)) listed = true;
    const tuple = /^\[\s*(['"])3d\1\s*,([\s\S]*)\]$/.exec(entry);
    if (tuple) {
      if (/\bautoLoad\s*:\s*false\b/.test(tuple[2])) return 'auto-load-false';
      listed = true;
    }
  }
  return listed ? 'listed' : 'not-listed';
}

/**
 * Adds `'3d'` as the last entry of the config's `plugins` array. Brackets inside comments and strings are
 * ignored. Returns null when there is no plugins array to add to.
 */
export function add3dToConfig(text) {
  const source = maskComments(text);
  const open = pluginsArrayStart(source);
  const close = open === -1 ? -1 : matchingBracket(source, open);
  if (close === -1) return null;
  const inner = source.slice(open + 1, close);
  const used = inner.trimEnd().length;
  if (!used) return `${text.slice(0, open + 1)}'3d'${text.slice(close)}`;

  const last = open + used; // the last character of the last entry (or its trailing comma)
  const head = text.slice(0, last + 1) + (source[last] === ',' ? '' : ',');
  const tail = text.slice(last + 1, close); // comments and whitespace before the closing bracket
  if (!inner.includes('\n')) return `${head}${tail || ' '}'3d'${text.slice(close)}`;
  const indent = /\n([ \t]*)\S/.exec(inner)?.[1] ?? '    ';
  const closingIndent = /\n([ \t]*)$/.exec(tail)?.[1];
  if (closingIndent === undefined) return `${head}${tail}\n${indent}'3d'${text.slice(close)}`;
  return `${head}${tail.slice(0, tail.length - closingIndent.length)}${indent}'3d',\n${closingIndent}${text.slice(close)}`;
}

/** Set up the 3D plugin, release-age exception, config entry, and sample scene. */
export async function add3d(cwd, opts = {}, { run = defaultRun, exec = defaultExec, log = console.log } = {}) {
  const packageFile = path.join(cwd, 'package.json');
  if (!fs.existsSync(packageFile)) throw new Error('no package.json found in this directory.');
  // Windows package managers are .cmd shims, which Node only starts through a shell. Every argument below
  // is a fixed string or a version that passed isPlainVersion, so there is nothing for a shell to expand.
  const spawnOpts = { cwd, shell: process.platform === 'win32' };
  const pkg = JSON.parse(fs.readFileSync(packageFile, 'utf-8'));

  const plugin = readInstalledPackage(cwd, '@caperjs/plugin-3d');
  let pixi3dPin = plugin?.peerDependencies?.['@pixi/3d'];
  if (!pixi3dPin) {
    try {
      const peers = JSON.parse(exec('npm', ['view', '@caperjs/plugin-3d', 'peerDependencies', '--json'], spawnOpts));
      pixi3dPin = peers?.['@pixi/3d'];
    } catch {
      // The plain error below also covers missing or malformed registry data.
    }
  }
  if (!pixi3dPin) {
    throw new Error('Could not find out which @pixi/3d version @caperjs/plugin-3d needs. Check your network, or install @caperjs/plugin-3d first and run this again.');
  }
  pixi3dPin = requireVersion(pixi3dPin, '@pixi/3d');
  const corePkg = JSON.parse(fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf-8'));
  const corePixi = requireVersion(corePkg.peerDependencies?.['pixi.js'], 'pixi.js', true);

  const installedPixi3d = readInstalledPackage(cwd, '@pixi/3d');
  const installedPixi = readInstalledPackage(cwd, 'pixi.js');
  const installed = missingDeps(pkg, ['@caperjs/plugin-3d']);
  if (missingDeps(pkg, ['@pixi/3d']).length || installedPixi3d?.version !== pixi3dPin) installed.push(`@pixi/3d@${pixi3dPin}`);
  if (installedPixi?.version && compareVersions(requireVersion(installedPixi.version, 'installed pixi.js'), corePixi) < 0) {
    installed.push(`pixi.js@${corePixi}`);
  }

  const pm = packageManagerFor(cwd);
  const manualSteps = [];
  let releaseAge = 'not-needed';
  const pixi3dSpec = `@pixi/3d@${pixi3dPin}`;
  if (pm === 'pnpm' && installed.includes(pixi3dSpec)) {
    let pnpmVersion;
    try { pnpmVersion = String(exec('pnpm', ['--version'], spawnOpts)).trim(); } catch { pnpmVersion = null; }
    if (pnpmVersion && VERSION_RE.test(pnpmVersion) && compareVersions(pnpmVersion, '10.16.0') >= 0) {
      const existing = findUp(cwd, 'pnpm-workspace.yaml');
      const yamlFile = existing ?? path.join(path.dirname(findUp(cwd, 'pnpm-lock.yaml') ?? path.join(cwd, 'pnpm-lock.yaml')), 'pnpm-workspace.yaml');
      const yaml = existing ? fs.readFileSync(existing, 'utf-8') : '';
      const patch = isSymlink(yamlFile) ? null : patchReleaseAgeExclude(yaml, pixi3dSpec);
      if (!patch) {
        releaseAge = 'manual';
        manualSteps.push(`Add this line under minimumReleaseAgeExclude in ${yamlFile}:   - '${pixi3dSpec}'`);
      } else if (patch.changed) {
        fs.writeFileSync(yamlFile, patch.text, 'utf-8');
        releaseAge = 'added';
        log(`Allowed ${pixi3dSpec} in pnpm-workspace.yaml (pnpm holds back packages published in the last day; this lets the pinned version install).`);
      } else releaseAge = 'present';
    }
  }

  if (installed.length) {
    const { cmd, args } = commandsFor(pm, 0).add(...installed);
    log(`Installing ${installed.join(', ')} (${[cmd, ...args].join(' ')})`);
    run(cmd, args, spawnOpts);
  }

  const configFile = path.join(cwd, 'caper.config.ts');
  let config = 'manual';
  if (fs.existsSync(configFile) && !isSymlink(configFile)) {
    const source = fs.readFileSync(configFile, 'utf-8');
    const state = read3dConfig(source);
    if (state === 'listed' || state === 'auto-load-false') {
      config = 'present';
      if (state === 'auto-load-false') manualSteps.push("'3d' must load at startup. Remove autoLoad: false from its entry in caper.config.ts.");
    } else if (state === 'not-listed') {
      const patched = add3dToConfig(source);
      if (patched && read3dConfig(patched) === 'listed') {
        fs.writeFileSync(configFile, patched, 'utf-8');
        config = 'added';
      }
    }
  }
  if (config === 'manual') manualSteps.push("Add this line inside defineConfig({ ... }) in caper.config.ts:  plugins: ['3d'],");

  const sceneFile = path.join(cwd, SCENE_PATH);
  fs.mkdirSync(path.dirname(sceneFile), { recursive: true });
  let scene = 'created';
  // The scenes folder must really be inside the app; a folder linked from elsewhere is left alone.
  const sceneDir = fs.realpathSync(path.dirname(sceneFile));
  if (!sceneDir.startsWith(fs.realpathSync(cwd) + path.sep)) {
    scene = 'skipped';
    manualSteps.push('src/scenes points outside this app, so no sample scene was written.');
  } else {
    try { fs.writeFileSync(path.join(sceneDir, path.basename(sceneFile)), SCENE, { encoding: 'utf-8', flag: 'wx' }); }
    catch (err) { if (err.code === 'EEXIST') scene = 'exists'; else throw err; }
  }

  return { installed, releaseAge, config, scene, scenePath: SCENE_PATH, manualSteps };
}

/** CLI presentation for `caper add 3d`. */
export async function add3dCommand() {
  try {
    const result = await add3d(process.cwd());
    console.log(green(bold(result.installed.length ? '✓ Installed' : '✓ Dependencies already in place')) + (result.installed.length ? ` ${result.installed.join(', ')}` : ''));
    if (result.releaseAge === 'added') console.log(green(bold('✓ Allowed the pinned @pixi/3d release in pnpm-workspace.yaml')));
    if (result.releaseAge === 'present') console.log(green(bold('✓ pnpm release exception already in place')));
    if (result.config === 'added') console.log(green(bold("✓ Added '3d' to caper.config.ts")));
    if (result.config === 'present') console.log(green(bold("✓ '3d' is in caper.config.ts")));
    if (result.scene !== 'skipped') console.log(green(bold(result.scene === 'created' ? '✓ Created sample scene' : '✓ Sample scene already exists')) + ` ${cyan(result.scenePath)}`);
    for (const step of result.manualSteps) console.log(step);
    console.log("Start your dev server (restart it if it is already running), then open the scene: set defaultScene: 'sample-3d' in caper.config.ts, or call app.scenes.load('sample-3d').");
    console.log('Types for this.add.view3d come from the generated caper-app.d.ts (dev server start, or npx caper types).');
    console.log('3D is experimental and adds about 160 KB (gzip) to startup.');
    console.log('Using an AI agent? Give it the PixiJS 3D skill: npx skills add https://github.com/pixijs/pixijs-skills --skill pixijs-3d');
  } catch (err) {
    console.error(red(`caper add 3d: ${err.message}`));
    process.exit(1);
  }
}
