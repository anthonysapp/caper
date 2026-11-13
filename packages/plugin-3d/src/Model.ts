import { Model3D } from '@pixi/3d';
import type { AnimationState } from '@pixi/3d';
import type { Ticker } from 'pixi.js';

export type PlayOptions = Partial<Pick<AnimationState, 'loop' | 'animationSpeed' | 'weight' | 'onComplete' | 'onLoop'>> & {
  fade?: number;
  layer?: boolean;
};

type Fade = { elapsed: number; duration: number; incoming: AnimationState; weight: number; outgoing: { state: AnimationState; weight: number }[] };

export class Model extends Model3D {
  private transition?: Fade;

  play(name: string, options: PlayOptions = {}): AnimationState {
    const player = this.player;
    if (!player || !player.animationLabels.includes(name)) {
      throw new Error(
        `Animation '${name}' is unavailable; available clips: ${player?.animationLabels.join(', ') || '(none)'}.`,
      );
    }
    const state = player.getState(name);
    const running = this.transition;
    if (options.layer) {
      // A fade under way carries on; it just lets go of this clip if it was fading it out.
      if (running) running.outgoing = running.outgoing.filter((old) => old.state !== state);
    } else {
      // A fade under way ends here: its outgoing clips stop at once.
      for (const { state: old } of running?.outgoing ?? []) {
        old.onComplete = old.onLoop = null;
        old.stop();
      }
      this.transition = undefined;
    }
    const outgoing = options.layer ? [] : player.animationLabels
      .map((label) => player.getState(label))
      .filter((other) => other !== state && other.playing);
    for (const other of outgoing) other.onComplete = other.onLoop = null;
    const { fade = 0, layer: _layer, ...stateOptions } = options;
    Object.assign(state, { loop: true, animationSpeed: 1, weight: 1, onComplete: null, onLoop: null }, stateOptions);
    if (fade > 0 && outgoing.length) {
      this.transition = {
        elapsed: 0, duration: fade, incoming: state, weight: state.weight,
        outgoing: outgoing.map((other) => ({ state: other, weight: other.weight })),
      };
      state.weight = 0;
    } else {
      for (const other of outgoing) other.stop();
    }
    state.gotoAndPlay(0);
    return state;
  }

  stop(): void {
    this.transition = undefined;
    this.player?.stop();
  }

  update(ticker: Ticker): void {
    const fade = this.transition;
    if (fade) {
      fade.elapsed = Math.min(fade.duration, fade.elapsed + ticker.deltaMS / 1000);
      const progress = fade.elapsed / fade.duration;
      fade.incoming.weight = fade.weight * progress;
      for (const { state, weight } of fade.outgoing) {
        state.weight = weight * (1 - progress);
        if (progress === 1) state.stop();
      }
      if (progress === 1) this.transition = undefined;
    }
    this.player?.update(ticker);
  }
}
