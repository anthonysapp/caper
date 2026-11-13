import { describe, expect, it, vi } from 'vitest';
import { Model } from './Model';

function fixture() {
  const states = Object.fromEntries(['Idle', 'Wave', 'Run'].map((name) => [name, {
    time: 0, playing: false, loop: true, animationSpeed: 1, weight: 1,
    onComplete: null as null | (() => void), onLoop: null as null | (() => void),
    gotoAndPlay(time: number) { this.time = time; this.playing = true; return this; },
    stop() { this.playing = false; return this; },
  }])) as Record<'Idle' | 'Wave' | 'Run', {
    time: number; playing: boolean; loop: boolean; animationSpeed: number; weight: number;
    onComplete: null | (() => void); onLoop: null | (() => void);
    gotoAndPlay(time: number): unknown; stop(): unknown;
  }>;
  const player = {
    animationLabels: Object.keys(states),
    getState: (name: keyof typeof states) => states[name],
    update: vi.fn((ticker: { deltaMS: number }) => {
      for (const state of Object.values(states)) {
        if (!state.playing) continue;
        state.time += ticker.deltaMS / 1000 * state.animationSpeed;
        if (!state.loop && state.time >= 1) { state.stop(); state.onComplete?.(); }
      }
    }),
    stop: vi.fn(() => { for (const state of Object.values(states)) state.stop(); }),
  };
  const model = Object.create(Model.prototype) as Model;
  Object.defineProperty(model, 'player', { value: player });
  return { model, player, states, tick: (ms: number) => model.update({ deltaMS: ms } as any) };
}

it('names available clips when play has no player', () => {
  const model = Object.create(Model.prototype) as Model;
  Object.defineProperty(model, 'player', { value: undefined });
  expect(() => model.play('idle')).toThrow(/idle.*available clips|available clips.*idle/i);
});

describe('Model playback', () => {
  it('rejects an unknown clip and restarts a finished one-shot with fresh defaults', () => {
    const { model, states, tick } = fixture();
    expect(() => model.play('Missing')).toThrow("Animation 'Missing' is unavailable; available clips: Idle, Wave, Run.");
    model.play('Wave', { loop: false, animationSpeed: 2, weight: 0.4, onComplete: vi.fn() });
    tick(500);
    expect(states.Wave.playing).toBe(false);
    expect(states.Wave.time).toBe(1);
    model.play('Wave');
    expect(states.Wave).toMatchObject({ time: 0, playing: true, loop: true, animationSpeed: 1, weight: 1, onComplete: null, onLoop: null });
  });

  it('replaces playing states and clears their callbacks, unless layered', () => {
    const { model, states } = fixture();
    const onComplete = vi.fn();
    const onLoop = vi.fn();
    model.play('Idle', { onComplete, onLoop });
    model.play('Wave');
    expect(states.Idle.playing).toBe(false);
    expect(states.Idle.onComplete).toBeNull();
    expect(states.Idle.onLoop).toBeNull();
    model.play('Run', { layer: true });
    expect(states.Wave.playing).toBe(true);
    expect(states.Run.playing).toBe(true);
  });

  it('cross-fades from current weights on the view clock before player update', () => {
    const { model, player, states, tick } = fixture();
    model.play('Idle', { weight: 0.8 });
    model.play('Wave', { fade: 0.5, weight: 0.6 });
    expect(states.Idle.weight).toBe(0.8);
    expect(states.Wave.weight).toBe(0);
    player.update.mockImplementationOnce(() => {
      expect(states.Idle.weight).toBeCloseTo(0.4);
      expect(states.Wave.weight).toBeCloseTo(0.3);
    });
    tick(250);
    expect(states.Idle.playing).toBe(true);
    tick(250);
    expect(states.Idle.playing).toBe(false);
    expect(states.Wave.weight).toBeCloseTo(0.6);
  });

  it('stops the prior fade outgoing set on a new play and cancels fades on stop', () => {
    const { model, states, tick } = fixture();
    model.play('Idle');
    model.play('Wave', { fade: 1 });
    tick(250);
    model.play('Run', { fade: 1 });
    expect(states.Idle.playing).toBe(false);
    expect(states.Wave.playing).toBe(true);
    expect(states.Wave.weight).toBeCloseTo(0.25);
    model.stop();
    expect(states.Wave.playing).toBe(false);
    expect(states.Run.playing).toBe(false);
    const weight = states.Run.weight;
    tick(1000);
    expect(states.Run.weight).toBe(weight);
  });

  it('leaves a running fade alone when a clip is layered on it', () => {
    const { model, states, tick } = fixture();
    model.play('Idle');
    model.play('Wave', { fade: 1 });
    tick(500);
    model.play('Run', { layer: true });
    expect(states.Idle.playing).toBe(true);
    tick(500);
    expect(states.Idle.playing).toBe(false);
    expect(states.Wave.weight).toBe(1);
    expect(states.Run.playing).toBe(true);
  });
});
