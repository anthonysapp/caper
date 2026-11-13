import BaseScene from '@/scenes/BaseScene';
import { FONT_BODY } from '@/utils/Constants';
import { defineScene, type FlexContainer } from '@caperjs/core';
import type { Model, View3D } from '@caperjs/plugin-3d';
import type { CameraRig } from '@caperjs/plugin-klipp';
import type { Material3D, Mesh3D } from '@pixi/3d';
import type { Text } from 'pixi.js';

export const scene = defineScene({
  id: 'camera-rig',
  debug: { group: 'Display', label: 'Camera Rig' },
  assets: { preload: { bundles: ['models'] } },
});

const COLORS = [0xd9534f, 0x4a90d9, 0x6fbf5c, 0xf0ad4e];
// Three 256 px buttons and two 16 px gaps.
const ROW_WIDTH = 800;

export default class CameraRigScene extends BaseScene {
  protected readonly title = 'Camera Rig';
  protected readonly subtitle = 'Follow, overview, shake, and pointer orbit';

  view: View3D;
  rig: CameraRig;
  hero: Model;
  cube: Mesh3D;
  taps = 0;
  private heroAngle = 0;
  private overview = false;
  private orbitOn = false;
  private buttons: FlexContainer;
  private status: Text;
  private shotLabel: Text;
  private orbitLabel: Text;

  public async initialize() {
    await super.initialize();

    this.view = this.add.view3d();
    this.view.add.mesh({
      geometry: 'plane', rotation: [-Math.PI / 2, 0, 0], scale: 20,
      castShadow: false, color: 0x7f8f6a,
    });
    this.cube = this.view.add.mesh({
      geometry: 'box', color: COLORS[0], x: -2, y: 1.2, scale: 1.5,
      eventMode: 'static', cursor: 'pointer',
    });
    this.view.add.mesh({ geometry: 'box', color: 0x4a90d9, x: 5, y: 0.5, scale: 1 });
    this.hero = this.view.add.model({ asset: 'cesium-man', scale: 2 });
    this.hero.play('anim_0');
    this.view.add.light({ type: 'directional', intensity: 3, castShadow: true });

    this.rig = this.view.add.cameraRig({ fitAspect: 16 / 9 });
    this.rig.add.shot('follow', { priority: 10, follow: this.hero, offset: [0, 3, -8], damping: 0.5, lookAt: this.hero });
    this.rig.add.shot('overview', { position: [0, 12, 14], lookAt: [0, 0, 0] });
    const material = this.cube.material as Material3D;
    this.cube.on('pointertap', () => {
      if (this.rig.dragging) return;
      this.taps++;
      material.baseColor = COLORS[this.taps % COLORS.length];
    });

    // Add 2D controls after the view so they receive taps above the 3D surface.
    this.buttons = this.add.flexContainer({ gap: 16, alignItems: 'center', label: 'Camera Rig buttons' });
    this.shotLabel = this.addButton('Overview', () => {
      this.overview = !this.overview;
      this.rig.cut(this.overview ? 'overview' : 'follow', { blend: 1 });
      this.shotLabel.text = this.overview ? 'Follow' : 'Overview';
      this.orbitOn = false;
      this.orbitLabel.text = 'Orbit';
    });
    this.addButton('Shake', () => this.rig.shake({ amplitude: 0.3, duration: 0.3 }));
    this.orbitLabel = this.addButton('Orbit', () => {
      this.orbitOn = !this.orbitOn;
      this.rig.orbit(this.orbitOn ? { target: this.hero } : false);
      this.orbitLabel.text = this.orbitOn ? 'Stop Orbit' : 'Orbit';
    });
    this.status = this.add.text({
      text: '', anchor: 0.5,
      style: { fontFamily: FONT_BODY, fontSize: 20, fill: 0xffffff },
      label: 'Camera Rig status',
    });
    this.resize();
  }

  /** Adds a button to the row and returns its label, so toggles can rename themselves. */
  private addButton(label: string, onClick: () => void): Text {
    const button = this.buttons.add.button({
      textures: { default: 'btn/blue', hover: 'btn/yellow' },
      layout: { height: 91, width: 256 }, scale: 0.5, label: `Camera Rig ${label}`,
    });
    button.onClick.connect(onClick);
    return button.addLabel({ type: 'text', text: label, anchor: 0.5, style: { fontSize: 48, fill: 0xffffff } }) as Text;
  }

  update() {
    if (!this.hero || !this.rig) return;
    const dt = this.app.ticker.deltaMS / 1000;
    this.heroAngle += dt * 0.4;
    this.hero.position.set(Math.cos(this.heroAngle) * 4, 0, Math.sin(this.heroAngle) * 4);
    this.hero.rotation.set(0, Math.atan2(-Math.sin(this.heroAngle), Math.cos(this.heroAngle)), 0);
    this.cube.rotation.y += 0.6 * dt;
    this.status.text = `shot ${this.rig.klipp.liveCameraName ?? 'none'} | blending ${this.rig.klipp.isBlending ? 'yes' : 'no'} | orbit ${this.orbitOn ? 'on' : 'off'} | cube taps ${this.taps}`;
  }

  resize() {
    super.resize();
    const h = this.app.size.height;
    if (this.buttons) {
      // The layout scales the row about its centre, so its box stays ROW_WIDTH wide.
      this.buttons.scale.set(Math.min(1, (this.app.size.width - 40) / ROW_WIDTH));
      this.buttons.position.set(-ROW_WIDTH * 0.5, h * 0.5 - 110);
    }
    if (this.status) this.status.position.set(0, h * 0.5 - 170);
  }
}
