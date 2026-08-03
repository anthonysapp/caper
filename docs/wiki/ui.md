# UI: UICanvas, FlexContainer & Widgets

> Part of the Caper core wiki. Index: [Home](Home.md)

## Purpose

`packages/core/src/ui/` is Caper's screen-space UI layer, sitting on top of
`@pixi/layout` (a Yoga/flexbox binding for Pixi) rather than raw
transform math. Two modules carry the layout model — `UICanvas` (a
9-region, safe-area-aware screen frame) and `FlexContainer` (a thin,
convenience-heavy wrapper around a single `@pixi/layout`-enabled node) —
and five widgets build on them: `Button` (press/hover state machine +
texture swapping), `Input` (a hidden real `<input>` DOM element driving a
Pixi text render, for actual keyboard/IME text entry), `Joystick`
(drag-vector-to-direction/power), `Popup` (a `Container` subclass wired
into the focus system and action-context stack, discovered like scenes
via `definePopup`), and `Toast`/`Toaster` (a queue-managed stack of
auto-dismissing notifications). All of it composes the same mixin stack
described in [Mixins & the Factory](mixins-and-factory.md) — `Factory()`
for `this.add`/`this.make`, `WithSignals` for signal-connection lifecycle,
`Interactive`/`Focusable` for pointer + DOM-focus wiring.

## Interface (what callers must know)

**UICanvas** — `packages/core/src/ui/UICanvas.ts:124`. Construct via
`this.add.uiCanvas({...})` (factory method, `UICanvasFactoryProps`) or
`new UICanvas(config)` directly; throws in the constructor if
`app.config.useLayout` isn't `true` (`UICanvas.ts:142-144`). Key config
(`UICanvasProps`, `UICanvas.ts:90-98`): `size`/`useAppSize` (bind to
`app.size` and re-center every resize), `padding` (`Padding` or
`PointLike`), `useSafeArea` (default `true` — folds device safe-area
insets into padding), `layout` (raw `@pixi/layout` passthrough, defaults
to `flexGrow:0, flexShrink:0, autoLayoutChildren:true`), `debug` (draws a
region/padding overlay). Callers never call `addChild`/`addChildAt`
directly (both throw — see Invariants); instead:

- `addElement(child, { align, padding })` — parents `child` into one of
  nine named regions (`UICanvasEdge`: `'top left'`, `'top center'`,
  `'center'`, `'bottom right'`, etc., `UICanvas.ts:22-39`) and joins the
  flex flow.
- `removeElement(child)` — inverse; throws if `child` wasn't added via
  `addElement` (`UICanvas.ts:653-660`).
- `bindElement(child, anchor, place)` / `unbindElement(child)` — parents a
  **free-floating** element (tooltip, popover, dropdown) that tracks an
  anchor's laid-out box every layout pass without joining the flex flow
  (`UICanvas.ts:575-621`). `place` receives a `UICanvasBindRect` in
  canvas-local space; the bound child must **not** re-enable `.layout`
  itself (see Invariants).
- `topRow` / `middleRow` / `bottomRow` — the three `FlexContainer` rows
  backing the 9-grid, public for advanced cases (rare; prefer
  `addElement`).
- No signals of its own; children's own `layout` events drive
  `updateLayout()` via internal listeners.

