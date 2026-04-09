import BaseScene from '@/scenes/BaseScene';
import { FlexContainer, type SceneAssets, defineScene } from '@caper/core';
import { Sprite } from 'pixi.js';

export const scene = defineScene({
  id: 'assets',
  debug: {
    group: 'Framework',
    label: 'Assets',
  },
});

export default class AssetScene extends BaseScene {
  title = 'Asset Scene';
  subtitle = 'Asset loading from different sources';
  container: FlexContainer;
  pickle: Sprite;
  logo: Sprite;
  zilla: Sprite;

  public get assets(): SceneAssets {
    return {
      preload: {
        assets: [
          {
            alias: 'logo',
            src: '/static/caper-text.svg',
          },
          {
            alias: 'staticCaperLogo',
            src: '/static/caper.png',
          },
          {
            alias: 'zilla',
            src: '/static/Zilla.webp',
          },
          '/static/tech-pickle-300x300.webp',
        ],
      },
    };
  }

  public async initialize() {
    await super.initialize();
    this.container = this.add.flexContainer({
      layout: {
        gap: 25,
        justifyContent: 'center',
        alignItems: 'center',
        flexWrap: 'nowrap',
      },
      label: 'Main Container',
    });
    this.pickle = this.container.add.sprite({
      asset: '/static/tech-pickle-300x300.webp',
      label: 'Pickle',
    });

    this.logo = this.container.add.sprite({
      asset: 'staticCaperLogo',
      label: 'Caper Logo',
      scale: 0.5,
      anchor: 0.5,
      layout: { applySizeDirectly: true, width: 150, height: 150, aspectRatio: 1 },
    });

    this.zilla = this.container.add.sprite({ asset: 'zilla', label: 'Zilla' });
  }

  resize() {
    super.resize();

    if (this.app.size.width >= this.app.size.height) {
      this.container.size = [this.app.size.width, this.app.size.height - 110];
      this.container.position.set(-this.app.size.width * 0.5, -this.app.size.height * 0.5 + 110);
      this.container.scale.set(1);
      this.container.flexDirection = 'row';
      this.container.flexWrap = 'wrap';
    } else {
      this.container.size = [0, this.app.size.height - 110];
      this.container.flexDirection = 'column';
      this.container.flexWrap = 'nowrap';
      this.container.position.set(0, -this.app.size.height * 0.5 + 100);
    }
  }
}
