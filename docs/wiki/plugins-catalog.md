# Plugins: Built-in Catalog (single-file plugins)

> Part of the Caper core wiki. Index: [Home](Home.md)

Every module below lives directly in `packages/core/src/plugins/`. The contract they
all implement — lifecycle, ordering, registration, `app.<name>` accessors — is
documented in [plugins-architecture.md](plugins-architecture.md). Directory-based
plugins (`actions/`, `audio/`, `breakpoints/`, `captions/`, `focus/`, `gesture/`,
`input/`, `spine/`) are documented in
[plugins-subsystems.md](plugins-subsystems.md).

Sections are ordered roughly by bootstrap position, then by the non-default extras.

---

## DataAdapter (`data`)

`packages/core/src/plugins/DataAdapter.ts:86` — in-memory game-state store with
optional per-key `localStorage` backup. Registered only when `config.useStore`, and
reached as `app.data`; it is a plain plugin, not an `IStorageCapability`, because its
API is richer than generic save/load (`DataAdapter.ts:80`).

**Interface.** `get(key?)`, `set(key, value)` / `set(partial, merge = true)`,
`increment(key, amount = 1)`, `concat(key, value)`, `append(key, value, sep = '')`,
`snapshot(key?)` (deep JSON clone), `clear(key?)`; signal `onDataChange` carrying
`{ key?, value?, restore?, clear? }`, also published as a core signal
(`DataAdapter.ts:100`). Options (`IDataAdapterOptions`, `:12`): `initial`, `namespace`
(defaults to `app.appName`), `backupAll`, `backupKeys`,
`overrideWithLocalStorage` (default `true`).

**Gotchas.** `clear()` with no key only removes this namespace's own `localStorage`
keys (`${namespace}-*`), not the whole origin; `clear(key)` is scoped the same way.
`destroy()` (`:104`) calls `super.destroy()`, so tracked signal connections are
released along with the in-memory `data`. `snapshot()` is `JSON.parse(JSON.stringify(...))`,
so `Date`/`Map`/`undefined` values do not round-trip. Restore failures are
`console.warn`-ed per key and fall back to the initial value (`:245`).

---

## LookupPlugin (`lookup`)

`packages/core/src/plugins/LookupPlugin.ts:88` — O(1) container lookup by
slash-separated label path (`'UI/HUD/HealthBar'`). Registered first in `defaults.ts`
so it sees every container add/remove. Reached as `app.lookup`.

**Interface.** `getChildAtPath(path)`, `getChildrenAtPaths(...paths)` (undefined
entries filtered out), `getPathForChild(container)` (`''` when untracked),
`getPathsForChildren(...containers)`, `getAllPaths()`, `getAllChildren()`.
Maintains two mirrored maps and subscribes to `Container.onGlobalChildAdded` /
`onGlobalChildRemoved` in `initialize` (`:109`), recursing over whole subtrees.

**Gotchas.** Core functions are registered through `getCoreFunctions()` (`:100`), so
`app.func.getChildAtPath` works the same as `app.lookup.getChildAtPath`. Paths are
built from `container.label` only, walking up until a `'Stage'`-labelled ancestor
(`:292`); unlabelled containers are skipped entirely, and two siblings sharing a label
silently overwrite each other in the map. Renaming a `label` after insertion does not
re-index. `destroy()` disconnects the global `Container.onGlobalChildAdded` /
`onGlobalChildRemoved` subscriptions taken out in `initialize`, so the plugin doesn't
outlive its teardown.

---

## WebEventsPlugin (`webEvents`)

`packages/core/src/plugins/WebEventsPlugin.ts:19` — the single DOM-event source for
the framework. Everything else consumes its signals rather than adding its own
`window` listeners. Reached as `app.webEvents`.

