import { bold, cyan, green, red } from 'kleur/colors';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { addPlugin, compareVersions, readInstalledPackage, requireVersion } from './addPlugin.mjs';

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

/** Set up the 3D plugin, release-age exception, config entry, and sample scene. */
export async function add3d(cwd, opts = {}, deps = {}) {
  const corePkg = JSON.parse(fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf-8'));
  const corePixi = requireVersion(corePkg.peerDependencies?.['pixi.js'], 'pixi.js', true);
  return addPlugin(cwd, {
    id: '3d', pluginPackage: '@caperjs/plugin-3d', enginePackage: '@pixi/3d',
    scenePath: SCENE_PATH, scene: SCENE, manualPlugins: "['3d']",
    autoLoadFalse: "'3d' must load at startup. Remove autoLoad: false from its entry in caper.config.ts.",
    extraInstalls: (app) => {
      const installedPixi = readInstalledPackage(app, 'pixi.js');
      return installedPixi?.version && compareVersions(requireVersion(installedPixi.version, 'installed pixi.js'), corePixi) < 0
        ? [`pixi.js@${corePixi}`] : [];
    },
  }, deps);
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
