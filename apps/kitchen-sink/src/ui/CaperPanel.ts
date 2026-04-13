import { Container, Graphics, Text } from 'pixi.js';
import { CaperColors } from '@/theme';
import { FONT_BODY } from '@/utils/Constants';
import { defineUI } from '@caper/core';

export const ui = defineUI({ id: 'caper-panel' });

export interface CaperPanelOptions {
  width: number;
  height: number;
  /**
   * Optional panel heading — rendered inside a green "Floating Slab" tab that
   * hangs off the top-left corner of the panel. Pass the panel title (e.g.
   * `'Animations'`, `'Stopwatch'`). Omit for an untitled panel.
   */
  heading?: string;
  /**
   * @deprecated Use `heading` directly. Kept for backwards compat;
   * when `true`, renders the heading even if the string form is omitted.
   */
  slab?: boolean | string;
  /** Corner radius for the panel body. Defaults to 12. */
  radius?: number;
}

/**
 * Branded container panel with neutral hairline border, caper-panel fill,
 * rounded corners, and an optional "Floating Slab" heading tab — a small
 * green pill hanging off the top-left corner containing the panel title
 * in Space Grotesk Bold. Matches the Pro-Retro v2.1 style guide.
 */
export default class CaperPanel extends Container {
  private bg: Graphics;
  private slabBg?: Graphics;
  private slabText?: Text;
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

    // Resolve heading text: prefer `heading`, fall back to `slab` string.
    const headingText =
      options.heading ?? (typeof options.slab === 'string' ? options.slab : undefined);

    // Slab tab — green pill with the panel title, hangs off top-left
    if (headingText) {
      this.slabBg = new Graphics();
      this.addChild(this.slabBg);

      this.slabText = new Text({
        text: headingText,
        style: {
          fontFamily: FONT_BODY,
          fontSize: 12,
          fontWeight: '700',
          fill: CaperColors.ink,
        },
      });
      this.addChild(this.slabText);
    }

    // Content starts below the slab so it doesn't overlap
    const contentY = headingText ? 20 : 12;
    this.contentContainer = new Container();
    this.contentContainer.position.set(16, contentY);
    this.addChild(this.contentContainer);

    this.draw();

    // Fonts may still be loading when draw() first runs. Redraw once they're
    // ready so the slab backing correctly matches the final text width.
    if (this.slabText && typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(() => this.draw());
    }
  }

  private draw(): void {
    this.bg.clear();
    this.bg
      .roundRect(0, 0, this._panelWidth, this._panelHeight, this._radius)
      .fill({ color: CaperColors.panel });
    this.bg
      .roundRect(0, 0, this._panelWidth, this._panelHeight, this._radius)
      .stroke({ color: CaperColors.line, width: 1 });

    if (this.slabBg && this.slabText) {
      // Slab pill — green fill with dark text, hangs off top-left
      const padX = 10;
      const padY = 4;
      const textW = this.slabText.width;
      const textH = this.slabText.height;
      const slabW = textW + padX * 2;
      const slabH = textH + padY * 2;
      const slabX = 12;
      const slabY = -Math.round(slabH / 2);

      this.slabBg.clear();
      this.slabBg
        .roundRect(slabX, slabY, slabW, slabH, 4)
        .fill({ color: CaperColors.olive });

      this.slabText.position.set(slabX + padX, slabY + padY);
    }
  }

  resize(width: number, height: number): void {
    this._panelWidth = width;
    this._panelHeight = height;
    this.draw();
  }
}