**Interface.** Signals `onResize({width, height})`, `onVisibilityChanged(visible)`,
`onOrientationChanged({ orientation, screenOrientation })`. The last two are published
as core signals (`:67`); `onResize` deliberately is not — `Application` owns
`app.signals.onResize` itself (`core/Application.ts:694`). Listens to
`visibilitychange`, `pagehide`, `pageshow` (Safari fallbacks), `resize`,
`fullscreenchange`, `orientationchange`, and `visualViewport.resize`.

**Gotchas.** `visualViewport` resizes are ignored while `scale !== 1` so pinch-zoom
does not trigger a layout pass (`:96`, covered by `WebEventsPlugin.test.ts:48`).
Visibility emits are debounced by 1ms (`:30`) to collapse `pagehide` +
`visibilitychange` double-fires. Size is measured from the canvas's **parent element**
when one exists, falling back to `window.inner*` (`:82`). `destroy()` (`:58`) removes
every listener it attached — including `orientationchange` — then calls
`super.destroy()`. `_onOrientationChanged` falls back to a 10ms `setTimeout` re-read
when the event carries no `screen.orientation` (`:142`).

---

## FullScreenPlugin (`fullscreen`)

`packages/core/src/plugins/FullScreenPlugin.ts:69` — cross-browser fullscreen wrapper
(standard + `webkit`/`moz`/`ms` prefixes). Reached as `app.fullScreen`.

**Interface.** `toggleFullScreen()`, `setFullScreen(value)`,
`setFullScreenElement(el | window | null)`, getters `isFullScreen` (plugin's own
belief), `isFullscreen` (queried from the document, all four vendor properties),
`canFullscreen` (capability probe on the target element). Signal
`onFullScreenChange(isFullscreen)`. All three setters are core functions (`:301`).

**Gotchas.** Two very similar names: `isFullScreen` is cached state, `isFullscreen`
(`:278`) is the truth. The change handler (`:356`) re-reads `this.isFullscreen` (the
vendor-prefixed-aware getter) and assigns it to `_isFullScreen` before emitting, so a
user-initiated exit (Esc / browser chrome) keeps the cached flag in sync.
`_requestFullscreen` **throws** when no element is available (`:313`) while
`setFullScreenElement(null)` only warns. `initialize` registers `fullscreenchange`
twice (`:146`, `:150`); harmless, same function reference. `destroy()` removes all
four vendor-prefixed listeners and calls `super.destroy()`.

---

## ResizerPlugin (`resizer`)

`packages/core/src/plugins/ResizerPlugin.ts:52` — owns renderer sizing, letterboxing,
and device safe-area measurement. Reached as `app.resizer`; driven by
`webEvents.onResize` wired in `Application._setup` (`core/Application.ts:1118`).

**Interface.** `resize(): Promise<Size>` (rAF-debounced; cancels any pending frame),
readonly `size`, `scale`, `safeArea` (`{top,right,bottom,left}` in logical render
units). Options (`ResizerPluginOptions`, `:22`): `autoScroll`, `minWidth`, `minHeight`,
`letterbox`, `center`, `debug`, `useSafeArea` (default `true`).
`postInitialize` performs the first resize (`:85`).

**Gotchas.** Safe-area insets are measured through a hidden `position:fixed` probe div
padded with `env(safe-area-inset-*)` (`:102`), created once and removed in `destroy`.
Browsers (and happy-dom) without `env()` yield `0`. Insets are multiplied by `scale`
because the renderer's logical size is CSS pixels × scale (`:198`) — verified by
`ResizerPlugin.test.ts:46`. `minWidth`/`minHeight` do double duty: minimum size **and**
letterbox aspect ratio. With `resizeToContainer: false` the canvas is pinned to exactly
`minWidth × minHeight`. `_resize`, `_resizeInternal`, `_measureSafeAreaCssPx` and
`_cancelResize` are public-by-convention (underscore-prefixed, no `private`) precisely
so tests can drive and stub them.

---

## AssetsPlugin (`assets`)

