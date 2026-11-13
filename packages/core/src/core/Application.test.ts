import { gsap } from 'gsap';
import { describe, expect, it, vi } from 'vitest';

import { Application } from './Application';
import './config';
import '../mixins/factory/const';
import { registerFactoryMethods } from '../mixins/factory/defaults';

/**
 * `pause`/`resume`/`destroy` are plain instance methods that only touch a
 * handful of fields (`_pauseConfig`, `audio`, `ticker`, `timers`, `_store`,
 * `_plugins`, the pause/resume signals). Rather than boot a real Application
 * (Pixi renderer, full plugin registry, asset pipeline), build a bare object
 * on `Application.prototype` and populate just those fields — the real
 * methods run unmodified against it.
 */
function makeApp() {
  const app = Object.create(Application.prototype) as any;
  app._paused = false;
  app._pauseConfig = {};
  app._audioManager = { pause: vi.fn(), resume: vi.fn(), paused: false };
  app._timerPlugin = { pauseAllTimers: vi.fn(), resumeAllTimers: vi.fn() };
  app.ticker = { stop: vi.fn(), start: vi.fn(), started: true };
  app.onPause = { emit: vi.fn() };
  app.onResume = { emit: vi.fn() };
  app._plugins = new Map();
  return app;
}

describe('Application#pause / #resume', () => {
  it('pause() with no args pauses everything (audio, animations, ticker, timers)', () => {
    const app = makeApp();
    const gsapPause = vi.spyOn(gsap.globalTimeline, 'pause');

    app.pause();

    expect(app._audioManager.pause).toHaveBeenCalledTimes(1);
    expect(gsapPause).toHaveBeenCalledTimes(1);
    expect(app.ticker.stop).toHaveBeenCalledTimes(1);
    expect(app._timerPlugin.pauseAllTimers).toHaveBeenCalledTimes(1);
    expect(app.paused).toBe(true);

    gsapPause.mockRestore();
  });

  it('pause({ pauseAudio: true }) only pauses audio', () => {
    const app = makeApp();
    const gsapPause = vi.spyOn(gsap.globalTimeline, 'pause');

    app.pause({ pauseAudio: true });

    expect(app._audioManager.pause).toHaveBeenCalledTimes(1);
    expect(gsapPause).not.toHaveBeenCalled();
    expect(app.ticker.stop).not.toHaveBeenCalled();
    expect(app._timerPlugin.pauseAllTimers).not.toHaveBeenCalled();

    gsapPause.mockRestore();
  });

  it('resume() undoes exactly what pause() paused', () => {
    const app = makeApp();
    const gsapPause = vi.spyOn(gsap.globalTimeline, 'pause');
    const gsapResume = vi.spyOn(gsap.globalTimeline, 'resume');
    vi.spyOn(gsap.globalTimeline, 'paused').mockReturnValue(true);
    app._audioManager.paused = true;
    app.ticker.started = false;

    app.pause();
    app.resume();

    expect(app._audioManager.resume).toHaveBeenCalledTimes(1);
    expect(gsapResume).toHaveBeenCalledTimes(1);
    expect(app.ticker.start).toHaveBeenCalledTimes(1);
    expect(app._timerPlugin.resumeAllTimers).toHaveBeenCalledTimes(1);
    expect(app.paused).toBe(false);

    gsapPause.mockRestore();
    gsapResume.mockRestore();
    vi.restoreAllMocks();
  });

  it('resume() after pause({ pauseAudio: true }) only resumes audio', () => {
    const app = makeApp();
    app._audioManager.paused = true;

    app.pause({ pauseAudio: true });
    app.resume();

    expect(app._audioManager.resume).toHaveBeenCalledTimes(1);
    expect(app.ticker.start).not.toHaveBeenCalled();
    expect(app._timerPlugin.resumeAllTimers).not.toHaveBeenCalled();
  });
});

/**
 * Same bare-prototype trick as `makeApp`, but populated for the private
 * `_resize` path: a fake resizer, a settable `_center`, and stubbed scene /
 * popup managers so the `views` getter has something to walk.
 */
function makeResizeApp() {
  const app = Object.create(Application.prototype) as any;
  app.config = {};
  app._plugins = new Map();
  app._center = {
    x: 0,
    y: 0,
    set(x: number, y: number) {
      this.x = x;
      this.y = y;
    },
  };
  app._sceneManager = { view: makeView(), splash: {}, transition: null };
  app._popupManager = { view: makeView() };
  app._resizer = {
    resize: () => Promise.resolve({ width: 100, height: 50 }),
    size: { width: 100, height: 50 },
  };
  app.onResize = { emit: vi.fn() };
  return app;
}

