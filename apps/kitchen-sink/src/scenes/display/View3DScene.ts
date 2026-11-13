import BaseScene from '@/scenes/BaseScene';
import { FONT_BODY } from '@/utils/Constants';
import { defineScene, type Button } from '@caperjs/core';
import type { Model, View3D } from '@caperjs/plugin-3d';
import type { Material3D, Mesh3D } from '@pixi/3d';
import type { Text, Ticker } from 'pixi.js';

export const scene = defineScene({
  id: 'view-3d',
  debug: {
    group: 'Display',
    label: 'View 3D',
  },
  assets: {
    preload: {
      bundles: ['models'],
    },
  },
});

const COLORS = [0xd9534f, 0x4a90d9, 0x6fbf5c, 0xf0ad4e];

export default class View3DScene extends BaseScene {
  protected readonly title = 'View 3D';
  protected readonly subtitle = 'Tap the cube to change its colour';

  view: View3D;
  cube: Mesh3D;
  hero: Model;
  taps = 0;
  buttonClicks = 0;
  private hudLabel: Text;
  private button: Button;

  public async initialize() {
    await super.initialize();

    const behind = this.add.graphics();
    behind.circle(0, 0, 220).fill({ color: 0xffcc00, alpha: 1 });
    behind.label = 'View 3D behind circle';

    this.view = this.add.view3d({
      camera: { position: [0, 4, 9], lookAt: [0, 1, 0] },
    });

    this.view.add.mesh({
      geometry: 'plane',
      rotation: [-Math.PI / 2, 0, 0],
      scale: 20,
      castShadow: false,
      color: 0x7f8f6a,
    });

    this.cube = this.view.add.mesh({
      geometry: 'box',
      color: COLORS[0],
      x: -2,
      y: 1.2,
      scale: 1.5,
      eventMode: 'static',
      cursor: 'pointer',
    });
    const material = this.cube.material as Material3D;
    let colorIndex = 0;
    this.cube.on('pointertap', () => {
      this.taps++;
      colorIndex = (colorIndex + 1) % COLORS.length;
      material.baseColor = COLORS[colorIndex];
    });

    this.hero = this.view.add.model({ asset: 'cesium-man', x: 1.5, scale: 2 });
    this.hero.play('anim_0');

    this.view.add.light({ type: 'directional', intensity: 3, castShadow: true });

    this.hudLabel = this.add.text({
      text: 'Caper 2D text over 3D',
      style: { fontFamily: FONT_BODY, fontSize: 28, fill: 0xffffff },
      anchor: 0.5,
      label: 'View 3D label',
    });
    this.button = this.add.button({
      textures: { default: 'btn/blue', hover: 'btn/yellow' },
      layout: { height: 91, width: 332 },
      scale: 0.65,
      label: 'View 3D button',
    });
    this.button.addLabel({
      type: 'text',
      text: 'Caper Button',
      anchor: 0.5,
      style: { fontSize: 50, fill: 0xffffff },
    });
    this.button.onClick.connect(() => {
      this.buttonClicks++;
      this.hudLabel.text = `Button clicks: ${this.buttonClicks}`;
    });
  }

  update(_ticker?: Ticker) {
    if (this.cube) {
      const dt = this.app.ticker.deltaTime;
      this.cube.rotation.y += 0.02 * dt;
      this.cube.rotation.x += 0.01 * dt;
    }
  }

  resize() {
    super.resize();
    const h = this.app.size.height;
    if (this.hudLabel) this.hudLabel.position.set(0, h * 0.5 - 160);
    if (this.button) this.button.position.set(-this.button.width * 0.5, h * 0.5 - 110);
  }
}
