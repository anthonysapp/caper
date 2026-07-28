import { Graphics, Sprite, Text, Texture } from 'pixi.js';

import { CaperColors } from '@/theme';
import { FONT_BODY, FONT_DISPLAY } from '@/utils/Constants';
import { FlexContainer, Scene, Size, defineScene } from '@caper-engine/core';
import { GUI } from 'dat.gui';

export const scene = defineScene({
  id: 'base',
  dynamic: false,
  active: false,
});

export default class BaseScene extends Scene {
  protected readonly title: string;
  protected readonly subtitle: string;
  protected titleContainer: FlexContainer;
  protected gui: GUI;
  protected config: any;
  protected _bg: Graphics;
  protected _title: Text;
  protected _subtitle: Text;
  protected _headerBg: Sprite;

  get isMobile() {
    return this.app.size.width < 1200;
  }

  public async initialize() {
    this._bg = this.add.graphics();
    this._headerBg = this.add.sprite({
      asset: Texture.WHITE,
      tint: 0x0,
      width: this.app.size.width,
      height: 110,
      alpha: 0.1,
      anchor: 0,
      x: -this.app.size.width * 0.5,
      y: -this.app.size.height * 0.5,
    });

    this.titleContainer = this.add.flexContainer({
      flexDirection: 'column',
      width: this.app.size.width,
      height: 110,
      alignItems: 'flex-start',
      justifyContent: 'flex-start',
      x: -this.app.size.width * 0.5,
      y: -this.app.size.height * 0.5 + 50,
      label: 'Header',
    });

    this._title = this.titleContainer.add.text({
      text: (this.title ?? this.id)?.toUpperCase(),
      style: { fontFamily: FONT_DISPLAY, fontSize: 36 },
    });

    this._subtitle = this.titleContainer.add.text({
      text: this.subtitle,
      style: { fontFamily: FONT_BODY, fontSize: 16 },
    });

    if (this.config) {
      await this.addGUI();
      this.configureGUI();
    }
    // this.alpha = 0;
  }

  public destroy() {
    if (this.gui) {
      this.gui.destroy();
    }
    super.destroy();
  }

  resize(size?: Size) {
    super.resize(size);
    if (this._bg) {
      const x0 = -this.app.size.width * 0.5;
      const y0 = -this.app.size.height * 0.5;
      const w = this.app.size.width;
      const h = this.app.screen.height;
      this._bg.clear();
      // Base fill
      this._bg.rect(x0, y0, w, h).fill({ color: CaperColors.ink });
      // Subtle grid (32px, very low alpha)
      this._bg.setStrokeStyle({ width: 1, color: CaperColors.olive, alpha: 0.04 });
      for (let gx = x0 - (x0 % 32); gx < x0 + w; gx += 32) {
        this._bg.moveTo(gx, y0).lineTo(gx, y0 + h);
      }
      for (let gy = y0 - (y0 % 32); gy < y0 + h; gy += 32) {
        this._bg.moveTo(x0, gy).lineTo(x0 + w, gy);
      }
      this._bg.stroke();
    }

    if (this.titleContainer) {
      this.titleContainer.layoutWidth = this.app.size.width;
      this.titleContainer.x = -this.app.size.width * 0.5 - 10;
      this.titleContainer.y = -this.app.size.height * 0.5 + 60;
    }

    if (this._title) {
      this._title.x = this.isMobile ? 20 : 30;
    }
    if (this._subtitle) {
      this._subtitle.x = this._title.x;
    }

    if (this._headerBg) {
      this._headerBg.x = -this.app.size.width * 0.5;
      this._headerBg.y = -this.app.size.height * 0.5;
      this._headerBg.width = this.app.size.width;
      this._headerBg.height = this.titleContainer.height + 45;
    }
  }

  protected async addGUI() {
    const dat = await import('dat.gui');
    this.gui = new dat.GUI({
      name: 'Controls',
      closeOnTop: true,
      closed: true,
      width: 200,
    });
    this.gui.domElement.id = 'gui';
    this.gui.domElement.style.marginRight = `0px`;
    this.app.canvas.parentNode?.appendChild(this.gui.domElement.parentNode!);
    (this.gui.domElement.parentNode as HTMLElement).style.cssText = `position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 0;
    z-index: 0;`;
  }

  protected configureGUI() {}
}
