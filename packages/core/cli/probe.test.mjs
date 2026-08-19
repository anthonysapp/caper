import { describe, expect, it } from 'vitest';
import { parseProbeArgs } from './probe.mjs';

describe('parseProbeArgs', () => {
  it('parses the url positional argument', () => {
    const result = parseProbeArgs(['http://localhost:4179/']);
    expect(result.url).toBe('http://localhost:4179/');
    expect(result.actions).toEqual([]);
    expect(result.headed).toBe(false);
    expect(result.json).toBe(false);
  });

  it('parses repeated --action with and without JSON data', () => {
    const result = parseProbeArgs([
      'http://localhost:4179/',
      '--action',
      'start',
      '--action',
      'submit={"value":42}',
    ]);
    expect(result.actions).toEqual([
      { name: 'start' },
      { name: 'submit', data: { value: 42 } },
    ]);
  });

  it('parses --until predicate string', () => {
    const result = parseProbeArgs(['http://localhost:4179/', '--until', "s => s && s.phase === 'resolved'"]);
    expect(result.until).toBe("s => s && s.phase === 'resolved'");
  });

  it('parses numeric --wait and --timeout options', () => {
    const result = parseProbeArgs(['http://localhost:4179/', '--wait', '500', '--timeout', '30000']);
    expect(result.waitMs).toBe(500);
    expect(result.timeoutMs).toBe(30000);
  });

  it('parses --viewport WxH', () => {
    const result = parseProbeArgs(['http://localhost:4179/', '--viewport', '800x600']);
    expect(result.viewport).toEqual({ width: 800, height: 600 });
  });

  it('parses boolean and string options', () => {
    const result = parseProbeArgs([
      'http://localhost:4179/',
      '--app',
      'demo',
      '--screenshot',
      '/tmp/out.png',
      '--headed',
      '--json',
    ]);
    expect(result.appId).toBe('demo');
    expect(result.screenshot).toBe('/tmp/out.png');
    expect(result.headed).toBe(true);
    expect(result.json).toBe(true);
  });

  it('throws when url is missing', () => {
    expect(() => parseProbeArgs(['--action', 'start'])).toThrow('Missing required <url> argument');
  });

  it('throws on invalid JSON in --action', () => {
    expect(() => parseProbeArgs(['http://localhost:4179/', '--action', 'submit={not json}'])).toThrow(
      'Invalid JSON data',
    );
  });

  it('throws on invalid --viewport', () => {
    expect(() => parseProbeArgs(['http://localhost:4179/', '--viewport', '800'])).toThrow(
      'Invalid --viewport value',
    );
  });
});
