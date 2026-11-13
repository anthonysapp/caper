import { defineEntity } from '@caperjs/core';
import { Entity3D, type Model } from '@caperjs/plugin-3d';
import type { Container3D } from '@pixi/3d';

export const entity = defineEntity({
  id: 'robot',
  active: true,
});

export type RobotProps = {
  /** The clip it loops: 'Idle', 'Walking', 'Running' or 'Dance'. */
  clip?: string;
};

export default class Robot extends Entity3D<RobotProps> {
  model: Model;
  /** A point at chest height: something for a camera to look at or a label to sit over. */
  chest: Container3D;
  /** True while a one-off clip plays. */
  reacting = false;
  private looping: string;

  added() {
    // The file is about 4.5 units tall; this stands the robot about 1.6 high.
    this.model = this.add.model({ asset: 'robot', scale: 0.35 });
    this.chest = this.add.container({ y: 1.1 });
    this.loop(this.props.clip ?? 'Idle');
  }

  /** Switches the looping clip. */
  loop(clip: string) {
    this.looping = clip;
    this.reacting = false;
    // play() adds to whatever is playing, so stop first for a clean cut.
    this.model.stop();
    this.model.play(clip);
  }

  /** Plays a clip once ('Jump', 'Wave', 'ThumbsUp', 'Punch'), then returns to the looping one. */
  react(clip: string) {
    this.reacting = true;
    this.model.stop();
    const state = this.model.play(clip, { loop: false, onComplete: () => this.loop(this.looping) });
    // A one-shot clip that already finished would resume at its end: rewind it.
    state.gotoAndPlay(0);
  }
}
