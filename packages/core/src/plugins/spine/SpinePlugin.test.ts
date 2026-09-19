import { extensions } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

// SpinePlugin extends Plugin, which transitively imports Application → the whole
// display graph (and an import cycle). The base class is irrelevant here. Stub it.
vi.mock('../Plugin', () => ({ Plugin: class {} }));

import { SpinePlugin } from './SpinePlugin';
import { SpinePipe } from './pixi-spine';
import { DarkTintBatcher } from './pixi-spine/darktint/DarkTintBatcher';

describe('SpinePlugin', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // package.json declares `"sideEffects": false`, so a production bundler is free
  // to drop `import './SpinePipe.js'` and with it the module-scope
  // `extensions.add(SpinePipe)`. Without the pipe, the first Spine on stage throws
  // inside `renderer.render()`, which kills Pixi's ticker: the picture freezes.
  // Registration has to be an explicit call the bundler can see.
  it('registers the render pipe and the dark-tint batcher explicitly, not via module side effects', async () => {
    const add = vi.spyOn(extensions, 'add');

    await new SpinePlugin().initialize();

    const registered = add.mock.calls.flat();
    expect(registered).toContain(SpinePipe);
    expect(registered).toContain(DarkTintBatcher);
  });
});
