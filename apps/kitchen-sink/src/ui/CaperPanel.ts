import { Container, Graphics, Text } from 'pixi.js';
import { CaperColors } from '@/theme';
import { FONT_DISPLAY, FONT_BODY } from '@/utils/Constants';

export interface CaperPanelOptions {
  width: number;
  height: number;
  heading?: string;
  radius?: number;
}

/**
 * Branded container panel with olive hairline border,
 * caper-panel fill, rounded corners, and optional Syncopate heading.
 */
export class CaperPanel extends Container {
  private bg: Graphics;
  private headingText?: Text;
  readonly contentContainer: Container;
  private _panelWidth: number;
  private _panelHeight: number;
  private _radius: number;

  constructor(options: CaperPanelOptions) {
    super();
    this._panelWidth = options.width;
    this._panelHeight = options.height;
    this._radius = options.radius ?? 12;

    this.bg = new Graphics();
    this.addChild(this.bg);

    const contentY = options.heading ? 40 : 12;
    this.contentContainer = new Container();
    this.contentContainer.position.set(16, contentY);
    this.addChild(this.contentContainer);

    if (options.heading) {
      this.headingText = new Text({
        text: options.heading.toUpperCase(),
        style: {
          fontFamily: FONT_DISPLAY,
          fontSize: 11,
          fontWeight: 'bold',
          fill: CaperColors.oliveHi,
          letterSpacing: 3,
        },
      });
      this.headingText.position.set(16, 14);
      this.addChild(this.headingText);
    }

    this.draw();
  }

  private draw(): void {
    this.bg.clear();
    this.bg
      .roundRect(0, 0, this._panelWidth, this._panelHeight, this._radius)
      .fill({ color: CaperColors.panel });
    this.bg
      .roundRect(0, 0, this._panelWidth, this._panelHeight, this._radius)
      .stroke({ color: CaperColors.line, width: 1 });
  }

  resize(width: number, height: number): void {
    this._panelWidth = width;
    this._panelHeight = height;
    this.draw();
  }
}
