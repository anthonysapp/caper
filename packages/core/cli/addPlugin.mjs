import fs from 'node:fs';
import path from 'node:path';

import { commandsFor, defaultExec, defaultRun, missingDeps, packageManagerFor } from './native.mjs';

const VERSION_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

/**
 * The install commands for `specs` (`name` or `name@version`). pnpm, yarn and bun save an explicit
 * version as given. npm saves `^version` instead, which would let a pinned beta engine drift, so under
 * npm the pinned specs get their own `--save-exact` install and the rest keep their normal range.
 */
export function installCommands(pm, specs) {
  const { add } = commandsFor(pm, 0);
  if (pm !== 'npm') return [add(...specs)];
  const pinned = specs.filter((spec) => spec.lastIndexOf('@') > 0);
  const ranged = specs.filter((spec) => !pinned.includes(spec));
  return [
    ...(ranged.length ? [add(...ranged)] : []),
    ...(pinned.length ? [{ cmd: 'npm', args: ['install', '--save-exact', ...pinned] }] : []),
  ];
}

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

// The raw value is never printed: it can come from the registry.
export function requireVersion(raw, name, stripRange = false) {
  const version = stripRange && typeof raw === 'string' ? raw.replace(/^[~^]/, '') : raw;
  if (!isPlainVersion(version)) throw new Error(`Could not use ${name} version. Expected a version like 1.2.3.`);
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

/** An entry state inside the first active `plugins: [...]` array. */
export function readPluginConfig(text, id) {
  const source = maskComments(text);
  const open = pluginsArrayStart(source);
  if (open === -1) return 'no-plugins-array';
  const close = matchingBracket(source, open);
  if (close === -1) return 'no-plugins-array';
  const entries = splitTopLevel(source.slice(open + 1, close));
  let listed = false;
  for (const entry of entries) {
    if (/^(['"])([^'"]+)\1$/.exec(entry)?.[2] === id) listed = true;
    const tuple = /^\[\s*(['"])([^'"]+)\1\s*,([\s\S]*)\]$/.exec(entry);
    if (tuple?.[2] === id) {
      if (/\bautoLoad\s*:\s*false\b/.test(tuple[3])) return 'auto-load-false';
      listed = true;
    }
  }
  return listed ? 'listed' : 'not-listed';
}

/**
 * Adds a plugin as the last entry of the config's `plugins` array. Brackets inside comments and strings are
 * ignored. Returns null when there is no plugins array to add to.
 */
export function addPluginToConfig(text, id) {
  const source = maskComments(text);
  const open = pluginsArrayStart(source);
  const close = open === -1 ? -1 : matchingBracket(source, open);
  if (close === -1) return null;
  const inner = source.slice(open + 1, close);
  const used = inner.trimEnd().length;
  if (!used) return `${text.slice(0, open + 1)}'${id}'${text.slice(close)}`;

  const last = open + used; // the last character of the last entry (or its trailing comma)
  const head = text.slice(0, last + 1) + (source[last] === ',' ? '' : ',');
  const tail = text.slice(last + 1, close); // comments and whitespace before the closing bracket
  if (!inner.includes('\n')) return `${head}${tail || ' '}'${id}'${text.slice(close)}`;
  const indent = /\n([ \t]*)\S/.exec(inner)?.[1] ?? '    ';
  const closingIndent = /\n([ \t]*)$/.exec(tail)?.[1];
  if (closingIndent === undefined) return `${head}${tail}\n${indent}'${id}'${text.slice(close)}`;
  return `${head}${tail.slice(0, tail.length - closingIndent.length)}${indent}'${id}',\n${closingIndent}${text.slice(close)}`;
}


/** Recognized ids in their config order. */
export function listedPluginIds(text) {
  const source = maskComments(text);
  const open = pluginsArrayStart(source);
  const close = open === -1 ? -1 : matchingBracket(source, open);
  if (close === -1) return [];
  return splitTopLevel(source.slice(open + 1, close)).flatMap((entry) => {
    const match = /^(?:\[\s*)?(['"])([\w-]+)\1(?:\s*,[\s\S]*\])?$/.exec(entry);
    return match ? [match[2]] : [];
  });
}

/** Install a pinned plugin and write its config entry and sample scene. */
export async function addPlugin(cwd, spec, { run = defaultRun, exec = defaultExec, log = console.log } = {}) {
  const packageFile = path.join(cwd, 'package.json');
  if (!fs.existsSync(packageFile)) throw new Error('no package.json found in this directory.');
  // Windows package managers are .cmd shims, which Node only starts through a shell. Every argument below
  // is a fixed string or a version that passed isPlainVersion, so there is nothing for a shell to expand.
  const spawnOpts = { cwd, shell: process.platform === 'win32' };
  const pkg = JSON.parse(fs.readFileSync(packageFile, 'utf-8'));

  const plugin = readInstalledPackage(cwd, spec.pluginPackage);
  let pin = plugin?.peerDependencies?.[spec.enginePackage];
  if (!pin) {
    try {
      const peers = JSON.parse(exec('npm', ['view', spec.pluginPackage, 'peerDependencies', '--json'], spawnOpts));
      pin = peers?.[spec.enginePackage];
    } catch {
      // The plain error below also covers missing or malformed registry data.
    }
  }
  if (!pin) {
    throw new Error(`Could not find out which ${spec.enginePackage} version ${spec.pluginPackage} needs. Check your network, or install ${spec.pluginPackage} first and run this again.`);
  }
  pin = requireVersion(pin, spec.enginePackage);

  const installedEngine = readInstalledPackage(cwd, spec.enginePackage);
  const installed = missingDeps(pkg, [spec.pluginPackage]);
  if (missingDeps(pkg, [spec.enginePackage]).length || installedEngine?.version !== pin) installed.push(`${spec.enginePackage}@${pin}`);
  if (spec.extraInstalls) installed.push(...spec.extraInstalls(cwd));

  const pm = packageManagerFor(cwd);
  const manualSteps = [];
  let releaseAge = 'not-needed';
  const engineSpec = `${spec.enginePackage}@${pin}`;
  if (pm === 'pnpm' && installed.includes(engineSpec)) {
    let pnpmVersion;
    try { pnpmVersion = String(exec('pnpm', ['--version'], spawnOpts)).trim(); } catch { pnpmVersion = null; }
    if (pnpmVersion && VERSION_RE.test(pnpmVersion) && compareVersions(pnpmVersion, '10.16.0') >= 0) {
      const existing = findUp(cwd, 'pnpm-workspace.yaml');
      const yamlFile = existing ?? path.join(path.dirname(findUp(cwd, 'pnpm-lock.yaml') ?? path.join(cwd, 'pnpm-lock.yaml')), 'pnpm-workspace.yaml');
      const yaml = existing ? fs.readFileSync(existing, 'utf-8') : '';
      const patch = isSymlink(yamlFile) ? null : patchReleaseAgeExclude(yaml, engineSpec);
      if (!patch) {
        releaseAge = 'manual';
        manualSteps.push(`Add this line under minimumReleaseAgeExclude in ${yamlFile}:   - '${engineSpec}'`);
      } else if (patch.changed) {
        fs.writeFileSync(yamlFile, patch.text, 'utf-8');
        releaseAge = 'added';
        log(`Allowed ${engineSpec} in pnpm-workspace.yaml (pnpm holds back packages published in the last day; this lets the pinned version install).`);
      } else releaseAge = 'present';
    }
  }

  if (installed.length) {
    const commands = installCommands(pm, installed);
    log(`Installing ${installed.join(', ')} (${commands.map(({ cmd, args }) => [cmd, ...args].join(' ')).join(' && ')})`);
    for (const { cmd, args } of commands) run(cmd, args, spawnOpts);
  }

  const configFile = path.join(cwd, 'caper.config.ts');
  let config = 'manual';
  if (fs.existsSync(configFile) && !isSymlink(configFile)) {
    const source = fs.readFileSync(configFile, 'utf-8');
    const state = readPluginConfig(source, spec.id);
    if (state === 'listed' || state === 'auto-load-false') {
      config = 'present';
      if (state === 'auto-load-false' && spec.autoLoadFalse) manualSteps.push(spec.autoLoadFalse);
    } else if (state === 'not-listed') {
      const patched = addPluginToConfig(source, spec.id);
      if (patched && readPluginConfig(patched, spec.id) === 'listed') {
        fs.writeFileSync(configFile, patched, 'utf-8');
        config = 'added';
      }
    }
  }
  if (config === 'manual') {
    manualSteps.push(`Add this line inside defineConfig({ ... }) in caper.config.ts:  plugins: ${spec.manualPlugins},`);
  }

  const sceneFile = path.join(cwd, spec.scenePath);
  let scene = 'created';
  // The scenes folder must really be inside the app. A linked src or src/scenes is left alone, checked
  // before mkdir so nothing is created through the link.
  const sceneParents = [path.join(cwd, 'src'), path.dirname(sceneFile)];
  if (sceneParents.some(isSymlink)) {
    scene = 'skipped';
    manualSteps.push('src or src/scenes is a link, so no sample scene was written.');
  } else {
    fs.mkdirSync(path.dirname(sceneFile), { recursive: true });
    const sceneDir = fs.realpathSync(path.dirname(sceneFile));
    if (!sceneDir.startsWith(fs.realpathSync(cwd) + path.sep)) {
      scene = 'skipped';
      manualSteps.push('src/scenes points outside this app, so no sample scene was written.');
    } else {
      try { fs.writeFileSync(path.join(sceneDir, path.basename(sceneFile)), spec.scene, { encoding: 'utf-8', flag: 'wx' }); }
      catch (err) { if (err.code === 'EEXIST') scene = 'exists'; else throw err; }
    }
  }

  return { installed, releaseAge, config, scene, scenePath: spec.scenePath, manualSteps };
}
