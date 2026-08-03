# Utils & Public Barrel
> Part of the Caper core wiki. Index: [Home](Home.md)

## Purpose

`packages/core/src/utils/` is the framework's collection of small, mostly-stateless
modules: math/geometry helpers, type-only plumbing, a couple of runtime seams
(`define.ts`, `framework.ts`, `env.ts`, `vite.ts`) that other subsystems depend on,
and a console/logging module. Nothing here holds a reference to the `Application`
instance — these are leaf modules, safe to import from anywhere (core, mixins, UI,
plugins) without creating cycles. `packages/core/src/index.ts` is the npm package's
public barrel; it re-exports `utils/index.ts` wholesale, so anything exported from a
file under `utils/` (and listed in `utils/index.ts`) is public API surface for
`@caperjs/core` consumers. `webgl-check.ts`, `version.ts`, and `hello.ts` sit next to
`utils/` at `src/` root and are bootstrap-adjacent, not general-purpose helpers.

## High-value modules

Per-module interface descriptions for the utils that carry architectural weight —
everything else is a flat helper covered in the reference table.

**`utils/define.ts`** — the `define*` discovery markers. `defineScene` /
`definePlugin` / `definePopup` / `defineEntity` / `defineUI` (packages/core/src/utils/define.ts:102-120)
are typed identity functions: `(config) => config`, no runtime effect. Their entire
job is to give scene/plugin/popup/entity/UI config files strong type inference
without forcing an author to extend a base class. The companion `*ConfigInput`
interfaces (define.ts:36-100) are the canonical shape the Vite config-scanner plugin
reads back out via AST — it parses the object literal argument the same way it reads
a bare `export const config = {...}`, so the function call adds zero build cost.
`PluginConfigInput.requires` (define.ts:56-77) is the input to the plugin topo-sort
described in the same file's comments.

**`utils/bind.ts`** — `bindMethods` / `bindAllMethods` / `checkAndInvokeMethod`
(packages/core/src/utils/bind.ts). `bindAllMethods` (bind.ts:63-67) walks the
prototype chain via `getInstanceMethodNames` (bind.ts:26-55) binding every method it
finds, and **stops** at the first class whose constructor has its own
`__caper_method_binding_root` static property (bind.ts:47). This is the seam that
lets a Caper `Container` bind all of its own + intermediate-class methods without
walking into PixiJS's `Container` base and binding/copying ~70 foreign methods onto
every display object. The marker **must be declared `static`** — an instance field
never lands on the constructor, so `hasOwnProperty(prototype.constructor, ...)`
silently fails to find it and the walk runs all the way to `Object.prototype`.
packages/core/src/utils/bind.test.ts is a regression test that pins this exact
failure mode (`BrokenRoot`/`BrokenLeaf`, bind.test.ts:43-56, 85-91) — read it before
touching `getInstanceMethodNames`.

**`utils/framework.ts`** — `getDynamicModuleFromImportListItem` (framework.ts:22-45).
The interface every dynamic-import seam in the framework (scenes, plugins, popups,
entities, UI) funnels through: given an `ImportListItem` (types.ts:60-68) whose
`module` field may be a `Promise`, a lazy `() => Promise<Module>` thunk, or an
already-resolved class reference, it normalizes all three into a single constructor.
`isClass` (framework.ts:9-11) distinguishes "already a class" from "a factory
function to call" by regexing `Function.prototype.toString()` for a `class ` prefix
— this is the one place in `utils/` doing feature-detection instead of a type guard.