**FlexContainer** — `packages/core/src/ui/FlexContainer.ts:55`. Construct
via `this.add.flexContainer({...})` or `new FlexContainer(config)`; same
`useLayout` guard as `UICanvas` (`FlexContainer.ts:64-66`). Config
(`FlexContainerConfig`, `FlexContainerConfig.ts:26-32`): `bindTo` (mirror
another container's width/height), `bindToAppSize` (mirror `app.size`),
`autoLayoutChildren` (default `true` — auto-marks children `isLeaf` so
Yoga measures their intrinsic bounds; re-applied for `Text`/`BitmapText`
children missing `isLeaf` even if they already carry other layout props,
`FlexContainer.ts:117-128`), `debug`. Interface surface is mostly
convenience accessors mirroring `@pixi/layout` style keys —
`gap`/`flexWrap`/`flexDirection`/`alignItems`/`justifyContent`/`size`/
`layoutWidth`/`layoutHeight`/`padding*`/`margin*` (`FlexContainer.ts:182-353`)
— each setter writes through `this.layout = {...}` and defers a
re-layout via `_updateLayout()`. `configure(styles)` batches several
layout keys into one deferred update. Emits `onLayoutComplete` (`Signal<()
=> void>`) after every `updateLayout()` pass (`FlexContainer.ts:56, 163`)
— `UICanvas` listens to this on every `FlexContainer` child added via
`addElement` to re-run its own layout (`UICanvas.ts:635-637`).

**Button** — `packages/core/src/ui/Button.ts:99`. Construct via
`this.add.button({...})` or `new Button(config)`. Required:
`textures.default`; optional `hover`/`active`/`disabled` textures,
`sounds` (`hover`/`out`/`down`/`click`, played via `app.audio.play`),
`actions` (per-event `{id, data}` dispatched through `app.action(id,
data)`, or a plain callback), `textLabel` (adds a `Text`/`HTMLText`/
`BitmapText` centered on the sprite via `addLabel`), `cursor`/
`disabledCursor`, `enabled` (default `true`). Signals: `onDown`, `onUp`,
`onUpOutside`, `onOver`, `onOut`, `onClick`, `onEnabled`, `onDisabled`,
`onKeyboardEvent`, `onDestroy` (`Button.ts:100-110`, `IButton.ts:30-49`).
Public state: `isDown`, `isOver`, `enabled` (get/set — swaps texture and
toggles `focusEnabled`), `view` (the underlying `Sprite`), `textLabel`
(getter). `addIsDownCallback(id, fn)`/`removeIsDownCallback(id)` register
a per-tick callback that fires every frame the button is held down
(`Button.ts:302-309, 455-472`).

**Input** — `packages/core/src/ui/Input.ts:278`. Constructed directly
(`new Input(options)`; there is **no** `this.add.input` factory entry —
`grep` of `mixins/factory/const.ts` confirms only `button`, `flexContainer`,
`uiCanvas`, and `toaster` are registered widget factories). It renders a
Pixi `Text` for display but drives a real hidden/near-invisible
`<input>` DOM element (`createDomElement`, `Input.ts:915-974`) appended to
`app.canvas.parentElement`, so native keyboard, IME, autofill, and mobile
soft-keyboard behavior all work — the Pixi text is a mirror, not the
input surface. Config (`InputOptions`, `Input.ts:159-197`): `value`,
`type` (`'text'|'password'|'number'|'email'|'tel'|'url'`), `pattern`/
`regex`/`maxLength` for validation, `bg`/`selection`/`caret`/`placeholder`
styling, `error` (alternate fill on failed validation), `focusOverlay`
(mobile/touch-only zoomed-in clone of the input rendered on `app.stage`
while focused — `_showCloneOverlay`/`_positionCloneOverlay`, `Input.ts:1152-1180`).
Signals: `onEnter`, `onChange`, `onError` — each carries `{value, input,
domElement}` (`InputDetail`, `Input.ts:203-207`). Interface: `value`
get/set (setter dispatches a synthetic DOM `input` event so listeners
fire consistently, `Input.ts:511-523`), `isValid`, `caretPosition`,
`selectionRect`, `focusIn()`/`focusOut()`, `resetBg()`.

**Joystick** — `packages/core/src/ui/Joystick.ts:42`. Constructed
directly (`new Joystick(settings)`; no factory entry either). `settings`:
optional `outer`/`inner` (`Sprite | Graphics`, default plain circles),
`outerScale`/`innerScale`, `threshold` (minimum normalized power before a
direction registers, default `0.01`). Signals: `onChange` (`{angle,
direction, power}`, emitted continuously while dragging past threshold),
`onStart`, `onEnd`, `onDestroy` (`Joystick.ts:11-26`). `direction` is a
`JoystickDirection` enum (8-way + `None`, from `../plugins`) computed by
`getDirection()`'s arctangent-sector logic (`Joystick.ts:268-287`).
Drags are tracked by the pointer's `pointerId` (`_pointerId`) so a second
finger can't hijack an in-progress drag; a `window`-level `pointerup`
listener (`Joystick.ts:259`) catches release even if it happens outside
the joystick's hit area.

**Popup** — `packages/core/src/ui/Popup.ts:80`. Not constructed directly
by app code — subclass it, export the class alongside a `definePopup({id,
...})` call (build-time discovery, same pattern as scenes/entities — see
`packages/core/src/plugins/PopupManagerPlugin.ts`), and drive it through
`app.popups.show(id, {data})` / `app.popups.hidePopup(id, data)`. Config
(`PopupConfig`, `Popup.ts:61-68`): `closeOnEscape`, `closeOnPointerDownOutside`,
`backing` (`boolean | {color, alpha}` — a full-screen dimmer `Sprite`,
click-to-close wired if `closeOnPointerDownOutside`), `actionContext`
(default `'popup'` — pushed onto `app.actionContext` in `beforeShow`,
restored in `restoreActionContext`). Lifecycle hooks a subclass overrides:
`initialize()`, `beforeShow()`/`show()`/`afterShow()`,
`beforeHide()`/`hide()`, `start()`/`end()`, `close()`. `view` is the
content container a subclass should add its own display tree to; `data`
is generic-typed (`Popup<T>`) and flows from the `show()` call site.
`afterShow()` auto-focuses `firstFocusableEntity` if the subclass sets it
(`Popup.ts:181-186`). Each popup gets its own focus layer keyed by `id`
(`app.focus.addFocusLayer`/`removeFocusLayer`, `Popup.ts:143, 147, 206`).

**Toast / Toaster** — `packages/core/src/ui/Toast.ts:143` /
`packages/core/src/ui/Toaster.ts:85`. Construct a `Toaster` via
`this.add.toaster(toasterConfig, defaultToastConfig)` (bespoke factory
entry, `mixins/factory/const.ts:293-295`) or `new Toaster(...)`. `show(config,
overrideDefaults?)` returns `Promise<Toast>`; evicts the oldest toast
first if `toasts.length >= maxToasts`. `ToasterConfig`
(`Toaster.ts:29-42`): `position` (a `UICanvasEdge`, reused from `UICanvas`
— toasts are positioned in raw screen coordinates, independent of any
actual `UICanvas` instance), `maxToasts`, `spacing`, `offset`,
`stackDirection`, `animationSpeed`. `ToastConfig` (`Toast.ts:49-104`)
covers message/type/duration/autoClose, background/shadow/corner-radius
styling, text alignment, and an optional close button
(`class`/`size`/`offset`/`position`, defaults to the real `Button`
class). Signals: `Toaster.onToastAdded`/`onToastRemoved`/
`onAllToastsRemoved`; `Toast.onToastClosed`. `hideAll()`/`removeAll()`
animate every toast out and clear the stack.

## Module map

| File | Responsibility | Key exports |
|---|---|---|
| `ui/UICanvas.ts` | Screen-frame layout: 9-region edge placement, safe-area-aware padding, free-floating anchored bindings, debug overlay. | `UICanvas`, `UICanvasEdge`, `UICanvasBindFn`, `computeEffectivePadding` |
| `ui/FlexContainer.ts` | Thin `@pixi/layout` wrapper: convenience getters/setters for flex style keys, auto-`isLeaf` for text measurement, debug overlay. | `FlexContainer`, `FlexContainerConfig`, `isText` |
| `ui/Button.ts` | Press/hover/click state machine over a `Sprite`, texture-per-state swapping, optional text label and sound/action hooks. | `Button`, `IButton`, `ButtonConfig` |
| `ui/Input.ts` | Pixi-rendered text field backed by a real hidden `<input>` DOM element; mobile focus-overlay clone, validation, caret/selection sync. | `Input`, `InputOptions`, `InputDetail` |
| `ui/Joystick.ts` | Drag-vector virtual joystick: angle/direction/power signal, 8-way direction sectoring. | `Joystick`, `IJoystick`, `JoystickSignalDetail` |
| `ui/Popup.ts` | Base class for modal/overlay content: backing dimmer, focus-layer + action-context lifecycle, show/hide hooks. | `Popup`, `IPopup`, `PopupConfig` |
| `ui/Toast.ts` | Single notification card: layout, GSAP show/hide timelines, optional close button. | `Toast`, `ToastConfig`, `defaultToastConfig` |
| `ui/Toaster.ts` | Queue/stack manager for `Toast` instances: eviction, GSAP-animated repositioning, screen-edge placement. | `Toaster`, `ToasterConfig` |
| `ui/index.ts` | Barrel re-exporting all of the above (external-consumer surface, per the mixins-and-factory cycle rules — internal display/ui code should still prefer concrete imports). | re-exports |
| `ui/UICanvas.test.ts` | Behavioral evidence for `computeEffectivePadding` only (padding + safe area, non-compounding on repeated calls) — stubs `Application` entirely, no display-tree assertions. | — |
| `ui/Button.test.ts` | Behavioral evidence for the press-state machine: mid-press disable/re-enable, `pointerupoutside` while disabled, destroy cleanup, synthetic keyboard activation (no `pointerId`). Builds a `Button` via `Object.create(Button.prototype)` and hand-inits only the fields the handlers touch — bypasses the real mixin constructor chain entirely. | — |

## Layout model

Both `UICanvas` and `FlexContainer` are wrappers around **`@pixi/layout`**
(a Yoga/flexbox binding registered on `Container.layout`), not a
hand-rolled positioning system. Setting `.layout = {...}` merges style
patches; `app.renderer.layout.update(node)` (called from each class's
`updateLayout()`) is what actually re-runs Yoga and writes
`node.layout.computedLayout` (`{left, top, width, height}`).

**UICanvas's frame** is three stacked `FlexContainer` rows
(`topRow`/`middleRow`/`bottomRow`, `flexDirection: column,
justifyContent: space-between` on the canvas itself,
`UICanvas.ts:170-176`), each row `flexDirection: row` with
`justifyContent: space-between`. Each row is split into three position
containers (left/center/right, or their row-appropriate
`justifyContent`/`alignItems` combination — see `_initializeLayout`,
`UICanvas.ts:195-360`) giving nine total regions. `UICanvasEdge` strings
map many-to-one onto these nine containers (e.g. `'top'`, `'top center'`
both resolve to `topCenter`; `'left'`, `'left center'` both resolve to
`middleLeft` — full map at `UICanvas.ts:335-359`). `addElement` looks up
the target container and calls `container.add.existing(child)`.

**Effective padding** is `computeEffectivePadding(config.padding,
useSafeArea ? app.safeArea : zeroPadding)` (`UICanvas.ts:107-114`,
pure function, covered by `UICanvas.test.ts`) — recomputed on every
`resize()` and every `padding` setter call rather than cached, specifically
so it never compounds (adding the safe area to an already-safe-area-adjusted
number). `app.safeArea` itself comes from `ResizerPlugin`'s CSS
`env(safe-area-inset-*)` probe (`packages/core/src/plugins/ResizerPlugin.ts`),
re-exposed as `Application.safeArea`.

**`useAppSize`** binds `UICanvas.size` to `app.size` and re-centers the
canvas (`position.set(-size.width/2, -size.height/2)`) on every
`app.onResize` signal (`UICanvas.ts:532-541`) — the canvas's own origin is
its center, not its top-left, so screen-edge alignment and centered
content both fall out of the same coordinate system.

**`bindElement`** is the escape hatch for anything that must track a
laid-out anchor's box without joining the flex flow (tooltips, popovers,
context menus): the bound child is parented with `layout = false` and
repositioned every `updateLayout()` pass by summing `computedLayout`
offsets from the anchor up to the canvas (`_anchorRect`, `UICanvas.ts:605-621`)
— the same math the debug overlay uses to draw region boxes.

