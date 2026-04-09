# Caper Personal Fork — Plan

## Context

This is a clean personal fork of [dill-pixel](https://github.com/relishinc/dill-pixel) by Relish Studios, rebranded to **Caper** (`@caper/core`) in Phase 6, for solo game dev use. Full audit findings are in [audit.md](./audit.md). The goal is to keep what's genuinely good (Pixi v8 native, opinionated scenes, auto asset types, exported build config, mixin stack, signals) and cut the scope problems (3 physics engines, split plugin/adapter contracts, zero tests, silent failures).

The TL;DR from the audit: **the core is good, the plugin/adapter sprawl is what makes it feel unfocused**. This fork narrows the sprawl without touching the core's strengths.

---

## Direction

### 1. Collapse plugins + storage adapters into one concept

Today the framework has two parallel systems:
- **Plugins** ([packages/core/src/plugins/](../packages/core/src/plugins/), [packages/plugin-](../packages/plugin-))
- **Storage adapters** ([packages/core/src/store/](../packages/core/src/store/), [packages/storage-adapters/](../packages/storage-adapters/))

Functionally an adapter *is* a plugin — it has `initialize/destroy` lifecycle, gets registered at bootstrap, holds state, is swappable. The registries in [registries.ts](../packages/core/src/core/registries.ts) already treat them near-identically. Keep one concept: **Plugin**.

**Store stays as a thin façade.** Storage-capable plugins implement an additional `StorageCapability` interface (`save/load/query/delete`), and `Store` picks the active one. This preserves the "games that want a simple save API get one, games that want raw Firebase access can `getPlugin('firebase')`" story without maintaining two parallel registration/lifecycle paths.

**Concrete changes:**
- Delete [src/store/adapters/](../packages/core/src/store/) distinction; `Store` becomes a consumer of any plugin implementing `StorageCapability`.
- Merge [packages/storage-adapters/](../packages/storage-adapters/) into [packages/plugin-](../packages/plugin-).
- Drop `storage-adapter:create` script; one `plugin:create` covers both.
- Update [registries.ts](../packages/core/src/core/registries.ts) to a single registry.
- Define `StorageCapability` TS interface in [src/core/interfaces/](../packages/core/src/core/interfaces/).

**No back-compat shim.** This is a hard fork with a breaking plugin API already on the table (§6). Keeping `StorageAdapter` base class + `config.storageAdapters` alive as aliases means two code paths to reason about, test, and eventually delete — pure cost with no external users to protect. Rip the band-aid in the same PR: update kitchen-sink and the firebase/supabase plugin packages atomically. Anyone tracking the fork migrates once.

### 2. One built-in physics plugin; others externalize

Keep **physics-crunch** — it's the only real engine with a high-level API (`createActor/Solid/Sensor`, collision layers, ~719 LOC of actual work, see [packages/plugin-crunch](../packages/plugin-crunch/)).

Move out of the monorepo:
- **physics-matter** — 94-LOC wrapper that tells users to read Matter.js docs. Either delete or archive as a standalone example package.
- **physics-snap** — undocumented custom engine. Archive.

This *also* proves the external-plugin story works: if a third party wants Matter integration, they publish `caper-physics-matter` as their own package and it plugs in via the same `Plugin` contract. That's the ecosystem story you'd want anyway.

### 3. Merge + prune the rest of the plugin set

Current [packages/plugin-](../packages/plugin-) after the physics cut:
- `colyseus` — 67 LOC thin wrapper. **Kept** as a scaffold; real plugin to be built out post-refactor.
- `google-analytics` — 119 LOC, solid. **Keep**.
- `rive` — freeze bug **fixed**: `RivePlugin.destroy()` no longer calls `this.rive.cleanup()`. That call tears down the Emscripten WASM runtime globally and deadlocks when any `RiveEntity` renderer/artboard is still registered. Per-entity cleanup in `RiveEntity._destroyInternals()` already frees artboards/machines/animations; the WASM heap is released by the browser on page unload, which is the only time `RivePlugin.destroy()` runs in practice. Re-test when `@rive-app/canvas-advanced-lite` is bumped in Phase 5 — upstream may eventually fix the teardown deadlock.
- `rollbar` — 66 LOC, fine. **Keep**.
- `springroll` — 310 LOC, undocumented. **Archive** unless actively used.

After pruning: `physics-crunch`, `google-analytics`, `rollbar`, `firebase`, `supabase`, optionally `colyseus`, `rive`. That's a focused set, not a scattered one.

### 4. Harden the core (from the audit)

In priority order:
1. **Wrap plugin init in try/catch**, surface failures via a `pluginError` signal. Silent bricking is the worst failure mode today. [Application.ts:594–684](../packages/core/src/core/Application.ts).
2. **Vitest on core**: `Plugin`, `Store`, `Scene`, `SceneManagerPlugin`, `SignalRegistry`, plus the kept plugins. No tests at all today.
3. **Fix [create-plugin.mjs](../scripts/create-plugin.mjs) template** — currently emits code that doesn't compile (undefined `IPlugin`/`IApplication`).
4. **Finish or remove SceneManager queue TODOs** (~6 unfinished `TODO` comments around halt/progress/loading behaviors).
5. **Fix audio plugin `console.assert`** bug.
6. **`Store.save()` error signal** — stop fire-and-forget; emit failures.

### 5. Upgrade all dependencies to latest

Current pins in [packages/core/package.json](../packages/core/package.json) are behind — notably `pixi.js@8.10.2` and `@assetpack/core@^1.4.0`. A fork is the right moment to take the hit.

**Priority bumps:**
- **pixi.js** — 8.10.2 → latest v8.x (check for v9 if released; evaluate migration cost separately). Peer dep, so kitchen-sink + all plugins must move together.
- **@assetpack/core** — 1.4.0 → latest. Verify [config/assetpack.mjs](../packages/core/config/assetpack.mjs) pipeline config still matches the new API.
- **@pixi/sound**, **@pixi/layout**, **@pixi/devtools**, **@pixi/filters** — align with the Pixi bump.
- **@esotericsoftware/spine-core** — check current release.
- **gsap** — latest v3.
- **vite** 6.1.1 → latest; **typescript** 5.4.3 → latest; **@types/node**.
- **eslint + plugins** — currently on ESLint 8 + typescript-eslint 7. Move to ESLint 9 flat config + typescript-eslint 8 while we're here; the old `--ext .ts` flag is gone in ESLint 9.
- **husky** 8 → 9, **@commitlint** 17 → 19.
- **vite-plugin-pwa**, **workbox-\*** — align as a set.
- **Rive** plugin — bump `@rive-app/canvas-advanced-lite`; this is also the moment to fix the cleanup-freeze bug before the version bump masks it.
- **Colyseus**, **Firebase**, **Supabase**, **Matter.js**, **Rollbar**, **SpringRoll** SDKs in the kept plugins — latest stable.

**Approach:**
1. Do the Pixi + assetpack bump first on a branch, in isolation — it's the one most likely to break builds and scene loading. Fix [config/vite.mjs](../packages/core/config/vite.mjs) asset-type generation against the new assetpack manifest shape if needed.
2. Then ESLint 9 flat config migration (independent; can land separately).
3. Then the remaining bumps as one PR, with kitchen-sink as the smoke test.
4. Regenerate `pnpm-lock.yaml` from scratch after all bumps to prune transitive drift.

**Verification:**
- `pnpm framework:build` clean.
- `pnpm kitchen-sink:dev` — every scene renders, every demo plugin initializes, no console errors.
- Visual diff of a couple of representative scenes (text rendering + filters are where Pixi minor bumps usually regress).

### 6. Name change (spitball)

Since this is a hard fork with a breaking plugin API, a Pixi upgrade, and a different scope philosophy, rebranding is cheap now and expensive later. The current name is a Relish in-joke and carries the upstream's maintenance baggage. A rename also gives a clean npm namespace and a clean docs story.

**Criteria:**
- Short, one or two syllables, easy to type as a package name.
- Pronounceable; works as a CLI binary (`npx create-<name>`).
- Doesn't collide with an existing npm package, game engine, or well-known library.
- Hints at "small, opinionated, game-focused" — not enterprise, not generic.
- Ideally evokes PixiJS lineage or game-dev culture without being cute to the point of embarrassment.

**Leading choice: `caper`** — short, playful, verb-energy ("a caper" = a small mischievous adventure), works as `create-caper` and `caper.config.ts`, and doesn't lean on the culinary pun. Shortlist the rest below as backups.

**Candidates to kick around:**
- **sprig** — tiny, green, grows into something. `create-sprig`, `sprig.config.ts`. Clean. (Check: an existing sprig.hackclub tile-game lib exists; possibly a collision.)
- **pixil** / **pixiline** — leans on Pixi lineage. pixil is short but probably taken.
- **caper** — small playful adventure; good verb energy. `create-caper`.
- **romp** — same vibe, shorter. Maybe too generic.
- **jot** — tiny, quick, opinionated. Works for a minimal framework.
- **knack** — "the knack for making games." Memorable, unique-ish.
- **roux** — cooking base that everything builds on (nods to the "dill" culinary thread without being a pickle joke). `create-roux`.
- **mise** — from *mise en place*. Same culinary nod, implies preparation/scaffolding. Very short. (Check: mise-en-place CLI exists — collision likely.)
- **coriander** / **basil** / **thyme** — stay in the herb lane if you want continuity with "dill." thyme is a pun magnet ("thyme to ship"). basil reads cleanest.
- **relic** — game-y, short, carries weight. Probably taken on npm.
- **glyph** — graphical + small. May collide with font tooling.
- **quill** — writing/drawing tool; small and sharp. Possibly taken.
- **aery** — an eagle's nest; small, elevated, where things are built. Rare word, likely free.

**Process:**
1. Shortlist 3 after an npm/GitHub collision check.
2. Gut-check how each feels as an import: `import { Application } from 'sprig'` vs `from 'roux'` vs `from 'caper'`.
3. Check the `.dev` / `.io` domain availability for the docs site.
4. Lock it in before the Plugin/StorageAdapter refactor lands — the rename touches every import and the refactor touches every plugin file, so bundle them into one migration rather than two.

**Execution note:** whatever the name, keep the old `dill-pixel` package published at its last version with a README pointing at the fork. Don't orphan anyone mid-project.

**Locked (Phase 6):** **Caper**, published as `@caper/core`. Unscoped `caper` and `caperjs` were both 2022 dead squats; rather than chase a dispute the `@caper` scope was free and gives a cleaner `@caper/plugin-*` namespace (matches Vitest/Pixi/SvelteKit/Astro precedent). `create-caper` CLI binary free. Directory layout flattened at the same time: `packages/framework` → `packages/core`, `packages/plugins/*` → `packages/plugin-*` siblings (the `plugins/` nesting was load-bearing only when it sat next to `storage-adapters/`; Phase 1 killed that distinction). `physics-crunch` → `plugin-crunch` since the physics- disambiguator is dead weight now that matter/snap are gone. Docs domain deferred — not a code change.

### 7. DX improvements (asset pipeline, scene gen, vite 7)

The current [config/vite.mjs](../packages/core/config/vite.mjs) is already doing the right things — AST-parsing `caper.config.ts` via `@typescript-eslint/typescript-estree`, exposing `virtual:caper-config`, auto-generating `caper-assets.d.ts` from the assetpack manifest, and using discovery plugins to scan scene/plugin/adapter directories. This is good architecture and worth doubling down on. Specific moves:

#### Vite 8 upgrade (verified against Vite 8 announcement + migration guide)

Vite 6.1.1 → **Vite 8.x**. The jump is significant: Vite 8 replaces esbuild + Rollup with **Rolldown + Oxc** (Rust bundler + Rust parser) as the *single, default* toolchain. Reported 10–30× build-time improvements. This is a real major, not a cosmetic version bump.

**Hard requirements:**
- **Node 20.19+ / 22.12+** (same as Vite 7). Bump CI and `engines` field.
- **Install size +~15 MB** (lightningcss ~10, Rolldown ~5). Acceptable cost.
- **Browser targets jumped ~2.5 years forward** (Chrome 107→111, Safari 16.0→16.4). Check kitchen-sink's target policy.

**AssetPack is not Vite-coupled — there is no peer-range blocker.** AssetPack is a standalone class-based tool (`new AssetPack(config).run() / .watch()`). The framework owns the ~40-line Vite plugin wrapper at [config/assetpack.mjs](../packages/core/config/assetpack.mjs), which uses only stable Vite plugin-lifecycle hooks (`configResolved`, `buildStart`, `buildEnd`). Those hooks are preserved under Rolldown. **The thing to actually version-check is `@assetpack/core` against its own latest** — the config shape (`pixiPipes`, `resolutions`, `compression`, `texturePacker`, `manifest`) may have moved between 1.4.0 and current. Read AssetPack's current docs ([pixijs.io/assetpack](https://pixijs.io/assetpack/)) and their suggested Vite-plugin integration pattern ([docs/guide/getting-started/vite](https://pixijs.io/assetpack/docs/guide/getting-started/vite/)) when bumping; if their recommended wrapper has diverged from ours, consider adopting theirs as the base and layering our config-generation / type-codegen hooks on top.

**Plugin API changes that directly affect [vite.mjs](../packages/core/config/vite.mjs):**

The config plugin uses `resolveId` / `load` for virtual modules and parses TS via `@typescript-eslint/typescript-estree`. Specific things to audit during the bump:

1. **`load` hook return shape.** Virtual modules that emit non-JS content must now return `{ code, moduleType: 'js' }`. The current plugin returns plain strings from `load()` for JS-shaped virtual modules, which should still work because Rolldown auto-detects `.js` by extension — but virtual IDs without an extension (like `\0virtual:caper-config`) may need an explicit `moduleType: 'js'` to be safe. **Low-effort fix, high-value to do preemptively.**
2. **Removed hooks** — verify the plugin doesn't use any of these (quick grep says it doesn't): `shouldTransformCachedModule`, `resolveImportMeta`, `renderDynamicImport`, `resolveFileUrl`. ✅ safe.
3. **`transformWithEsbuild` → `transformWithOxc`** — plugin doesn't call esbuild directly. ✅ safe.
4. **`parseAst`/`parseAstAsync` deprecated** → `parseSync`/`parse`. Plugin uses `@typescript-eslint/typescript-estree`, not Vite's parser. ✅ safe — *and* this is a perfect moment to swap that ~500KB JS-written TS parser for **`oxc-parser`**, which Vite 8 now bundles as a dep. Same AST shape, Rust speed, zero added install cost. Single biggest DX win from the upgrade for the framework specifically.
5. **`build.rollupOptions` → `build.rolldownOptions`** (auto-converts with a warning; rename before shipping).
6. **`esbuild` option → `oxc` option** (same, auto-converts).
7. **`optimizeDeps.esbuildOptions` → `optimizeDeps.rolldownOptions`**.

