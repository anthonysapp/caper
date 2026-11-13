import type Robot from '@/entities/Robot';
import type SpinCube from '@/entities/SpinCube';
import BaseScene from '@/scenes/BaseScene';
import { CaperColors } from '@/theme';
import { FONT_BODY } from '@/utils/Constants';
import { defineScene, type FlexContainer, type UICanvas } from '@caperjs/core';
import type { View3D } from '@caperjs/plugin-3d';
import type { CameraRig } from '@caperjs/plugin-klipp';
import type { Text } from 'pixi.js';

export const scene = defineScene({
  id: 'camera-rig',
  debug: { group: 'Display', label: 'Camera Rig' },
  assets: { preload: { bundles: ['models'] } },
});

const TRACK = 5;

export default class CameraRigScene extends BaseScene {
  protected readonly title = 'Camera Rig';
  protected readonly subtitle = 'Follow, cut, shake, orbit. One line each.';

  view: View3D;
  rig: CameraRig;
  robot: Robot;
  cube: SpinCube;
  private lap = 0;
  private ui: UICanvas;
  private buttons: FlexContainer;
  private code: Text;

  public async initialize() {
    await super.initialize();

    // Fog in the scene's background colour: the ground fades out instead of ending at an edge.
    this.view = this.add.view3d({
      fog: { type: 'linear', color: CaperColors.ink, near: 14, far: 46 },
      environment: { skyColor: 0xdfe8d0, groundColor: 0x6b7558, intensity: 0.8 },
      shadowFilter: 'pcf-high',
    });
    this.view.add.mesh({
      geometry: 'plane',
      rotation: [-Math.PI / 2, 0, 0],
      scale: 120,
      castShadow: false,
      material: this.view.make.material({ color: 0x3a3c3b, roughness: 1 }),
    });
    this.view.add.light({ color: 0xfff2dc, intensity: 2.6, castShadow: true, position: [-4, 8, 5], lookAt: [0, 0, 0] });

    // Many meshes, one material each: a ring of pillars and the dashes of the track.
    const stone = this.view.make.material({ color: 0xc4c8b8, roughness: 0.9 });
    const paint = this.view.make.material({ color: CaperColors.olive, roughness: 0.8 });
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2;
      const [x, z] = [Math.cos(angle), Math.sin(angle)];
      this.view.add.mesh({ material: paint, x: x * TRACK, y: 0.02, z: z * TRACK, rotation: [0, -angle, 0], scale: [0.16, 0.04, 0.7] });
      if (i % 2 === 0) continue;
      const height = 1 + (i % 3) * 0.9;
      this.view.add.mesh({ material: stone, x: x * 10, y: height / 2, z: z * 10, rotation: [0, -angle, 0], scale: [0.9, height, 0.9] });
    }

    this.cube = this.view.add.entity('spin-cube', { y: 1.4 });
    this.robot = this.view.add.entity('robot', { clip: 'Running' });

    this.rig = this.view.add.cameraRig({ fitAspect: 0.8 });
    // Models face +Z and the offset turns with the target, so "behind and above" is a negative z.
    this.rig.add.shot('follow', { priority: 10, follow: this.robot, offset: [0, 2.8, -4.8], damping: 0.5, lookAt: this.robot.chest });
    this.rig.add.shot('overview', { position: [0, 15, 19], lookAt: [0, 0, 0] });

    this.cube.on('pointertap', () => {
      // An orbit drag that ends on the cube is not a tap.
      if (this.rig.dragging) return;
      this.cube.pop();
    });

    // 2D goes after the view to sit above it and win taps. The header was added first, so lift it.
    this.add.existing(this.titleContainer);
    this.ui = this.add.uiCanvas({ useAppSize: true });
    const hud = this.make.flexContainer({ flexDirection: 'column', alignItems: 'center', gap: 14, layout: { paddingBottom: 64 } });
    this.ui.addElement(hud, { align: 'bottom' });
    const readout = hud.add.container({ layout: { width: 300, height: 34 } });
    readout.add.graphics().roundRect(0, 0, 300, 34, 6).fill({ color: CaperColors.ink, alpha: 0.9 }).stroke({ color: CaperColors.line });
    this.code = readout.add.text({
      text: "rig.cut('follow', { blend: 1 })",
      x: 150,
      y: 17,
      anchor: 0.5,
      style: { fontFamily: 'Menlo, Consolas, monospace', fontSize: 13, fill: CaperColors.olive },
    });
    this.buttons = hud.add.flexContainer({ gap: 10, flexWrap: 'wrap', justifyContent: 'center' });
    this.addButton('Follow', "rig.cut('follow', { blend: 1 })", () => this.rig.cut('follow', { blend: 1 }));
    this.addButton('Overview', "rig.cut('overview', { blend: 1 })", () => this.rig.cut('overview', { blend: 1 }));
    this.addButton('Orbit', 'rig.orbit({ target: robot })', () => this.rig.orbit({ target: this.robot.chest }));
    this.addButton('Shake', 'rig.shake({ amplitude: 0.5 })', () => this.rig.shake({ amplitude: 0.5 }));
    this.resize();
  }

  /** A button that runs one rig call and shows that line in the readout. */
  private addButton(label: string, code: string, run: () => void) {
    const button = this.buttons.add.button({
      textures: { default: 'btn/blue', hover: 'btn/yellow' },
      scale: 0.34,
      layout: { width: 174, height: 48 },
      cursor: 'pointer',
      label: `Camera Rig ${label}`,
    });
    button.addLabel({ type: 'text', text: label, anchor: 0.5, style: { fontFamily: FONT_BODY, fontSize: 48, fill: CaperColors.ink } });
    button.onClick.connect(() => {
      run();
      this.code.text = code;
    });
  }

  update() {
    if (!this.robot) return;
    // Run the track. deltaMS already includes ticker.speed and stops with pause.
    this.lap += (this.app.ticker.deltaMS / 1000) * 0.5;
    this.robot.position.set(Math.cos(this.lap) * TRACK, 0, Math.sin(this.lap) * TRACK);
    this.robot.rotation.y = -this.lap;
  }

  resize() {
    super.resize();
    // Four buttons in a row when there is room, two by two on a phone.
    if (this.buttons) this.buttons.layoutWidth = this.app.size.width > 780 ? 730 : 358;
  }
}
