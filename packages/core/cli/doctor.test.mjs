import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { agentInit } from './agent.mjs';
import { runChecks } from './doctor.mjs';

const START_MARKER = '<!-- caper:agent-start -->';
const END_MARKER = '<!-- caper:agent-end -->';

const installedVersion = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf-8')).version;

let tempDir = null;

afterEach(() => {
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  tempDir = null;
});

function makeTempDir() {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'caper-doctor-'));
  return tempDir;
}

function setMtime(file, secondsAgo) {
  const t = Date.now() / 1000 - secondsAgo;
  fs.utimesSync(file, t, t);
}

function find(checks, id) {
  return checks.find((c) => c.id === id);
}

describe('runChecks', () => {
  it('reports failures/warnings for an empty app directory', async () => {
    const cwd = makeTempDir();

    const checks = await runChecks(cwd, { online: false });

    expect(find(checks, 'version').status).toBe('ok');
    expect(find(checks, 'link').status).toBe('fail');
    expect(find(checks, 'app-types').status).toBe('fail');
    expect(find(checks, 'agent').status).toBe('warn');
    expect(find(checks, 'asset-types').status).toBe('warn');
    expect(find(checks, 'asset-manifest').status).toBe('warn');
    expect(find(checks, 'caches').status).toBe('ok');
  });

  it('marks app types ok when fresh and warns after a newer source file', async () => {
    const cwd = makeTempDir();

    fs.mkdirSync(path.join(cwd, 'src/types'), { recursive: true });
    fs.writeFileSync(path.join(cwd, 'caper.config.ts'), '// config', 'utf-8');
    fs.writeFileSync(path.join(cwd, 'src/types/caper-app.d.ts'), '// types', 'utf-8');
    setMtime(path.join(cwd, 'caper.config.ts'), 100);
    setMtime(path.join(cwd, 'src/types/caper-app.d.ts'), 50);

    const first = await runChecks(cwd, { online: false });
    expect(find(first, 'app-types').status).toBe('ok');

    fs.mkdirSync(path.join(cwd, 'src/scenes'), { recursive: true });
    fs.writeFileSync(path.join(cwd, 'src/scenes/Example.ts'), '// scene', 'utf-8');
    setMtime(path.join(cwd, 'src/scenes/Example.ts'), 10);

    const second = await runChecks(cwd, { online: false });
    expect(find(second, 'app-types').status).toBe('warn');
  });

  it('warns when the agent pointer version does not match the installed version', async () => {
    const cwd = makeTempDir();

    const block = `${START_MARKER}
## Caper agent pointers

This app runs on \`@caperjs/core@0.0.1\`.

- Before engine-facing work, load the \`caper\` skill at \`.claude/skills/caper/SKILL.md\`.
${END_MARKER}`;
    fs.writeFileSync(path.join(cwd, 'AGENTS.md'), block, 'utf-8');
    fs.mkdirSync(path.join(cwd, '.claude/skills/caper'), { recursive: true });
    fs.writeFileSync(path.join(cwd, '.claude/skills/caper/SKILL.md'), '# skill', 'utf-8');

    const checks = await runChecks(cwd, { online: false });
    const agent = find(checks, 'agent');

    expect(agent.status).toBe('warn');
    expect(agent.hint).toContain('@caperjs/core@0.0.1');
  });

  it('reports agent pointers ok when the block and skill are current', async () => {
    const cwd = makeTempDir();

    await agentInit(cwd);

    const checks = await runChecks(cwd, { online: false });
    expect(find(checks, 'agent').status).toBe('ok');
  });

  it('skips the solid tsconfig check when the app does not use @caperjs/solid', async () => {
    const cwd = makeTempDir();
    fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ dependencies: { '@caperjs/core': '^1' } }), 'utf-8');

    const checks = await runChecks(cwd, { online: false });

    expect(find(checks, 'solid-tsconfig')).toBeUndefined();
  });

  it('names every tsconfig setting a solid app is missing', async () => {
    const cwd = makeTempDir();
    fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ dependencies: { '@caperjs/solid': '^1' } }), 'utf-8');
    fs.writeFileSync(path.join(cwd, 'tsconfig.json'), '{\n  // solid needs more than this\n  "compilerOptions": { "jsx": "preserve" }\n}\n', 'utf-8');

    const checks = await runChecks(cwd, { online: false });
    const solid = find(checks, 'solid-tsconfig');

    expect(solid.status).toBe('fail');
    expect(solid.hint).toContain('"jsxFactory": "CaperJSX.h"');
    expect(solid.hint).toContain('"@caperjs/solid/jsx" in types');
    expect(solid.hint).not.toContain('"jsx": "preserve"');
  });

  it('passes a solid app whose tsconfig has all three settings', async () => {
    const cwd = makeTempDir();
    fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ devDependencies: { '@caperjs/solid': '^1' } }), 'utf-8');
    fs.writeFileSync(
      path.join(cwd, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { jsx: 'preserve', jsxFactory: 'CaperJSX.h', types: ['@caperjs/core/client', '@caperjs/solid/jsx'] },
      }),
      'utf-8',
    );

    const checks = await runChecks(cwd, { online: false });

    expect(find(checks, 'solid-tsconfig').status).toBe('ok');
  });

  it('resolves solid tsconfig settings inherited through a relative extends', async () => {
    const cwd = makeTempDir();
    fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ dependencies: { '@caperjs/solid': '^1' } }), 'utf-8');
    fs.writeFileSync(
      path.join(cwd, 'base.tsconfig.json'),
      JSON.stringify({
        compilerOptions: { jsx: 'preserve', jsxFactory: 'CaperJSX.h', types: ['@caperjs/core/client', '@caperjs/solid/jsx'] },
      }),
      'utf-8',
    );
    fs.writeFileSync(path.join(cwd, 'tsconfig.json'), JSON.stringify({ extends: './base.tsconfig.json' }), 'utf-8');

    const checks = await runChecks(cwd, { online: false });

    expect(find(checks, 'solid-tsconfig').status).toBe('ok');
  });

  it("lets the app's own tsconfig override a bad base setting", async () => {
    const cwd = makeTempDir();
    fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ dependencies: { '@caperjs/solid': '^1' } }), 'utf-8');
    fs.writeFileSync(
      path.join(cwd, 'base.tsconfig.json'),
      JSON.stringify({
        compilerOptions: { jsx: 'preserve', jsxFactory: 'Wrong.h', types: ['@caperjs/core/client', '@caperjs/solid/jsx'] },
      }),
      'utf-8',
    );
    fs.writeFileSync(
      path.join(cwd, 'tsconfig.json'),
      JSON.stringify({ extends: './base.tsconfig.json', compilerOptions: { jsxFactory: 'CaperJSX.h' } }),
      'utf-8',
    );

    const checks = await runChecks(cwd, { online: false });

    expect(find(checks, 'solid-tsconfig').status).toBe('ok');
  });

  it("fails when the app's own tsconfig overrides a good base setting with a bad one", async () => {
    const cwd = makeTempDir();
    fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ dependencies: { '@caperjs/solid': '^1' } }), 'utf-8');
    fs.writeFileSync(
      path.join(cwd, 'base.tsconfig.json'),
      JSON.stringify({
        compilerOptions: { jsx: 'preserve', jsxFactory: 'CaperJSX.h', types: ['@caperjs/core/client', '@caperjs/solid/jsx'] },
      }),
      'utf-8',
    );
    fs.writeFileSync(
      path.join(cwd, 'tsconfig.json'),
      JSON.stringify({ extends: './base.tsconfig.json', compilerOptions: { jsxFactory: 'Wrong.h' } }),
      'utf-8',
    );

    const checks = await runChecks(cwd, { online: false });
    const solid = find(checks, 'solid-tsconfig');

    expect(solid.status).toBe('fail');
    expect(solid.hint).toContain('"jsxFactory": "CaperJSX.h"');
  });

  it('resolves solid tsconfig settings from a later entry in an extends array', async () => {
    const cwd = makeTempDir();
    fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ dependencies: { '@caperjs/solid': '^1' } }), 'utf-8');
    fs.writeFileSync(path.join(cwd, 'first.tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true } }), 'utf-8');
    fs.writeFileSync(
      path.join(cwd, 'second.tsconfig.json'),
      JSON.stringify({
        compilerOptions: { jsx: 'preserve', jsxFactory: 'CaperJSX.h', types: ['@caperjs/core/client', '@caperjs/solid/jsx'] },
      }),
      'utf-8',
    );
    fs.writeFileSync(path.join(cwd, 'tsconfig.json'), JSON.stringify({ extends: ['./first.tsconfig.json', './second.tsconfig.json'] }), 'utf-8');

    const checks = await runChecks(cwd, { online: false });

    expect(find(checks, 'solid-tsconfig').status).toBe('ok');
  });

  it('resolves solid tsconfig settings through a chained extends', async () => {
    const cwd = makeTempDir();
    fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ dependencies: { '@caperjs/solid': '^1' } }), 'utf-8');
    fs.writeFileSync(
      path.join(cwd, 'grandparent.tsconfig.json'),
      JSON.stringify({
        compilerOptions: { jsx: 'preserve', jsxFactory: 'CaperJSX.h', types: ['@caperjs/core/client', '@caperjs/solid/jsx'] },
      }),
      'utf-8',
    );
    fs.writeFileSync(path.join(cwd, 'parent.tsconfig.json'), JSON.stringify({ extends: './grandparent.tsconfig.json' }), 'utf-8');
    fs.writeFileSync(path.join(cwd, 'tsconfig.json'), JSON.stringify({ extends: './parent.tsconfig.json' }), 'utf-8');

    const checks = await runChecks(cwd, { online: false });

    expect(find(checks, 'solid-tsconfig').status).toBe('ok');
  });

  it('does not throw on a broken extends path and falls back to the own tsconfig', async () => {
    const cwd = makeTempDir();
    fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ dependencies: { '@caperjs/solid': '^1' } }), 'utf-8');
    fs.writeFileSync(
      path.join(cwd, 'tsconfig.json'),
      JSON.stringify({ extends: './does-not-exist.json', compilerOptions: { jsx: 'preserve' } }),
      'utf-8',
    );

    const checks = await runChecks(cwd, { online: false });
    const solid = find(checks, 'solid-tsconfig');

    expect(solid.status).toBe('fail');
    expect(solid.hint).toContain('"jsxFactory": "CaperJSX.h"');
    expect(solid.hint).toContain('"@caperjs/solid/jsx" in types');
    expect(solid.hint).not.toContain('"jsx": "preserve"');
  });

  it('reports a linked package missing its build', async () => {
    const cwd = makeTempDir();
    const checkout = path.join(cwd, 'checkout');
    fs.mkdirSync(path.join(checkout, 'src'), { recursive: true });
    fs.writeFileSync(path.join(checkout, 'src/a.ts'), '// a', 'utf-8');

    const linkPath = path.join(cwd, 'node_modules/@caperjs/core');
    fs.mkdirSync(path.dirname(linkPath), { recursive: true });
    fs.symlinkSync(checkout, linkPath, 'dir');

    const checks = await runChecks(cwd, { online: false });
    const link = find(checks, 'link');

    expect(link.status).toBe('fail');
    expect(link.label).toContain('linked from');
    expect(link.hint).toContain('pnpm build');
  });

  it('reports a linked package ok when the build is newer than source', async () => {
    const cwd = makeTempDir();
    const checkout = path.join(cwd, 'checkout');

    fs.mkdirSync(path.join(checkout, 'src'), { recursive: true });
    fs.writeFileSync(path.join(checkout, 'src/a.ts'), '// a', 'utf-8');
    setMtime(path.join(checkout, 'src/a.ts'), 50);

    fs.mkdirSync(path.join(checkout, 'lib'), { recursive: true });
    fs.writeFileSync(path.join(checkout, 'lib/caper.mjs'), '// build', 'utf-8');
    setMtime(path.join(checkout, 'lib/caper.mjs'), 10);

    const linkPath = path.join(cwd, 'node_modules/@caperjs/core');
    fs.mkdirSync(path.dirname(linkPath), { recursive: true });
    fs.symlinkSync(checkout, linkPath, 'dir');

    const checks = await runChecks(cwd, { online: false });
    const link = find(checks, 'link');

    expect(link.status).toBe('ok');
    expect(link.label).toContain('linked from');
  });
});
