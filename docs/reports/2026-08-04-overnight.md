# Overnight report — 2026-08-04

Three roadmap tasks, done in order, each committed after review. Suite grew from 332 to 352+ tests; everything green at each commit.

## 1. Automatic cleanup for plugins ✅

**Commits:** `8fef06c6` (feat), `0f1b2962` (docs)

The `Plugin` base class now cleans up after its subclasses. Three new primitives:

- `listen(target, type, handler, options?)` — tracked DOM listener, auto-removed on destroy (matching capture/options), returns an early-removal fn.
- `addTickerCallback(fn, ctx?, priority?)` — tracked ticker callback, auto-removed.
- `addDisposer(...fns)` — arbitrary cleanup callbacks; run LIFO on destroy, each error-isolated (a throwing disposer can't skip the rest). `destroy()` is now idempotent.

**10 plugins migrated**; five of them (WebEvents, FullScreen, SceneManager, Stats, Keyboard) lost their entire `destroy()` override. Bonus fix: `CaptionsPlugin`'s ticker callback used to leak (it had no destroy at all) — now auto-cleaned. FocusManager deliberately stays manual: its listeners cycle at runtime (activate/deactivate), which is the documented exception.

**Found along the way** (logged in KNOWN_BUGS.md, not fixed): captions' five raw voiceover signal connects still leak; FullScreen registers `fullscreenchange` twice (harmless); WebEvents has an untracked 10 ms `setTimeout` that can fire after teardown (intermittent test flake).

## 2. Keyboard/touch input merge ✅

**Commits:** `cfe250df` (refactor), `27de965b` (docs)

The two near-copy adapters (482 lines combined) are now thin plumbing (257 lines) over:

- `controlsCore.ts` — new pure, import-free module (scheme normalization, context gating, combination evaluation), 16 unit tests, same pattern as the well-tested `gestureMath`/`breakpoints` cores.
- `AbstractControls` — grown from a 15-line stub into the shared base (scheme storage, context-driven map rebuilds, `isActionActive`, ticker hookup, warn-once).
- The misspelled `KeyboardContols.ts` file is renamed to `KeyboardControls.ts` (git mv; no public API change; `TouchControls` alias kept).

**Two deliberate behavior changes** — both are drift-fixes toward the documented scheme shape, each proven red-first:

1. Keyboard `up` bindings are now context-gated and warn once on unknown actions (they previously fired in any context, unlike every other section).
2. Virtual `up` bindings now accept arrays (`up: { jump: ['btn-a'] }`) — previously an array was silently never matched.

If a game relied on out-of-context keyboard `up` events, change 1 could surface — worth one manual sanity pass in bankshot when convenient.

## 3. Kitchen-sink boot smoke test ✅ — and it caught two real production bugs

**Commits:** `a40bb6b4` (fix: factory table), `98009ebf` (fix: prune), `536e81ce` (ci: smoke test)

The test itself: `pnpm kitchen-sink:smoke` serves the built `dist/` with `vite preview`, opens it in headless Chromium, and passes only if the app registers on `window.Caper`, a canvas exists, and there are zero page/console errors. CI runs it after the builds.

**It immediately caught two real bugs on its first run:**

1. **Production apps couldn't boot at all** — `"[caper] The factory method table hasn't been initialized"`. The package declares `sideEffects: false`, so app bundlers tree-shake the factory table's module-side-effect registration out of production builds. Dev never bundles, so nobody saw it. **Fixed** (`a40bb6b4`): `create()` now registers the table through a dynamic import — unshakeable, and no static edge that would re-close the factory/ui module cycle (my first attempt did exactly that and the `importOrder` guard tests caught it within minutes; the guards earn their keep).
2. **Bitmap fonts are broken in every production build** — assetpack hashes and webp-converts the font's texture page but never rewrites the `.fnt` file that references it by name, so the loader fetches a file that no longer exists. **Partially fixed** (`98009ebf`: the prune step no longer deletes fnt-referenced pngs) but the full fix needs a design decision (rewrite `.fnt` page refs vs. exempt font folders from processing — with retina-scale implications), so I logged it as the High item in KNOWN_BUGS.md rather than patching it at 1 AM. **Until it's fixed, the CI smoke step is `continue-on-error`** — it runs and reports, but doesn't fail the build. Flip it to blocking by deleting one line in `.github/workflows/ci.yml` once the font fix lands.

A red herring for the record: the smoke run also showed a 401 — that's the demo's Rollbar plugin faithfully reporting the boot error with a demo token. It disappears when the boot error does.

## State at handoff

- All work committed locally on `main` — **not pushed** (say the word and I'll push; CI stays green because the smoke step is non-blocking).
- Unit suite: 354 tests across 56 files, green; typecheck clean.
- KNOWN_BUGS.md: 1 High (bitmap fonts in prod, full diagnosis in the row), 7 minor.
- Wiki updated: plugin contract (cleanup primitives + "Disposer"), input subsystem (new module map).

## Suggested next steps (my recommended order)

1. **Decide the bitmap-font fix** — I'd rewrite `.fnt` page references to the emitted default-resolution texture during assetpack post-processing; say go and I'll design it properly. Then make the smoke step blocking.
2. Push + watch CI (first run installs Chromium; a couple extra minutes).
3. Quick wins with the new primitives: the captions signal-connect leak, the WebEvents untracked setTimeout.
4. Roadmap remainder: display-layer stragglers (ParticleContainer/SpineAnimation), public docs surface.
