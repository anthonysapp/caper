# Caper Framework Audit — DX & Long-Term Viability

## Context

Game-designer/dev audit of the PixiJS v8 framework focused on **developer experience** and **viability** — is this worth continuing to invest in versus Phaser, bare PixiJS, or Excalibur? Findings from a deep read of [packages/core](../packages/core/), [packages/plugins](../packages/plugin-), and [packages/storage-adapters](../packages/storage-adapters/).

Bottom line up front: **The framework core is genuinely good** — more opinionated and more thoughtfully structured than bare PixiJS, with a cleaner mental model than Phaser in several areas. **The plugin/adapter layer is where things fall apart** and is currently the strongest argument against long-term viability.

---

## What Works (keep doing this)

### Core (`packages/core/src/core`)
- **Staged bootstrap** in [Application.ts:594–684](../packages/core/src/core/Application.ts) — boot → assets → pixi init → plugins → storage → setup, with named hooks (`requiredAssetsLoaded`, `setup`, `preInitialize`, `postInitialize`). A real DX win over rolling your own.
- **Single `create()` entry** in [create.ts:109–169](../packages/core/src/core/create.ts) handles DOM mount, WebGL check, and error bridging. Sensible defaults in [config.ts:57–111](../packages/core/src/core/config.ts).
- **Registries pattern** in [registries.ts](../packages/core/src/core/registries.ts) — plugins declare `coreFunctions` and `coreSignals` on registration instead of mutating globals. Clean.
- **Dynamic plugin loading** in [Application.ts:715–729](../packages/core/src/core/Application.ts) lets games skip Spine/Layout/Voiceover to shrink bundles.

### Scenes
- Six transition modes (`exitEnter`, `enterBehind`, `transitionExitEnter`, …) cover real UX needs.
- Declarative `SceneAssets` (preload + background + autoUnload) removes a whole class of lifecycle bugs.
- Hash-based scene routing for dev is a small but excellent DX touch.

### Display & UI
- Mixin stack (`PIXIContainer → Factory → WithSignals → Animated → Container`) is layered cleanly — each mixin has one job.
- `container.make.sprite()` / `container.add.text()` factory is much nicer than `new Sprite()` chains.
- Automatic GSAP context per container + cleanup on destroy.

### Signals & Store
- Using `typed-signals` directly with `connectOnce` / `connectNTimes` wrappers is the right call — no home-grown event system.
- `Store` with adapter pattern is well-designed as an *interface*.

### Build Tooling
- Exporting `caper/config/vite` and `caper/config/assetpack` so games can `import + extend` is genuinely excellent and rare.
- **Auto-generated asset type declarations** in [config/vite.mjs:34–160](../packages/core/config/vite.mjs) — `caper-assets.d.ts` with all aliases is a killer feature and worth marketing harder.
- Interactive CLI scaffolder via `@clack/prompts` produces a playable starter.

### Framework bundle size
- ~320KB unminified for the framework output — reasonable. Phaser is ~1.5MB.

---

## What Needs Work (in order of impact)

### 1. Zero test coverage — this is the #1 viability problem
`find packages -name "*.test.ts"` returns nothing across framework, plugins, and adapters. Every package ships `"test": "echo \"Error: no test specified\""`. For a framework asking others to build production games on it, this is the single biggest signal against long-term viability.

**Minimum**: Vitest on `Plugin`, `Store`, `Scene`, `SceneManagerPlugin`, `SignalRegistry`, and the two storage adapters.

### 2. No error recovery anywhere
- Plugin `initialize()` failures silently brick the app. There's no try/catch around the plugin init loop in [Application.ts](../packages/core/src/core/Application.ts) and [create.ts addErrorHandler](../packages/core/src/core/create.ts) only catches *runtime* errors.
- Scene `enter()` throws don't restore the previous scene.
- `Store.save()` is fire-and-forget with no error signal — data loss on flaky connections is invisible.

### 3. Plugin contract is incoherent (the big one)
The framework advertises a plugin system, but plugins don't share a real contract beyond `extends Plugin`. This surfaces worst in physics:

- [physics-crunch](../packages/plugin-crunch/) (719 LOC): high-level `createActor/Solid/Sensor`, collision layers, well-documented. **The only real engine.**
- [physics-matter](../packages/plugin-physics-matter/) (94 LOC): thin holder that exposes `System` and tells you to go read Matter.js docs. Adds nothing.
- [physics-snap](../packages/plugin-physics-snap/) (~670 LOC): custom engine with spatial hash — undocumented, unclear when to pick.

**Swapping physics engines requires rewriting gameplay code** — that's catastrophic lock-in and the exact opposite of what a plugin system should deliver.

### 4. Storage adapters don't share a real contract either
- [firebase](../packages/storage-adapters/firebase/) (362 LOC, full CRUD + query builder, generics, solid JSDoc) — **production quality**.
- [supabase](../packages/storage-adapters/supabase/) (148 LOC, basic CRUD only, no query story).

They both claim to implement `StorageAdapter` but have divergent `save()`/`load()` shapes, so swapping providers is again a rewrite.

### 5. Plugin scaffolder is broken
[scripts/create-plugin.mjs](../scripts/create-plugin.mjs) generates a `Plugin.template.ts` whose imports (`IPlugin`, `IApplication`) are undefined in the emitted file — the generated code **does not compile**. First experience of "let me make a custom plugin" is a compile error.

### 6. Everything else (smaller)
- **No plugin dependency declaration** — load PopupManager before SceneManager and things break silently.
- **No gamepad / analog input** in the built-in input plugin.
- **SceneManagerPlugin queue** has ~6 `TODO` comments around halting, progress, and loading behaviors.
- **Audio plugin** has an unresolved `console.assert` TODO that fires during normal loading.
- **Rive plugin** has `// TODO: investigate why cleanup causes browser freeze` — shipping bug masquerading as a comment.
- **AppTypeOverrides** lets wrong scene/plugin IDs compile and crash at runtime.
- **JSDoc coverage ~3%** across 22.8K LOC.
- **Maintenance signal**: plugin commits since June 2025 are version bumps + one GSAP upgrade.

---

## Viability: Is It Worth Pursuing?

### Comparison

| | caper | Phaser | Bare Pixi | Excalibur |
|---|---|---|---|---|
| Opinionated scene/plugin model | ✅ clean | ✅ heavy | ❌ DIY | ✅ clean |
| Bundle size | ~320KB | ~1.5MB | ~300KB | ~800KB |
| Auto asset types | ✅ unique | ❌ | ❌ | ❌ |
| Reusable Vite/assetpack config export | ✅ unique | ❌ | ❌ | ❌ |
| Pixi v8 native | ✅ | ❌ (Pixi v7 era) | ✅ | ❌ |
| Tests / CI story | ❌ none | ✅ | N/A | ✅ |
| Plugin ecosystem | 🟡 thin, mostly one author | ✅ large | N/A | 🟡 medium |
| Physics | 3 competing | 2 positioned | DIY | 1 |
| Docs | 🟡 partial | ✅ | ✅ (Pixi only) | ✅ |

### Where caper genuinely wins
1. **PixiJS v8 native + opinionated structure** — this is a real gap. Phaser is not Pixi v8; bare Pixi gives you nothing.
2. **Auto asset type generation** — nobody else does this cleanly.
3. **Exported build config** — same, a huge DX win that most frameworks ignore.
4. **Cleaner mental model than Phaser** in scenes, signals, and the mixin stack.

### Where it loses today
1. **Trust** — no tests, silent failures, broken plugin scaffolder.
2. **Ecosystem** — plugins are mostly thin one-author wrappers with 3 competing physics engines.
3. **Docs + onboarding** — the framework has more going for it than a new user discovers in the first hour.

### Verdict

**Yes — worth pursuing, but narrow the scope and harden the core.** The framework has two or three genuinely novel DX wins that Phaser and Excalibur don't have, and that's enough of a niche to justify existing. See [fork-plan.md](./fork-plan.md) for the narrowing plan.