**Plugin compatibility (current deps):**
- **`vite-plugin-html`** — unknown Vite 8 status; likely broken or unmaintained. Replace with a ~20-line custom plugin using Vite's HTML transform + env injection. *Do this as part of the upgrade, not after.*
- **`vite-plugin-top-level-await`** — with Vite 8 browser targets bumped forward, TLA is natively supported in all targets. **Delete this dep.**
- **`vite-plugin-wasm`** — Vite 8 adds native WASM SSR support; client-side WASM may be first-class too. Check whether this plugin is still needed for the Rive + Spine cases.
- **`vite-plugin-singlefile`**, **`vite-plugin-pwa`**, **`vite-plugin-static-copy`** — verify against Vite 8 peer range; run `pnpm outdated` post-bump.

**CJS interop gotcha:** Vite 8 changed default-import handling from CJS modules. Some older Pixi plugins or third-party SDKs (firebase, colyseus, etc.) could have ambiguous module formats. If imports break, use `legacy.inconsistentCjsInterop: true` as a *temporary* escape hatch, then fix upstream or repath the import.

**Rolldown is the default, not opt-in.** That changes the strategy: there's no "try Rolldown during the upgrade" — *you are on Rolldown* the moment you install Vite 8. This means the §7 note about "pairs well with oxc-parser swap for a Rust-speed pipeline" becomes concrete and unavoidable. The framework build pipeline goes Rust-native on the same PR as the Vite bump, whether you planned it or not.

