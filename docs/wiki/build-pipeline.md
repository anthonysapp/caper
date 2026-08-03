# Build: Vite Preset & Asset Pipeline
> Part of the Caper core wiki. Index: [Home](Home.md)

## Purpose

`packages/core/build/` is Caper's entire build-time surface. It is published as the
`@caperjs/core/vite` subpath export (`packages/core/package.json:31`) and is plain
`.mjs` — never compiled, never bundled, imported directly by an app's
`vite.config.ts`.

The module is deep in the sense that matters here: an app author writes
`plugins: [caper()]` and gets sixteen Vite plugins, an AssetPack run, two generated
`.d.ts` files, five virtual modules, an auto-injected HTML entry, and an optional
service worker. Caper contributes **only** through Vite's own mechanisms, so plugin
ordering, config merging and precedence are Vite's rules rather than Caper's
(`packages/core/build/index.mjs:9`).

Three seams organise the folder. **`index.mjs` + `defaults.mjs`** are the
composition root and the Vite config Caper contributes as *defaults*, never
overrides. **`internal/`** holds pure-ish helpers with no Vite plugin objects in
them — source parsing, filesystem discovery, path constants, schema, validation —
and must never import from `plugins/` (`internal/manifest.mjs:5` records why: that
dependency once ran backwards and hid a missing import until a real production build
failed). **`plugins/`** holds the Vite adapters, each thin: capture `config.root` in
`configResolved`, delegate to `internal/`.

## Consumer interface

Everything an app author must know.