**`utils/env.ts`** — three constants: `env`, `isDev`, `isProduction`
(packages/core/src/utils/env.ts:1-3), derived from `process.env.NODE_ENV`. This
relies on Vite's built-in static replacement of `process.env.NODE_ENV` in client
bundles (Vite does this unconditionally, independent of any user `define` config);
it is not guarded the way the SSR-sensitive browser globals are elsewhere in the
framework (see CLAUDE.md's SSR section). Safe under `vite build`/`vite dev` and under
Node/SSR (where `process` is real); would throw `ReferenceError: process is not
defined` if this module were ever evaluated by a non-Vite bundler in a raw browser
context.

**`utils/vite.ts`** — `triggerViteError` (vite.ts:26-41). The seam that lets runtime
code (notably `promise/Queue.ts`, see below) surface an error in Vite's dev-mode
error overlay via the HMR channel (`import.meta.hot.send('caper:show-error', ...)`),
falling back to `Logger.error` when `import.meta.hot` isn't available or the build is
production (`import.meta.env.DEV` guard, vite.ts:29). No-ops safely outside dev.

**`utils/events.ts`** — `CaperEvent` enum + `CaperProgressEvent` type
(packages/core/src/utils/events.ts). The vocabulary for the asset-loading
`CustomEvent` names dispatched on `window`/document during required/background asset
loading (`REQUIRED_ASSETS_START/PROGRESS/COMPLETE`, `ASSETS_START/PROGRESS/COMPLETE`).
Anything listening for framework asset-progress from outside the app (automation
bridge, a loading-screen widget) keys off these string constants rather than magic
strings.

**`utils/console/Logger.ts`** — `Logger` (packages/core/src/utils/console/Logger.ts).
A static-only class (private constructor) with a module-level `LoggerMode`
(`'development' | 'default' | 'disabled'`) that every other module's diagnostic
output — `Queue`'s error path, lifecycle logging — routes through. `Logger.error`
always uses `console.error` uncollapsed (Logger.ts:74-78) specifically so DevTools
keeps a clickable, source-mapped stack; `log`/`warn` collapse into a `console.group`
in `'development'` mode (Logger.ts:79-85).

## Reference table

Every other file under `utils/`, one line each.

| File | Offers |
|---|---|
| `utils/array.ts` | `shuffle`, `getRandomElement` — array helpers built on `random.ts`'s `intBetween`. |
| `utils/canvas.ts` | `destroyCanvas` — releases a WebGL/2D canvas context and detaches it from the DOM. |
| `utils/color.ts` | `Color` class (RGB + named statics), `toHex`/`toRgb`, `lerp`/`lerpHex` color interpolation. |
| `utils/console/index.ts` | Barrel re-exporting `Logger`. |
| `utils/debug.ts` | `DebugColors`/`DebugAlpha` palette, `createDebugGraphics`/`createDebugLabel` factories, and a module-level debug-item registry (`registerDebug`/`unregisterDebug`/`getDebugRegistry`) for a future debug panel. |
| `utils/map.ts` | `getPreviousMapEntry` / `getNextMapEntry` / `getFirstMapEntry` / `getLastMapEntry` — positional lookups `Map` doesn't provide natively. |
| `utils/math.ts` | `clamp`, `lerp`. |
| `utils/misc.ts` | `resolveSizeLike` (normalizes `SizeLike` → `{width,height}`), `debounce`. |
| `utils/number.ts` | `getZeroPaddedNumber`. |
| `utils/object.ts` | `pluck`, `omitKeys`, `deepMerge` (plain-object recursive merge). |
| `utils/padding.ts` | `resolvePadding` (0–1 treated as a percentage of `size`), `ensurePadding` (normalizes number/array/`{x,y}`/`Padding` → `Padding`). |
| `utils/pixi.ts` | Pixi display-tree helpers: `reParent` (preserves world position), `objectDiagonal`, `sendToFront`/`sendToBack`, shape offsetting, `scaleToWidth`/`scaleToHeight`/`scaleToSize`. |
| `utils/platform.ts` | `isRetina`, `isTouch`, `isMobile`/`isAndroid`/`isIos` (wraps `pixi.js`'s `isMobile`). |
| `utils/point.ts` | Point-like vector math: `add`/`subtract`/`multiply`/`distance`/`magnitude`, plus `resolvePointLike` (overloaded to return a plain `{x,y}` or a Pixi `Point`). |
| `utils/promise/Queue.ts` | `Queue<T>` — sequential promise runner with pause/resume/cancel; on a step's rejection it logs, calls `triggerViteError`, drops that step, and continues. |
| `utils/promise/functions.ts` | `delay`/`wait`, `isPromise`. |
| `utils/promise/index.ts` | Barrel for `functions.ts` + `Queue.ts`. |
| `utils/random.ts` | `randomUUID` (native `crypto.randomUUID` with a manual v4 fallback), `floatBetween`/`intBetween` (+ `*Point` variants). |
| `utils/rect.ts` | `offset`, `center`, `scale`, `size` — in-place `Rectangle` helpers. |
| `utils/set.ts` | `filterSet`, `firstFromSet`, `lastFromSet`. |
| `utils/string.ts` | `capitalize`, `capitalizeWords`. |
| `utils/text.ts` | `getNearestCharacterIndex` — hit-tests a pointer event against a Pixi `Text`'s measured glyph metrics. |
| `utils/typefilters.ts` | Type-level string-literal filters (`FilterCleanAssetNames`, `FilterSpineAssetNames`, `FilterBitmapFontNames`) used only by `types.ts`'s asset alias types; **not** re-exported from `utils/index.ts`. |
| `utils/types.ts` | The framework's shared type vocabulary: `Constructor`, `Size`/`PointLike`/`Padding`/`RectLike`, `ImportListItem`/`ImportList` (the runtime shape `framework.ts` consumes), asset-loading option types, and the `EntityId`/`UIId`/`PopupId`/`SceneId` + `*Ctor`/`*Props`/`*Instance` families that key off the build-generated `AppTypeOverrides` augmentation. |
| `utils/web.ts` | `getOrientation` (`'portrait' \| 'landscape'` from `window.innerWidth/innerHeight`). |

## The public barrel

`packages/core/src/index.ts` is the package's sole public entry (the `main`/`exports`
target consumers import as `@caperjs/core`). It is a flat set of `export *` statements:

```
core, core/Application, display, mixins, plugins, signals, store, ui, utils, hello, version
```

Two things worth knowing:

- **`core/Application` is exported separately from `core`.** `core/index.ts` does not
  itself re-export `Application` — that split exists to defuse a mixins-factory/ui
  barrel import cycle (see commit `580fc080`, "defuse mixins-factory/ui barrel import
  cycle"). Adding `Application` back into `core/index.ts`'s barrel would likely
  reintroduce that cycle; if `Application` needs new named exports, add them to
  `core/Application.ts` and let this line pick them up, don't fold the re-export back
  into `./core`.
- **`utils/index.ts` decides what's public, not `utils/`'s file list.** A file living
  under `utils/` is invisible to consumers unless `utils/index.ts` has an
  `export * from './<file>'` line for it. `typefilters.ts` is the one file in this
  directory deliberately left out (it's an internal dependency of `types.ts`'s asset
  alias types, not a standalone public helper).
- `webgl-check.ts`, `version.ts`, and `hello.ts` live at `src/` root, not under
  `utils/`. `version.ts` and `hello.ts` are re-exported directly from `index.ts`
  (`sayHello()` and the `version`/`pixiVersion` constants are public). `webgl-check.ts`'s
  `checkWebGL()` is **not** re-exported anywhere — it's called once, internally, from
  `core/create.ts:151` during app bootstrap. Treat it as bootstrap-private unless a
  concrete public use case shows up.

## Invariants & gotchas

- **`__caper_method_binding_root` must be `static`.** See `utils/bind.ts` above and
  `utils/bind.test.ts` — a non-static marker silently disables the stop condition and
  `bindAllMethods` walks (and rebinds/copies) the entire foreign base class.
- **`env.ts` assumes a Vite pipeline.** `isDev`/`isProduction`/`env` read
  `process.env.NODE_ENV` with no `typeof process` guard, unlike the browser-global
  guards this repo uses elsewhere (see CLAUDE.md's "SSR / Node evaluation" section).
  It works because Vite always statically replaces `process.env.NODE_ENV` in client
  output and because `process` is real under Node/SSR — but it would break if
  imported by a non-Vite consumer bundling for a bare browser target.
- **`platform.ts` guards `window` access, `web.ts` doesn't.** `isRetina`/`isTouch`
  (platform.ts:9-24) check `typeof window !== 'undefined'` before touching it, so
  they're SSR-safe with a `false` fallback. `getOrientation` (web.ts:3-7) reads
  `window.innerWidth`/`innerHeight` unconditionally and will throw under SSR/Node.
  Don't call it from any module that might be `ssrLoadModule`'d (see CLAUDE.md's note
  on `caperConfig.mjs`).
- **`Queue`'s error handling is lossy by design.** On a step's rejection,
  `_next()` (promise/Queue.ts:97-124) logs the error, forwards it to
  `triggerViteError`, **removes that step from the queue**, and keeps going — it does
  not reject the queue or stop. Callers that need "fail the whole batch on first
  error" semantics should not reach for `Queue`.
- **`typefilters.ts` is intentionally unexported.** Don't add it to `utils/index.ts`
  "for completeness" — it's type-level machinery scoped to `types.ts`'s asset-name
  filtering, not a general-purpose helper.

## Recipes

- **Adding a new general-purpose helper.** Put it in the most specific existing file
  by subject (`math.ts` for numeric, `point.ts` for vector ops, `object.ts` for plain
  objects, etc.) rather than a new file, unless it's a genuinely new subject — this
  directory already has 25+ single-purpose files and `utils/index.ts` re-exports all
  of them flatly, so a new file means a new barrel line, not just a new function.
- **Exposing a new public export.** Add the function/class to its `utils/*.ts` file,
  confirm `utils/index.ts` has `export * from './<file>'` for that file (add it if the
  file is new), and that's sufficient — `src/index.ts`'s `export * from './utils'`
  picks it up automatically. No changes needed to `src/index.ts` itself unless the
  new thing lives outside `utils/` entirely (like `hello.ts`/`version.ts` do), in
  which case add an explicit `export * from './<file>'` line there.
- **Adding a new `define*` discovery marker** (e.g. for a future config-scanned
  primitive). Follow the pattern in `utils/define.ts`: a `*ConfigInput` interface with
  a required `id`, optional `active`/`dynamic`, and a typed-identity `defineX<T
  extends XConfigInput>(config: T): T` function. The vite-plugin-caper-config scanner
  needs to read the object literal via AST the same way it reads the others — check
  that plugin's scanning logic before assuming a new marker "just works."
- **Debugging a binding issue in a `Container` subclass.** Start at
  `utils/bind.test.ts` — it documents the exact failure mode (non-static root marker)
  most likely to bite a new base class that calls `bindAllMethods`.
