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

  it('scans the code-split roots so the cold dep scan sees them', () => {
    // The runtime entry is injected at transformIndexHtml time, which the dep
    // scanner never runs, and scenes/popups/lazy plugins arrive through the
    // virtual lists as dynamic imports. Without these entries the cold scan
    // prebundles nothing, and vite re-optimizes (and hard-reloads) on the
    // first scene that pulls a new dep.
    const { entries } = caperDefaults({}, serve).optimizeDeps;
    expect(entries).toContain('index.html');
    expect(entries).toContain('caper.config.ts');
    expect(entries).toContain('src/main.ts');
    for (const dir of ['scenes', 'popups', 'entities', 'ui', 'plugins']) {
      expect(entries).toContain(`src/${dir}/**/*.{ts,tsx,js,jsx}`);
    }
  });

  it("contributes its scan entries even when the project sets its own", () => {
    // vite concatenates array options, so both lists end up scanned.
    const userConfig = { optimizeDeps: { entries: ['custom.html'] } };
    expect(caperDefaults(userConfig, serve).optimizeDeps.entries).toContain('index.html');
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
