import { bold, cyan, green, red, yellow } from 'kleur/colors';

import fs from 'node:fs';
import path from 'node:path';

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
  scene: ({ className, id }) => `import { defineScene, Scene } from '@caper-engine/core';

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

  plugin: ({ className, id }) => `import { definePlugin, IApplication, Logger, Plugin } from '@caper-engine/core';

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

  entity: ({ className, id }) => `import { Container, defineEntity } from '@caper-engine/core';

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

  popup: ({ className, id }) => `import { Container, definePopup, IPopup, Popup } from '@caper-engine/core';

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

export async function add(args) {
  const [kind, rawName, ...rest] = args;

  if (!kind || !KINDS.includes(kind)) {
    console.error(red(`caper add: missing or unknown kind. Expected one of: ${KINDS.join(', ')}`));
    console.error(`Usage: caper add <${KINDS.join('|')}> <Name> [--dir path]`);
    process.exit(1);
  }
  if (!rawName) {
    console.error(red(`caper add ${kind}: missing name. Usage: caper add ${kind} <Name>`));
    process.exit(1);
  }

  // Optional --dir override; defaults to the conventional discovery dir
  let targetDir = DIRS[kind];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--dir' && rest[i + 1]) {
      targetDir = rest[i + 1];
      i++;
    }
  }

  const { className, id } = normalizeName(rawName);
  const fileName = `${className}${SUFFIXES[kind]}.ts`;
  const fullDir = path.resolve(process.cwd(), targetDir);
  const fullPath = path.join(fullDir, fileName);

  if (fs.existsSync(fullPath)) {
    console.error(red(`caper add ${kind}: ${path.relative(process.cwd(), fullPath)} already exists. Aborting.`));
    process.exit(1);
  }

  fs.mkdirSync(fullDir, { recursive: true });
  fs.writeFileSync(fullPath, TEMPLATES[kind]({ className, id }), 'utf-8');

  console.log(green(bold(`✓ Created ${kind}`)) + ` ${cyan(path.relative(process.cwd(), fullPath))}`);
  console.log(`  ${yellow('id:')}    ${id}`);
  console.log(`  ${yellow('class:')} ${className}${SUFFIXES[kind]}`);
  console.log(`\n  Discovery will pick this up on the next dev-server reload.`);
}
