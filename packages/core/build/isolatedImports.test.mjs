/**
 * Imports every module under `build/` in its own child process.
 *
 * This is the test for the failure mode the split invites: circular imports and
 * top-level ordering. Importing everything into one process hides both, because
 * whichever module got there first populated the module cache and the cycle
 * resolved by luck. A fresh process per module means each one has to stand up on
 * its own, in whatever order its own imports demand.
 *
 * It also catches a module that only works because something else ran first —
 * `readCaperBuildFlags()` runs at load time in `config/vite.mjs`, so that class
 * of dependency is real here.
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const run = promisify(execFile);
const buildDir = path.dirname(fileURLToPath(import.meta.url));

/** Every module under build/, tests excluded. */
function modules(dir = buildDir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...modules(full));
    else if (entry.name.endsWith('.mjs') && !entry.name.endsWith('.test.mjs')) out.push(full);
  }
  return out.sort();
}

const found = modules();

describe('isolated imports', () => {
  it('finds the build modules', () => {
    expect(found.length).toBeGreaterThan(0);
  });

  it.each(found.map((file) => [path.relative(buildDir, file), file]))(
    'imports %s in a fresh process',
    async (_label, file) => {
      // Any throw — circular import, TDZ, missing dependency, top-level side
      // effect that needs another module first — fails here with its own stack.
      await expect(
        run(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(file)});`]),
      ).resolves.toBeDefined();
    },
    30_000,
  );
});
