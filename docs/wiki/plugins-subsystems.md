# Plugins: Directory-based Subsystems

> Part of the Caper core wiki. Index: [Home](Home.md)

Eight plugins under `packages/core/src/plugins/` live in their own directory rather than a single file: `actions/`, `audio/`, `breakpoints/`, `captions/`, `focus/`, `gesture/`, `input/`, `spine/`. They are **not** a different kind of plugin — every one of them extends the same `Plugin` base and honours the same `initialize` → `postInitialize` → `destroy` lifecycle described in [plugins-architecture.md](plugins-architecture.md). They got a directory only because they grew a supporting cast: pure helper modules (`breakpoints/evaluate.ts`, `gesture/gestureMath.ts`), adapters over device APIs (`input/keyboard/`, `input/touch/`), value objects (`audio/AudioChannel.ts`, `audio/AudioInstance.ts`), or a whole vendored runtime (`spine/pixi-spine/`). Single-file plugins are catalogued separately in [plugins-catalog.md](plugins-catalog.md).

Two seams matter for all of them:

- **Core registries.** `getCoreFunctions()` / `getCoreSignals()` copy a plugin's methods and signals into `coreFunctionRegistry` / `coreSignalRegistry` (`packages/core/src/plugins/Plugin.ts:171`), which is what makes `app.signal.onGestureChange` and `app.setFocusLayer(...)` work without a `getPlugin` call. The registry keys are declared in `packages/core/src/core/interfaces/ICoreSignals.ts` and `ICoreFunctions.ts`.
- **Registration.** `actions`, `input`, `gesture`, `focus`, `breakpoints`, `audio` are in `defaultPlugins` (`packages/core/src/plugins/defaults.ts:20`) and always load. `voiceover` + `captions` load only when `config.useVoiceover` is true, and `spine` only when `config.useSpine` is true (`packages/core/src/core/Application.ts:952`, `:1006`).

---

## Actions

### Purpose

A context-gated command bus: named actions (`'jump'`, `'pause'`) are dispatched by any producer and consumed by any listener, but only while the app is in an action context the action declares. It is the seam that lets keyboard, virtual buttons, UI and automation all speak one vocabulary.

### Interface

The **action context model** is a single string on the plugin (`_context`, default `'default'`). Every action is declared once in `caper.config.ts` as `{ context }`, where `context` is `'*'`, one context name, or a list of them (`ActionDefinition`, `packages/core/src/plugins/actions/types.ts:39`). Contexts are just strings; the defaults are `default | menu | pause | popup | game` (`constants.ts:3`).

Dispatch (`ActionsPlugin.sendAction`, `ActionsPlugin.ts:72`) is three checks and two emits:

1. unknown action id → dropped (warns when `debug`);
2. context mismatch → dropped (warns when `debug`);
3. allowed → build `ActionDetail { id, context, data }`, emit it on the per-action signal, then emit the same detail on `onActionDispatched`.

`app.action(id, data)` and `app.sendAction(id, data)` are aliases that forward here (`packages/core/src/core/Application.ts:883`). `app.actions(id)` returns the per-action `Signal`, lazily created and cached in `_signals` (`ActionsPlugin.ts:61`) — connecting to an action that is never dispatched is harmless.

| Member | Notes |
| --- | --- |
| `context` get/set, `setActionContext(c)` | setter is a no-op when unchanged; otherwise emits `onActionContextChanged` |
| `onActionContextChanged` | registered as a core signal; `KeyboardControls`/`VirtualControls` rebuild their maps on it |
| `onActionDispatched` | fires **only** for allowed dispatches; feeds the automation log (`core/globals.ts`) |
| `getAction(id)` / `getActions()` | per-action signal / the whole declared `ActionMap` |
| `debug` | gates the two "dropped" warnings |

Authoring helpers `defineContexts` / `defineActions` / `defineButtons` (`methods.ts`) exist purely for literal-type inference; `defineActions` merges `defaultActionsList` unless told not to.

### Internal structure

