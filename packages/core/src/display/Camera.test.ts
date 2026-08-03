import { Container as PixiContainer } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';

// Camera transitively imports Application → Pixi display graph. Stub it.
vi.mock('../core', () => ({
  coreFunctionRegistry: {},
  coreSignalRegistry: {},
}));

const mocks = vi.hoisted(() => ({
  app: {
    size: { width: 800, height: 400 },
  },
}));

vi.mock('../core/Application', () => ({
  Application: { getInstance: () => mocks.app },
}));

import { Camera } from './Camera';

describe('Camera targetScale', () => {
  it('reflects the target scale, not the target pivot', () => {
    const camera = new Camera({ container: new PixiContainer(), viewportWidth: 200, viewportHeight: 100 });

    camera.zoom(3);

    expect(camera.targetScale.x).toBe(3);
    expect(camera.targetScale.y).toBe(3);
    expect(camera.targetScale).not.toBe(camera.targetPivot);
  });
});

describe('Camera viewportHeight default', () => {
  it('falls back to app.size.height, not app.size.width', () => {
    const camera = new Camera({ container: new PixiContainer() });

    expect(camera.viewportHeight).toBe(mocks.app.size.height);
  });
});