`packages/core/src/plugins/AssetsPlugin.ts:106` — wraps Pixi's `Assets` with
required/background/scene load phases, dedupe bookkeeping, and DOM `CustomEvent`
mirrors of its signals. Reached as `app.assets`.

**Interface.** `loadRequired()`, `loadBackground()`, `loadAssets(assets, reportProgress = true)`,
`loadBundles(bundles, reportProgress = true)`,
`loadSceneAssets(scene, background = false)`, `unloadSceneAssets(scene)`. Nine signals
across three phases (`onLoad*`, `onLoadRequired*`, `onBackground*`), all published as
core signals (`:310`). Options come from `config.assets`
(`AssetLoadingOptions`: `preload`, `background`, `assetPreferences`); defaults set
`preferWorkers: !isDev` and `crossOrigin: 'anonymous'` (`:54`).

**Gotchas.** Every load also dispatches a DOM event on `app.canvas`
(`CaperEvent.ASSETS_*`) so non-Pixi loading UI can listen; `dispatchWebEvent` mutates
and re-dispatches a **single reused `CustomEvent` instance** per kind (`:394`), so
`detail` is shared across dispatches. `.svg` sources are auto-flagged
`data.parseAsGraphicsContext = true` (`:59`). Dedupe uses `Set`s keyed by the raw
asset value — object-form assets are compared by reference, so the same asset passed as
two distinct objects loads twice (`:324`). `loadRequired` filters out already-loaded
bundles before calling `Assets.loadBundle`, so a repeat call only loads what's still
unloaded (`:189-190`). `loadBackground` and the background branch of
`loadSceneAssets` are fire-and-forget — nothing awaits them.

---

## SceneManagerPlugin (`scenes`)

`packages/core/src/plugins/SceneManagerPlugin.ts:87` — scene registry, transition
queue, splash handling, and the dev scene-picker. Reached as `app.scenes`.

**Interface.** `loadScene(id, ...props)` / `loadScene({ id, method })`,
`loadDefaultScene()`, `setDefaultLoadMethod(m)`, `getSceneFromHash()`; fields
`currentScene`, `view`, `list`, `ids`, `isFirstScene`, `splash`, `transition`; signals
`onSceneChangeStart({ exiting, entering })` and `onSceneChangeComplete({ current })`
(both core signals, `:362`). Six `LoadSceneMethod`s (`:51`) — `immediate` (default),
`exitEnter`, `enterExit`, `enterBehind`, `transitionExitEnter`, `exitTransitionEnter` —
each expanding to a different ordering of the same eight private queue steps
(`:265-341`).

**Gotchas.** `destroy()` (`:142`) removes the `hashchange` listener and the
debug-menu DOM node, then calls `super.destroy()` to release tracked signal
connections. Calling `loadScene` mid-transition cancels the queue and
force-`destroy()`s the half-mounted scene (`:215-224`) — enter/exit hooks are skipped.
`initialize` reads `Caper.get('sceneList')` and filters `active !== false` (`:149`),
so a scene missing from discovery throws at load time with a Vite error overlay
(`:241`). Props from `loadScene(id, props)` are assigned onto the instance as
`this.props` *before* `initialize()` and cleared immediately after (`:411`) — they are
single-use. The debug menu / hash routing turns on in dev unless
`showSceneDebugMenu: false`, and `useHash` is forced true whenever the menu is visible
(`:147`). `_createCurrentScene` accepts either `module.default` or a named export
matching the scene id (`:391`).

---

## KeyboardPlugin (`keyboard`)

`packages/core/src/plugins/KeyboardPlugin.ts:33` — raw keyboard state and per-key
signals. Higher-level bindings belong in `InputPlugin`/`ActionsPlugin`. Reached as
`app.keyboard`.

