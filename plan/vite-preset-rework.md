# Vite preset rework (0.2.0)

Status: **awaiting review**. Nothing here is implemented yet.

## Why

Caper owns the Vite config today: `defaultConfig` is a whole config object, and
`caper dev|build|preview|start` merge the project's `vite.config.ts` into it,
dedupe the plugin list by name, then hand the result to `createServer`/`build`.

That inverts Vite's model, and it bites:

- **Plugins ran twice.** `build(config)` re-resolves `vite.config.ts` on its own,
  so every project plugin was added a second time — once by caper's merge, once
  by Vite. Symptoms in bankshot: duplicate `<link rel="manifest">` and
  `registerSW.js` tags in the emitted HTML, `closeBundle` firing twice, dev
  middleware registered twice. Patched on `main` with `configFile: false`; this
  rework deletes the code that needed the patch.
- **Name-based dedupe is not a Vite concept.** Two legitimate instances of one
  plugin silently become one.
- **`mergeConfig(defaultConfig, userConfig)` concatenates arrays**, so project
  settings pile onto caper's rather than replacing them: duplicate
  `resolve.alias` entries, doubled rollup inputs.
- **`extendConfig()` / `withPWA()` can't be used from a project config.** They
  return whole configs, which the CLI then merges into the defaults *again*.
  Bankshot had to wire `VitePWA` by hand for exactly this reason.
- **`Caper.pwa.register()` is dead code.** `withPWA` adds a virtual `caper-pwa`
  rollup input that nothing imports, so registration never runs.
- **`.assetpack.mjs` replaces caper's asset defaults wholesale** instead of
  merging, so overriding one knob means restating all of them.

## Target design

One export, one entry point:

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { caper } from "@caperjs/core/vite";

export default defineConfig({
  plugins: [caper()],
});
```

```jsonc
// package.json
"dev": "vite",
"build": "vite build",
"preview": "vite build && vite preview",
```

`caper(options)` returns a plugin array. Everything caper contributes arrives
through Vite's own mechanisms, so ordering, merging and precedence are Vite's
rules rather than caper's.

### Options

| Option | Default | Meaning |
| --- | --- | --- |
| `assets` | `{}` | AssetPack `pixiPipes` overrides, **deep-merged** over caper's defaults. `false` omits the assetpack and asset-types plugins entirely (replaces `noAssetpackConfig`). |
| `assets.manifestUrl` | `'assets.json'` | Manifest filename, as the current `assetpackPlugin(manifestUrl)` argument. |
| `pwa` | absent | `VitePWAOptions`, merged over caper's PWA defaults. Absent means no service worker and no manifest — the plugin isn't added at all. |
| `pwa.autoRegister` | `true` | Registers the worker from the caper runtime. `false` exposes `Caper.pwa.register()` and leaves the timing to the app. |

`useWasm` keeps coming from `caper.config.ts` as it does today; it is not an
option here.

### Defaults, not overrides

The preset's `config()` hook fills only what the project left unset:

```js
config(userConfig, env) {
  return {
    publicDir: userConfig.publicDir ?? "./public",
    base: userConfig.base ?? (env.command === "serve" ? "/" : "./"),
    cacheDir: userConfig.cacheDir ?? ".cache",
    // ...
  };
}
```

This matters: Vite deep-merges a returned partial *over* the existing config, so
returning values unconditionally would silently beat the project's own. Filling
absent keys makes the project always win, which is the whole point of the
rework. Array-valued keys (`resolve.dedupe`, `optimizeDeps.exclude`) keep Vite's
concat behaviour, which is what we want.

Fields moving from `defaultConfig` into that hook, unchanged in value:
`cacheDir`, `logLevel`, `publicDir`, `base`, `server`, `preview`, `build`
(sourcemap + `rolldownOptions`), `resolve.alias` (`@` → `./src`),
`resolve.dedupe`, `optimizeDeps`, `define`.

### PWA wiring

The `caper-pwa` virtual input is deleted. When `pwa` is set, the preset adds
`VitePWA(merged)` and appends registration to the **existing** `caper-runtime`
virtual module, which `index.html` already loads. So `Caper.pwa` becomes real:
`info`, `register()`, `onRegisteredSW`, `offlineReady`, `onNeedRefresh`,
`onRegisterError` — the interface already declared in `src/core/create.ts`.

Caper's current PWA defaults (`registerType: 'autoUpdate'`, `SW_DEV`-gated
`devOptions`, the manifest skeleton from `npm_package_*`) carry over as the
merge base.

## File layout

`config/vite.mjs` is 2464 lines holding twelve unrelated concerns: an AST
parser, a zod schema, caper.config validation, asset-type generation, five
discovery/list plugins, runtime injection, PWA wiring, a dev websocket bridge,
and the config object itself. It gets split into a directory named for what it
actually is — build-time toolchain, not config:

```
packages/core/build/
  index.mjs               caper() preset, option normalization   (public entry)
  defaults.mjs            vite config defaults (fill-if-absent)
  assetpack.mjs           pixi-pipes defaults + plugin      (was config/assetpack.mjs)
  plugins/
    runtime.mjs           caper-runtime virtual module, HTML inject, PWA register
    caperConfig.mjs       schema validation, build-time validation, d.ts emit
    assetTypes.mjs        manifest → caper-assets.d.ts
    lists.mjs             createClassListPlugin + scenes/popups/entities/uis/plugins
    pwa.mjs               PWA defaults + VitePWA wiring
    devHelper.mjs         dev-server error bridge
  internal/
    ast.mjs               parse, node types, exported-const/class/config extraction
    discovery.mjs         file walking, npm + local plugin scan, locale keys
    util.mjs              env, cwd, logger, debounce, delay, manifest bundle names
