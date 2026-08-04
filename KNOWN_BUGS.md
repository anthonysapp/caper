# Known Bugs — packages/core

Originated from the full codebase audit on 2026-08-02 (commit `1f869eba`). **All High, Medium, and Low defects from that audit are now fixed** — each test-first (red→green) in its own conventional commit; see the `fix(...)`/`feat(ui)`/`docs`/`chore` history following `0af16695`. The wiki (`docs/wiki/`) was refreshed to match.

## High

| Location | Bug |
|---|---|
| assetpack pipeline (`packages/core/build/assetpack.mjs` config + upstream pixi pipes) | **Bitmap fonts are broken in every production build.** The pipeline hashes and webp-converts a font's texture page (`Syncopate.png` → `Syncopate-MPx5Vw.webp`) but never rewrites the `.fnt` file's internal `page file="Syncopate.png"` reference. Pixi's loader fetches the page relative to the .fnt URL, misses (SPA fallback returns HTML), and the app fails to boot. Dev is unaffected (serves raw source assets), which is why this went unnoticed. Caught 2026-08-04 by the new boot smoke test; the smoke CI step is `continue-on-error` until this is fixed. Fix needs a design decision: rewrite `.fnt` page refs to the emitted texture (mind resolution-variant scale) vs. exempting bitmap-font folders from hashing/conversion. Related partial fix already landed: prune no longer deletes fnt-referenced pngs (`pruneFallbacks.mjs`), which matters once page refs resolve again. |

Remaining minor items, found during the fix sweep (none block a release):

| Location | Note |
|---|---|
| `packages/core/build/internal/manifest.mjs` | Manifest lookup assumes `<root>/public`; a project with a custom Vite `publicDir` still isn't threaded through (would need capture in `caperConfigPlugin`'s `configResolved`). |
| `packages/core/build/plugins/caperConfig.mjs:24` | Unused `loadManifestBundleNames` import. |
| `packages/core/build/plugins/assetTypes.mjs` (EOF), `build/plugins/lists.mjs:~137` | Orphan JSDoc blocks describing functions that no longer follow them. |
| `src/plugins/Plugin.ts`, `TimerPlugin.ts`, `audio/AudioInstance.ts`, `captions/CaptionsRenderer.ts`, `focus/FocusManagerPlugin.ts` | Pre-existing lint warnings (unused eslint-disable directives / unused vars). |
| `scripts/` version-bump flow | Bumping package versions (release flow) rewrites package.json files without running `pnpm install`, leaving `pnpm-lock.yaml` stale — broke the first CI run after the 0.3.0 release (`ERR_PNPM_OUTDATED_LOCKFILE`). Bump scripts should sync the lockfile. |

| `src/plugins/captions/CaptionsPlugin.ts` | Connects five voiceover signals with raw `.connect()` instead of `addSignalConnection` and has no `destroy()` — those connections leak. (Ticker leak fixed 2026-08-04 via `addTickerCallback`.) |
| `src/plugins/FullScreenPlugin.ts` | Registers `fullscreenchange` twice with the same handler — harmless no-op duplicate. |
| `src/plugins/WebEventsPlugin.ts` | `_onOrientationChanged`'s 10 ms `setTimeout` can fire after environment teardown (intermittent `window is not defined` in tests) — should be a tracked/cancelable timer. |

Process: when a defect is found, add it here with severity + file:line; when fixed, remove it and update any matching wiki gotcha.