**`autoLayoutChildren`** (default `true` on both classes) exists because
Yoga can't measure a `Text`/`BitmapText`'s intrinsic size without an
explicit `isLeaf` flag; both classes set that flag (and default
`width/height: 'auto'`) the first time a child is added, unless it
already declared its own layout.

## Seams & extension points

- **New `UICanvasEdge` alias** — extend the `UICanvasEdge` union and the
  `_positionContainers` map in `_initializeLayout` (`UICanvas.ts:334-359`);
  there's no dynamic registration, it's a fixed nine-container grid.
- **Anchored floating UI** (tooltips, dropdowns, context menus) —
  `bindElement`/`unbindElement` is the sanctioned seam; don't reach for
  `setChildIndex`/raw `addChild` (see Invariants).
- **Toast visuals** — `ToastConfig.class` lets a caller swap in an
  entirely custom `Toast` subclass per call to `Toaster.show()`; the
  close button similarly accepts `closeButton.class` to swap in a custom
  `Button` subclass.
- **Popup discovery** — the seam is `definePopup({id, ...})` +
  default-exporting the class, mirroring scene/entity discovery; a popup
  never gets picked up by `app.popups.show(id)` without it (see
  `PopupManagerPlugin._registerDiscoveredPopups`).
- **Input mobile UX** — `focusOverlay.activeFilter` (`boolean |
  (() => boolean) | ('mobile'|'touch'|'desktop')[]`) is the seam for
  deciding when the zoomed clone-overlay behavior kicks in, without
  touching the clone machinery itself.
