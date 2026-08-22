// Typecheck `src/__typefixtures__` exactly the way a consumer app sees this
// package: `"types": ["@caperjs/solid/jsx"]` resolved through the package.json
// `exports` map. TypeScript will not self-resolve a package by its own name for
// a `types` entry (and `paths` does not apply to them either), so link the
// package into its own node_modules first — the same shape `pnpm install` gives
// a consumer. The link lives in node_modules, so it is never committed.

import { execFileSync } from 'node:child_process';
import { lstatSync, mkdirSync, symlinkSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const link = path.join(root, 'node_modules', '@caperjs', 'solid');

mkdirSync(path.dirname(link), { recursive: true });
try {
  if (lstatSync(link).isSymbolicLink()) unlinkSync(link);
} catch {
  // No link yet — nothing to clean up.
}
symlinkSync(root, link, 'junction');

execFileSync('tsc', ['-p', 'tsconfig.fixture.json'], { cwd: root, stdio: 'inherit' });