**Interface.** `onKeyDown(key?)` / `onKeyUp(key?)` return a lazily-created
`KeySignal` for that key (omit the key for a catch-all), `isKeyDown(key)`,
`keysDown: Set<string>`, `enabled` (gates the per-key signals only). Global signals
`onGlobalKeyDown` / `onGlobalKeyUp` are core signals; the three methods are core
functions (`:91-97`). `normalizeKey` (`:22`) maps `' '` → `'Space'`, uppercases
single characters, and maps `undefined` → the `'*undefined*'` catch-all bucket.

**Gotchas.** The two listener sets are independent: `keysDown` and the global signals
are always live from `initialize`, but the per-key `document` listener is only attached
on the *first* `onKeyDown`/`onKeyUp` call (`:134`). `enabled = false` silences per-key
signals but **not** `onGlobalKey*` or `keysDown` tracking (`:99-121`). The global
signals emit the raw `e.key`, while `keysDown` and the per-key signals use the
normalized form — mixing the two is a common bug. A dev-only one-shot warning fires if
a key event arrives with zero per-key subscribers (`:111`), the usual symptom of an
`Application` subclass that skipped framework wiring.

---

## PopupManagerPlugin (`popups`)

`packages/core/src/plugins/PopupManagerPlugin.ts:50` — stacked popup registry, show/hide
lifecycle, focus-layer handoff, Escape handling. Reached as `app.popups`.

**Interface.** `showPopup(id, config?)` / `show(...)` (alias), `hidePopup(id, data?)`,
`removeAllPopups(animate = false)`; readonly `view`, `current`, `currentPopupId`,
`hasActivePopups`, `popupCount`; signals `onShowPopup`, `onHidePopup`,
`onPopupChanged`, all core signals (`:195`). `showPopup` awaits the full lifecycle —
`initialize → clearFocus → beforeShow → show() → setFocusLayer → afterShow` — then
resolves on the next ticker tick after emitting and calling `start()` (`:113-142`).

**Gotchas.** Popups come from `Caper.get('popupList')` (`:214`); entries stay as
dynamic-import thunks until first `show()`, which resolves and caches the constructor
(`:230`). An unknown id **throws** with the known-id list in the message (`:233`) —
it does not return `undefined`. `removeAllPopups(true)` routes each popup through
`hidePopup(id)` (`:180-189`), which removes it from `_activePopups` and the view and
recomputes `_currentPopupId` as it resolves — so the animated path ends in the same
clean state as the non-animated one. `popupCount` counts *registered* popups, not
active ones — use `_activePopups`-backed `hasActivePopups` for that. The Escape
listener (`:207`) is attached without `addSignalConnection`, so `destroy()` does not
release it. `_handleEscape` only closes the current popup when its
`config.closeOnEscape` is set.

---

## i18nPlugin (`i18n`)

`packages/core/src/plugins/i18nPlugin.ts:114` — locale dictionaries, dot-path key
lookup, interpolation, variant groups, CLDR plurals. Reached as `app.i18n`.

**Interface.** `t(key, params?, locale?)` (alias `translate`),
`tCount(key, count, params?, locale?)`, `parse(input, locale?)`,
`setLocale(id)`, `loadLocale(id)`; readonly `locale`, `locales`; signal
`onLocaleChanged`. `t`/`translate`/`tCount`/`setLocale` are core functions (`:304`).
Options (`i18nOptions`, `:56`): `defaultLocale`, `locales`, `loadAll`, `files`.
`LocaleKey` / `PluralLocaleKey` (`:16`, `:27`) are generated from the reference locale
by the Vite plugin, giving autocomplete without rejecting dynamic keys.

