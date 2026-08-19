/**
 * `caper types` — command-line type generation without a dev server.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateTypes } from './types.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(here, '../test/fixtures/app');
const caperBuildUrl = pathToFileURL(path.resolve(here, '../build/index.mjs')).href;

let root;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'caper-types-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function scaffoldApp(options = { assets: false }) {
  fs.cpSync(fixtureRoot, root, { recursive: true });
  fs.writeFileSync(
    path.join(root, 'vite.config.ts'),
    `import { caper } from '${caperBuildUrl}';

export default {
  plugins: [caper(${JSON.stringify(options)})],
};
`,
    'utf-8',
  );
}

describe('generateTypes', () => {
  it('writes caper-app.d.ts and returns null assetTypes when assets are disabled', async () => {
    scaffoldApp({ assets: false });

    const result = await generateTypes(root, { assets: false });

    const dtsPath = path.join(root, 'src', 'types', 'caper-app.d.ts');
    expect(fs.existsSync(dtsPath)).toBe(true);
    const content = fs.readFileSync(dtsPath, 'utf-8');
    expect(content).toContain("'main'");
    expect(result.appTypes).toBe(dtsPath);
    expect(result.assetTypes).toBeNull();
  });

  it('throws when caper() is not present in vite.config', async () => {
    fs.writeFileSync(path.join(root, 'vite.config.ts'), 'export default { plugins: [] };', 'utf-8');

    await expect(generateTypes(root)).rejects.toThrow("caper() is not in this project's vite.config");
  });
});
