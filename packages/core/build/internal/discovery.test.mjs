import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findTypeScriptFiles } from './discovery.mjs';

describe('findTypeScriptFiles', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'caper-discovery-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('finds .ts and .tsx files but not .t or non-TS files', async () => {
    fs.writeFileSync(path.join(dir, 'Foo.tsx'), '');
    fs.writeFileSync(path.join(dir, 'Bar.ts'), '');
    fs.writeFileSync(path.join(dir, 'Baz.t'), '');
    fs.writeFileSync(path.join(dir, 'readme.md'), '');

    const files = await findTypeScriptFiles(dir);

    expect(files).toContain(path.join(dir, 'Foo.tsx'));
    expect(files).toContain(path.join(dir, 'Bar.ts'));
    expect(files).not.toContain(path.join(dir, 'Baz.t'));
    expect(files).not.toContain(path.join(dir, 'readme.md'));
  });
});
