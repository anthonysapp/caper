import { Container, definePopup, Focusable, IPopup, Popup } from '@caper-engine/core';
import { Text } from 'pixi.js';

import { FONT_BODY } from '@/utils/Constants';
import CaperPanel from '@/ui/CaperPanel';
import CloseButton from '@/ui/CloseButton';
import { gsap } from 'gsap';

export const popup = definePopup({
  id: 'example',
  active: true,
});

class FocusableText extends Focusable(Text) {}

export class ExamplePopup extends Popup implements IPopup {
  window: Container;
  panel: CaperPanel;
  title: FocusableText;
  closeButton: CloseButton;

  protected _showAnimation: gsap.core.Timeline;

  initialize() {
    this.window = this.view.add.container({ x: -300, y: -200 });
    this.panel = this.window.add.existing(
      new CaperPanel({
        width: Math.min(this.app.size.width - 40, 600),
        height: 400,
        heading: this.config.data?.title ?? 'Example Popup',
      }),
    );

    this.title = this.window.add.existing(
      new FocusableText({
        text: this.config.data?.title ?? 'Example Popup',
        resolution: 2,
        roundPixels: true,
        style: {
          fontFamily: FONT_BODY,
          fill: 'white',
          fontWeight: 'bold',
        },
      }),
      {
        x: 50,
        y: 80,
        accessibleTitle: 'Popup text',
        accessibleType: 'div',
        accessibleHint: this.config.data?.title ?? 'Example' + ' Popup',
      },
    );

    this.closeButton = this.window.add.existing(new CloseButton(32), {
      x: this.panel.width - 44,
      y: 12,
    });
    this.closeButton.accessibleTitle = 'Close button';
    this.closeButton.accessibleHint = 'Click to close popup';

    this.firstFocusableEntity = this.closeButton;
    this.app.focus.add(this.title, this.id, false);

    if (this.backing) {
      this.backing.alpha = 0;
    }
    this.window.x = -this.window.width * 0.5;
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

  public start() {
    this.closeButton.onInteraction('click').connectOnce(this.close);
    this.closeButton.onInteraction('tap').connectOnce(this.close);
  }

  async hide() {
    this._showAnimation.timeScale(2);
    return this._showAnimation.reverse();
  }

  resize() {
    super.resize();
    const targetWidth = Math.min(this.app.size.width - 40, 600);
    if (this.panel.width !== targetWidth) {
      this.panel.resize(targetWidth, 400);
    }
    this.closeButton.x = this.panel.width - 44;
    this.window.x = -this.window.width * 0.5;
  }
}

export default ExamplePopup;
