import { bold, cyan, green, red, yellow } from 'kleur/colors';

import fs from 'node:fs';
import path from 'node:path';
import { add3dCommand } from './add3d.mjs';
import { addKlippCommand } from './addKlipp.mjs';

/**
 * `caper add <kind> <Name>` — scaffolds a single file under `src/<kind>s/`
 * for a scene, plugin, entity, or popup, using the project's discovery
 * conventions (default-exported class, optional `defineX({...})` wrapper
 * with an `id`). The file is intentionally minimal — just enough that the
 * Vite plugin's discovery picks it up immediately on next dev reload.
 */

const KINDS = ['scene', 'plugin', 'entity', 'popup'];

// Convert a user-supplied name into a PascalCase class name and a
// kebab-case id, regardless of input casing. "my cool scene" → MyCoolScene
// + my-cool-scene; "MyCoolScene" → MyCoolScene + my-cool-scene.
function normalizeName(raw) {
  const cleaned = raw
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/);
  if (cleaned.length === 0 || !cleaned[0]) {
    throw new Error(`Invalid name: ${JSON.stringify(raw)}`);
  }
  const className = cleaned
    .map((word) => {
      // Split on lowercase→uppercase boundary so "MyCoolScene" stays MyCoolScene
      // rather than getting collapsed.
      return word
        .split(/(?=[A-Z])/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join('');
    })
    .join('');
  const id = className
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
  return { className, id };
}

const TEMPLATES = {
  scene: ({ className, id }) => `import { defineScene, Scene } from '@caperjs/core';

export const scene = defineScene({
  id: '${id}',
  active: true,
  // assets: { preload: { bundles: ['default'] } },
});

export default class ${className} extends Scene {
  initialize() {
    // build the scene's display tree here
  }

  start() {
    // start jobs / timelines here
  }

  resize() {
    // re-layout on viewport changes
  }

  update() {
    // per-frame loop
  }

  destroy() {
    super.destroy();
    // clean up listeners / timers
  }
}
`,

  plugin: ({ className, id }) => `import { definePlugin, IApplication, Logger, Plugin } from '@caperjs/core';

export const plugin = definePlugin({
  id: '${id}',
  // requires: ['firebase'], // other plugin IDs that must initialize before this one
});

export type ${className}PluginOptions = {
  // TODO: add plugin options here
};

const defaultOptions: ${className}PluginOptions = {};

export default class ${className}Plugin extends Plugin<${className}PluginOptions> {
  public readonly id = '${id}';

  protected _options: ${className}PluginOptions = defaultOptions;

  async initialize(options: Partial<${className}PluginOptions> = {}, _app: IApplication): Promise<void> {
    this._options = { ...defaultOptions, ...options };
    Logger.log('${className} plugin initialized');
  }
}
`,

  entity: ({ className, id }) => `import { Container, defineEntity } from '@caperjs/core';

export const entity = defineEntity({
  id: '${id}',
});

export default class ${className} extends Container {
  constructor() {
    super();
    this.init();
  }

  init() {
    // build the entity's display tree here
  }
}
`,

  entity3d: ({ className, id }) => `import { defineEntity } from '@caperjs/core';
import { Entity3D } from '@caperjs/plugin-3d';
import type { Mesh3D } from '@pixi/3d';

export const entity = defineEntity({
  id: '${id}',
});

export type ${className}Props = {
  color?: number;
};

// Add it from a scene with a 3D view: view.add.entity('${id}', { color: 0x4a90d9, y: 1 })
export default class ${className} extends Entity3D<${className}Props> {
  private body?: Mesh3D;

  added() {
    // Build parts here, not in the constructor: this.add works once the entity is in a view.
    // added() runs again when the entity is moved to a new parent, so build once.
    if (this.body) return;
    this.body = this.add.mesh({ geometry: 'box', color: this.props.color ?? 0xe85d5d });
    // Taps: listen on the entity from a scene, e.g. entity.on('pointertap', ...). Listening makes it tappable.
  }

  update() {
    // Runs every frame while the entity is in a view; stops with app.pause().
    this.rotation.y += 0.02 * this.app.ticker.deltaTime;
  }
}
`,

  popup: ({ className, id }) => `import { Container, definePopup, IPopup, Popup } from '@caperjs/core';

export const popup = definePopup({
  id: '${id}',
});

export default class ${className}Popup extends Popup implements IPopup {
  window: Container;

  initialize() {
    this.window = this.view.add.container();
    // build the popup contents on this.window
  }

  async show() {
    // entry animation
  }

  async hide() {
    // exit animation
  }
}
`,
};

const DIRS = {
  scene: 'src/scenes',
  plugin: 'src/plugins',
  entity: 'src/entities',
  popup: 'src/popups',
};

const SUFFIXES = {
  scene: '',
  plugin: 'Plugin',
  entity: '',
  popup: 'Popup',
};

// `--3d` and `--dir <path>` may come before or after the name.
function parseScaffoldArgs(tokens) {
  let is3d = false;
  let dir;
  const positional = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === '--3d') is3d = true;
    else if (tokens[i] === '--dir' && tokens[i + 1]) dir = tokens[++i];
    else positional.push(tokens[i]);
  }
  return { rawName: positional[0], is3d, dir };
}

export async function add(args) {
  const [kind, ...afterKind] = args;
  const { rawName, is3d, dir } = parseScaffoldArgs(afterKind);

  if (is3d && kind !== 'entity') {
    console.error(red('caper add: --3d is only valid with entity.'));
    process.exit(1);
  }

  if (kind === '3d') return add3dCommand(afterKind);
  if (kind === 'klipp') return addKlippCommand(afterKind);

  if (!kind || !KINDS.includes(kind)) {
    console.error(red(`caper add: missing or unknown kind. Expected one of: ${[...KINDS, '3d', 'klipp'].join(', ')}`));
    console.error(`Usage: caper add <${KINDS.join('|')}> <Name> [--dir path], caper add entity <Name> --3d, or caper add 3d|klipp`);
    process.exit(1);
  }

  if (!rawName) {
    console.error(red(`caper add ${kind}: missing name. Usage: caper add ${kind} <Name>`));
    process.exit(1);
  }

  // Optional --dir override; defaults to the conventional discovery dir
  const targetDir = dir ?? DIRS[kind];

  const { className, id } = normalizeName(rawName);
  const fileName = `${className}${SUFFIXES[kind]}.ts`;
  const fullDir = path.resolve(process.cwd(), targetDir);
  const fullPath = path.join(fullDir, fileName);

  if (fs.existsSync(fullPath)) {
    console.error(red(`caper add ${kind}: ${path.relative(process.cwd(), fullPath)} already exists. Aborting.`));
    process.exit(1);
  }

  const template = is3d ? 'entity3d' : kind;
  fs.mkdirSync(fullDir, { recursive: true });
  fs.writeFileSync(fullPath, TEMPLATES[template]({ className, id }), 'utf-8');

  console.log(green(bold(`✓ Created ${kind}`)) + ` ${cyan(path.relative(process.cwd(), fullPath))}`);
  console.log(`  ${yellow('id:')}    ${id}`);
  console.log(`  ${yellow('class:')} ${className}${SUFFIXES[kind]}`);
  if (is3d) {
    console.log(`  ${yellow('note:')}  it needs the 3D plugin (npx caper add 3d).`);
  }
  console.log(`\n  Discovery will pick this up on the next dev-server reload.`);
}
