import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { agentInit } from './agent.mjs';

const shippedSkill = path.resolve(process.cwd(), 'extras/skills/caper/SKILL.md');

const START_MARKER = '<!-- caper:agent-start -->';

let tempDir = null;

afterEach(() => {
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  tempDir = null;
});

function makeTempDir() {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'caper-agent-'));
  return tempDir;
}

function countMarkers(contents) {
  return {
    start: (contents.match(/<!-- caper:agent-start -->/g) || []).length,
    end: (contents.match(/<!-- caper:agent-end -->/g) || []).length,
  };
}

describe('agentInit', () => {
  it('creates the default skill copy and AGENTS.md when no context file exists', async () => {
    const cwd = makeTempDir();

    const { skillFile, contextFile } = await agentInit(cwd);

    expect(fs.existsSync(skillFile)).toBe(true);
    expect(fs.readFileSync(skillFile, 'utf-8')).toBe(fs.readFileSync(shippedSkill, 'utf-8'));
    expect(path.basename(contextFile)).toBe('AGENTS.md');

    const context = fs.readFileSync(contextFile, 'utf-8');
    expect(context).toContain('<!-- caper:agent-start -->');
    expect(context).toContain('<!-- caper:agent-end -->');
    expect(context).toContain('.claude/skills/caper/SKILL.md');
  });

  it('respects --dir and references the custom skill path', async () => {
    const cwd = makeTempDir();

    const { skillFile, contextFile } = await agentInit(cwd, { dir: 'skills' });

    expect(skillFile).toBe(path.join(cwd, 'skills/caper/SKILL.md'));
    expect(fs.existsSync(skillFile)).toBe(true);

    const context = fs.readFileSync(contextFile, 'utf-8');
    expect(context).toContain('skills/caper/SKILL.md');
    expect(context).not.toContain('.claude/skills/caper/SKILL.md');
  });

  it('appends the block to CLAUDE.md when only CLAUDE.md exists', async () => {
    const cwd = makeTempDir();
    const original = '# Project CLAUDE.md\n\nSome existing guidance.\n';
    fs.writeFileSync(path.join(cwd, 'CLAUDE.md'), original, 'utf-8');

    const { skillFile, contextFile } = await agentInit(cwd);

    expect(path.basename(contextFile)).toBe('CLAUDE.md');
    expect(fs.existsSync(path.join(cwd, 'AGENTS.md'))).toBe(false);

    const context = fs.readFileSync(contextFile, 'utf-8');
    expect(context).toContain('Some existing guidance.');
    expect(context).toContain('<!-- caper:agent-start -->');
    expect(context).toContain('<!-- caper:agent-end -->');
    expect(context.indexOf('Some existing guidance.')).toBeLessThan(context.indexOf(START_MARKER));
  });

  it('is idempotent and preserves user edits outside the markers', async () => {
    const cwd = makeTempDir();

    await agentInit(cwd);
    const first = fs.readFileSync(path.join(cwd, 'AGENTS.md'), 'utf-8');

    // User edits outside the markers
    const edited = `# App pointers\n\n${first}\n\n## Custom section\n\nKeep me.\n`;
    fs.writeFileSync(path.join(cwd, 'AGENTS.md'), edited, 'utf-8');

    await agentInit(cwd);
    const second = fs.readFileSync(path.join(cwd, 'AGENTS.md'), 'utf-8');

    const markers = countMarkers(second);
    expect(markers.start).toBe(1);
    expect(markers.end).toBe(1);
    expect(second).toContain('# App pointers');
    expect(second).toContain('## Custom section');
    expect(second).toContain('Keep me.');

    // Replace the block with the freshly generated one so we can compare the rest
    const start = second.indexOf('<!-- caper:agent-start -->');
    const end = second.indexOf('<!-- caper:agent-end -->') + '<!-- caper:agent-end -->'.length;
    const regenerated = second.slice(start, end);
    expect(regenerated).toBe(first.trimEnd());
  });
});
