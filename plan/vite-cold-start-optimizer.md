# Cold-start dep optimizer reload

**Status:** fixed on `hotfix/vite-optimizer-issue`. Live-verified in bankshot
(linked) on 2026-07-30: cold start prebundles the gameplay deps up front, and
clicking into a level no longer reloads. Uncommitted; not published yet.

## Symptom

Cold `pnpm dev` (empty `.cache`), reach a menu scene, click through to a gameplay
scene — the whole page hard-reloads. Every later run in the same session is fine.
The dev terminal prints:

```
✨ new dependencies optimized: check2d, pixi-filters, gsap/CustomEase, …
✨ optimized dependencies changed. reloading
```

Reported against bankshot: level select → level → full reload.

## Diagnosis

Vite's cold-start dep scan sees **nothing at all** in a caper app, so every
dependency is discovered lazily at runtime instead of being prebundled up front.

Two separate reasons, both of them caper's doing:

1. **The entry is invisible.** `build/plugins/runtime.mjs` injects
   `<script type="module">import("caper-runtime")</script>` from
   `transformIndexHtml`. The dep scanner reads the **raw** `index.html` for
   script tags and never runs `transformIndexHtml`, so a caper app's
   `index.html` scans as an empty document.
2. **The scene graph is behind virtual modules.** Scenes, popups and
   `autoLoad: false` plugins reach the runtime through `virtual:caper-scenes` /
   `-popups` / `-plugins` as dynamic imports. The scanner cannot resolve virtual
   ids, so it stops there even when an entry does exist.

The result: the first page load discovers the startup deps, and the first scene
that pulls a new one (physics, filters, gsap plugins) triggers a re-optimize
mid-session — which forces the full reload.

### Measurement

`vite optimize --force` against bankshot's real source tree, with caper's
`resolve`/`optimizeDeps` defaults but no plugins, writing to a throwaway
`cacheDir`:

| scan entries | deps prebundled |
| --- | --- |
| default (`index.html`) | `@pixi/ui > typed-signals` — the manual `include`, nothing else |
| proposed `entries` | `@caperjs/core`, `check2d`, `gsap`, `gsap/CustomEase`, `partysocket`, `pixi-filters`, `pixi-filters/outline`, `pixi.js`, `tweakpane`, `@pixi/ui > typed-signals` |

`check2d`, `pixi-filters` and `gsap/CustomEase` are exactly the deps named in the
"new dependencies optimized" line, so the second column is the reload, moved to
startup.

## Fix

`build/defaults.mjs` — add `optimizeDeps.entries` listing the roots the virtual
lists load, since none are reachable from the html:

```
index.html
caper.config.ts
src/main.ts
src/{scenes,plugins,popups,entities,ui,locales}/**/*.{ts,tsx,js,jsx}
```

`index.html` stays first so an app with a hand-written script tag keeps its entry
(setting `entries` replaces the default scan).

### Why these paths are safe to assume

They are not a guess about how people lay out a project — they are the layout
caper already requires. `internal/discovery.mjs` only ever crawls `src/scenes`,
`src/plugins`, `src/popups`, `src/entities`, `src/ui` and `src/locales`, so a
scene outside `src/scenes` is not a scene as far as the framework is concerned;
there is nothing there for the optimizer to miss. Same for `caper.config.ts`
(resolved as exactly `root/caper.config.ts` in `plugins/caperConfig.mjs`) and
`src/main.ts` (globbed literally in `plugins/runtime.mjs`).

Everything *else* an app writes — `src/game`, `src/utils`, whatever the tree
looks like — is reached transitively from those roots, so the scanner follows it
without needing to know the names.

To stop the two lists drifting, the paths now live in `build/internal/paths.mjs`
(`SOURCE_DIRS`, `CAPER_CONFIG_FILE`, `APP_ENTRY_FILE`) and both `discovery.mjs`
and `defaults.mjs` read them from there. A glob that matches nothing — an app
with no `src/entities` — is skipped silently, verified against a real project.

Notes:

- This changes **when** deps are optimized, not **which**. The same set was
  already ending up in `.cache/deps`, just one reload later.
- Arrays concatenate when vite merges configs, so an app that sets its own
  `optimizeDeps.entries` gets both lists scanned, never a replacement.
- Deliberately not a blanket `src/**` — that would drag `*.spec.ts` and other
  node-only source into the scan.
- The prebundled set now includes `@caperjs/core` in registry (non-linked) mode.
  Linked deps are served as source and are unaffected.

Covered by two tests in `build/defaults.test.mjs`. `packages/core`: 181 pass.

## Not the cause

caper's own full-reload paths (`build/assetpack.mjs` after a rebuild batch,
`build/plugins/assetTypes.mjs` after a manifest change) were the alternative
theory. They fire independently of navigation, and the terminal signature is the
assetpack rebuild line rather than "optimized dependencies changed". Left alone.

## Verification

1. In an app, cold start: `rm -rf .cache && vite`.
2. Terminal should print one "Optimizing dependencies:" line at startup listing
   the gameplay deps, and **no** "optimized dependencies changed. reloading"
   after clicking into a scene.
3. Play a scene: physics, filters and gsap-driven motion all still work — the
   prebundle boundary is where duplicate-instance bugs (pixi singletons) would
   show up.
