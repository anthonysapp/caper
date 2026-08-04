/**
 * Webp-only production builds.
 *
 * AssetPack emits every image twice, `.webp` and `.png`, and lists webp first in
 * `assets.json` — so pixi's resolver takes webp on every browser shipped since
 * 2020 and the png half is dead weight. In a caper game that's megabytes: 5.8MB
 * of a 43MB build, in bankshot's case.
 *
 * Dev keeps both on purpose: the png is passed through uncompressed there, which
 * is the cheapest thing the pipeline can do, and nothing downloads it anyway.
 * Production drops it. Opt back in with `caper({ assets: { pngFallback: true } })`
 * if you need to serve a browser without webp support.
 *
 * Why prune rather than not emit: AssetPack's `compression.png: false` doesn't
 * drop the file, it passes the *uncompressed original* through — bigger than the
 * compressed one — and that combination crashes the texture-packer cache-buster
 * before the manifest is written.
 *
 * `assets.json` drives the prune rather than filenames, because production
 * cache-busts each format with its own hash (`sheet-u_QUSQ@2x.png` next to
 * `sheet-Ui99Xw@2x.webp`), so pairing them on disk is guesswork. A png `src` is
 * only dropped when a non-png `src` survives it, so a `{nc}`-tagged (uncompressed
 * on purpose) image is never deleted out from under the game.
 */
import fs from 'node:fs';
import path from 'node:path';

/** A png image, a texture-packer descriptor, or a spine atlas for one. */
const isPngSrc = (src) => /\.png(\.json|\.atlas)?$/.test(src);

/** A bitmap font descriptor — text `.fnt` or XML `.fnt`/`.xml`, both quote `file="…"`. */
const isFontSrc = (src) => /\.(fnt|xml)$/.test(src);

/**
 * PixiJS bitmap fonts hardcode their texture page filename inside the
 * descriptor and fetch it relative to the descriptor's own URL — the asset
 * manifest is never consulted for that request, so rewriting `src` there
 * doesn't stop the loader asking for the exact name printed here.
 */
const fontPageNames = (text) => new Set([...text.matchAll(/file="([^"]+\.png)"/g)].map((match) => path.basename(match[1])));

/**
 * Works out what to delete without touching the filesystem, so the decision is
 * testable on its own.
 *
 * @param {{ bundles: { assets: { src: string[] }[] }[] }} manifest Parsed asset manifest; rewritten in place.
 * @param {(rel: string) => string | null} readText Returns a descriptor's contents, or null if absent.
 * @returns {string[]} Manifest-relative paths to delete.
 */
export function planPngPrune(manifest, readText) {
  const doomed = [];
  const seen = new Set();

  /**
   * A descriptor, the image(s) it names, and any further pages it chains to.
   *
   * Two formats reference images by name rather than being manifest entries
   * themselves: a texture-packer `*.png.json` (`meta.image`, plus
   * `related_multi_packs` for pages past the first, which are never manifest
   * entries) and a spine `*.png.atlas` (page names on their own lines). `seen` is
   * load-bearing for the first: sibling pages list each other, so following the
   * chain without it never terminates.
   */
  const addDescriptor = (rel) => {
    if (seen.has(rel)) return;
    seen.add(rel);

    const text = readText(rel);
    if (text) {
      if (rel.endsWith('.atlas')) {
        for (const line of text.split(/\r?\n/)) {
          const name = line.trim();
          if (name.endsWith('.png')) doomed.push(path.join(path.dirname(rel), name));
        }
      } else {
        let sheet;
        try {
          sheet = JSON.parse(text);
        } catch {
          sheet = null;
        }
        if (sheet?.meta?.image) doomed.push(path.join(path.dirname(rel), sheet.meta.image));
        for (const pack of sheet?.meta?.related_multi_packs ?? []) {
          addDescriptor(path.join(path.dirname(rel), pack));
        }
      }
    }
    doomed.push(rel);
  };

  const protectedPngs = new Set();
  for (const bundle of manifest.bundles ?? []) {
    for (const asset of bundle.assets ?? []) {
      for (const src of asset.src ?? []) {
        if (!isFontSrc(src)) continue;
        const text = readText(src);
        if (text) for (const name of fontPageNames(text)) protectedPngs.add(name);
      }
    }
  }

  for (const bundle of manifest.bundles ?? []) {
    for (const asset of bundle.assets ?? []) {
      const isProtected = (src) => isPngSrc(src) && protectedPngs.has(path.basename(src));
      const png = (asset.src ?? []).filter((src) => isPngSrc(src) && !isProtected(src));
      const kept = (asset.src ?? []).filter((src) => !isPngSrc(src) || isProtected(src));
      if (!png.length || !kept.length) continue;

      for (const rel of png) {
        if (rel.endsWith('.png.json') || rel.endsWith('.png.atlas')) addDescriptor(rel);
        else doomed.push(rel);
      }
      // Keep the manifest honest: a src the resolver could still pick but the
      // build no longer ships would 404 on whoever got that far.
      asset.src = kept;
    }
  }

  return doomed;
}

/**
 * @param {{ manifestUrl?: string }} [options]
 * @returns {import('vite').Plugin}
 */
export function pngFallbackPrunePlugin({ manifestUrl = 'assets.json' } = {}) {
  let assetsDir;
  let enabled = false;

  return {
    name: 'caper:prune-png-fallbacks',
    apply: 'build',
    configResolved(config) {
      // Dev builds keep the fallback; so does a `vite build --mode development`.
      enabled = config.isProduction;
      assetsDir = path.join(config.build.outDir, 'assets');
      if (!path.isAbsolute(assetsDir)) assetsDir = path.resolve(config.root, assetsDir);
    },
    closeBundle: {
      // Ahead of vite-plugin-pwa, which globs `dist` to build its precache list.
      order: 'pre',
      sequential: true,
      handler() {
        if (!enabled) return;

        const manifestPath = path.join(assetsDir, manifestUrl);
        if (!fs.existsSync(manifestPath)) return;

        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const doomed = planPngPrune(manifest, (rel) => {
          const file = path.join(assetsDir, rel);
          return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
        });

        let removed = 0;
        let bytes = 0;
        for (const rel of doomed) {
          const file = path.join(assetsDir, rel);
          if (!fs.existsSync(file)) continue;
          bytes += fs.statSync(file).size;
          fs.rmSync(file);
          removed += 1;
        }

        fs.writeFileSync(manifestPath, JSON.stringify(manifest));

        if (removed) {
          this.info?.(`pruned ${removed} png fallbacks (${(bytes / 1e6).toFixed(1)}MB) — set assets.pngFallback to keep them`);
        }
      },
    },
  };
}
