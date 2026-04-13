import { CaperColors } from '@/theme';
import { FONT_BODY, FONT_DISPLAY } from '@/utils/Constants';
import { FlexContainer, defineScene } from '@caper/core';
import { gsap } from 'gsap';
import { Sprite } from 'pixi.js';
import Base from './BaseScene';

export const scene = defineScene({
  id: 'start',
  debug: {
    label: 'Start',
    group: 'Start',
  },
});

export default class Start extends Base {
  title = 'Caper';
  private container: FlexContainer;
  private mascot: Sprite;

  async initialize() {
    await super.initialize();
    this.app.focus.addFocusLayer(this.id);

    this.container = this.add.flexContainer({
      label: 'Start Container',
      bindToAppSize: true,
      layout: {
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
      },
    });

    // Mascot logo
    this.mascot = this.add.sprite({
      asset: 'caper',
      label: 'Caper Mascot',
      scale: 0.35,
      anchor: 0.5,
      y: -150,
    });

    // Wordmark
    this.container.add.text({
      text: 'CAPER',
      style: {
        fontFamily: FONT_DISPLAY,
        fontSize: 42,
        fontWeight: 'bold',
        fill: CaperColors.text,
        letterSpacing: -1,
      },
      layout: {
        marginTop: 100,
      },
    });

    // Tagline
    this.container.add.text({
      text: 'HTML game framework',
      style: {
        fontFamily: FONT_BODY,
        fontSize: 16,
        fill: CaperColors.textDim,
      },
    });

    // CTA
    const cta = this.container.add.text({
      text: 'Pick a scene from the reel below.',
      style: {
        fontFamily: FONT_BODY,
        fontSize: 14,
        fill: CaperColors.olive,
      },
      layout: {
        marginTop: 10,
      },
    });

    // Subtle idle animation on the mascot
    this.startIdleAnimation();

    // Gentle pulse on the CTA
    gsap.to(cta, {
      alpha: 0.75,
      duration: 1.5,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut',
    });
  }

  private startIdleAnimation(): void {
    if (!this.mascot) return;

    // Breathing scale
    gsap.to(this.mascot.scale, {
      x: 0.36,
      y: 0.36,
      duration: 1.5,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut',
    });
  }

  start() {}

  resize() {
    super.resize();
    this.container.position.set(-this.app.size.width * 0.5, -this.app.size.height * 0.5 + 50);
  }
}
