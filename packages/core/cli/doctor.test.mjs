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