| File | Responsibility |
| --- | --- |
| `ActionsPlugin.ts` | the bus: context state, signal map, gating |
| `types.ts` | `Action`, `ActionDetail`, `ActionMap`, `ActionDefinition`, context/button type plumbing |
| `constants.ts` | default context names, default action list, default action→context table |
| `methods.ts` | `defineContexts` / `defineActions` / `defineButtons` config helpers |

### Gotchas

- `onActionDispatched` is declared in `ICoreSignals`, so `app.signal.onActionDispatched` typechecks as well as working at runtime.
- Context matching is exact: a single-string `context` is compared with `===` (plus the `'*'` wildcard), and an array `context` uses `includes` — so `'popup'` no longer matches a current context of `'pop'`.
- `app.isActionActive()` (`core/Application.ts:919`) delegates to `app.input.isActionActive()`, so it reports whether the action is currently held, not merely declared.
- Nothing validates that an action referenced by a control scheme exists in the map — see the Input gotchas.

---

## Audio

### Purpose

A three-tier volume/mute model over `@pixi/sound`: manager → channel → instance, so a game can duck music without touching sfx and mute globally without losing per-sound levels. `VoiceOverPlugin` sits on top as an opt-in queue for narration.

### Interface

**Channels** are the organising unit. Three exist from the constructor: `music`, `sfx`, `voiceover` (aliased `vo`) — `AudioManagerPlugin.ts:187`. `createChannel(name)` adds more and throws on a duplicate name. Each `AudioChannel` owns a `Map<alias, IAudioInstance[]>`, so several concurrent plays of the same alias are tracked separately (`AudioChannel.ts:31`).

Volume is composed, never stored twice: `AudioInstance._effectiveVolume = volume × channel.volume × master × muteFactor` (`AudioInstance.ts:113`). Mute is folded into the volume rather than relying on `media.muted` alone. `play()` pre-computes the start volume and hands it to `sound.play` so the first sample is already at the right level (`AudioManagerPlugin.ts:513`).

| Surface | What it does |
| --- | --- |
| `play/stop/load/isPlaying(id, channel, opts)` | channel defaults to `'sfx'`; unknown channel throws |
| `fade / fadeIn / fadeOut / crossFade` | GSAP tweens over `AudioInstance.volume`; music-channel defaults |
| `mute/unmute`, `pause/resume`, `suspend/restore` | `suspend` stores master volume, zeroes it, pauses; `restore` resumes the `AudioContext` too |
| `setChannelVolume`, `getChannel`, `channels` | channel-level control |
| `add / addAllFromManifest / addAllFromBundle` | registers assets with `@pixi/sound`, filtered by `.mp3/.ogg/.wav/.webm` |
| `audioContext` | the real `AudioContext`; **must** be used to build `PlayOptions.filters` |
| signals | `onSoundStarted`, `onSoundEnded`, `onMuted`, `onMasterVolumeChanged`, `onChannelVolumeChanged`, `onChannelMuted` — all core signals |

`VoiceOverPlugin` (`id: 'voiceover'`, `app.vo` / `app.voiceover`) is a priority queue of VO keys and numeric delays. `playVO(key | keys, mode | callback | options)` supports `mode: 'append' | 'override' | 'new'`, a numeric `priority`, a `didPlay` callback, and `localized` (suffixes `_${app.i18n.locale}`). It auto-connects to the `pause`/`unpause` actions and stops on scene change (`VoiceOverPlugin.ts:90`).

### Internal structure

| File | Responsibility |
| --- | --- |
| `AudioManagerPlugin.ts` | the plugin: channels, master volume/mute, play/fade/stop, manifest ingestion, `@pixi/sound` patch |
| `AudioChannel.ts` | one channel: alias→instances buckets, channel volume/mute fan-out |
| `AudioInstance.ts` | one playing sound: effective-volume math, media event → signal adapter |
| `VoiceOverPlugin.ts` | opt-in narration queue on the `voiceover` channel |
| `AudioChannel.test.ts` | covers concurrent instances, mute folding, `remove`/`removeInstance` |

### Gotchas

