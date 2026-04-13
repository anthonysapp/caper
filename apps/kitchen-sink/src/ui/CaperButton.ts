import { CaperColors } from '@/theme';
import { FONT_BODY } from '@/utils/Constants';
import { Container, defineUI } from '@caper/core';
import { Graphics, Text } from 'pixi.js';

export const ui = defineUI({ id: 'caper-button' });

export interface CaperButtonOptions {
  text: string;
  width?: number;
  height?: number;
  onClick?: () => void;
}

/**
 * Branded button with olive inset bar on hover,
 * matching the sidebar's visual treatment.
 */
export default class CaperButton extends Container {
  private bg: Graphics;
  private bar: Graphics;
  private _label: Text;
  private _btnWidth: number;
  private _btnHeight: number;

  constructor(options: CaperButtonOptions) {
    super();
    this._btnWidth = options.width ?? 200;
    this._btnHeight = options.height ?? 44;
    this.cursor = 'pointer';
    this.eventMode = 'static';

    this.bg = new Graphics();
    this.addChild(this.bg);

    this.bar = new Graphics();
    this.bar.alpha = 0;
    this.addChild(this.bar);

    this._label = new Text({
      text: options.text,
      style: {
        fontFamily: FONT_BODY,
        fontSize: 14,
        fontWeight: '500',
        fill: CaperColors.textDim,
      },
    });

    this._label.anchor.set(0.5);
    this._label.position.set(this._btnWidth / 2, this._btnHeight / 2);
    this.addChild(this._label);

    this.draw();

    this.on('pointerover', () => {
      this._label.style.fill = CaperColors.text;
      this.bar.alpha = 1;
      this.bg.clear();
      this.bg.roundRect(0, 0, this._btnWidth, this._btnHeight, 6).fill({ color: CaperColors.panel2 });
      this.bg.roundRect(0, 0, this._btnWidth, this._btnHeight, 6).stroke({ color: CaperColors.line, width: 1 });
    });

    this.on('pointerout', () => {
      this._label.style.fill = CaperColors.textDim;
      this.bar.alpha = 0;
      this.draw();
    });

    if (options.onClick) {
      this.on('pointertap', options.onClick);
    }
  }

  private draw(): void {
    this.bg.clear();
    this.bg.roundRect(0, 0, this._btnWidth, this._btnHeight, 6).fill({ color: CaperColors.panel });
    this.bg.roundRect(0, 0, this._btnWidth, this._btnHeight, 6).stroke({ color: CaperColors.line, width: 1 });

    this.bar.clear();
    this.bar.roundRect(0, 4, 2, this._btnHeight - 8, 1).fill({ color: CaperColors.olive });
  }
}
