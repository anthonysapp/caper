import { bold, cyan, green, red } from 'kleur/colors';

import fs from 'node:fs';
import path from 'node:path';

import { add3d } from './add3d.mjs';
import { addPlugin, listedPluginIds, readInstalledPackage, readPluginConfig } from './addPlugin.mjs';

const SCENE_PATH = 'src/scenes/SampleCameraRigScene.ts';

const SCENE = `import { defineScene, Scene, type Button } from '@caperjs/core';
import type { Mesh3D } from '@pixi/3d';
import type { CameraRig } from '@caperjs/plugin-klipp';
import { Texture } from 'pixi.js';

export const scene = defineScene({
  id: 'sample-camera-rig',
});

// Made by \`caper add klipp\`. Built-in shapes and a white texture only.
export default class SampleCameraRigScene extends Scene {
  private hero?: Mesh3D;
  private button?: Button;
  private lap = 0;

  initialize() {
    const view = this.add.view3d();
    view.add.light({ type: 'directional', intensity: 3, castShadow: true });
    view.add.mesh({
      geometry: 'plane', color: 0x7f8f6a,
      rotation: [-Math.PI / 2, 0, 0], scale: 18, castShadow: false,
    });
    this.hero = view.add.mesh({ geometry: 'box', color: 0xe85d5d, y: 1 });
    view.add.mesh({ geometry: 'sphere', color: 0x4a90d9, x: 3, y: 0.5, z: 2 });
    view.add.mesh({ geometry: 'box', color: 0xf6c85f, x: -3, y: 0.75, z: -2, scale: [0.7, 1.5, 0.7] });

    const rig: CameraRig = view.add.cameraRig({ fitAspect: 4 / 3 });
    // The follow offset turns with the hero. Negative z stays behind its +Z face.
    rig.add.shot('follow', { priority: 10, follow: this.hero, offset: [0, 3, -7], damping: 0.5 });
    rig.add.shot('overview', { position: [0, 13, 16], lookAt: [0, 0, 0] });

    // Add the button after the view so it sits above the 3D scene and wins taps.
    const button = this.add.button({ textures: { default: Texture.WHITE }, cursor: 'pointer' });
    this.button = button;
    button.view.width = 180;
    button.view.height = 48;
    button.view.tint = 0x273c54;
    button.addLabel({ type: 'text', text: 'Show overview', anchor: 0.5, style: { fontSize: 18, fill: 0xffffff } });
    let overview = false;
    button.onClick.connect(() => {
      overview = !overview;
      rig.cut(overview ? 'overview' : 'follow', { blend: 1 });
      if (button.textLabel) button.textLabel.text = overview ? 'Follow hero' : 'Show overview';
    });
  }

  resize() {
    // A scene's origin is the middle of the screen: keep the button centred near the bottom edge.
    this.button?.position.set(-90, this.app.size.height / 2 - 96);
  }

  update() {
    if (!this.hero) return;
    this.lap += (this.app.ticker.deltaMS / 1000) * 0.5;
    this.hero.position.set(Math.cos(this.lap) * 3, 1, Math.sin(this.lap) * 3);
    this.hero.rotation.y = -this.lap;
  }
}
`;

/** Set up the klipp camera rig after the 3D plugin it requires. */
export async function addKlipp(cwd, opts = {}, deps = {}) {
  const packageFile = path.join(cwd, 'package.json');
  if (!fs.existsSync(packageFile)) throw new Error('no package.json found in this directory.');
  const pkg = JSON.parse(fs.readFileSync(packageFile, 'utf-8'));
  const configFile = path.join(cwd, 'caper.config.ts');
  const source = fs.existsSync(configFile) ? fs.readFileSync(configFile, 'utf-8') : '';
  const order = listedPluginIds(source);
  // Checked before anything is installed or written: the 3D step would add '3d' after 'klipp'.
  if (order.includes('klipp') && !order.slice(0, order.indexOf('klipp')).includes('3d')) {
    throw new Error("'klipp' is in plugins without '3d' before it. Change it to plugins: ['3d', 'klipp'] in caper.config.ts, then run this again.");
  }
  // 3D counts as set up only when it is declared, listed to load at startup, and installed at the pinned version.
  const plugin3d = readInstalledPackage(cwd, '@caperjs/plugin-3d');
  const has3d = Boolean(pkg.dependencies?.['@caperjs/plugin-3d'] || pkg.devDependencies?.['@caperjs/plugin-3d'])
    && readPluginConfig(source, '3d') === 'listed'
    && Boolean(plugin3d) && readInstalledPackage(cwd, '@pixi/3d')?.version === plugin3d.peerDependencies?.['@pixi/3d'];
  const add3dResult = has3d ? undefined : await add3d(cwd, opts, deps);
  const result = await addPlugin(cwd, {
    id: 'klipp', pluginPackage: '@caperjs/plugin-klipp', enginePackage: '@pmndrs/klipp',
    scenePath: SCENE_PATH, scene: SCENE, manualPlugins: "['3d', 'klipp']",
  }, deps);
  return add3dResult ? { ...result, add3d: add3dResult } : result;
}

/** CLI presentation for `caper add klipp`. */
export async function addKlippCommand() {
  try {
    const result = await addKlipp(process.cwd());
    if (result.add3d) {
      const threeD = result.add3d;
      console.log(green(bold(threeD.installed.length ? '✓ Installed 3D dependencies' : '✓ 3D dependencies already in place')) + (threeD.installed.length ? ` ${threeD.installed.join(', ')}` : ''));
      if (threeD.config === 'added') console.log(green(bold("✓ Added '3d' to caper.config.ts")));
      if (threeD.scene !== 'skipped') console.log(green(bold(threeD.scene === 'created' ? '✓ Created 3D sample scene' : '✓ 3D sample scene already exists')) + ` ${cyan(threeD.scenePath)}`);
    }
    console.log(green(bold(result.installed.length ? '✓ Installed' : '✓ Dependencies already in place')) + (result.installed.length ? ` ${result.installed.join(', ')}` : ''));
    if (result.releaseAge === 'added') console.log(green(bold('✓ Allowed the pinned @pmndrs/klipp release in pnpm-workspace.yaml')));
    if (result.releaseAge === 'present') console.log(green(bold('✓ pnpm release exception already in place')));
    if (result.config === 'added') console.log(green(bold("✓ Added 'klipp' to caper.config.ts")));
    if (result.config === 'present') console.log(green(bold("✓ 'klipp' is in caper.config.ts")));
    if (result.scene !== 'skipped') console.log(green(bold(result.scene === 'created' ? '✓ Created sample scene' : '✓ Sample scene already exists')) + ` ${cyan(result.scenePath)}`);
    for (const step of result.add3d?.manualSteps ?? []) {
      if (result.config === 'manual' && step.includes("plugins: ['3d']")) continue;
      console.log(step);
    }
    for (const step of result.manualSteps) console.log(step);
    console.log("Start your dev server (restart it if it is already running), then open the scene: set defaultScene: 'sample-camera-rig' in caper.config.ts, or call app.scenes.load('sample-camera-rig').");
    console.log('The camera rig is experimental and adds about 16 KB (gzip).');
  } catch (err) {
    console.error(red(`caper add klipp: ${err.message}`));
    process.exit(1);
  }
}