- Module load **monkey-patches** `sound.add` to dodge a `console.assert` in `@pixi/sound` (`AudioManagerPlugin.ts:20`). Importing this file has side effects.
- Filters built on a different `AudioContext` are silently dropped with an error log rather than throwing (`_usableFilters`, `:471`). An app bundling its own `@pixi/sound` gets a different context — always build on `app.audio.audioContext`.
- `AudioChannel.destroy()` (`AudioChannel.ts:163`) destroys every tracked instance before clearing its buckets, and `AudioManagerPlugin` disconnects `onChannelMuted` on teardown — nothing keeps playing past `destroy()`.
- `_verifySoundId` caches each resolved `originalId → resolvedId` mapping in `_idMap`, so repeat lookups for the same alias skip the extension-guessing walk.
- `VoiceOverPlugin.stopVO()` calls `clearSignalConnections()`, which drops **every** connection the plugin registered, not just the active VO's.
- `voiceover` and `captions` load together, both gated on `config.useVoiceover`.

---

## Breakpoints

### Purpose

Named responsive state derived from the renderer size: an ordered tier ladder (`mobile/tablet/desktop/wide`) plus arbitrary named modes, re-evaluated on resize and emitted only when a name actually flips.

### Interface

Everything nameable shares one namespace: tier names, mode names, and the two axis values (`portrait|landscape`, `coarse|fine`). One `Set<string>` of active names backs `is()`, the enter/leave signals and the change diff, so they cannot disagree (`evaluate.ts:153`).

| Member | Notes |
| --- | --- |
| `current`, `size`, `width`, `height`, `orientation`, `pointer` | read the evaluated context |
| `is(name)` | membership in the active set; warns + returns false for an unknown name |
| `atLeast / below / between` | width comparisons; accept a tier name or raw px |
| `matches(mode)` | evaluate an ad-hoc mode object/predicate |
| `value({ mobile: 1, tablet: 2 })` | mobile-first cascade; a non-empty map never returns `undefined` |
| `define(name, mode)` / `undefine(name)` | runtime modes; both re-evaluate immediately |
| `onEnter / onLeave / when` | `when` runs the callback now if already matching, then on each entry |
| `onBreakpointChanged` (alias `onChange`) | `{ current, previous, entered[], left[], size }` — the only core signal |

Config comes from the `breakpoints` key, authored with `defineBreakpoints({ tiers, modes })` so the Vite plugin can re-export literal key types into `caper-app.d.ts`. `postInitialize` connects `app.onResize` at `'highest'` priority so ordinary resize handlers already see the new tier (`BreakpointPlugin.ts:149`).

### Internal structure

| File | Responsibility |
| --- | --- |
| `BreakpointPlugin.ts` | plugin shell: options, pointer media query, enter/leave signal maps, `_evaluate` |
| `evaluate.ts` | pure core — `normalizeTiers`, `resolveTier`, `resolveStop`, `matchesMode`, `buildContext`, `activeNames`, `diffNames`, `resolveValue` |
| `types.ts` | `BreakpointMode`, `BreakpointContext`, `BreakpointsConfig`, default ladder, `AppTypeOverrides` hooks |
| `methods.ts` | `defineBreakpoints` |
| `*.test.ts` | ladder validation, diffing, cascade, priority ordering, teardown |

### Gotchas

- An invalid ladder **throws** from `initialize` (empty, lowest stop ≠ 0, duplicate stop, negative/NaN). `registerPlugin` swallows the rejection, so the plugin pre-seeds a default ladder first to avoid a cascade of unrelated `TypeError`s (`BreakpointPlugin.ts:127`).
- A config-declared tier set **replaces** the defaults; declaring `ultrawide` without `mobile` means `mobile` is unknown.
- Listen to `app.onResize` or `bp.onChange`, never `app.webEvents.onResize` — that fires before this plugin and reports a stale tier.
- `_evaluate` returns early when nothing flipped, so `onChange` is not a general resize hook.
- `onEnter`/`onLeave` on an unknown name still return a live connection (it may be `define`d later) but warn once per name.

---

## Captions

### Purpose

Timed on-screen caption lines driven by voice-over playback, with a swappable renderer. Opt-in, and only alongside `voiceover`.

### Interface

`CaptionsPlugin` (`id: 'captions'`) owns a per-locale dictionary of `id → CaptionLine[]` (`{ start, end, content, speaker? }` in ms) and a `view: Container` that `Application` inserts into its view list. A ticker callback advances `_activeCaptionTime` and calls `playLine(id, i)` when the elapsed ms enters a line's window (`CaptionsPlugin.ts:347`).

