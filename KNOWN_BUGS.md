# Known Bugs — packages/core

Originated from the full codebase audit on 2026-08-02 (commit `1f869eba`). **All High, Medium, and Low defects from that audit are now fixed** — each test-first (red→green) in its own conventional commit; see the `fix(...)`/`feat(ui)`/`docs`/`chore` history following `0af16695`. The wiki (`docs/wiki/`) was refreshed to match.

Remaining minor items, found during the fix sweep (none block a release; the 2026-08-04 High item — bitmap fonts broken in production builds — was fixed the same day by `bitmapFontPassthrough()` in `build/assetpack.mjs`, and the CI boot smoke test is now blocking):

| Location | Note |
|---|---|
| `packages/core/build/internal/manifest.mjs` | Manifest lookup assumes `<root>/public`; a project with a custom Vite `publicDir` still isn't threaded through (would need capture in `caperConfigPlugin`'s `configResolved`). |
| `packages/core/build/plugins/caperConfig.mjs:24` | Unused `loadManifestBundleNames` import. |
| `packages/core/build/plugins/assetTypes.mjs` (EOF), `build/plugins/lists.mjs:~137` | Orphan JSDoc blocks describing functions that no longer follow them. |
| `src/plugins/Plugin.ts`, `TimerPlugin.ts`, `audio/AudioInstance.ts`, `captions/CaptionsRenderer.ts`, `focus/FocusManagerPlugin.ts` | Pre-existing lint warnings (unused eslint-disable directives / unused vars). |

| `src/plugins/captions/CaptionsPlugin.ts` | Connects five voiceover signals with raw `.connect()` instead of `addSignalConnection` and has no `destroy()` — those connections leak. (Ticker leak fixed 2026-08-04 via `addTickerCallback`.) |
| `src/plugins/FullScreenPlugin.ts` | Registers `fullscreenchange` twice with the same handler — harmless no-op duplicate. |
| `src/plugins/WebEventsPlugin.ts` | `_onOrientationChanged`'s 10 ms `setTimeout` can fire after environment teardown (intermittent `window is not defined` in tests) — should be a tracked/cancelable timer. |


Process: when a defect is found, add it here with severity + file:line; when fixed, remove it and update any matching wiki gotcha.
