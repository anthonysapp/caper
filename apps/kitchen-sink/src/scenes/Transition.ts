import { SceneTransition } from '@caperjs/core';
import { gsap } from 'gsap';
import { Sprite } from 'pixi.js';
import { COLOR_BG } from '../utils/Constants';

export class Transition extends SceneTransition {
  private _timeline: gsap.core.Timeline;
  private _logo: Sprite;
  private _bg: Sprite;

  constructor() {
    super(true);
  }

  initialize() {
    this._bg = this.addColoredBackground({ color: COLOR_BG, alpha: 1 });
    this._bg.visible = false;

    this._logo = this.add.sprite({ asset: 'required/caper.png', anchor: 0.5, scale: 0.25, alpha: 0, pivot: [0, -40] });
  }

  async enter() {
    const tl = gsap.timeline();
    tl.set(this._bg, { visible: true, x: -this.app.size.width * 0.6 });
    tl.to(
      this._bg,
      {
        x: 0,
        ease: 'expo.out',
        duration: 0.5,
      },
      0,
    );

    tl.addLabel('logo');

    tl.to(
      this._logo.pivot,
      {
        y: 0,
        ease: 'expo.out',
        duration: 0.75,
      },
      'logo',
    );

    tl.to(
      this._logo,
      {
        alpha: 1,
        ease: 'sine.out',
        duration: 0.4,
      },
      'logo',
    );

    this._timeline = tl;

    return this._timeline;
  }

  async exit() {
    const tl = gsap.timeline();
    tl.addLabel('logo');
    tl.to(
      this._logo.pivot,
      {
        y: 20,
        ease: 'expo.in',
        duration: 0.6,
      },
      'logo',
    );

    tl.to(
      this._logo,
      {
        alpha: 0,
        ease: 'sine.in',
        duration: 0.6,
      },
      'logo',
    );
    tl.to(this._bg, {
      x: this.app.size.width * 0.6,
      ease: 'expo.in',
      duration: 0.3,
    });
    tl.set(this._bg, { visible: false });
    tl.set(this._logo.pivot, { y: -40 });
    this._timeline = tl;

    return this._timeline;
  }
}
