import { Container, definePopup, Focusable, Interactive, IPopup, Popup } from '@caper-engine/core';
import { Text } from 'pixi.js';

import { FONT_BODY } from '@/utils/Constants';
import CaperPanel from '@/ui/CaperPanel';
import CloseButton from '@/ui/CloseButton';
import { gsap } from 'gsap';

export const popup = definePopup({
  id: 'confirm',
  active: true,
});

const _Button = Focusable(Interactive(Container));

class ConfirmButton extends _Button {
  constructor(text: string, fill: number) {
    super();
    this.cursor = 'pointer';
    this.add.graphics().roundRect(0, 0, 160, 48, 8).fill(fill);
    const txt = this.add.existing(
      new Text({
        text,
        resolution: 2,
        style: { fontFamily: FONT_BODY, fontSize: 22, fontWeight: 'bold', fill: 0xffffff },
      }),
      { x: 80, y: 24 },
    );
    txt.anchor.set(0.5);
  }
}

export default class ConfirmPopup extends Popup implements IPopup {
  private window: Container;
  private panel: CaperPanel;
  private closeBtn: CloseButton;
  private confirmBtn: ConfirmButton;
  private cancelBtn: ConfirmButton;
  private _showAnimation: gsap.core.Timeline;

  initialize() {
    const panelWidth = Math.min(this.app.size.width - 40, 440);

    this.window = this.view.add.container({ x: -panelWidth / 2, y: -150 });
    this.panel = this.window.add.existing(
      new CaperPanel({ width: panelWidth, height: 300, heading: 'Confirm' }),
    );

    this.window.add.existing(
      new Text({
        text: this.config.data?.title ?? 'Are you sure?',
        resolution: 2,
        roundPixels: true,
        style: {
          fontFamily: FONT_BODY,
          fontSize: 20,
          fill: 0xffffff,
          wordWrap: true,
          wordWrapWidth: panelWidth - 80,
        },
      }),
      { x: 40, y: 70 },
    );

    this.closeBtn = this.window.add.existing(new CloseButton(32), {
      x: panelWidth - 44,
      y: 12,
    });
    this.closeBtn.accessibleTitle = 'Close button';
    this.closeBtn.accessibleHint = 'Click to close popup';

    this.confirmBtn = this.window.add.existing(new ConfirmButton('Confirm', 0x4caf50), {
      x: panelWidth / 2 - 170,
      y: 220,
    });
    this.cancelBtn = this.window.add.existing(new ConfirmButton('Cancel', 0xef5350), {
      x: panelWidth / 2 + 10,
      y: 220,
    });

    this.firstFocusableEntity = this.confirmBtn;
    this.app.focus.add(this.cancelBtn, this.id, false);

    if (this.backing) {
      this.backing.alpha = 0;
    }
    this.window.alpha = 0;
    this.window.pivot.set(0, -10);
  }

  async show() {
    this._showAnimation = gsap.timeline();
    if (this.backing) {
      this._showAnimation.to(this.backing, { alpha: 1, duration: 0.5, ease: 'sine.out' });
    }
    this._showAnimation.to(this.window, { alpha: 1, duration: 0.3, ease: 'sine.out' }, '<+=0.25');
    this._showAnimation.to(this.window.pivot, { x: 0, y: 0, duration: 0.3, ease: 'sine.out' }, '<');
    return this._showAnimation;
  }

  start() {
    const pick = (choice: 'confirm' | 'cancel') => {
      this.config.data = { ...this.config.data, choice };
      this.close();
    };
    this.confirmBtn.onInteraction('click').connectOnce(() => pick('confirm'));
    this.confirmBtn.onInteraction('tap').connectOnce(() => pick('confirm'));
    this.cancelBtn.onInteraction('click').connectOnce(() => pick('cancel'));
    this.cancelBtn.onInteraction('tap').connectOnce(() => pick('cancel'));
    this.closeBtn.onInteraction('click').connectOnce(() => pick('cancel'));
    this.closeBtn.onInteraction('tap').connectOnce(() => pick('cancel'));
  }

  async hide() {
    this._showAnimation.timeScale(2);
    return this._showAnimation.reverse();
  }

  resize() {
    super.resize();
    const targetWidth = Math.min(this.app.size.width - 40, 440);
    if (this.panel.width !== targetWidth) {
      this.panel.resize(targetWidth, 300);
    }
    this.closeBtn.x = targetWidth - 44;
    this.confirmBtn.x = targetWidth / 2 - 170;
    this.cancelBtn.x = targetWidth / 2 + 10;
    this.window.x = -this.window.width * 0.5;
  }
}