function makeView() {
  return { position: { set: vi.fn() } };
}

describe('Application#views', () => {
  it('re-centers a view created after the first resize', async () => {
    const app = makeResizeApp();
    await app._resize();

    // e.g. a transition view built lazily on the first scene change, i.e.
    // after the app has already resized once.
    const late = makeView();
    app._sceneManager.transition = late;

    await app._resize();

    expect(late.position.set).toHaveBeenCalledWith(50, 25);
  });
});

describe('Application#isActionActive', () => {
  function makeActionApp(held: string[]) {
    const app = Object.create(Application.prototype) as any;
    app._plugins = new Map();
    app._input = { isActionActive: (action: string) => held.includes(action) };
    // Both actions are *declared*; only what the input plugin reports counts.
    app._actionsPlugin = { getActions: () => ({ jump: {}, run: {} }) };
    return app;
  }

  it('returns false for a declared action that is not currently held', () => {
    expect(makeActionApp([]).isActionActive('jump')).toBe(false);
  });

  it('returns true while the input plugin reports the action held', () => {
    expect(makeActionApp(['jump']).isActionActive('jump')).toBe(true);
  });
});

describe('Application#destroy', () => {
  it('does not throw when the app was configured without a store (useStore: false)', () => {
    const app = makeApp();
    // No `_store` set — mirrors an app booted with `useStore: false`.
    vi.spyOn(Object.getPrototypeOf(Application.prototype), 'destroy').mockImplementation(() => {});

    expect(() => app.destroy()).not.toThrow();

    vi.restoreAllMocks();
  });
});

describe('Application plugin phases', () => {
  it('initializes pre-renderer plugins before the renderer, normal plugins after, and post-initializes both', async () => {
    const app = makeApp();
    const calls: string[] = [];
    app.config = { scenes: [] };
    app.plugins = [
      { id: '3d', phase: 'pre-renderer', module: () => Promise.resolve({}), autoLoad: true },
      { id: 'normal', module: () => Promise.resolve({}), autoLoad: true, requires: ['3d'] },
    ];
    app.loadPlugin = vi.fn(async (p: { id: string }) => {
      calls.push(`initialize:${p.id}`);
      app._plugins.set(p.id, { id: p.id, postInitialize: () => calls.push(`postInitialize:${p.id}`) });
    });
    app._connectPwaSignals = vi.fn();
    app._webEventsManager = { onVisibilityChanged: { connect: vi.fn() } };
    app.postInitialize = vi.fn();

    await app.registerPreRendererPlugins();
    calls.push('renderer:init');
    // a default plugin registers after the renderer, before config plugins
    app._plugins.set('input', { id: 'input', postInitialize: () => calls.push('postInitialize:input') });
    await app.registerPlugins();
    await app._postInitialize();

    expect(calls).toEqual([
      'initialize:3d', 'renderer:init', 'initialize:normal', 'postInitialize:input', 'postInitialize:3d', 'postInitialize:normal',
    ]);
    expect(app.loadPlugin).toHaveBeenCalledTimes(2);
  });
});

describe('Application pre-renderer validation', () => {
  it('fails bootstrap when a discovered scene lists a pre-renderer plugin', async () => {
    const app = makeApp();
    app.plugins = [{ id: '3d', phase: 'pre-renderer', module: () => Promise.resolve({}), autoLoad: true }];
    app.loadPlugin = vi.fn();
    const g = globalThis as any;
    const previous = g.Caper;
    g.Caper = { get: (key: string) => (key === 'sceneList' ? [{ id: 'game', plugins: ['3d'] }] : undefined) };
    try {
      await expect(app.registerPreRendererPlugins()).rejects.toThrow(/'3d'.*scene 'game'/s);
    } finally {
      g.Caper = previous;
    }
    expect(app.loadPlugin).not.toHaveBeenCalled();
  });
});

describe('Application#make', () => {
  it('rebuilds its cached methods after registration and disposal', () => {
    const app = makeApp();
    const original = app.make;
    const widget = () => ({ id: 'widget' }) as never;
    const dispose = registerFactoryMethods({ widget });
    try {
      expect(app.make).not.toBe(original);
      expect(app.make).toBe(app.make);
      expect(app.make.widget()).toEqual({ id: 'widget' });
    } finally {
      dispose();
    }
    expect(app.make.widget).toBeUndefined();
  });
});
