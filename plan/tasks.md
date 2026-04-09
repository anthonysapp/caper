# Fork Execution Tasks

Living checklist tracking [fork-plan.md](./fork-plan.md). Check items as they land; add notes inline.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[-]` skipped

---

## Phase 0 — Groundwork

- [x] Move plans into [plan/](./) (fork-plan.md, audit.md)
- [ ] Create working branch `fork/upgrade-deps`
- [ ] Bump Node engines to `>=20.19` in all `package.json`
- [x] Decide on rename (§6) — **locked: Caper / `@caper/core`**. Shortlisted caper/knack/aery after npm collision check; every short English word in §6 was squatted on bare npm (2022 dead trivial packages), but the `@caper` scope was free and `create-caper` was free. Picked scoped `@caper/core` over suffixed variants (`caperkit`/`caperjs`) — matches Vitest/Pixi/SvelteKit/Astro convention, gives a clean `@caper/plugin-*` namespace, and "Caper" stays the primary brand everywhere user-facing. Domain deferred (not needed to ship rename).

## Phase 1 — Dependency upgrade (§5, §7 Vite 8)

> Do first, in isolation. Refactor should land on current APIs.

### 1a. Pixi + AssetPack
- [x] Bump `pixi.js` 8.10.2 → **8.17.1** (framework + kitchen-sink + 4 plugin peer deps)
- [x] Bump `@pixi/layout` 3.0.2 → **3.2.0** (framework + kitchen-sink)
- [x] Bump `@assetpack/core` 1.4.0 → **1.7.0** (framework + kitchen-sink)
- [x] `@pixi/sound`, `@pixi/devtools`, `@esotericsoftware/spine-core`, `gsap`, `pixi-filters` — already on latest
- [x] Fix Pixi 8.17 breaking type changes in framework:
  - `IRenderLayer` → `RenderLayer` ([UICanvas.ts](../packages/core/src/ui/UICanvas.ts))
  - `Container.parent` is now `Container | null` — null guards in [utils/pixi.ts](../packages/core/src/utils/pixi.ts), [FocusOutliner.ts](../packages/core/src/plugins/focus/FocusOutliner.ts)
  - Generic `instanceof` narrowing cast in [UICanvas.ts:393](../packages/core/src/ui/UICanvas.ts)
- [x] `pnpm framework:build` clean (0 TS errors)
- [x] `pnpm kitchen-sink:build` clean (11/11 tasks)
- [x] `pnpm kitchen-sink:dev` — manual pass confirmed working
- [x] Dummy [.env](../apps/kitchen-sink/.env) + [.env.example](../apps/kitchen-sink/.env.example) for rollbar/GA/firebase/supabase
- [ ] Visual diff representative scenes (text + filters) — defer unless regression spotted
- [ ] Note: `@pixi/layout@3.2.0` transitively pulls `@pixi/react` wanting React 19 — peer warnings only, not fatal. Revisit if `@pixi/layout` adds a hard React dep.

### 1b. Vite 8 + Rolldown
- [x] Bump `vite` 6.1.1 → **^8.0.7** across 13 `package.json` files
- [x] Bump `vite-plugin-pwa` → ^1.2.0, `vite-plugin-singlefile` → ^2.3.2, `vite-plugin-static-copy` → ^4.0.1, `vite-plugin-wasm` → ^3.6.0
- [x] Bump workbox-* → ^7.4.0 (required by vite-plugin-pwa 1.2)
- [x] Delete `vite-plugin-top-level-await` — Chrome 111 / Safari 16.4 defaults support TLA natively
- [x] Delete `vite-plugin-html` — was called with no args, was dead weight; Vite's native HTML transform covers it
- [x] Rename `build.rollupOptions` → `build.rolldownOptions` in [config/vite.mjs](../packages/core/config/vite.mjs) (two places) — avoid the deprecated compat layer
- [x] Drop `build.minify: 'esbuild'` — use Vite 8's default oxc minifier
- [x] Rewrite `manualChunks` from object form (Rollup-only) to function form (required by Rolldown)
- [x] Add pnpm peer dep override to allow `vite-plugin-pwa@1.2.0` on Vite 8 (plugin declares `^7.0.0` max)
- [x] `pnpm framework:build` clean on Vite 8
- [x] `pnpm kitchen-sink:build` clean — **5.4s** (down from 7s on Vite 6), 11/11 tasks
- [x] Rolldown's `PLUGIN_TIMINGS` confirms the plan's §7 call-out: `vite-plugin-caper-config` (38%) + discovery plugins are the hottest paths. The `@typescript-eslint/typescript-estree` → `oxc-parser` swap is now data-backed as the biggest remaining DX win.
- [ ] `pnpm kitchen-sink:dev` manual runtime verification (HMR on scene edit)
- [ ] Swap `@typescript-eslint/typescript-estree` → `oxc-parser` — deferred to follow-up PR; it's a perf win, not a fix
- [ ] Record cold build time before/after for future blog post

### 1c. Tooling bumps (can ship separately)
- [x] ESLint 8 → 9 **flat config** at repo root ([eslint.config.mjs](../eslint.config.mjs)); deleted three legacy `.eslintrc.json`
- [x] typescript-eslint 7 → 8.58
- [x] TypeScript 5.4 → **5.9** (stayed on 5.x; TS 6.0.2 deferred — risky while tooling catches up)
- [x] `@types/node` 20.14 → 20.19
- [x] husky 8 → 9 (dropped `_/husky.sh` shim)
- [x] @commitlint 17 → 19
- [x] `@typescript-eslint/typescript-estree` 8.19 → 8.58 (used by framework's Vite config AST parser; will be replaced by `oxc-parser` in Phase 1b)
- [x] Moved lint tooling deps from framework → root package.json (config lives at root)
- [x] Drop `--ext .ts` flag from lint scripts
- [ ] **Follow-up cleanup:** 16 pre-existing lint warnings surfaced by tseslint 8 — run a sweep to fix and re-tighten the temporarily-relaxed rules in [eslint.config.mjs](../eslint.config.mjs) (`no-empty-object-type`, `no-unused-vars`, `no-unused-expressions`, `no-constant-binary-expression`)
- [ ] Regenerate `pnpm-lock.yaml` from scratch — defer to end of Phase 1 (after Vite 8)

## Phase 2 — Architecture: unify Plugin + StorageAdapter (§1)

- [x] Define `IStorageCapability` interface + `isStorageCapable` guard in [src/core/interfaces/IStorageCapability.ts](../packages/core/src/core/interfaces/IStorageCapability.ts) — duck-typed, no inheritance required
- [x] Rework [src/store/Store.ts](../packages/core/src/store/Store.ts) as a thin façade over `app._plugins`, filtered by `isStorageCapable` (~125 LOC, no second registry)
- [x] Move `DataAdapter` → [src/plugins/DataAdapter.ts](../packages/core/src/plugins/DataAdapter.ts), now `extends Plugin` directly. `app.data` routes through `getPlugin('data')`, bypassing Store
- [x] Delete `src/store/adapters/` entirely (`StorageAdapter` base class, old `DataAdapter`)
- [x] Single registration path in [Application.ts](../packages/core/src/core/Application.ts) — dropped `storageAdapters` field, `generateAdapterList`, `registerStorageAdapter(s)`, `registerDefaultStorageAdapters`. `DataAdapter` registers as a normal plugin via `loadPlugin` when `useStore` is on
- [x] Wrap `Plugin.initialize()` and `postInitialize()` in try/catch; emit new `onPluginError` signal (closes §4.1 in the same PR)
- [x] Drop `config.storageAdapters` from `IApplicationOptions`, `defaultApplicationOptions`, and the discovery type-gen
- [x] Drop `storageAdapter:create` script + `storage-adapter` template; one `plugin:create` covers both
- [x] Move `packages/storage-adapters/firebase` → `packages/plugin-firebase`; rename package + class to `@caper/plugin-firebase` / `FirebasePlugin`. (Firebase keeps its richer API; not formally `IStorageCapability`, accessed via `app.getPlugin('firebase')`)
- [x] Unify Vite discovery: drop `storageAdapterListPlugin`, fold storage-adapter package prefix into the plugin scanner
- [x] Update kitchen-sink config + `KitchenSinkApplication.firebase` getter (`getPlugin('firebase')`)
- [x] **Rip-off-the-bandaid:** no back-compat aliases. `StorageAdapter`, `IStorageAdapter`, `Store.registerAdapter`, `config.storageAdapters` are gone in one PR.
- [x] Fully exorcise `AppStorageAdapters` type — dropped from generated `caper-app.d.ts`, removed `StorageAdapters` slot from [framework.d.ts](../packages/core/src/types/framework.d.ts), `Store` + `Application` parameter types now use `AppPlugins` directly
- [x] Delete `Application.getStorageAdapter()` — redundant forwarder; users go through `app.store.getAdapter()` or `app.getPlugin()`
- [x] `pnpm framework:build` + `pnpm kitchen-sink:build` clean

## Phase 3 — Prune plugins (§2, §3)

- [x] Keep `physics-crunch`; deleted `physics-matter`, `physics-snap` from monorepo (and corresponding kitchen-sink scenes / `entities/snap`)
- [x] Deleted `springroll` (client-specific)
- [x] Deleted `supabase` (unused)
- [x] `rive`: fixed freeze bug — removed `cleanup()` / `IRivePlugin.cleanup`, `destroy()` no longer calls `rive.cleanup()` (Emscripten teardown deadlocks when entity renderers still registered; WASM heap is freed on page unload). Re-test when `@rive-app/canvas-advanced-lite` bumps.
- [x] `colyseus`: kept as scaffold — user plans to build out a real plugin post-refactor
- [x] Kept: `physics-crunch`, `google-analytics`, `rollbar`, `firebase`, `rive`, `colyseus`

## Phase 4 — Harden core (§4)

- [x] Wrap plugin `initialize()` + `postInitialize()` in try/catch; emit `onPluginError` signal — landed with Phase 2
- [x] Fix audio plugin `console.assert` bug — `AudioManagerPlugin.add()` no longer calls `sound.add({})` when every alias is already registered ([AudioManagerPlugin.ts:403](../packages/core/src/plugins/audio/AudioManagerPlugin.ts#L403))
- [x] `Store.save()` error signal — added `onError: Signal<StoreErrorDetail>`, routed fire-and-forget rejects and load failures through it ([Store.ts](../packages/core/src/store/Store.ts))
- [x] Fix [create-plugin.mjs](../scripts/create-plugin.mjs) template — now imports `IPlugin`/`IApplication`, types `Plugin<O>` generically, sets `id`/`_options` with initializers, correct `initialize(options, app)` signature ([Plugin.template.ts](../packages/core/templates/plugin/src/Plugin.template.ts))
- [x] Add Vitest + happy-dom to framework package; `pnpm --filter caper test` wired. 23 tests across 4 suites: `Signal`, `Plugin` (with `core/Application` mocked to avoid Pixi graph), `Store` (fake-app + onError paths), `isStorageCapable` guard. Config at [vitest.config.ts](../packages/core/vitest.config.ts).
- [x] Resolve SceneManager queue TODOs — removed stale/aspirational comments. The queue-cancel path in `loadScene()` already handles interrupting in-flight loads; bundle loading lives in `_loadCurrentScene` via `app.assets.loadSceneAssets`. Queue-level asset loading + progress reporting punted to Phase 5 DX with an inline pointer ([SceneManagerPlugin.ts:248](../packages/core/src/plugins/SceneManagerPlugin.ts#L248))
- [ ] **Follow-up test coverage:** `Scene`, `SceneManagerPlugin`, and live plugin suites need Pixi DOM/WebGL mocks (happy-dom alone isn't enough — Pixi's `Factory()`/`WithSignals()` chain pulls the display graph). Scope this as its own task: either `@pixi/node` + canvas shim, or extract pure logic into separately-testable modules. Not blocking Phase 4 ship.

## Phase 5 — DX wins (§7)

- [x] **oxc-parser swap** — dropped `@typescript-eslint/typescript-estree` in favour of Rust-speed `oxc-parser` (bundled with Vite 8). Local `AST_NODE_TYPES` shim kept the call sites unchanged. `vite-plugin-caper-config` plugin-time dropped from 32% → 28% → 13% (latter with popup/entity scans added), bigger wins expected on HMR where it runs on every scene/plugin edit.
- [x] Per-bundle `AssetTextures` type narrowing — tracks which bundle each texture belongs to during manifest scan, emits `AssetTexturesByBundle` + `AssetTexturesIn<B>` helper. Same pattern extended to spritesheets, audio, and TPS frames. Flat unions preserved for back-compat. ([config/vite.mjs](../packages/core/config/vite.mjs))
- [x] Frame-level types per TPS spritesheet — wired in the same pass. `AssetTPSFramesByBundle['kenney']` narrows to only the kenney bundle's TPS frames.
- [-] Audio sprite types — **skipped.** Current AssetPack output (Phase 5 verification) doesn't emit audio-sprite manifests in the kitchen-sink pipeline, and the Pixi-side plumbing was premature without a real sample to pattern-match against. Revisit if a real project uses assetpack's audio-sprite pipe and the need becomes concrete.
- [x] Locale key codegen → typed `t()` — `discoverLocaleKeys` walks `src/locales/`, prefers `en.ts`, AST-parses the default export, flattens to dot-paths (`foo`, `obj.nested`, `replace.x`). Emitted as `AppLocaleKeys` and wired into `AppTypeOverrides`. `LocaleKey` type alias uses `AppTypeOverrides['LocaleKeys'] | (string & {})` for autocomplete + dynamic-string compat. **Also fixed a runtime gap**: old `t()` did `dict[key]` which only worked for flat keys — added `resolveLocalePath` so `t('obj.foo')` actually resolves at runtime now.
- [x] Confirm assetpack watcher wired to HMR — `assetpackPlugin.buildStart` calls `new AssetPack(apConfig).watch()` in serve mode ([config/assetpack.mjs:113](../packages/core/config/assetpack.mjs#L113)); `vite-plugin-asset-types` adds the manifest path to `server.watcher` and regenerates `caper-assets.d.ts` on change ([config/vite.mjs:355](../packages/core/config/vite.mjs#L355)). Full loop confirmed.
- [x] `virtual:caper/plugins` auto-discovery — rewritten to mirror scene discovery: walks `src/plugins/` recursively, AST-parses each `.ts`, requires a default-exported class, reads `id`/`active`/`dynamic` from either individual exports OR a `definePlugin({...})` wrapper. Per-plugin code-split chunks. npm `@caper/plugin-*` discovery preserved as an additive path. Dead code (`findRegistryAndLocal`, `generateVirtualModule`, `createDiscoveryPlugin`, `createEmptyPlugin`) removed (~90 LOC).
- [x] `virtual:caper/popups`, `virtual:caper/entities` — generic `createClassListPlugin` factory + `discoverLocalClassFiles` helper, so popups and entities share one ~80 LOC implementation with the plugin discovery. Dev-server watches `src/popups/` and `src/entities/`. IDs flow into `AppPopups` / `AppEntities` in `AppTypeOverrides`. Per-file code-split chunks verified in kitchen-sink (`ExamplePopup`, `ConfirmPopup`, `Actor`, `Boy`, `Dragon`, `Player`). **Runtime consumers (`app.popups.show`, entity factory) are intentionally not built yet** — discovery plumbing is the expensive part; wiring typed runtime APIs is cheap when the actual use-case arrives.
- [x] `virtual:caper/routes` typed scene loader map — **already implemented** as `virtual:caper-scenes`. `discoverScenes` in [config/vite.mjs](../packages/core/config/vite.mjs) walks `src/scenes/`, AST-parses each file, emits `() => import('@/scenes/...')` as the default (opt out via `export const dynamic = false`), so each scene ships as its own chunk — confirmed in kitchen-sink build output. Scene IDs flow into the generated `AppScenes` union in `caper-app.d.ts`, so `app.scenes.load('menu')` is fully typed.
- [x] Build-time validation as codegen warnings ([config/vite.mjs](../packages/core/config/vite.mjs) `runBuildTimeValidation` + `loadManifestBundleNames` + `extractConfigReferences`). Cross-checks scene `assets.preload.bundles` / `assets.background.bundles` against the assetpack manifest, validates `caper.config.ts` `plugins[]` IDs against discovered plugins (npm + local), validates `defaultScene` against discovered scene IDs, and detects duplicate scene/plugin/popup/entity IDs. Warnings only — typos shouldn't fail the build, but a missing reference wouldn't either since the runtime needs to start so the user can see what broke. Output goes via `console.warn` with yellow ANSI (vite's `createLogger.warn` is suppressed inside the dts plugin chain during builds, so the colored fallback is load-bearing). Caught one real pre-existing bug on first run: `caper.config.ts` referenced plugin id `'crunch-physics'` left over from before the Phase 6 rename dropped the `physics-` prefix — fixed in the same change.
- [x] Zod-validated `caper.config.ts` — strict-fields schema ([config/vite.mjs](../packages/core/config/vite.mjs) `dillPixelConfigSchema`) validates the common pitfall fields (`id`, `defaultScene`, `plugins`, `assets.{preload,background}.bundles`, boolean flags). Validation runs **inside the Vite plugin** via `server.ssrLoadModule(configPath)`, dev-only — Zod stays a framework devDep and never ships to the client bundle. Errors surface in the overlay + terminal via `server.ws.send({type: 'error'})`. Deeper cross-reference validation (plugin IDs must exist, etc.) folds into the build-time validation task above.
- [x] `defineScene` / `definePlugin` / `definePopup` / `defineEntity` helpers — typed identity functions in [src/utils/define.ts](../packages/core/src/utils/define.ts) with input types pulled from `AppTypeOverrides` (so `plugins: PluginId[]` autocompletes from discovered plugin IDs). Discovery was extended to unwrap `export const scene = defineScene({...})` / plugin / popup / entity wrappers via a new `DEFINE_HELPER_NAMES` set + `CallExpression` handling in `findExportedConstants`, so individual `export const id` and the wrapper form both work transparently.
- [x] Scanner gap fix — `findDefaultExportedClass` used to only match inline `export default class Foo {}`. Extended to also resolve `export class Foo {}; export default Foo;` and bare `class Foo {}; export default Foo;` via a two-pass AST walk (find the default export identifier, then resolve it to a same-file class declaration). Fixes discovery for kitchen-sink's pre-existing named entity/popup files (Actor, Boy, Dragon, ExamplePopup).
- [x] CLI: `caper add scene|plugin|entity|popup <Name>` ([cli/add.mjs](../packages/core/cli/add.mjs), wired into [cli.mjs](../packages/core/cli.mjs)). Each kind drops a single minimal stub file under the conventional discovery directory (`src/scenes/`, `src/plugins/`, `src/entities/`, `src/popups/`) using a `defineX({...})` wrapper for the id + a default-exported class for the discovery scanner. Auto-derives PascalCase class name + kebab-case id from any input casing (`my cool scene` / `MyCoolScene` / `my-cool-scene` all collapse to the same pair). Optional `--dir <path>` overrides the default destination. Refuses to overwrite existing files. Discovery picks up the new file on the next dev-server reload — no manual config edit needed. Also fixed the lingering "Caper" branding strings in [cli.mjs](../packages/core/cli.mjs) (the rename's case-sensitive bulk replace missed the spaced form).

## Phase 6 — Rename + nice-to-haves (§6, §8)

### 6a. Rename to Caper (`@caper/core`)
- [x] `git mv packages/framework packages/core` (history preserved via rename detection)
- [x] Flatten `packages/plugins/*` → `packages/plugin-*` siblings; removed the now-tautological `plugins/` nesting (one category post-Phase-1 = dead weight). `physics-crunch` → `plugin-crunch` (dropped the physics- disambiguator since physics-matter/snap are gone).
- [x] Renamed `@dill-pixel/plugin-crunch-physics` → `@caper/plugin-crunch` (original name had the words reversed from the directory; fixed the ordering while here). Updated vite.config output filename + package.json `main`/`exports` accordingly.
- [x] All imports rewritten: `from 'dill-pixel'` → `from '@caper/core'`, `@dill-pixel/plugin-*` → `@caper/plugin-*`. 198 tracked files touched via a bulk node script with ordered substitutions (most-specific first: path refs → `@dill-pixel/plugin-crunch-physics` → `@dill-pixel/plugin-` → `@dill-pixel/` → `create-dill-pixel` → generated .d.ts filenames → `virtual:dill-pixel-` → quoted imports → bare `dill-pixel` → `caper` → `DillPixel` → `Caper`).
- [x] Config file renamed: `dill-pixel.config.ts` → `caper.config.ts` in kitchen-sink, docs project template, and framework template.
- [x] Virtual module IDs: `virtual:dill-pixel-*` → `virtual:caper-*` across the board (config, scenes, plugins, popups, entities, assets).
- [x] Generated types: `dill-pixel-assets.d.ts` → `caper-assets.d.ts`, `dill-pixel-app.d.ts` → `caper-app.d.ts`. Stale kitchen-sink copies `git rm`'d so the next build regenerates under the new names.
- [x] `DillPixel` global → `Caper`.
- [x] CLI binary: `create-dill-pixel` → `create-caper`. Fixed `bin` field in `packages/core/package.json` (bulk-replaced `@caper/core: ./cli.mjs` — bin names shouldn't include the scope — back to `caper: ./cli.mjs`).
- [x] `packages/core/package.json`: `title` "Dill Pixel V8" → "Caper"; description refreshed.
- [x] `pnpm-workspace.yaml`: simplified from `packages/framework` + `packages/plugins/*` to a single `packages/*` glob.
- [x] Plugin `package.json` deps: changed from fixed-version `"@caper/core": "6.2.2"` to `"@caper/core": "workspace:*"` — the original fixed-version form only worked because `dill-pixel` happened to be published on npm; `@caper/core` isn't, so workspace protocol is now load-bearing.
- [x] Scripts updated: `scripts/build-packages.sh` glob `packages/plugins/*` → `packages/plugin-*`; `scripts/create-plugin.mjs` output path; `packages/core/scripts/build-packages.mjs` hardcoded plugin list; `packages/core/cli/create.mjs` plugin registry (crunch entry); `packages/core/config/vite.mjs` `viteStaticCopy` path for caption fonts (the bulk substitution over-replaced `./node_modules/dill-pixel/...` to `./node_modules/caper/...` — restored to `./node_modules/@caper/core/...`).
- [x] Audio caption CSV filenames ("Caper Kitchen Sink - Intro EN/FR.csv") renamed to "Caper Examples - Intro EN/FR.csv".
- [x] Verification: `pnpm framework:build` clean, `pnpm packages:build` all 7 packages clean, `pnpm kitchen-sink:build` clean, `pnpm --filter @caper/core test` 23/23 passing, grep sweep for `dill-pixel`/`Caper`/`@dill-pixel` returns zero matches outside `plan/*.md`, `MIGRATION_GUIDE.md`, `CHANGELOG.md`, and `pnpm-lock.yaml`.
- [x] Git history preserved: `git status` shows renames as `R`/`RM` entries (not delete+add), so `git log --follow` will trace through the moves after commit.

### 6b. Nice-to-haves (§8)
- [x] `AppTypeOverrides` compile-time validation against registries — already substantially in place from Phase 5: `Application.loadScene` accepts `AppScenes`, `Application.getPlugin` accepts `AppPlugins`, `IApplicationOptions.defaultScene` is `AppTypeOverrides['Scenes']`, `Scene.id` / `ScenePlugins` / `Store.getAdapter|hasAdapter|save|load` all flow through the union types. Generated `caper-app.d.ts` augments `AppTypeOverrides` with the discovered scene/plugin/popup/entity/locale unions, so any consumer that types its own code against these gets compile errors on typos for free. Closing wedge in this commit: typed `definePlugin({ requires: [...] })` to `AppPluginId[]` instead of `string[]` ([utils/define.ts](../packages/core/src/utils/define.ts)) so `requires` autocompletes from discovered plugin IDs the same way `caper.config.ts plugins[]` already does. (Popups + entities don't have runtime APIs typed yet — Phase 5 deliberately deferred wiring `app.popups.show` / `app.entities.create` until a real consumer needs them; the unions are generated and waiting.)
- [ ] Gamepad support in input plugin
- [x] Plugin `requires: [...]` dependency declaration. Field lives on `definePlugin({...})` (not on the class) so the AST can read it at build time without instantiating anything. Carried through `discoverLocalPlugins` → generated `pluginsList` virtual module → `generatePluginList` → `ImportListItem.requires` → `Application.registerPlugins`. Bootstrap calls new `sortPluginsByRequires` ([core/config.ts](../packages/core/src/core/config.ts)) which is Kahn's algorithm with stable original-index tie-breaking, so plugins with no deps preserve their `caper.config.ts` order. Build-time validator extended to (a) flag `requires` referencing an unknown plugin id, (b) detect cycles via DFS (`detectCycle` helper). Runtime fails bootstrap loudly on missing/cycle with an actionable error message that includes the fix; deliberately does not auto-register transitive deps (would break "caper.config.ts is the source of truth" — see plan discussion). NPM plugins get `requires: []` from discovery and can declare their own at runtime via class property, validated by topo-sort. CLI add plugin template includes a commented-out `requires:` hint. Verified end-to-end against kitchen-sink with synthetic leaderboard + cycler plugins covering: (1) typo → build warning, (2) valid require → silent reorder, (3) cycle → build warning + bootstrap throw.
- [x] JSDoc coverage on Scene/Plugin lifecycle. Class-level docs on `Scene` ([display/Scene.ts](../packages/core/src/display/Scene.ts)) and `IPlugin` ([plugins/Plugin.ts](../packages/core/src/plugins/Plugin.ts)) document the full lifecycle order with numbered steps + a working `@example`. Per-method docs cover: when each hook fires relative to siblings, what it's safe to do at that point, what NOT to do (e.g. don't reference `this.app` in scene constructor; don't build display tree in `start`), what to override, and the consequences of forgetting `super.destroy()`. Plugin lifecycle doc explicitly calls out the `requires` interaction (init order is dependency-aware; `postInitialize` is the safe place for cross-plugin lookups regardless of declared requires).

## Phase 7 — Release

- [x] Rewrite root + `packages/core/` READMEs from scratch — pitch Caper concisely (Pixi v8 native, auto-discovered scenes/plugins/popups/entities, type-safe IDs, per-bundle asset types, plugin requires + topo-sort, build-time validation, exported Vite + AssetPack config), credit Relish for the upstream architecture, document status (not yet on npm), link to plan/ and kitchen-sink as the current docs surface. Same pass rewrote `CONTRIBUTING.md`, `apps/kitchen-sink/README.md`, and the framing in `CLAUDE.md`. Bulk-purged remaining "Dill Pixel" / "DillPixel" / "dillpixel" / "relishinc" / "Relish Studios" / "Relish Interactive" / "Relish Digital" / "reli.sh" references across 63 tracked files via an ordered substitution script (most-specific URLs and tuples first to avoid partial mismatches), then surgically restored historical attribution where the bulk pass overrewrote it (Relish Studios should still appear in upstream-credit context; only the fork's identity becomes Anthony Sapp). Author fields in `packages/core/package.json` and `apps/kitchen-sink/package.json` updated to `Anthony Sapp <anthony@anthonysapp.dev>`. Repo URL is `github.com/anthonysapp/caper` everywhere.
- [x] Deleted `apps/docs/` entirely. The Astro+Starlight site was almost entirely upstream content describing pre-fork state — fixing it in place would have been a Phase-7-grade rewrite for an audience of one. Removed the workspace entry from `pnpm-workspace.yaml`, updated `CLAUDE.md` repo layout, dropped docs mentions from both READMEs. A new docs surface will be designed from scratch when there's an audience that justifies it.
- [ ] Publish old `dill-pixel` npm package with README pointing to the Caper fork (out of my control — that's Relish's package)
- [ ] First release of `@caper/core` + `@caper/plugin-*` to npm (under the `@caper` scope)