**New Vite 8 features to evaluate post-upgrade (not blockers):**
- **Built-in `emitDecoratorMetadata` support.** Directly relevant to the "decorators as escape hatch" note in §7 — Vite 8 handles decorator metadata without `vite-plugin-swc-transform` or equivalent. Makes the "decorators-optional" story essentially free.
- **`resolve.tsconfigPaths`** — native support. Drop `vite-tsconfig-paths` if used.
- **Integrated devtools** — free observability for the build pipeline.
- **Browser console forwarding** — forwards client errors to the dev-server terminal. Useful for debugging scene init errors without jumping tabs.

**Updated execution order for the bump:**
1. Bump Node engines in all `package.json` files to `>=20.19`.
2. Install `vite@8` + `@assetpack/core@latest` + aligned `@pixi/*` packages in one step on a branch.
3. Rename `rollupOptions` → `rolldownOptions`, `esbuild` → `oxc` in `config/vite.mjs`.
4. Add `moduleType: 'js'` to the virtual-module `load()` returns.
5. Delete `vite-plugin-top-level-await`; replace or delete `vite-plugin-html`.
6. Swap `@typescript-eslint/typescript-estree` → `oxc-parser` in the config/scene discovery plugin (the scene discovery plugin AST parse is the hottest path; do it the same PR as the bump since you're already in the file).
7. `pnpm kitchen-sink:dev` — every scene renders, no console errors.
8. `pnpm kitchen-sink:build` — time the before/after; expect a noticeable speedup.

**Verification:**
- Cold build time before/after Vite 8 + oxc-parser (record the number for a future "why caper" blog post).
- HMR invalidation time when editing a scene file (this is where oxc-parser should shine — the AST parse on every scene edit is currently the bottleneck).
- Manifest asset-type regeneration still fires on `raw-assets/` change.

#### Asset pipeline improvements
The asset-type generation is the killer feature; extend it instead of adding new features elsewhere.

1. **Per-bundle type narrowing.** Today `AssetTextures` is a flat union of every texture across every bundle. A game scene that only loads the `menu` bundle still gets autocomplete for `game/*` textures and can pass one to `Sprite.from()` at compile time even though it'll fail at runtime. Generate `AssetTextures['menu']` → union scoped to that bundle, and tighten `Assets.get<T>(alias)` signatures so the compiler knows which bundle is active. This is a real type-safety win no other PixiJS framework offers.
2. **Frame-level types for TPS spritesheets.** You already extract frame names into `AssetTPSFrames`; scope them per-spritesheet so `sheet.textures[x]` is typed.
3. **Audio sprite support.** If assetpack handles audio sprites, extract sprite names into `AssetAudioSprites` the same way.
4. **Locale key codegen.** The kitchen-sink has `src/locales/` — if you standardize on JSON locale files, generate a `AssetLocaleKeys` union from them and feed it into a typed `t('key.path')` function. This is the kind of thing people reach for i18next for and it's ~40 lines of codegen.
5. **Asset preview in the editor.** A small VSCode extension (later, not now) that reads `caper-assets.d.ts` and shows texture thumbnails on hover. Even a no-config comment convention like `/** @asset textures */ 'game/wordmark'` would let VSCode render an image on hover via a markdown image link.
6. **Watch-mode assetpack.** Confirm assetpack's watcher is wired to HMR in [vite.mjs](../packages/core/config/vite.mjs) so adding a PNG to `raw-assets/` regenerates manifest + types without a restart. If it isn't, fix.

#### Scene generation & codegen
You already have virtual-module scene discovery. The question is how far to push it — and this is where the decorator/virtual-module tradeoff matters.

**Why the current virtual-module approach is the right call** (vs decorators):
- **Build-time over runtime.** Decorators run at import time, which means you can't tree-shake unused scenes, and you pay a reflect-metadata cost. Virtual modules are pure build-time codegen — zero runtime overhead.
- **No `experimentalDecorators` / stage-3 churn.** TS decorators have been unstable for years. Stage-3 (TS 5+) changed semantics from the stage-2/legacy version, and most libraries that used decorators (TypeORM, NestJS) are still mid-migration. Avoid that pain entirely.
- **Better DX for the user.** With virtual modules, a user writes `export default class MenuScene extends Scene {}` and the framework *finds it*. No decorator import, no boilerplate. That's less magic, not more — the magic is in the build, not the file.
- **Works with HMR.** The current vite.mjs already watches `src/scenes/` and invalidates the virtual module on change. Decorators can't do that without a custom transform.

**Path forward — extend virtual modules to more things:**
1. **`virtual:caper/scenes`** (already exists) — keep, expand to pass scene metadata (id, assets, transitions) extracted from a `static config = {...}` property via AST so users don't duplicate scene registration.
2. **`virtual:caper/plugins`** — auto-discover classes under `src/plugins/` that extend `Plugin`, generate the registration list. Today users still list plugins manually in `caper.config.ts`; this would make the config file ~half as long.
3. **`virtual:caper/popups`, `virtual:caper/entities`** — same pattern for any convention-directory.
4. **`virtual:caper/routes`** — a typed map of scene ID → async loader, so `app.scenes.load('menu')` is fully typed and code-split per scene at the bundler level. This is what Next.js does for routes, applied to scenes.
5. **Build-time validation as codegen side effect.** While the vite plugin is parsing scenes, have it emit warnings for: scenes without a `static config`, scenes whose assets don't exist in the manifest, plugin IDs used in `AppTypeOverrides` that don't match a discovered plugin. Compile-time errors catch the stuff that silently fails at runtime today.
6. **Replace `@typescript-eslint/typescript-estree` with `oxc-parser` or `swc`.** The current AST parse is the slowest part of the config plugin (it's a full TS parser written in JS). `oxc-parser` is Rust-speed and the API is similar. On a cold `vite dev` start this is a noticeable win; on HMR invalidation it's *very* noticeable.

**Decorators as an escape hatch, not the default.** If a user *wants* to annotate a scene with `@scene({ id: 'menu', preload: [...] })` for visual clarity, keep the door open — the vite plugin can read decorator metadata via AST the same way it reads `static config`. Both approaches produce the same virtual-module output. Users who like decorators get them; users who don't never see them.

#### Config DX
Small wins that compound:
- **Zod-validated config.** `caper.config.ts` uses `defineConfig()` today. Validate the object against a Zod schema and emit a clean error with the offending path on mismatch. Today config errors surface as runtime crashes inside `Application.initialize()`.
- **`defineScene`, `definePlugin` helpers** for type inference without having to extend base classes explicitly. Rollup, Vite, Playwright all use this pattern; it's become the idiomatic "config as code" shape.
- **First-class `env.d.ts`.** The auto-generated `caper-app.d.ts` already does some of this; make sure `import.meta.env` keys from vite's env-prefix are typed too.

#### Scaffolder
- **Interactive scene/plugin/entity scaffolds** from the CLI: `npx caper add scene menu`, `npx caper add plugin leaderboard`. Use the same templates directory the `create-caper` CLI uses. This replaces the current `plugin:create` / `storage-adapter:create` npm scripts with one discoverable CLI surface.
- **Template should build on day one.** Fix the currently-broken plugin template (undefined `IPlugin`/`IApplication`).

### 8. Nice-to-haves (lower priority)

- Build-time validation of `AppTypeOverrides` against actual registries so scene/plugin ID typos fail at compile.
- Gamepad support in the input plugin — matters for HTML5 + Steam.
- Plugin dependency declaration (`requires: ['scenes']`) to catch load-order bugs.
- Bump JSDoc coverage on Scene/Plugin lifecycle and the new unified Plugin interface.

---

## Execution order

1. **Move plans to [plan/](./)** (this file + audit.md). Done as part of this change.
2. **Upgrade Pixi + assetpack + core deps** (§5) — do this first, on a clean branch, before any architectural changes. You want the refactor to land on current APIs, not on stale ones that are about to move anyway.
3. **Unify Plugin + StorageAdapter contract** — biggest architectural change, do it on current APIs post-upgrade.
4. **Prune physics to crunch only**; archive matter/snap.
5. **Prune other plugins** per §3.
6. **Harden core** per §4, starting with plugin init try/catch + Vitest setup.
7. **Update kitchen-sink** to the new plugin API and use it as the integration test.
8. **Rewrite README + one "why caper" page** leading with: Pixi v8 native, auto asset types, exported Vite/assetpack config, opinionated scenes. Those are the wedge.

## Critical files

- [packages/core/src/core/Application.ts](../packages/core/src/core/Application.ts) — bootstrap + plugin loading + error-handling gaps
- [packages/core/src/core/registries.ts](../packages/core/src/core/registries.ts) — unify to one registry
- [packages/core/src/core/interfaces/](../packages/core/src/core/interfaces/) — define `StorageCapability`
- [packages/core/src/store/](../packages/core/src/store/) — thin façade, not a parallel system
- [packages/core/src/plugins/SceneManagerPlugin.ts](../packages/core/src/plugins/) — finish or remove TODOs
- [scripts/create-plugin.mjs](../scripts/create-plugin.mjs) + template — fix compile-broken scaffolder
- [apps/kitchen-sink/](../apps/kitchen-sink/) — integration test for the new API

## Verification

- `pnpm framework:build` — framework compiles with unified Plugin API.
- `pnpm kitchen-sink:dev` — demo app runs end-to-end with pruned plugin set.
- `pnpm --filter caper test` — new Vitest suite passes (once added).
- Manual: scaffold a fresh plugin via `pnpm plugin:create`, confirm generated code compiles and loads.
- Manual: kill a plugin's `initialize()` on purpose, confirm `pluginError` signal fires and app doesn't brick.