The renderer is the extension seam: `options.renderer` is a constructor taking the plugin, satisfying `ICaptionRenderer` (`start`, `stop`, `lineBegin`, `lineEnd`, `resize`, `updateSettings`). The default `CaptionsRenderer` is a Caper `Container` with a tinted `Sprite` backdrop and a `BitmapText`.

Presentation options are all live setters that re-run `updateSettings()` or `resize()`: `enabled`, `floating`, `position: 'top' | 'bottom'`, `distance`, `padding`, `textColor`, `backgroundColor`, `backgroundAlpha`, `fontSizeMultiplier`, `maxWidth` (≤1 is treated as a fraction of app width). Locale plumbing: `setLocale`, `loadLocale`, `locale`, driven by `app.i18n.onLocaleChanged`.

Wiring happens in `postInitialize` (`:288`): five `app.voiceover` signals map to caption start/pause/resume/complete/stop, the view is added to the stage, the renderer is constructed, and scene changes call `stopAllCaptions`.

### Internal structure

| File | Responsibility |
| --- | --- |
| `CaptionsPlugin.ts` | dictionary loading, timing loop, option setters, VO/i18n wiring |
| `CaptionsRenderer.ts` | default renderer: background sprite + bitmap text, layout/fade |
| `font/Sans.fnt`, `font/Sans.png` | bundled bitmap font, loaded from `./caper/font/Sans.fnt` by default |

### Gotchas

- Caption ids are voice-over asset ids with the extension stripped (`_getId`), so `vo_intro.mp3` and `vo_intro` are the same caption.
- `loadLocale` returns early when `this._dicts[localeId]` is already populated (`CaptionsPlugin.ts:330`), so loading the same locale twice skips the re-fetch.
- `postInitialize` connects i18n/voiceover signals directly, not via `addSignalConnection`, so they survive `destroy()`.
- The default `fontFile` path assumes the `caper/font/` assets were copied into the app's public dir.
- `CaptionsPlugin` is not re-exported from `plugins/index.ts`; only its interface leaks out, via `app.captions`.

---

## Focus

### Purpose

Keyboard/gamepad focus management for the Pixi scene graph: a stack of focus layers, each an ordered ring of focusables, plus a visual outline. It exists because Pixi's accessibility system alone cannot express "the popup owns focus now".

### Interface

`IFocusable` is a `Container` plus `isFocused`, `focusEnabled`, `tabIndex`, the four focus signals (`onFocusIn/onFocusOut/onFocus/onBlur`), `focusIn()/focusOut()/blur()/click()`, and `getFocusArea()/getFocusPosition()/getFocusSize()` for the outliner.

`IFocusLayer` is a ring of focusables with `next()`/`prev()` (skipping `focusEnabled: false`), a `defaultFocusable`, and `sortFocusables()` / `sortFocusablesByPosition()`.

Plugin surface — the first ten are exposed as core functions, so they are callable as `app.addFocusLayer(...)`:

| Member | Notes |
| --- | --- |
| `addFocusLayer(id?, setAsCurrent?, focusables?)` | id defaults to `layers.size`; re-adding an existing id warns and reuses it |
| `removeFocusLayer(id?)` / `removeAllFocusLayers()` | no id removes the top layer and falls back to the previous one |
| `setFocusLayer(id)`, `setLayerOrder(ids)` | switching a layer emits `onFocusLayerChange` and re-targets |
| `add / addFocusable / remove / removeFocusable` | default to the current layer |
| `focus / setFocus / forceFocus / clearFocus / restart(reverse?)` | all funnel into `_setTarget` |
| `enabled`, `active`, `currentLayer`, `layers`, `view` | `view` holds the `FocusOutliner` |
| signals | `onFocusManagerActivated`, `onFocusManagerDeactivated`, `onFocusLayerChange`, `onFocusChange` |