```

Two rules for the split: it is a **pure move** — no behaviour changes ride along,
so the verification can be a byte-level diff of build output. And any file that
lands over ~400 lines gets split again (`lists.mjs` is the likely candidate, at
roughly 750; it would become a `lists/` directory with the factory separate from
the five plugins that use it).

The old `config/` directory keeps only what is not build machinery:
`tsconfig.base.json`, `.prettierrc.json`.

## Deleted

- `caper dev`, `caper build`, `caper preview`, `caper start` from `cli.mjs`, and
  all of `cli/vite.mjs` (including this week's `configFile: false` patch).
  `create`, `add`, `update`, `install`, `version`, `audio`, `vo` stay — the CLI
  goes back to being a scaffolding tool.
- `defaultConfig`, `extendConfig`, `noAssetpackConfig`, `withPWA`, and the
  `./config/vite` export path.
- `.assetpack.mjs` discovery (`hasUserAssetpackConfig` / `loadUserAssetpackConfig`)
  and the `./config/assetpack` export path.
- `createCaperPWAPlugin` and its virtual `caper-pwa` entry.

## Consumers

Only two apps exist, so there is no deprecation window and no codemod.

**Scaffold** (`templates/app/default`): gains a `vite.config.ts`; scripts become
`vite` / `vite build` / `vite build && vite preview`. `clean` stays.

**kitchen-sink**: `vite.config.mjs` becomes `plugins: [caper()]` plus its
existing workspace aliases (which now merge instead of being concatenated onto
caper's). Its commented-out `withPWA` import goes away.

**bankshot-web**: `plugins: [caper({ pwa, assets }), levelEditorPlugin(), prune]`.
Its `.assetpack.mjs` audio override moves into `assets`, and its hand-wired
`VitePWA` block becomes the `pwa` option. Two consequences worth calling out:

- The `closeBundle` ordering hack in bankshot's prune plugin (`order: "pre"`, to
  beat vite-plugin-pwa's glob) becomes plain array order, which is legible.
- `pnpm build` drops its `caper build` wrapper but keeps
  `pnpm clean && rimraf public/assets` — that part is bankshot's own fix for
  AssetPack not clearing stale output, and is unrelated to this rework.

## Steps

Each step is independently verifiable. Steps 1–3 build the new surface, 4–6
move the consumers onto it, 7–8 remove the old surface and reorganize, 9 ships.

Deletion comes *before* the split on purpose: moving code we are about to delete
is wasted motion. The preset is born in its new home (`build/index.mjs`) and
imports the old module until step 8 empties it.

Baseline to capture first: build bankshot and kitchen-sink, and save a listing of
`dist` (paths + sizes). Steps 7 and 8 are pure refactors, so that listing is the
oracle — it should come back identical.

1. **Preset skeleton.** New `build/index.mjs` exporting `caper(options)`: returns
   the existing plugin array (imported from `config/vite.mjs`) plus the
   `config()` defaults-fill hook. Add the `@caperjs/core/vite` export path. Old
   exports stay live so nothing breaks mid-refactor.
   *Verify:* new vitest cases — a project's `base`/`publicDir` survives the hook;
   absent keys get caper's values; `resolve.dedupe` still contains pixi.
2. **Assets option.** Deep-merge `assets` over the pixi-pipes defaults; honour
   `assets: false`.
   *Verify:* vitest — overriding only `audio` keeps caper's `resolutions` and
   `compression`; `assets: false` omits both asset plugins.
3. **PWA option.** Merge into caper's PWA defaults, add `VitePWA` only when set,
   append registration to the `caper-runtime` module.
   *Verify:* build kitchen-sink with a `pwa` option → `sw.js` emitted and exactly
   one `rel="manifest"` tag; without it → no `sw.js`, no tag.
4. **Scaffold.** Add the template `vite.config.ts` and update
   `package.template.json`.
   *Verify:* `caper create` into a temp dir, install, `vite build` succeeds.
5. **kitchen-sink.** Update its config and scripts.
   *Verify:* `pnpm kitchen-sink:build` succeeds; scenes load in the browser.
6. **bankshot-web.** Update `vite.config.ts` and scripts, delete
   `.assetpack.mjs`.
   *Verify:* `pnpm typecheck` and the 802-test suite green; `vite build` emits
   one `rel="manifest"` and one `registerSW` tag; `dist` stays ~42MB with no
   `.png` under `dist/assets`; splash boots in a browser with zero failed
   requests.
7. **Delete the old surface.** The four build subcommands and `cli/vite.mjs`;
   `defaultConfig`, `extendConfig`, `noAssetpackConfig`, `withPWA`,
   `createCaperPWAPlugin`, `.assetpack.mjs` discovery, and both old export paths.
   *Verify:* `caper` with no args lists only the surviving commands; `caper dev`
   exits with the unknown-subcommand error; `pnpm test` green; both consumer
   builds still match the baseline listing.
8. **Split the file.** Move what remains into the `build/` layout above, one
   commit per destination file so a regression bisects to a single move. No
   behaviour changes in this step.
   *Verify:* `pnpm test` green after each commit; both consumer builds produce a
   `dist` listing identical to the baseline; `config/vite.mjs` is gone.
9. **Docs and release.** Sweep `README.md`, `extras/llms.txt`, `docs/`, and the
   template README for `caper dev|build|preview|start`, `withPWA`,
   `extendConfig`, `.assetpack.mjs` and `config/vite`. Bump to 0.2.0 with a
   breaking-change note, publish.

## Testing the split

`pnpm test` covers runtime code only, so it would not notice any of this. Four
layers, each catching what the others can't:

1. **Build fingerprint (the oracle).** `scripts/build-fingerprint.mjs` walks a
   `dist` and prints `sha256  size  path` sorted by path. Captured for bankshot
   and kitchen-sink before step 7, re-run after every commit in steps 7–8, and
   diffed. A pure move must produce a byte-identical fingerprint. This is the
   strongest check available and it covers the whole production path at once.
2. **Isolated import test, one child process per module.** Circular imports and
   top-level-order bugs hide behind the module cache when everything is imported
   into one process, so each `build/**/*.mjs` gets `node --input-type=module -e
   "await import(...)"` in its own process. This is the specific test for the
   `readCaperBuildFlags()`-at-module-load risk.
3. **Plugin-array snapshot.** `caper()` returns a known list of plugin names in a
   known order; a vitest snapshot catches a plugin silently dropped or reordered
   during a move. Same for `caper({ assets: false })` and `caper({ pwa })`.
4. **Dev-server integration test.** Several plugins are dev-only —
   `caperDevHelperPlugin`, `validateCaperConfig` via `ssrLoadModule`, the asset
   manifest watcher, all five discovery plugins — so a production build diff says
   nothing about them. A vitest case starts `createServer` against a minimal
   fixture app, asserts `/` responds and each virtual module
   (`caper-runtime`, `virtual:caper-scenes`, `virtual:caper-plugins`,
   `virtual:caper-popups`, `virtual:caper-entities`, `virtual:caper-uis`)
   transforms to expected content, then closes the server.

The fixture app for layers 3 and 4 lives at `packages/core/test/fixtures/app/`:
a `caper.config.ts`, one scene, one popup, one entity, one UI, and a small
`assets/` tree. Deliberately tiny, and independent of kitchen-sink so a
kitchen-sink change can't quietly alter what the tests assert.

## Risks

- **`define` reads `process.env.npm_package_*`**, which is set by the package
  manager running the script. Still true under `vite build` via `pnpm build`, but
  a bare `vite build` from a shell loses the app name and version. Worth a
  fallback that reads `package.json` directly while we're in here.
- **Plugin ordering becomes the project's business.** That's the point, but it
  means a project putting its plugins before `caper()` can now shadow caper's
  hooks. Documented, not prevented.
- **The split is the riskiest step** precisely because it looks safe. These
  modules share mutable top-level state (`buildFlags`, `logger`, `env`, `cwd`)
  and import order matters in at least one place — `readCaperBuildFlags()` runs at
  module load. Circular imports between `internal/ast.mjs` and the plugins that
  use it are the likely failure. Mitigation: one commit per destination file, with
  the build-output diff run each time.
- **Nothing verifies the CLI today.** The 102 vitest cases cover runtime code
  only, which is why the double-plugin bug survived. Steps 1–3 add the first
  config-level tests; the consumer builds in 5–7 are the end-to-end check.
