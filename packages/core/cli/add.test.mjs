import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { add } from './add.mjs';

const dirs = [];
let cwd = process.cwd();
let exitSpy;

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  process.chdir(cwd);
  exitSpy?.mockRestore();
  exitSpy = undefined;
  vi.restoreAllMocks();
});

function useTempApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'caper-add-'));
  dirs.push(dir);
  process.chdir(dir);
  return dir;
}

const ENTITY_2D = `import { Container, defineEntity } from '@caperjs/core';

export const entity = defineEntity({
  id: 'spin-box',
});

export default class SpinBox extends Container {
  constructor() {
    super();
    this.init();
  }

  init() {
    // build the entity's display tree here
  }
}
`;

const ENTITY_3D = `import { defineEntity } from '@caperjs/core';
import { Entity3D } from '@caperjs/plugin-3d';
import type { Mesh3D } from '@pixi/3d';

export const entity = defineEntity({
  id: 'spin-box',
});

export type SpinBoxProps = {
  color?: number;
};

// Add it from a scene with a 3D view: view.add.entity('spin-box', { color: 0x4a90d9, y: 1 })
export default class SpinBox extends Entity3D<SpinBoxProps> {
  private body?: Mesh3D;

  added() {
    // Build parts here, not in the constructor: this.add works once the entity is in a view.
    // added() runs again when the entity is moved to a new parent, so build once.
    if (this.body) return;
    this.body = this.add.mesh({ geometry: 'box', color: this.props.color ?? 0xe85d5d });
    // Taps: listen on the entity from a scene, e.g. entity.on('pointertap', ...). Listening makes it tappable.
  }

  update() {
    // Runs every frame while the entity is in a view; stops with app.pause().
    this.rotation.y += 0.02 * this.app.ticker.deltaTime;
  }
}
`;

const entityPath = () => path.join(process.cwd(), 'src/entities/SpinBox.ts');

describe('caper add entity --3d', () => {
  it('writes the 3D entity template with --3d after the name', async () => {
    useTempApp();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await add(['entity', 'SpinBox', '--3d']);

    expect(fs.readFileSync(entityPath(), 'utf-8')).toBe(ENTITY_3D);
    expect(log.mock.calls.flat().join('\n')).toContain('npx caper add 3d');
    log.mockRestore();
  });

  it('writes the 3D entity template with --3d before the name', async () => {
    useTempApp();
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await add(['entity', '--3d', 'SpinBox']);

    expect(fs.readFileSync(entityPath(), 'utf-8')).toBe(ENTITY_3D);
  });

  it('writes the unchanged 2D template without --3d', async () => {
    useTempApp();
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await add(['entity', 'SpinBox']);

    expect(fs.readFileSync(entityPath(), 'utf-8')).toBe(ENTITY_2D);
  });

  it('errors when --3d is used with scene', async () => {
    useTempApp();
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit:${code}`);
    });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(add(['scene', 'Test', '--3d'])).rejects.toThrow('exit:1');

    expect(fs.existsSync(path.join(process.cwd(), 'src/scenes/Test.ts'))).toBe(false);
    err.mockRestore();
  });
});