Two modes, chosen by `options.usePixiAccessibility` (default `false`). When false the plugin **destroys** Pixi's accessibility system and drives Tab/Shift-Tab/Enter/Space itself, synthesising `pointerdown`/`pointerup`/`click` on the target (`FocusManagerPlugin.ts:510`). When true it defers to Pixi and just focuses `_accessibleDiv`. Any real mouse move or pointer-down deactivates keyboard focus.

### Internal structure

| File | Responsibility |
| --- | --- |
| `FocusManagerPlugin.ts` | plugin + private `FocusLayer` class + `IFocusable`/`IFocusLayer` contracts |
| `FocusOutliner.ts` | the highlight: a `Graphics` rect/rounded-rect that ticker-tracks the target's global position |

### Gotchas

- `destroy()` calls `_removeGlobalListeners()`, which removes every `document`/`window`/`globalThis` `mousemove`/`keydown`/`keyup` handler the plugin attached (including the capture-phase one from `_activate()`), then destroys the outliner and chains `super.destroy()`.
- The plugin registers `removeAllFocusLayers` on `app.scenes.onSceneChangeStart`, so every scene starts with zero layers; scenes must build their own.
- `FocusOutliner.setFocusTarget` adds a ticker callback per target and only removes it in `clearFocusTarget`.
- `layerId` may be `0` — code paths that test truthiness of the layer id (e.g. `currentLayer`, `FocusManagerPlugin.ts:301`) treat layer `0` as "no layer".
- `ICoreFunctions.setFocus` is typed to return `IFocusable`; the implementation returns `void`.

---

## Gesture

### Purpose

Multi-touch pinch-zoom and two-finger pan recognised as one combined gesture, the way map apps behave. One finger is never a camera gesture, and rotation is deliberately not recognised.

### Interface

Three signals, all core signals, all in client CSS pixels:

- `onGestureStart { centerX, centerY, pointerCount }` — fires when a pending gesture crosses a threshold;
- `onGestureChange { centerX, centerY, dx, dy, scale, totalScale, pointerCount }` — `dx/dy/scale` are per-frame deltas, `totalScale` is the ratio since the gesture started;
- `onGestureEnd { centerX, centerY, totalScale }`.

Plus `isActive` and `pointerCount`. Options (`gesture` key in `caper.config.ts`): `enabled`, `pointerTypes` (default `['touch']`), `pinchThreshold` / `panThreshold` (8px), `preventDefault` (also sets `canvas.style.touchAction = 'none'` and restores it on destroy).

The state machine is `idle → pending → active`. Two pointers down enters `pending`; crossing either threshold rebases the frame (discarding the slack, so there is no jump) and enters `active`. A third finger joining or one lifting while ≥2 remain rebases silently. Dropping below two pointers ends the gesture.

It listens to **raw DOM pointer events** — `pointerdown` on `app.canvas`, `pointermove`/`pointerup`/`pointercancel` on `window` — not Pixi federated events, so hit testing cannot hide a pointer and lift-outside is always seen.

### Internal structure

| File | Responsibility |
| --- | --- |
| `GesturePlugin.ts` | listeners, state machine, thresholds, signal emission |
| `gestureMath.ts` | pure math: `computeFrame` (centroid + mean radial spread), `frameDelta` (translation + spread ratio) — no Pixi/caper imports |
| `types.ts` | options, defaults, the three detail shapes |
| `gestureMath.test.ts` | centroid/spread/epsilon cases |

### Gotchas

- `spread` is the *mean radial distance* from the centroid (half the pair distance for two fingers), which is why the same math generalises to 3+ fingers.
- A previous spread under `0.01` makes `scale` report `1` instead of dividing by near-zero (`gestureMath.ts:57`, and again for `totalScale` at `GesturePlugin.ts:205`).
- `preventDefault` calls `e.preventDefault()` on every tracked pointer event while pending or active — including the `pointerdown` that starts the gesture, which can swallow taps that a UI layer expected.
- Default `pointerTypes: ['touch']` means mouse and pen produce nothing until you widen it.
- With `enabled: false` no listeners are attached at all; the signals exist but never fire.

---

## Input

### Purpose

Turn device input into actions. `InputPlugin` tracks *which* controller the player is using; `Controls` and its two adapters translate physical keys and virtual buttons into `app.action(...)` dispatches according to the current action context.

### Interface