- **Joystick visuals** — pass `settings.outer`/`inner` as any
  `Sprite`/`Graphics` to fully replace the default circles; `threshold`
  is the seam for dead-zone tuning.

## Invariants & gotchas

- **`UICanvas.setChildIndex` throws — no sanctioned z-order path exists.**
  `UICanvas` overrides `addChildAt` to unconditionally throw
  (`UICanvas.ts:483-488`, no `_disableAddChildError` escape hatch unlike
  `addChild`/`removeChild`). But `setChildIndex` (`UICanvas.ts:493-496`)
  just calls `super.setChildIndex(child, index)`, and Pixi's own
  `Container` mixin implementation of `setChildIndex` (`eventemitter3`-style
  `childrenHelperMixin.mjs` in `pixi.js`) is implemented as `this.getChildIndex(child);
  this.addChildAt(child, index);` — since `this` resolves dynamically to
  the `UICanvas` instance, that call lands on `UICanvas`'s own
  `addChildAt` override and throws immediately, every time, regardless of
  arguments. There is currently no way to reorder a `UICanvas`'s direct
  children (the debug graphics/labels use `super.addChild` directly under
  `_disableAddChildError = true` to sidestep this for their own internal
  z-order needs — `UICanvas.ts:726-741, 799-806`). A fix would need
  either a guarded internal path (mirroring `_disableAddChildError`) or a
  dedicated `bringToFront`-style method that manipulates
  `settingsMap`/`_childMap` and the underlying position container
  directly.
