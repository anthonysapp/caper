# Known Bugs — packages/core

Found during the full codebase mapping on 2026-08-02 (commit `1f869eba`). Every entry was reported by a subsystem audit; entries marked ✅ were independently re-verified against source. Remove entries as they're fixed.

**Update 2026-08-02:** 18 High/Medium bugs were fixed test-first (red→green) and are committed for the next release — see the `fix(core|display|input|plugins|ui|build|cli)` commits. The tables below hold what remains.

Severity: **High** = breaks behavior or destroys data in a way a game would hit. **Medium** = wrong behavior on a less-common path, or resource leak. **Low** = dead code, type mismatch, or doc drift.

## High

| ✔ | Location | Bug |
|---|---|---|
|  | `packages/core/src/ui/UICanvas.ts:483` | `setChildIndex` always throws: Pixi's implementation calls `addChildAt`, which `UICanvas` overrides to throw with no escape hatch. No sanctioned z-order path exists. **Deferred: needs an interface design decision (what the sanctioned reorder path should be), not a patch.** |

## Medium

| ✔ | Location | Bug |
|---|---|---|
|  | `packages/core/src/plugins/actions/ActionsPlugin.ts:86` | Context gate uses `String.includes` when `context` is a single string — substring match, so context `'popup'` wrongly allows current context `'pop'`. |
|  | `packages/core/src/plugins/input/touch/VirtualControls.ts` (initialize) | Connects `app.signal.onActionContextChanged` without tracking the connection, so it survives destroy. (Found during the input fixes.) |
|  | `packages/core/src/plugins/focus/FocusManagerPlugin.ts:734` | `_removeGlobalListeners` misses the `window` keydown/keyup and the capture-phase mousemove — a destroyed plugin still handles Tab/Enter. |
|  | `packages/core/src/plugins/FullScreenPlugin.ts:356` | `_onFullScreenChange` never updates `_isFullScreen` — user Esc-exit desyncs the flag and the next `toggleFullScreen()` exits again. Also ignores vendor-prefixed fullscreen properties the getter checks. |
|  | `packages/core/src/plugins/SceneManagerPlugin.ts:142` | `destroy()` is an empty override — leaks the `hashchange` listener, pause/resume connections, debug-menu DOM, and base signal connections. |
|  | `packages/core/src/plugins/PopupManagerPlugin.ts:180` | `removeAllPopups(true)` hides popups but never clears `_activePopups`/`_currentPopupId`/the view — only the non-animated branch cleans up. |
|  | `packages/core/src/plugins/AssetsPlugin.ts:189` | `loadRequired` filters loaded bundles into a local, then passes the unfiltered `this._required.bundles` to `Assets.loadBundle` — the filter is a no-op. |
|  | `packages/core/src/plugins/WebEventsPlugin.ts:58` | `destroy()` omits `super.destroy()` and never removes the `orientationchange` listener. |
| ✅ | `packages/core/src/plugins/captions/CaptionsPlugin.ts:330` | `loadLocale` compares `this._locale === 'localeId'` (string literal) instead of the parameter — the already-loaded guard never fires. |
|  | `packages/core/src/plugins/audio/AudioManagerPlugin.ts:798` | `_verifySoundId` caches `resolvedId → resolvedId` instead of `originalId → resolvedId` — the alias cache never hits; extension probing re-runs every play. Related: at `:702` the loop variable clobbers the array being iterated. |
|  | `packages/core/src/plugins/audio/VoiceOverPlugin.ts:250` | `gsap.delayedCall` with no `gsap` import — resolves via the window global; breaks if GSAP isn't self-installed globally. |
|  | `packages/core/src/core/Application.ts:1035` | `sortPluginsByRequires` only sees config-listed plugins — `requires: ['audio']` (any built-in id) hard-throws "not registered" with an unfollowable fix hint. |
|  | `packages/core/src/core/Application.ts:644` | `views` is memoized on first `_resize` — views created later (captions, late transitions) are never re-centered on resize. |
|  | `packages/core/src/core/config.ts:20` | `p.id === plugin[0]` on a string entry compares the **first character** — a discovered plugin with a single-char id can shadow the intended match. |
|  | `packages/core/src/store/Store.ts:129` | `'*'` fan-out only recognized at `keys[0]` — `store.save(['a','*'], …)` treats `'*'` as a literal adapter id. |
|  | `packages/core/build/plugins/caperConfig.mjs:443` | Dev watcher covers scenes/plugins/popups/entities/locales but **not `src/ui`** — UI type regeneration only happens on server restart. |
|  | `packages/core/build/plugins/assetTypes.mjs:448` | `env` referenced but never imported — would be a `ReferenceError` in `closeBundle`; masked only by the dead branch below. |
|  | `packages/core/build/plugins/assetTypes.mjs:403` | PWA detection reads `config.plugins` in the `config` hook, where the array is still nested — `.some(p => p.name === …)` on a nested array is always false. |
|  | `packages/core/build/internal/manifest.mjs:14` | Manifest path hardcodes `process.cwd()/public/assets`, ignoring Vite `root`/`publicDir`; `validate.mjs:24` also passes no `manifestUrl`, so custom-manifest projects get no bundle validation. |
|  | `packages/core/cli/create.mjs:301` | Prompt promises the PascalCase default but an empty answer falls back to the raw directory name — `my-cool-game` becomes the class name verbatim. |
|  | `packages/core/cli/create.mjs:184` | Wizard plugin injection regex only matches a literally empty `plugins: []` — a template with default plugins silently receives none of the selected ones. |