**Gotchas.** A missing key returns the key itself and logs an error (`:193`) — typos
render visibly rather than blanking the UI. `[a|b|c]` variant groups are **always**
resolved, params or not: index 0 by default, `variant: <n>` clamped per group,
`variant: 'random'` rolled independently per group (`:201`, tests at
`i18nPlugin.test.ts:49-75`). `tCount` resolves `<key>.<cldrCategory>` and falls back to
`<key>.other` (`:253`), passing `count` through as a param. `parse()` only looks up
**flat** dict keys (`dict[key]`, `:280`) — it does not use the dot-path resolver that
`t` uses, and it returns `''` (not the input) when no dictionary is loaded.
`setLocale` assigns `_locale` *before* awaiting the load (`:160`), so a failed load
leaves the plugin pointing at a locale with no dictionary.

---

## TimerPlugin (`timers`)

`packages/core/src/plugins/TimerPlugin.ts:641` — countdown/count-up timers on the Pixi
ticker or in a generated Web Worker. Reached as `app.timers`.

**Interface.** `createTimer(options?)` → `Timer`, `destroyTimer(t)`,
`destroyAllTimers()`, `pauseAllTimers()`, `resumeAllTimers()`, plus worker plumbing
(`startWorkerTimer`, `stopWorkerTimer`, `resetWorkerTimer`, `adjustWorkerTimer`) and
`hasWorkerSupport`. Signals `onTimerCreated`, `onTimerDestroyed`, `onAllTimersPaused`,
`onAllTimersResumed` — all core signals (`:673`). `Timer` (`:241`):
`start/pause/reset/destroy/update/getTime/getRemainingTime/getId/getOptions/isWorker/
addTime/removeTime`. `TimerOptions` (`:9`): `duration` (omit for count-up),
`autoStart`, `loop`, `useWorker`, `workerInterval` (default 16ms), `onComplete`,
`onTick`. The module also exports `formatTime(ms, format?, returnFormat?)` (`:176`)
supporting `'mm:ss' | 'hh:mm:ss' | 'ms'` and string-or-object output.

**Gotchas.** The worker is built from an inline blob URL (`:37`) and created in
`postInitialize` (`:677`); if construction fails (CSP, no `Worker`), `useWorker: true`
silently degrades to a main-thread timer with a warning (`:255`).
`Application._postInitialize` wires page visibility to `pauseAllTimers` /
`resumeAllTimers` (`core/Application.ts:795`) — and `resumeAllTimers` calls `start()`
on *every* timer, so a timer you deliberately paused restarts when the tab regains
focus. Non-looping main-thread timers self-destroy on completion (`:344`), so holding a
reference past `onComplete` gives you a dead object. `getTime()` returns elapsed time
in both modes despite the doc comment; use `getRemainingTime()` for countdowns.
`addTime` on a countdown mutates `options.duration` in place. `TimerPlugin.destroy()`
clears the tracking sets without destroying the individual timers (`:765`). The
`isPageVisible` field (`:644`) and the worker-message `'adjustTime'` branch (`:719`)
are dead code — the worker never posts that message.

---

## GSAPPlugin (`GSAPPlugin`)

`packages/core/src/plugins/GSAPPlugin.ts:328` — registers GSAP's `PixiPlugin`, custom
eases, and a grouping layer for tweens. Loaded unconditionally in `preInitialize`.
Reached as `app.animation`, with `app.anim` for the raw `gsap` object and
`app.addAnimation(...)` / `app.eases(...)` as shortcuts (`core/Application.ts:415-449`).