The unification story has three layers:

1. **Device detection — `InputPlugin`.** It listens for canvas `pointerdown`/`pointermove`, window `keydown`, and `gamepadconnected`/`gamepaddisconnected`, and maintains `activeControllers: Set<string>` plus `lastUsedController` (only ever one of `keyboard | gamepad | mouse | touch`). Signals: `onControllerChanged`, `onControllerActivated`, `onControllerDeactivated`, `onGamepadConnected`, `onGamepadDisconnected` — all core signals. `isControllerActive`, `isGamepadActive`, `isActionActive` round it out. Gamepads are recorded in `activeGamepads` but **no gamepad polling loop exists** — buttons and axes are not read.
2. **Scheme translation — `Controls`** (`app.controls`). Built from `config.controls`, it owns `keyboard: KeyboardControls` and `virtual: VirtualControls` (`touch` is the deprecated alias for the same instance) and fans `isActionActive` out to both. `initialize(scheme)` constructs each adapter only if that half of the scheme exists; `connect()` (called from `postInitialize`) attaches them to the ticker and signals.
3. **Adapters.** Both subclass `WithSignals(AbstractControls)` and follow the same shape: `_sortActions()` flattens the scheme into `Map<input, Action>` plus a `combinations` list sorted longest-first, **filtered by the current action context**; it re-runs on `onActionContextChanged`. A ticker `_update()` walks combinations first, marks their inputs as consumed, then fires singles — so `A+B` does not also fire `A`. Dispatch is always `app.action(actionId, { inputState, combination, key|button })`.

| Adapter | Source | Scheme keys | Notes |
| --- | --- | --- | --- |
| `KeyboardControls` | `app.keyboard` signals + `app.keyboard.keysDown` (`KeyboardPlugin`) | `down`, `up` | keys normalised via `normalizeKey`; `up` fires immediately on keyup, `down` fires every tick while held |
| `VirtualControls` | `IButton` instances via `addButton()`, plus an assigned `IJoystick` | `down`, `up`, `joystick` | joystick direction is matched against `JoystickDirection` values and dispatched with `inputState: 'joystick'` |

Scheme authoring uses `defineControls(actions, buttons, controls)` for literal-type inference. `KeyboardControlsMap` accepts a key, a `'A+B'` combination, or an array of either.

### Internal structure

| File | Responsibility |
| --- | --- |
| `InputPlugin.ts` | controller detection + gamepad registry; owns a `Controls` |
| `Controls.ts` | composition root for the two adapters; `isActionActive` fan-out |
| `AbstractControls.ts` | tiny base: `scheme` + `app` accessor |
| `keyboard/KeyboardContols.ts` | keyboard adapter (note the filename typo) |
| `keyboard/interfaces.ts` | keyboard scheme shapes |
| `touch/VirtualControls.ts` | virtual button + joystick adapter; `TouchControls` deprecated alias |
| `touch/constants.ts` | `JoystickDirection` enum |
| `touch/interfaces.ts` | joystick input shapes |
| `constants.ts` | `InputControllerTypes` enum |
| `types.ts`, `interfaces.ts` | scheme/action map types shared by both adapters |
| `methods.ts` | `defineControls` |

### Gotchas

- `AbstractControls.destroy()` is an intentional no-op that terminates the chain — `WithSignals(...).destroy()` calls `super.destroy(options)` safely, and `Controls.destroy()` → `keyboard.destroy()` / `touch.destroy()` no longer throws.
- `_sortActions()` warns (once per key, via `_warnMissingAction`) rather than throwing when a scheme entry names an action not present in `getActions()`.
- `isActionActive` splits a `'A+B'` combination string and checks every key/button is held (`_isInputActive`), so combinations are correctly reported active.
- `VirtualControls.addButton` keeps each button's connections in a `_buttonConnections` map; `removeButton` disconnects exactly those connections, so the button is fully unwired.
- Disconnecting a gamepad unconditionally dispatches the `pause` action (`InputPlugin.ts:201`).
- `_handleContextChanged` / `_sortActions` are wired to `onActionContextChanged` through `addSignalConnection`, so the connection is released on `destroy()`.
- Context filtering happens when the map is built, not at dispatch time — the `ActionsPlugin` gate is the real authority; the adapter filter is an optimisation that must stay in sync with it.

