// A completely ordinary imperative caper game object: builds its own look in
// `added()`, moves itself in `update()`. It knows nothing about Solid.
//
// The point it proves: caper wires `autoUpdate` off Pixi's native `added`
// event, so an instance *mounted by JSX* starts ticking with zero bridge code.

import { CaperColors } from '@/theme';
import { Container } from '@caperjs/core';
import type { Ticker } from 'pixi.js';

export class Orbiter extends Container {
  private _t = 0;
  private _originX = 0;
  private _originY = 0;
  private readonly _radius = 34;

  constructor() {
    super({ autoUpdate: true });
  }

  public added() {
    // Whatever x/y JSX set is our orbit centre.
    this._originX = this.x;
    this._originY = this.y;

    this.add.graphics().circle(0, 0, 11).fill({ color: CaperColors.coral });
    this.add.graphics().circle(0, 0, 4).fill({ color: CaperColors.coralHi });
  }

  public update(ticker?: Ticker | number) {
    const delta = typeof ticker === 'number' ? ticker : (ticker?.deltaTime ?? 1);
    this._t += delta / 60;
    this.x = this._originX + Math.cos(this._t * 2) * this._radius;
    this.y = this._originY + Math.sin(this._t * 2) * this._radius;
  }
}