**The preset.** `caper(options?)` returns a `PluginOption[]`
(`packages/core/build/index.mjs:103`).

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { caper } from '@caperjs/core/vite';
export default defineConfig({ plugins: [caper()] });
```

Then plain `vite` / `vite build`. There is no `caper build` command.

**`caper()` options** (`packages/core/build/index.mjs:85`):

| Option | Meaning |
| --- | --- |
| `assets` | AssetPack pixi-pipes overrides, deep-merged over Caper's defaults. |
| `assets: false` | Drops the whole asset pipeline: no AssetPack run, no `caper-assets.d.ts`, no png prune. |
| `assets.manifestUrl` | Manifest filename, default `assets.json`. Threaded into the manifest pipe too (`assetpack.mjs:177`). |
| `assets.pngFallback` | `true` keeps the png twins a production build otherwise prunes. |
| `pwa` | `vite-plugin-pwa` options merged over Caper's PWA defaults. Absent means no service worker. Two sub-keys are Caper's own, stripped before the plugin sees them: `autoRegister` (default `true`) and `update` — `'prompt'` (default, DOM banner), `'auto'` (reload immediately), `'manual'` (no UI; the game listens to `app.onPwaUpdateAvailable`). |

**`caper.config.ts`** is the app's runtime config, validated by a Zod schema
(`internal/schema.mjs:20` — `.loose()` at the top level, so unknown keys pass, but
known keys are typed). It is read **three different ways** and each matters:
AST-parsed at `caper()` construction time for boolean build flags
(`internal/buildFlags.mjs:10`, currently only `useWasm`); AST-parsed on every dts
regeneration to find `defineConfig` / `defineData` / `defineBreakpoints` / `actions`
/ `contexts` / the `application` class (`plugins/caperConfig.mjs:142`); and actually
*evaluated* via `server.ssrLoadModule` in dev only (`caperConfig.mjs:62`, see
[The SSR stub](#the-ssr-stub)).

**Client types.** Apps add `"@caperjs/core/client"` to their tsconfig `types` array.
That file (`packages/core/client.d.ts`) is three lines: `declare module
'caper-runtime'` plus the ambient `__CAPER_APP_NAME` / `__CAPER_APP_VERSION`
globals.

**Build defines** come from `readAppIdentity()` (`build/defaults.mjs:32`), which
prefers `npm_package_*` env vars and falls back to reading `package.json` — a bare
`vite build` from a shell sets no `npm_package_*`, and used to bake `undefined`
into the bundle.

**Environment variables.** `SW_DEV=true` enables the service worker in dev
(`plugins/pwa.mjs:150`; off by default because a SW serves stale assets in a project
whose assets rebuild on save). `SW_DESTROY=true` ships a self-destroying worker
(`pwa.mjs:146`). `NODE_ENV` is a **fallback only** for production-ness
(`assetpack.mjs:144`) — Vite's `resolvedConfig.isProduction` is the authority.

**Generated files**, both written into the app's `src/types/`: `caper-app.d.ts`
(scene/plugin/popup/entity/UI ids, class maps, locale keys, breakpoints, action
names, data schema — `caperConfig.mjs:306`) and `caper-assets.d.ts` (every bundle,
texture, frame, font, audio clip and JSON file as a literal type —
`assetTypes.mjs:155`). Both `declare module '@caperjs/core'` and augment
`AppTypeOverrides` / `AssetTypeOverrides`. They are build artefacts — regenerate
rather than edit.

## Pipeline anatomy

| File | Responsibility |
| --- | --- |
| `index.mjs` | Composition root. Assembles the plugin array in a fixed order; reads build flags at module load. |
| `defaults.mjs` | The Vite config Caper contributes, expressed as gap-filling defaults (`fillMissing`). Also `readAppIdentity()`. |
| `assetpack.mjs` | AssetPack pixi-pipes defaults, the deep merge for overrides, the `fontWeights` pipe, and the `vite-plugin-assetpack` adapter. |
| `internal/paths.mjs` | `SOURCE_DIRS`, `CAPER_CONFIG_FILE`, `APP_ENTRY_FILE`. One contract, two consumers (discovery + `optimizeDeps.entries`). |
| `internal/util.mjs` | Logger, `debounce`, `delay`, the two dts filenames, module-load `cwd`. |
| `internal/ast.mjs` | oxc-parser wrapper plus the extractors: exported constants (with `define*()` unwrapping), default-exported class, `defineConfig` object. |
| `internal/buildFlags.mjs` | Boolean flags read out of `caper.config.ts` before anything can execute it. |
| `internal/discovery.mjs` | Crawls `SOURCE_DIRS`, parses each `.ts`, returns descriptor records for scenes / local plugins / npm plugins / popups / entities / UI / locale keys. |
| `internal/manifest.mjs` | Reads AssetPack's `assets.json` and returns the bundle-name set. |
| `internal/schema.mjs` | Zod schema for `caper.config.ts`. |
| `internal/validate.mjs` | Cross-reference checks over discovery + config AST + manifest, plus `detectCycle`. All warnings, never errors. |
| `plugins/runtime.mjs` | The `caper-runtime` virtual module, and the `transformIndexHtml` hook that injects it. |
| `plugins/viewport.mjs` | Amends the app's `<meta name="viewport">` with `viewport-fit=cover`. |
| `plugins/lists.mjs` | Five virtual-module plugins: `virtual:caper-{scenes,plugins,popups,entities,uis}`. |
| `plugins/caperConfig.mjs` | `virtual:caper-config`, `caper-app.d.ts` generation, SSR validation, the dev watcher. |
| `plugins/assetTypes.mjs` | `caper-assets.d.ts` from the manifest; watches the manifest in dev. |
| `plugins/pruneFallbacks.mjs` | Deletes png twins from a production `dist`, rewriting the manifest to match. |
| `plugins/pwa.mjs` | PWA defaults, icon discovery, workbox strategy, and the runtime snippet appended to `caper-runtime`. |
| `plugins/devHelper.mjs` | Echoes an app's `caper:show-error` websocket message back as Vite's own `error` event. |

**Plugin order** is asserted verbatim in `build/assets.test.mjs:100`. It is not
incidental: `caper:defaults` first, then `caper:dedupe`, then runtime and viewport
(both `transformIndexHtml` `order: 'pre'`), then the five list plugins, then the
asset trio, then config, then dev-helper, then PWA.

**Dev-server start** (`vite`):

1. `caper()` runs while the app's `vite.config.ts` is still evaluating.
   `readCaperBuildFlags()` AST-parses `caper.config.ts` at module load
   (`index.mjs:30`) — Vite fixes a config's plugin list at creation, so
   `wasm()` has to be decided here or not at all.
2. `caper:defaults` `config()` returns only the keys the project left unset
   (`defaults.mjs:178`).
3. `configResolved` captures `config.root` / `config.publicDir` in every plugin.
   `caperPwaDefaultsPlugin` runs `order: 'pre'` so it can mutate the PWA options
   object *before* `vite-plugin-pwa` snapshots it (`plugins/pwa.mjs:181`).
4. `buildStart`: AssetPack starts in watch mode (`assetpack.mjs:246`);
   `assetTypesPlugin` waits 500ms for the manifest then writes `caper-assets.d.ts`;
   `caperConfigPlugin` discovers everything, validates, writes `caper-app.d.ts`.
5. `configureServer`: the config plugin watches `caper.config.ts` and five source
   dirs; the asset-types plugin watches the manifest; the dev-helper subscribes to
   `caper:show-error`.
6. Browser requests `/`. `transformIndexHtml` (`order: 'pre'`) injects
   `viewport-fit=cover` and `<script type="module">import("caper-runtime")</script>`.
7. `caper-runtime` loads, pulling the five virtual list modules and
   `virtual:caper-config` — each `load()` triggers a fresh discovery crawl.
8. `create(config)` boots the app; `src/main.ts`'s default export, if any, is
   awaited; `signalCaperReady(app)` fires.

**Production build** (`vite build`):

1–3 as above (no server, so `validateCaperConfig` is skipped entirely).
4. `buildStart`: AssetPack runs once to completion (`assetpack.mjs:256`);
   `caper-app.d.ts` and `caper-assets.d.ts` are written.
5. Rolldown bundles. `caper-globals` is external; GSAP gets its own chunk
   (`defaults.mjs:118`).
6. `buildEnd`: asset types regenerated from the final manifest.
7. `closeBundle`, `order: 'pre'`: `caper:prune-png-fallbacks` deletes png twins from
   `dist/assets` and rewrites `assets.json`. It must run before `vite-plugin-pwa`,
   which globs `dist` to build its precache list (`plugins/pruneFallbacks.mjs:118`).

## Discovery & virtual modules

**How things are found.** `internal/discovery.mjs` walks the directories in
`SOURCE_DIRS` (`internal/paths.mjs:13`) and **parses** each `.ts` file rather than
importing it. The reason is the same one behind the SSR stub: importing a project
module pulls in `@caperjs/core`, whose `@pixi/sound` and GSAP dependencies run
browser-only top-level side effects that throw under Node
(`internal/ast.mjs:7`).

A file qualifies when it has a **default-exported class**
(`internal/ast.mjs:219`, three accepted forms). Metadata comes from
`findExportedConstants` (`internal/ast.mjs:122`), which reads exported consts and
then *flattens* any value produced by a `define*()` helper onto the top level. The
flattening rule keys on **what the export is** — a call to one of
`DEFINE_HELPER_NAMES` (`internal/ast.mjs:120`) — not what it is named. The previous
version matched a hardcoded list of export names, so `defineUI` was silently ignored
and every UI element registered under its class name (`internal/ast.test.mjs:20`).
File-level exports win over the wrapper; earlier wrappers win over later ones.

Per-kind behaviour:

| Kind | Directory | Emit default | Extra rule |
| --- | --- | --- | --- |
| Scene | `src/scenes` | dynamic | Carries `assets`, `plugins`, `debug*`, `autoUnloadAssets` through to the list. |
| Local plugin | `src/plugins` | dynamic | Requires an actual `definePlugin()` wrapper in the file (`discovery.mjs:145`), not just a default class. |
| npm plugin | `package.json` deps | dynamic always | Any `@caperjs/plugin-*` dependency; id is the suffix (`discovery.mjs:219`). |
| Popup | `src/popups` | dynamic | `show()` is async, so code-splitting is free. |
| Entity | `src/entities` | **static** | `this.add.entity(id, props)` must construct synchronously. |
| UI | `src/ui` | **static** | Same reason. |
| Locale | `src/locales` | n/a | Reference file is `en.ts` or first alphabetically; leaves flattened to dot-paths. |

`dynamic: false` on any of the first six flips the emit mode. A dynamic entry is
represented by a sentinel object with `isFunction: true` and a `toString()` that
renders `() => import('…')` (`discovery.mjs:91`) — the list generators branch on
that flag.

**The virtual modules.** `plugins/lists.mjs` turns descriptors into source.
`createClassListPlugin` (`lists.mjs:21`) is the shared factory; scenes and plugins
have their own generators because their record shapes differ. Each plugin resolves
`virtual:caper-x` to `\0virtual:caper-x` and regenerates on every `load()` — there
is no cache, so a discovery result is never stale, at the cost of re-crawling.

`caper-runtime` (`plugins/runtime.mjs:52`) is the seam between build and runtime. It
imports all five lists, installs the `Caper` global, sets `Caper.__dev` from
`import.meta.env.DEV` (real here because this module is transformed in the
*consumer's* Vite context — inside the pre-built framework lib it has already been
compiled away), then bootstraps from `virtual:caper-config`. `transformIndexHtml`
injects it only when the HTML does not already mention `caper-runtime` or a legacy
`src/index.(ts|js)` script (`runtime.mjs:28`), so existing apps keep working.

**Generated `caper-app.d.ts`.** Beyond the id unions, it emits `{ id: typeof
import('@/…').default }` class maps for scenes/popups/entities/UI
(`caperConfig.mjs:253`) using the `@/` alias, so `ConstructorParameters<>` and
`InstanceType<>` at framework call sites derive real prop types without any AST
type extraction. It lives inside the app so the app's tsconfig `paths` applies.

**HMR behaviour.** `configureServer` (`caperConfig.mjs:439`) watches
`caper.config.ts` plus `src/{scenes,plugins,popups,entities,locales}` — note
**`src/ui` is missing**, so editing a UI file does not regenerate `caper-app.d.ts`.
Any add/change/unlink of a watched path regenerates the dts, re-runs validation, and
sends a **`full-reload`** (`caperConfig.mjs:412`), not an HMR update. The asset-types
plugin does the same on manifest change (`assetTypes.mjs:392`), and AssetPack's
watcher sends one per completed rebuild batch (`assetpack.mjs:252`), because Vite
does not reload for changes under `publicDir`.

## The SSR stub

**Why it exists.** `validateCaperConfig` (`plugins/caperConfig.mjs:26`) is the one
place that *executes* the app's config rather than parsing it, via
`server.ssrLoadModule` — that way the project's TypeScript and path aliases resolve
exactly as they do for the app itself.

But `caper.config.ts` imports `@caperjs/core`, whose built entry
(`lib/caper.mjs` → `lib/registries-*.js`) bundles `@pixi/sound` and GSAP. Both run
**browser-only top-level side effects** during module init, so the load throws under
Vite SSR (Node, no DOM) and aborts — silently, since the `catch` returns `false`
without reporting.

**How it works** (`caperConfig.mjs:47`):

1. Record whether `document` / `window` already exist on `globalThis`.
2. Install a stub **only for whichever is missing** — never overwrite a real DOM
   (jsdom, happy-dom, a future Vite DOM environment). `document.createElement()`
   returns `{ canPlayType: () => '', style: {} }`: `canPlayType` satisfies
   `@pixi/sound`'s `utils/supported.mjs` format probe, `style` satisfies GSAP
   CSSPlugin's `'transform' in tempDiv.style` check (any object works — contents are
   never read). `addEventListener` / `removeEventListener` are no-ops.
   `globalThis.window = globalThis`, because `@pixi/sound`'s `WebAudioContext` /
   `SoundLibrary` singletons read `window` at module top level.
3. `await server.ssrLoadModule(configPath)`, then `finally`: delete whichever
   globals this call installed.

**How to extend it.** When a new dependency adds a browser-only top-level side
effect, the symptom is dev-mode config validation quietly not happening —
`caper.config.ts` schema errors stop appearing in the overlay while everything else
works. Reproduce it directly rather than guessing, with
`node -e "import('.../node_modules/@caperjs/core/lib/caper.mjs')"`, read the thrown
`ReferenceError`, and add the narrowest possible property to the stub object at
`caperConfig.mjs:50`. Keep it minimal — the stub is a lie, and a richer lie is a
worse one. This constraint is also recorded in the repo `CLAUDE.md`, and it is why
`internal/ast.mjs` exists at all: build flags and discovery parse source instead of
importing it, so they never need the stub.

## Asset pipeline

**AssetPack integration** (`build/assetpack.mjs`). `assetpackPlugin` is a thin
adapter: `configResolved` derives the output path from Vite's `publicDir`,
`buildStart` either starts `AssetPack.watch()` (serve) or `AssetPack.run()` (build),
`buildEnd` stops the watcher.

The interesting part is `resolvePixiPipesConfig` (`assetpack.mjs:156`), the only
place the merge is observable. Caper's defaults encode four deliberate departures
from AssetPack's: **retina-first resolutions** `{ high: 2, default: 1, low: 0.5 }`
(raw art is authored at 2x); **quality-first webp** (`quality: 92, alphaQuality: 100,
smartSubsample`, because the upstream default rings on anti-aliased UI edges);
**both audio outputs re-encoded** to the same 128kbps target (AssetPack *copies* the
mp3 while re-encoding the ogg to 32kbps mono — and pixi's resolver prefers ogg, so
desktop played the worst copy of a file the project also shipped at ten times the
size, `assetpack.mjs:62`); and the **`fontWeights` pipe**, inserted before the
webfont pipe to convert a `{weight=bold}` filename tag into the `weights: string[]`
array `loadWebFont` expects (`assetpack.mjs:19`).

Merge semantics: deep for plain objects, replace for arrays and scalars, and
`resolutions` is in `REPLACE_WHOLE` (`assetpack.mjs:116`) because it is a *set of
tiers* — merging `{ default: 1, low: 0.5 }` would put `high: 2` back and render 1x
art at half size. Dev overrides only the effort/CPU knobs, never quality, so dev
pixels match production (`assetpack.mjs:88`).

**Asset types** (`plugins/assetTypes.mjs`). Categorises every manifest asset by
extension and `data.tags`, emits flat unions (`AssetTextures`) and per-bundle maps
(`AssetTexturesIn<'menu'>`), and reads TPS `.json` files off disk for frame names
(`assetTypes.mjs:82`).

**PNG pruning** (`plugins/pruneFallbacks.mjs`). AssetPack emits every image twice and
lists webp first, so the png half is dead weight — 5.8MB of a 43MB build in one real
case. `planPngPrune` is pure (manifest in, delete-list out) and handles the two
formats that reference images *by name* rather than as manifest entries:
texture-packer `*.png.json` (`meta.image` plus `related_multi_packs`, which cycle and
need the `seen` set) and spine `*.png.atlas`. A png is only dropped when a non-png
`src` survives it, so a `{nc}`-tagged image is never deleted.

**PWA** (`plugins/pwa.mjs`). Three parts:

- `caperPwaPlugins()` — `vite-plugin-pwa` with Caper's defaults under the project's
  options, plus `caperPwaDefaultsPlugin` for the parts only knowable after
  `configResolved` (icons found in `publicDir`).
- The workbox strategy: **precache the shell, runtime-cache the art.** A game's
  `public/assets` is tens of megabytes; precaching it turns "install" into a full
  download, and workbox would skip anything over its 2MB default anyway. Crucially
  `assets.json` is `NetworkFirst` and ordered *ahead* of the `CacheFirst` rule
  (`pwa.mjs:106`) — a stale manifest points at hashed files an atomic deploy has
  already deleted, and every lookup 404s.
- `pwaRuntimeSnippet()` — appended to `caper-runtime`, installs `Caper.pwa` and (by
  default) registers the worker. This is why `injectRegister: false`: exactly one
  thing registers. The old arrangement added a `caper-pwa` rollup input that nothing
  imported, so registration never ran and the API was dead.

## Invariants & gotchas

- **`internal/` never imports `plugins/`.** Convention only; the reverse is fine.
- **Every plugin threads `root`.** `process.cwd()` is only *usually* the project
  root; it differs under `vite --root elsewhere` or a monorepo invocation from a
  parent. `internal/discovery.mjs:6` documents this; `devServer.test.mjs:14` asserts
  it by deliberately *not* calling `process.chdir()`.
- **`readCaperBuildFlags()` is the exception** and cannot be fixed. It runs at
  `index.mjs:30` module load, resolving against module-level `cwd`
  (`buildFlags.mjs:12`), because Vite fixes the plugin list when the config object is
  created — no hook can add `wasm()` later. `useWasm` therefore ignores `--root`.
- **`caperDefaults` fills gaps, never overrides.** Vite deep-merges a plugin's
  returned partial *over* the existing config, so returning a value unconditionally
  would beat the project's own. Arrays are the deliberate exception — Vite
  concatenates them, which is what keeps `resolve.dedupe` containing pixi even when a
  project adds its own entries (`defaults.mjs:11`).
- **Deduping is load-bearing, twice.** `caper:dedupe` (`index.mjs:52`) covers
  `@caperjs/core` itself; `resolve.dedupe` in the defaults covers pixi/gsap/sound.
  Two copies split pixi's global registries and break every cross-boundary
  `instanceof`. Related: `@pixi/ui` is excluded from prebundling
  (`defaults.mjs:145`) because esbuild inlines its own pixi copy into the dep chunk.
- **`optimizeDeps.entries` is derived from `SOURCE_DIRS`**, so the dep scanner and
  the discovery crawl can never disagree. Without it the cold scan prebundles
  *nothing* — the runtime entry is injected at `transformIndexHtml` time, which the
  scanner never runs, and scenes arrive as dynamic imports it cannot follow.
- **All build-time validation is warnings.** `runBuildTimeValidation`
  (`internal/validate.mjs:13`) never fails a build; it `console.warn`s in yellow ANSI
  and posts only the *first* warning to the browser overlay.
- **`vite-plugin-static-copy` runs with `silent: true`** (`index.mjs:65`). Without
  it the plugin *throws* when its glob matches nothing, so any install layout that
  does not put Caper's source at exactly that path fails the build over an optional
  captions font.
- **Discovery only matches `.ts`** — the regex at `discovery.mjs:40` is `/\.ts?$/`,
  which accepts `.ts` and `.t` but not `.tsx`, even though `optimizeDeps.entries`
  globs `.tsx`. A `.tsx` scene is invisible to Caper.
- **Static-import identifiers come from the file basename** (`lists.mjs:28`). Two
  entities named `Foo.ts` in different subdirectories produce two `import Foo from …`
  lines in one virtual module, which then fails to parse. Same for UI and for local
  plugins with `dynamic: false`.
- **Every dts regeneration is a full page reload**, including a one-character scene
  edit. There is no HMR path for discovered code.
- **`loadManifestBundleNames` ignores both `root` and `manifestUrl`.** It hardcodes
  `process.cwd()/public/assets/assets.json` (`internal/manifest.mjs:14`) and
  `internal/validate.mjs:24` calls it with no argument, so bundle-reference
  validation silently no-ops under `--root` or a custom `assets.manifestUrl`.
- **`assetTypesPlugin`'s `closeBundle` PWA branch is dead and would throw.**
  `ispPwaEnabled` is computed from `config.plugins` in the `config` hook
  (`plugins/assetTypes.mjs:403`), which sees the *unflattened* user array — the
  nested `caper()` array has no `.name`, so it is always `false`. That is the only
  thing keeping `env !== 'development'` at `assetTypes.mjs:448` from throwing:
  `env` is never imported into that module.
- **Test layers are stratified.** `isolatedImports.test.mjs` imports each module in a
  fresh child process (cycles, TDZ); `devServer.test.mjs` boots a real Vite server
  against `test/fixtures/app` (serve-only plugins); `prodBuild.test.mjs` runs a real
  build. The last exists because a missing import in `internal/validate.mjs` passed
  both other layers.

## Recipes

### Add a build plugin

1. Write it in `plugins/`, exporting a factory. Capture `config.root` /
   `config.publicDir` in `configResolved` — never read `process.cwd()`.
2. Delegate real work to a pure function in `internal/` so it is testable without a
   Vite server, the way `planPngPrune` and `withViewportFitCover` are.
3. Add it to `caperPluginList` in `index.mjs` at the position its hook ordering
   demands, then update the verbatim order assertion in `assets.test.mjs:100`.
4. If it only runs in `serve`, add a case to `devServer.test.mjs`; if only in
   `build`, to `prodBuild.test.mjs`.

### Add a new discovered kind

Say `src/systems`, ids typed as `AppSystems`:

1. Add `systems: 'src/systems'` to `SOURCE_DIRS` (`internal/paths.mjs:13`). This
   alone extends `optimizeDeps.entries`.
2. Add a `defineSystem` identity helper in `src/utils/define.ts` **and** its name to
   `DEFINE_HELPER_NAMES` (`internal/ast.mjs:120`), or the wrapper's `id` will not
   flatten.
3. Add `discoverSystems()` to `internal/discovery.mjs` — for a plain class-file kind
   this is one call to `discoverLocalClassFiles({ dir, kind, server, root,
   defaultDynamic })`. Choose `defaultDynamic: false` if the factory must construct
   synchronously.
4. Add `systemListPlugin()` in `plugins/lists.mjs` via `createClassListPlugin`, and
   register it in `index.mjs`.
5. Import the new virtual module in the `caper-runtime` snippet
   (`plugins/runtime.mjs:54`) and hang the list off `Caper`.
6. In `plugins/caperConfig.mjs`: call the discoverer, build the id union and the
   class map, add both to the `AppTypeOverrides` block — and add the directory to
   both the watcher list and `handleFileChange` (`caperConfig.mjs:443`).
7. Add duplicate-id checking in `internal/validate.mjs:96`.
8. Extend the fixture at `packages/core/test/fixtures/app` and assert the virtual
   module in `devServer.test.mjs`.

### Debug config-load failures

Symptoms and where to look:

- **Schema errors never appear in the overlay, but the app runs.** `ssrLoadModule`
  is throwing and being swallowed at `caperConfig.mjs:63` — almost always a new
  browser-only top-level side effect in a dependency, see
  [The SSR stub](#the-ssr-stub). Log inside that `catch` to see the real error.
- **`caper-app.d.ts` full of `/* … skipping augmentation. */`.** The AST parse
  failed. The comment says which case: empty file (a mid-save race), `ENOENT` (a
  delete/recreate save), or a real parse error. Only the last is a bug.
- **Ids resolve to the class name instead of the declared `id`.** The `define*()`
  wrapper is not being flattened — check the callee is in `DEFINE_HELPER_NAMES`.
- **A scene/entity is simply not found.** In order: is it under the exact
  `SOURCE_DIRS` path; does it have a *default-exported class*; is the file `.ts`
  (not `.tsx`); for local plugins, is there a literal `definePlugin(` call.
- **Reproducing outside Vite.** Every module under `build/` is plain ESM with no
  Vite dependency at import time, so importing `internal/discovery.mjs` in bare Node
  and calling `discoverScenes(null, '/path/to/app')` is the fastest way to see what
  discovery actually returns.