- **`useLayout` must be `true` in app config** — both `UICanvas` and
  `FlexContainer` throw synchronously in their constructors otherwise
  (`UICanvas.ts:142-144`, `FlexContainer.ts:64-66`).
- **Bound elements must not be `@pixi/layout` nodes.** Per the doc
  comment at `UICanvas.ts:571-573`: re-enabling `.layout` on a
  `bindElement`-attached child makes it a direct layout-enabled child of
  the canvas, which joins the column flow and bottom-docks + reflows the
  whole canvas — position its subtree manually instead.
- **Direct `addChild`/`addChildAt`/`removeChild` on a `UICanvas` throw**
  by design, guiding callers to `addElement`/`removeElement`/`bindElement`
  (`UICanvas.ts:483-530`). The one exception is internal debug-graphics
  bookkeeping, which flips `_disableAddChildError` around a `super.addChild` call.
- **`Button._doAction` assumes `action.data` exists even though the type
  says it's optional** (`Button.ts:444-453` vs `ButtonAction` at
  `Button.ts:24`, `data?: any`). `if (!action.data.button) { action.data.button
  = this; }` throws `Cannot read properties of undefined` if a caller
  configures `actions: { click: { id: 'foo' } }` without a `data` field —
  a perfectly valid value per `ButtonActionOrCallback`'s own type.
  Work around it by always passing `data: {}` alongside `id` in button
  action configs until this is fixed upstream.
