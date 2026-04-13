import { FONT_BODY } from '@/utils/Constants';
import { Scene, defineScene } from '@caper/core';

export const scene = defineScene({
  id: 'level',
  debug: {
    group: 'Framework',
    label: 'Typed Scene Props',
    order: 10,
  },
});

/**
 * Demonstrates `Scene<Props>` — the generic carries a typed prop shape
 * that the caller of `app.scenes.loadScene('level', {...})` must satisfy
 * at compile time. Props are populated by
 * `SceneManagerPlugin._createCurrentScene` before `initialize()` runs, so
 * scene code reads them directly via `this.props`.
 *
 * **Runtime nuance**: the hash-based sidebar loader goes through the
 * loose `loadScene(id: string)` overload and doesn't pass props, so the
 * scene falls back to defaults in `initialize()` if `this.props` is
 * undefined. Typed call sites still enforce the full shape at compile
 * time — see the key handlers in `start()` below.
 */
export type LevelProps = {
  levelId: number;
  difficulty: 'easy' | 'normal' | 'hard';
};

const DEFAULT_LEVEL_PROPS: LevelProps = { levelId: 1, difficulty: 'normal' };

export default class LevelScene extends Scene<LevelProps> {
  public async initialize() {
    const { levelId, difficulty } = this.props ?? DEFAULT_LEVEL_PROPS;
    this.add.text({
      text: `Level ${levelId}  (${difficulty})`,
      resolution: 2,
      style: {
        fontFamily: FONT_BODY,
        fontSize: 48,
        fill: 'white',
        fontWeight: 'bold',
      },
      anchor: 0.5,
      x: 0,
      y: 0,
    });

    this.add.text({
      text:
        `this.props came from app.scenes.load('level', {...}).\n` +
        `Press 1 / 2 / 3 to reload with different typed props.`,
      resolution: 2,
      style: {
        fontFamily: FONT_BODY,
        fontSize: 18,
        fill: 0xaaaaaa,
        align: 'center',
      },
      anchor: 0.5,
      x: 0,
      y: 80,
    });
  }

  public async start() {
    // Demonstrate typed loadScene from a real call site. TypeScript
    // enforces the prop shape here — swap `levelId: 3` for `levelId: '3'`
    // and the compiler errors at build time.
    this.addSignalConnection(
      this.app.keyboard.onKeyUp('1').connect(() => {
        void this.app.scenes.loadScene('level', { levelId: 1, difficulty: 'easy' });
      }),
      this.app.keyboard.onKeyUp('2').connect(() => {
        void this.app.scenes.loadScene('level', { levelId: 2, difficulty: 'normal' });
      }),
      this.app.keyboard.onKeyUp('3').connect(() => {
        void this.app.scenes.loadScene('level', { levelId: 3, difficulty: 'hard' });
      }),
    );
  }
}