---

## Spine

### Purpose

Esoteric Software's Spine runtime for PixiJS v8, vendored into the framework so Caper can pin it against `pixi.js@8.10.2`, plus a dark-tint batcher Pixi does not ship. Opt-in via `config.useSpine`.

### Interface

`SpinePlugin` (`id: 'SpinePlugin'`) is fourteen lines: register the two asset loaders and the render pipe as Pixi extensions, then publish `window.Spine` (`SpinePlugin.ts:8`).

Consumers use `Spine`, a `ViewContainer` subclass:

- `Spine.from({ skeleton, atlas, scale?, autoUpdate?, darkTint? })` — both assets must already be loaded; parsed `SkeletonData` is cached under `` `${skeleton}-${atlas}-${scale}` ``.
- `skeleton` / `state` — the raw spine-core `Skeleton` and `AnimationState`.
- `autoUpdate` (default true) drives updates off `Ticker.shared`; when false call `update(dt)`.
- `addSlotObject(slot, container)` / `removeSlotObject(...)` / `getSlotObject(slot)` — attach a Pixi container to a bone's world transform.
- `setBonePosition` / `getBonePosition`, and the coordinate converters `skeletonToPixiWorldCoordinates`, `pixiWorldCoordinatesToSkeleton`, `pixiWorldCoordinatesToBone`.
- `debug = new SpineDebugRenderer()` to overlay bones, hulls, triangles, clipping polygons, bounding boxes and events.
- `beforeUpdateWorldTransforms` / `afterUpdateWorldTransforms` hooks.

Asset loading is by extension: `.atlas` → `spineTextureAtlasLoader` (fetches the atlas text, loads each page through the Pixi loader, wraps them in `SpineTexture`), `.skel`/`.json` → `spineLoaderExtension`.

### Internal structure

| File | Responsibility |
| --- | --- |
| `SpinePlugin.ts` | the Caper plugin: extension registration + `window.Spine` |
| `pixi-spine/Spine.ts` | the display object: update loop, attachment cache, clipping masks, slot objects, bounds |
| `pixi-spine/SpinePipe.ts` | Pixi `RenderPipe`: per-slot batchables keyed by `spine.uid`, dirty checks, slot-object collection |
| `pixi-spine/BatchableSpineSlot.ts` | one batchable element; packs colour/dark colour, picks `darkTint` vs `default` batcher |
| `pixi-spine/SpineTexture.ts` | spine `Texture` ↔ Pixi `Texture` adapter (filters, wraps, blend modes) |
| `pixi-spine/SpineDebugRenderer.ts` | Graphics-based debug overlay |
| `pixi-spine/assets/atlasLoader.ts`, `assets/skeletonLoader.ts` | Pixi `AssetExtension`s for `.atlas` and `.skel`/`.json` |
| `pixi-spine/darktint/` | `DarkTintBatcher` (7-float vertex), `DarkTintBatchGeometry`, `DarkTintShader`, `darkTintBit` WGSL/GLSL bits |
| `pixi-spine/require-shim.ts` | legacy `require('pixi.js')` shim, active only when `window.PIXI` exists |

### Gotchas

- This is **vendored upstream code**. Treat `pixi-spine/` as a copy to be re-synced, not as Caper-authored source; the only Caper file is `SpinePlugin.ts`.
- `SpinePipe` and `DarkTintBatcher` call `extensions.add(...)` at module scope (`SpinePipe.ts:197`, `DarkTintBatcher.ts:186`); `SpinePlugin.initialize` relies on that and does not register `SpinePipe` a second time.
- `Skeleton.yDown = true` is set at module load (`Spine.ts:96`), globally, for every skeleton.
- `Spine` and the loaders are not re-exported from `plugins/index.ts`, so the package entry does not expose them — `window.Spine` is the intended access path.
- Dark tint is auto-detected from whether any slot has a dark colour unless `darkTint` is passed explicitly; it selects a different batcher and therefore breaks batching with ordinary sprites.
- The plugin id is `'SpinePlugin'` (PascalCase), unlike every other plugin id in the framework.
