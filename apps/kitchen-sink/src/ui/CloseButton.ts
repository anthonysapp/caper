import { CaperColors } from '@/theme';
import { Container, defineUI, Focusable, Interactive } from '@caper/core';
import { Graphics } from 'pixi.js';

export const ui = defineUI({ id: 'close-button' });

const _Base = Focusable(Interactive(Container));

export default class CloseButton extends _Base {
  private bg: Graphics;
  private icon: Graphics;

  constructor(size = 32) {
    super();
    this.cursor = 'pointer';
    const r = size / 2;
    const stroke = Math.max(2, size / 12);
    const arm = r * 0.38;

    this.bg = this.add.graphics().circle(r, r, r).fill({ color: CaperColors.panel2, alpha: 0.85 });
    this.bg.circle(r, r, r).stroke({ color: CaperColors.line, width: 1 });

    this.icon = this.add.graphics();
    this.icon
      .moveTo(r - arm, r - arm)
      .lineTo(r + arm, r + arm)
      .moveTo(r + arm, r - arm)
      .lineTo(r - arm, r + arm)
      .stroke({ color: CaperColors.text, width: stroke, cap: 'round' });

    this.on('pointerover', () => {
      this.bg.clear().circle(r, r, r).fill({ color: CaperColors.coral, alpha: 1 });
      this.bg.circle(r, r, r).stroke({ color: CaperColors.coralHi, width: 1 });
      this.icon.clear()
        .moveTo(r - arm, r - arm).lineTo(r + arm, r + arm)
        .moveTo(r + arm, r - arm).lineTo(r - arm, r + arm)
        .stroke({ color: 0xffffff, width: stroke, cap: 'round' });
    });

    this.on('pointerout', () => {
      this.bg.clear().circle(r, r, r).fill({ color: CaperColors.panel2, alpha: 0.85 });
      this.bg.circle(r, r, r).stroke({ color: CaperColors.line, width: 1 });
      this.icon.clear()
        .moveTo(r - arm, r - arm).lineTo(r + arm, r + arm)
        .moveTo(r + arm, r - arm).lineTo(r - arm, r + arm)
        .stroke({ color: CaperColors.text, width: stroke, cap: 'round' });
    });
  }
}