**Interface.** `anim` (the `gsap` namespace), `addAnimation(tween | tweens, contextId?)`,
`getContext(id)`, `registerCustomEase(name, fn)`, `registerEases(map)`, `easeNames`,
`eases`, and the context operations `playAll/pauseAll/killAll/revertAll/clear/clearAll`
plus the global-only `killGlobal/revertGlobal/clearGlobal`. Twelve signals
(`onPlayAll`, `onPauseAll`, `onKillAll`, `onRevertAll`, `onClear`, `onClearAll`,
`onKillGlobal`, `onRevertGlobal`, `onClearGlobal`, `onEaseRegistered`,
`onEasesRegistered`, `onAnimationAddded` — note the typo'd triple-d) — **none** are
published to the core registries.

**Gotchas.** An "animation context" here is a plain
`Set<Tween | Timeline>` (`AnimationContext`), **not** a `gsap.Context`; nothing is
auto-reverted and nothing is auto-added — you must call `addAnimation` yourself, and
nothing removes a completed tween from its set. `initialize` ignores its `options`
argument and reads `app.config.gsap` (`:394`). `clearGlobal()` and `killGlobal()`/
`revertGlobal()` all go through the same `_animationContexts` map keyed by
`GSAPPlugin.GLOBAL_CONTEXT_ID`, so there is no separate global-context field to fall
out of sync. `killAll(contextId)` also deletes the context and emits `onClear` as a
side effect (`:658`). `PixiPlugin.registerPIXI` only registers `ColorMatrixFilter` and
`BlurFilter` (`:402`) — other filters must be animated by hand.

---

## LayoutPlugin (`LayoutPlugin`)

`packages/core/src/plugins/LayoutPlugin.ts:74` — opt-in `@pixi/layout` integration.
Loaded in `preInitialize` only when `config.useLayout` is true.

**Interface.** None beyond `initialize`. Its whole job is the side effect of importing
`@pixi/layout` (+ its devtools) and setting `Layout.defaultStyle` (`:105`):
containers `auto`-sized with `gap: 0`, leaves `intrinsic` with `flexShrink: 1`, shared
defaults of `transformOrigin: '50%'`, `objectPosition: 'center'`, `flexDirection: 'row'`,
`alignContent: 'stretch'`, `flexWrap: 'nowrap'`, `overflow: 'visible'`.

**Gotchas.** Not exported from `plugins/index.ts`, and not in `defaults.ts` — reach it
via `app.getPlugin('LayoutPlugin')` if you need it at all. Caper's own `FlexContainer` /
`UICanvas` are independent of this plugin; enabling it changes the defaults for
`container.layout` on **every** Pixi container, so turning it on mid-project can shift
existing layouts. Defaults are set at initialize time, so anything reading
`Layout.defaultStyle` before `preInitialize` sees the library defaults.

---

## DevToolsPlugin (`DevToolsPlugin`)

`packages/core/src/plugins/DevToolsPlugin.ts:60` — thin wrapper over
`@pixi/devtools`'s `initDevtools`. Loaded in `preInitialize` when `isDev`.

**Interface.** `initializeDevTools(app: PIXI.Application)`. `initialize()` is
intentionally empty — activation is a separate explicit call made by
`Application.initialize` after the renderer exists (`core/Application.ts:734`).

**Gotchas.** Registered under the class-name id `DevToolsPlugin`, not a lowercase one.
Only loaded in dev, so `app.getPlugin('DevToolsPlugin')` is `undefined` in production
builds — guard before calling. Not exported from `plugins/index.ts`. Requires the
browser extension to actually show anything.

---

## StatsPlugin (`stats`)

`packages/core/src/plugins/StatsPlugin.ts:6` — bottom-right `stats.js` FPS panel.
Loaded after the defaults when `config.showStats === true`, or in dev unless
`showStats` is explicitly `false` (`core/Application.ts:999`).

**Interface.** Public field `stats` (the raw `Stats` instance). No signals, no core
functions. `initialize` creates the panel, gives it `id="stats"`, appends it to
`Application.containerElement`, absolutely positions it bottom-right, and adds
`stats.update` to `Ticker.shared` at `UPDATE_PRIORITY.UTILITY` (`:22`).

**Gotchas.** The class hardcodes `id = 'StatsPlugin'` but is registered under `stats`;
`loadPlugin` overwrites the field (`core/Application.ts:849`), so look it up as
`'stats'`. `destroy()` removes the ticker callback and the DOM node before calling
`super.destroy()`. Not exported from `plugins/index.ts`. If `Application.containerElement`
is unset the panel is silently never attached (`:14`).
