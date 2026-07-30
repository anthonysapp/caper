import { describe, expect, it } from 'vitest';
import { caperDefaults, caperDefaultValues, fillMissing } from './defaults.mjs';

const build = { command: 'build', mode: 'production' };
const serve = { command: 'serve', mode: 'development' };

describe('fillMissing', () => {
  it('contributes a key the target lacks', () => {
    expect(fillMissing({}, { base: '/' })).toEqual({ base: '/' });
  });

  it('leaves a key the target already set', () => {
    expect(fillMissing({ base: '/app/' }, { base: '/' })).toBeUndefined();
  });

  it('recurses into plain objects so siblings still fill', () => {
    const out = fillMissing({ server: { port: 4000 } }, { server: { port: 3000, host: true } });
    expect(out).toEqual({ server: { host: true } });
  });

  it('always contributes arrays, since vite concatenates them', () => {
    const out = fillMissing({ resolve: { dedupe: ['mine'] } }, { resolve: { dedupe: ['pixi.js'] } });
    expect(out).toEqual({ resolve: { dedupe: ['pixi.js'] } });
  });

  it('returns undefined when there is nothing to contribute', () => {
    expect(fillMissing({ a: 1 }, { a: 2 })).toBeUndefined();
  });

  it('treats a falsy target value as set', () => {
    expect(fillMissing({ base: '' }, { base: '/' })).toBeUndefined();
    expect(fillMissing({ sourcemap: false }, { sourcemap: true })).toBeUndefined();
  });
});

describe('caperDefaults', () => {
  it('gives an empty project the full default set', () => {
    const out = caperDefaults({}, build);
    expect(out.publicDir).toBe('./public');
    expect(out.cacheDir).toBe('.cache');
    expect(out.logLevel).toBe('info');
    expect(out.server).toEqual({ port: 3000, host: true, open: true });
    expect(out.preview).toEqual({ host: true, port: 8080 });
  });

  it('serves from root in dev and relative in build', () => {
    expect(caperDefaults({}, serve).base).toBe('/');
    expect(caperDefaults({}, build).base).toBe('./');
  });

  it("never overwrites the project's own values", () => {
    const userConfig = {
      base: '/custom/',
      publicDir: './static',
      server: { port: 4321 },
      build: { sourcemap: true },
      define: { __CAPER_APP_NAME: '"mine"' },
    };
    const out = caperDefaults(userConfig, build);
    expect(out.base).toBeUndefined();
    expect(out.publicDir).toBeUndefined();
    expect(out.server?.port).toBeUndefined();
    expect(out.build?.sourcemap).toBeUndefined();
    expect(out.define?.__CAPER_APP_NAME).toBeUndefined();
    // ...while still contributing the siblings the project didn't set.
    expect(out.server).toEqual({ host: true, open: true });
    expect(out.define?.__CAPER_APP_VERSION).toBeDefined();
  });

  it('keeps the pixi singletons deduped even when the project adds its own', () => {
    const out = caperDefaults({ resolve: { dedupe: ['my-lib'] } }, build);
    expect(out.resolve.dedupe).toContain('pixi.js');
    expect(out.resolve.dedupe).toContain('gsap');
    expect(out.resolve.dedupe).toContain('@pixi/sound');
  });

  it('keeps caper-globals external and the gsap chunk split', () => {
    const out = caperDefaults({}, build);
    expect(out.build.rolldownOptions.external).toContain('caper-globals');
    const { manualChunks } = out.build.rolldownOptions.output;
    expect(manualChunks('/x/node_modules/gsap/index.js')).toBe('gsap');
    expect(manualChunks('/x/src/main.ts')).toBeUndefined();
  });

  it('falls back to package.json when npm_package_* is absent', () => {
    const saved = [process.env.npm_package_name, process.env.npm_package_version];
    delete process.env.npm_package_name;
    delete process.env.npm_package_version;
    try {
      const { define } = caperDefaultValues(build);
      expect(define.__CAPER_APP_NAME).not.toBe(undefined);
      expect(define.__CAPER_APP_NAME).not.toBe('undefined');
      expect(JSON.parse(define.__CAPER_APP_NAME)).toBeTruthy();
    } finally {
      if (saved[0] !== undefined) process.env.npm_package_name = saved[0];
      if (saved[1] !== undefined) process.env.npm_package_version = saved[1];
    }
  });
});
