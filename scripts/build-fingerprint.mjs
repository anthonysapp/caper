/**
 * Print a stable fingerprint of a build output directory: one
 * `sha256  size  path` line per file, sorted by path.
 *
 * Used as the oracle for refactors that must not change what ships. Capture a
 * fingerprint before the refactor, re-run after, and `diff` them — a pure code
 * move produces identical output, so any line that moves is a real behaviour
 * change worth explaining.
 *
 *   node scripts/build-fingerprint.mjs <dist-dir> > before.txt
 *
 * Paths are printed relative to the given directory so fingerprints taken from
 * different checkouts compare cleanly.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];

if (!target) {
  console.error('usage: node scripts/build-fingerprint.mjs <dist-dir>');
  process.exit(1);
}

const root = path.resolve(target);

if (!fs.existsSync(root)) {
  console.error(`build-fingerprint: no such directory: ${root}`);
  process.exit(1);
}

/** Every file under `dir`, as paths relative to `root`. */
function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(path.relative(root, full));
  }
  return out;
}

const files = walk(root).sort();

for (const rel of files) {
  const buffer = fs.readFileSync(path.join(root, rel));
  const hash = createHash('sha256').update(buffer).digest('hex');
  console.log(`${hash}  ${String(buffer.length).padStart(9)}  ${rel}`);
}

console.error(`build-fingerprint: ${files.length} files in ${root}`);
