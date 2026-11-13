import { Model3D } from '@pixi/3d';
import type { AnimationState } from '@pixi/3d';

export type PlayOptions = Partial<Pick<AnimationState, 'loop' | 'animationSpeed' | 'weight' | 'onComplete' | 'onLoop'>>;

export class Model extends Model3D {
  play(name: string, options: PlayOptions = {}): AnimationState {
    const player = this.player;
    if (!player || !player.animationLabels.includes(name)) {
      throw new Error(
        `Animation '${name}' is unavailable; available clips: ${player?.animationLabels.join(', ') || '(none)'}.`,
      );
    }
    const state = player.play(name);
    Object.assign(state, options);
    return state;
  }

  stop(): void {
    this.player?.stop();
  }
}
