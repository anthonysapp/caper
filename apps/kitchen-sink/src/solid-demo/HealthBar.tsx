// A self-contained widget that declares its own members with `compose()`, so it
// nests inside the scene's composed tree as just another element. Its state is
// an instance-field signal, which means imperative callers (`bar.damage(15)`)
// and the declarative view stay in sync without either knowing about the other.

import { CaperColors } from '@/theme';
import { FONT_BODY } from '@/utils/Constants';
import type { Graphics } from 'pixi.js';
import { animated, ComposableContainer, type Composes } from '@caperjs/solid';
import { createSignal } from 'solid-js';

const WIDTH = 220;
const HEIGHT = 22;

const bg = (g: Graphics) =>
  g.roundRect(0, 0, WIDTH, HEIGHT, 4).fill({ color: CaperColors.panel2 }).stroke({ color: CaperColors.line, width: 2 });

const fill = (g: Graphics) => g.roundRect(0, 0, WIDTH, HEIGHT, 4).fill({ color: CaperColors.olive });

export class HealthBar extends ComposableContainer implements Composes {
  private health = createSignal(100);

  /** Imperative API — an ordinary method that happens to write a signal. */
  public damage(amount: number) {
    this.health[1]((hp) => Math.max(0, hp - amount));
  }

  public heal(amount: number) {
    this.health[1]((hp) => Math.min(100, hp + amount));
  }

  public compose() {
    const hp = this.health[0];
    // The bar glides, the readout snaps. Same source, two different feels.
    const hpA = animated(() => hp() / 100);

    return (
      <container>
        <graphics draw={bg} />
        <graphics draw={fill} scale={{ x: hpA(), y: 1 }} />
        <text
          text={`${hp()} HP`}
          style={{ fontFamily: FONT_BODY, fontSize: 14, fill: CaperColors.text }}
          anchor={{ x: 0.5, y: 0.5 }}
          x={WIDTH / 2}
          y={HEIGHT / 2}
        />
      </container>
    );
  }
}