- **Popup lifecycle hooks are driven by `PopupManagerPlugin`, not by the
  constructor.** Constructing a `Popup` subclass directly (bypassing
  `app.popups.show`) skips `beforeShow`/`afterShow`/focus-layer wiring —
  always go through the manager.
- **`Input` has no factory method; `Joystick` has no factory method.**
  Both are constructed directly and attached via `this.add.existing(...)`
  — don't look for `this.add.input`/`this.add.joystick`.
- **`Joystick`'s pointer handlers rely on `eventemitter3`'s default
  listener context** (the emitter itself), not `bindAllMethods` — unlike
  every other widget here, `Joystick`'s constructor never calls
  `bindAllMethods(this)`. Works today because Pixi's `Container.on(event,
  fn)` defaults the listener's `this` to the emitter when no context is
  passed, but it's a different, implicit mechanism than the rest of the
  module relies on.

## Recipes

**HUD anchored to screen edges:**

```ts
const hud = this.add.uiCanvas({ useAppSize: true, useSafeArea: true });
const scoreLabel = hud.addElement(this.make.text({ text: 'Score: 0' }), { align: 'top left' });
const pauseButton = hud.addElement(this.make.button({ textures: { default: 'pause' } }), {
  align: 'top right',
  padding: { top: 8, right: 8 },
});
```

Regions auto-reflow on resize and fold in `app.safeArea` automatically —
no manual `app.onResize` handling needed for basic edge-docked chrome.

**Tooltip anchored to a laid-out element (bypassing the flex flow):**

```ts
const anchor = hud.addElement(this.make.button({ textures: { default: 'info' } }), { align: 'top center' });
const tooltip = this.make.container(); // NOT layout-enabled
hud.bindElement(tooltip, anchor, (rect, child) => {
  child.position.set(rect.left + rect.width / 2, rect.top + rect.height + 4);
});
// later: hud.unbindElement(tooltip);
```

**Custom popup:**

```ts
// popups/ConfirmPopup.ts
export const popup = definePopup({ id: 'confirm', active: true });

export class ConfirmPopup extends Popup<{ message: string }> {
  initialize() {
    const label = this.view.add.text({ text: '' });
    this.firstFocusableEntity = /* a Focusable button */;
  }
  beforeShow() {
    super.beforeShow();
    (this.view.children[0] as Text).text = this.data.message;
  }
}

// call site
await app.popups.show('confirm', { data: { message: 'Are you sure?' } });
```

**Toast notification:**

```ts
const toaster = this.add.toaster({ position: 'bottom right', maxToasts: 3 });
await toaster.show({ message: 'Saved!', type: 'success', closeButton: { show: true } });
```

**FlexContainer bound to another container's size:**

```ts
const panel = this.add.flexContainer({
  bindTo: someOtherContainer, // mirrors its width/height on every 'layout' event
  flexDirection: 'column',
  gap: 8,
});
```
