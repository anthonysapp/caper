import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { outputModeKey, shouldBypassCache, writeMarker } from './outputMarker.mjs';

const basePipes = { resolutions: { default: 1 } };

describe('outputModeKey', () => {
  it('differs between dev and production for otherwise identical config', () => {
    const devKey = outputModeKey({
      isProduction: false,
      pixiPipesConfig: basePipes,
      manifestUrl: '/manifest.json',
    });
    const prodKey = outputModeKey({
      isProduction: true,
      pixiPipesConfig: basePipes,
      manifestUrl: '/manifest.json',
    });
    expect(devKey).not.toBe(prodKey);
  });

  it('differs when pipes config or manifest URL changes', () => {
    const a = outputModeKey({
      isProduction: false,
      pixiPipesConfig: basePipes,
      manifestUrl: '/manifest.json',
    });
    const b = outputModeKey({
      isProduction: false,
      pixiPipesConfig: { resolutions: { default: 2 } },
      manifestUrl: '/manifest.json',
    });
    const c = outputModeKey({
      isProduction: false,
      pixiPipesConfig: basePipes,
      manifestUrl: '/other-manifest.json',
    });
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(b).not.toBe(c);
  });

  it('is stable for the same inputs', () => {
    const opts = {
      isProduction: true,
      pixiPipesConfig: basePipes,
      manifestUrl: '/manifest.json',
    };
    expect(outputModeKey(opts)).toBe(outputModeKey(opts));
    expect(outputModeKey({ ...opts })).toBe(outputModeKey(opts));
  });
});

describe('shouldBypassCache', () => {
  let root;
  let markerPath;
  let outputDir;
  let key;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'caper-output-marker-'));
    markerPath = path.join(root, '.assetpack', 'caper-output-mode.json');
    outputDir = path.join(root, 'public', 'assets');
    key = outputModeKey({
      isProduction: false,
      pixiPipesConfig: basePipes,
      manifestUrl: '/manifest.json',
    });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('bypasses when the marker file is missing', () => {
    expect(shouldBypassCache({ markerPath, outputDir, key })).toBe(true);
  });

  it('bypasses when the marker JSON is unreadable', () => {
    fs.mkdirSync(path.dirname(markerPath), { recursive: true });
    fs.writeFileSync(markerPath, 'not json', 'utf8');
    expect(shouldBypassCache({ markerPath, outputDir, key })).toBe(true);
  });

  it('bypasses when the stored key differs', () => {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, 'sprite.webp'), 'x', 'utf8');
    writeMarker({ markerPath, key: 'other-key', outputDir });
    expect(shouldBypassCache({ markerPath, outputDir, key })).toBe(true);
  });

  it('bypasses when the output directory is missing', () => {
    writeMarker({ markerPath, key, outputDir });
    fs.rmSync(outputDir, { recursive: true, force: true });
    expect(shouldBypassCache({ markerPath, outputDir, key })).toBe(true);
  });

  it('bypasses when the output directory is empty', () => {
    fs.mkdirSync(outputDir, { recursive: true });
    writeMarker({ markerPath, key, outputDir });
    expect(shouldBypassCache({ markerPath, outputDir, key })).toBe(true);
  });

  it('does not bypass when marker matches and output has files', () => {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, 'sprite.webp'), 'x', 'utf8');
    writeMarker({ markerPath, key, outputDir });
    expect(shouldBypassCache({ markerPath, outputDir, key })).toBe(false);
  });
});

describe('writeMarker', () => {
  let root;
  let markerPath;
  let outputDir;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'caper-output-marker-write-'));
    markerPath = path.join(root, '.assetpack', 'caper-output-mode.json');
    outputDir = path.join(root, 'public', 'assets');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('creates the marker parent and stores key and output path', () => {
    const key = 'test-key';
    writeMarker({ markerPath, key, outputDir });
    expect(fs.existsSync(markerPath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    expect(parsed).toEqual({ key, output: outputDir });
  });
});
