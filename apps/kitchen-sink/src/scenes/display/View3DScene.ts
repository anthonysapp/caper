import type Robot from '@/entities/Robot';
import BaseScene from '@/scenes/BaseScene';
import { CaperColors } from '@/theme';
import { FONT_BODY, FONT_DISPLAY } from '@/utils/Constants';
import { defineScene, type Container, type UICanvas } from '@caperjs/core';
import type { View3D } from '@caperjs/plugin-3d';
import type { Graphics, Text } from 'pixi.js';

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

export default class View3DScene extends BaseScene {
  protected readonly title = 'View 3D';
  protected readonly subtitle = '2D art behind, a 3D stage, 2D UI on top. Tap a cube.';

  view: View3D;
  robot: Robot;
  taps = 0;
  private sun: Graphics;
  private nameTag: Container;
  private ui: UICanvas;
  private score: Text;
  private walk = 0;

  public async initialize() {
    await super.initialize();

    // 1. 2D behind: anything added before the view draws under it.
    this.sun = this.add.graphics().circle(0, 0, 100).fill(CaperColors.olive);

    // 2. The 3D stage. The view is see-through, so the sun and the scene background show around it.
    this.view = this.add.view3d({
      // fitAspect: on a screen narrower than this the camera widens, so the stage never crops.
      camera: { position: [10, 8.5, 10], lookAt: [0, -0.5, 0], fov: 36, fitAspect: 1 },
      environment: { skyColor: 0xdfe8d0, groundColor: 0x6b7558, intensity: 0.8 },
      shadowFilter: 'pcf-high',
    });
    this.view.add.mesh({
      geometry: 'box',
      scale: [6, 0.4, 6],
      y: -0.2,
      castShadow: false,
      material: this.view.make.material({ color: 0xd9dccf, roughness: 0.9 }),
    });
    this.view.add.light({ color: 0xfff2dc, intensity: 2.6, castShadow: true, position: [-3, 8, 5], lookAt: [0, 0, 0] });

    this.robot = this.view.add.entity('robot', { clip: 'Walking' });
    for (const [x, y, z] of [[-0.8, 1.1, -0.6], [0.7, 1.8, -0.7], [0, 0.9, 0.8]]) {
      const cube = this.view.add.entity('spin-cube', { x, y, z, scale: 0.7 });
      cube.on('pointertap', () => {
        cube.pop();
        this.robot.react('ThumbsUp');
        this.score.text = `${++this.taps}`;
      });
    }

    // 3. 2D on top: anything added after the view draws over it and wins taps.
    this.nameTag = this.add.container();
    this.nameTag.add.graphics().roundRect(-44, -13, 88, 26, 13).fill({ color: CaperColors.ink, alpha: 0.85 });
    this.nameTag.add.text({
      text: 'SCOUT',
      anchor: 0.5,
      style: { fontFamily: FONT_DISPLAY, fontSize: 11, fill: CaperColors.olive, letterSpacing: 2 },
    });
    // Pin 2D to 3D: worldToScreen gives global pixels, then each parent converts them to local space.
    // The tag follows the robot; the sun stays behind the cubes over the stage center.
    this.view.pin(this.nameTag, this.robot, { offset: [0, 2, 0] });
    this.view.pin(this.sun, [0, 2, 0]);

    this.ui = this.add.uiCanvas({ useAppSize: true });
    const hud = this.make.flexContainer({ flexDirection: 'column', alignItems: 'center', gap: 14, layout: { paddingBottom: 64 } });
    this.ui.addElement(hud, { align: 'bottom' });
    const readout = hud.add.flexContainer({ alignItems: 'center', gap: 10 });
    readout.add.text({
      text: 'CUBES TAPPED',
      style: { fontFamily: FONT_DISPLAY, fontSize: 12, fill: CaperColors.textDim, letterSpacing: 2 },
    });
    this.score = readout.add.text({
      text: '0',
      style: { fontFamily: FONT_BODY, fontWeight: 'bold', fontSize: 26, fill: CaperColors.text },
    });
    const button = hud.add.button({
      textures: { default: 'btn/blue', hover: 'btn/yellow' },
      scale: 0.4,
      layout: { width: 205, height: 56 },
      cursor: 'pointer',
      label: 'View 3D button',
    });
    button.addLabel({ type: 'text', text: 'Wave', anchor: 0.5, style: { fontFamily: FONT_BODY, fontSize: 48, fill: CaperColors.ink } });
    button.onClick.connect(() => this.robot.react('Wave'));
    this.resize();
  }

  update() {
    if (!this.robot) return;
    // Walk a circle around the cubes, facing along it; stand still while waving.
    if (!this.robot.reacting) this.walk += this.app.ticker.deltaMS / 1000;
    const angle = this.walk * 0.45;
    const x = Math.sin(angle) * 2.1;
    const z = Math.cos(angle) * 2.1;
    this.robot.position.set(x, 0, z);
    this.robot.rotation.y = angle + Math.PI / 2;
  }

  resize() {
    super.resize();
    if (!this.sun) return;
    const { width, height } = this.app.size;
    this.sun.scale.set(Math.min(width * 0.38, height * 0.25) / 100);
    // On a tall screen aim the camera higher, which lowers the stage toward the controls.
    this.view.camera.lookAt({ x: 0, y: width < height ? 0.8 : -0.5, z: 0 });
  }
}