## Low / nits

| Location | Note |
|---|---|
| `packages/core/src/utils/color.ts:66` | `rgbToHexString` doesn't round — fractional RGB (from `Color.random()`/`lerp`) yields malformed hex like `"7f.8"`. Numeric `toHex()` unaffected. |
| `packages/core/src/utils/platform.ts:23` | `isTouch` checks the same `navigator.maxTouchPoints > 0` condition twice (likely meant a legacy vendor property). |
| `packages/core/src/core/interfaces/IApplication.ts:314` | `onPause`/`onResume` declared `Signal<() => void>` but implemented with a `PauseConfig` payload — interface hides the payload. |
| `packages/core/src/core/Application.ts:911` | `isActionActive()` returns whether the action is *declared*, not *held* — contradicts `InputPlugin.isActionActive`. Semantic clash, pick one. |
| `packages/core/src/plugins/actions/ActionsPlugin.ts:111` | `onActionDispatched` registered in the signal registry but missing from `ICoreSignals` — works at runtime, fails typecheck. |
| `packages/core/src/plugins/spine/SpinePlugin.ts:11` | Re-registers `SpinePipe` (and `DarkTintBatcher`) already added at module scope in the vendored barrel. |
| `packages/core/src/display/Entity.ts:11` | Doc comment claims props are stashed before `super()`; code does the opposite. |
| `packages/core/src/display/Camera.ts:138` | Comment says lerp setter clamps and logs; it actually throws. |
| `packages/core/src/display/SpineAnimation.ts:23` | Parameter typo `tracklndex` (lowercase L). |
| `packages/core/src/core/Application.ts:209` | `_isBooting` is written but never read anywhere in the repo. |
| `packages/core/src/mixins/factory/methods.ts:14` | Commented-out duplicate `instance.addChild(obj)` line (pre-existing dead code). |
| `packages/core/build/internal/manifest.mjs:11`, `build/plugins/lists.mjs:16` | Unused imports (`cwd`; `discoverLocaleKeys`, `logger`, `loadManifestBundleNames`). |
| Plugin `destroy()` hygiene | `super.destroy()` omitted or missing in `DataAdapter.ts:104`, `FullScreenPlugin.ts:157`, `LookupPlugin` (no override; keeps global container subscriptions), `StatsPlugin` (leaks DOM node + ticker callback). |
