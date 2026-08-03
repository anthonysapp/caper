# Caper Core Wiki

A map of `packages/core` — the `@caperjs/core` framework. Written for anyone (human or AI session) who needs to extend or debug the framework without re-reading the source. Pages use the deep-module vocabulary: **module** (interface + implementation), **interface** (everything a caller must know: signatures, invariants, ordering, error modes), **seam** (where behavior can be swapped without editing), **adapter** (a concrete thing filling a seam).

Start with [Architecture Overview](architecture-overview.md) if you're new. Terms live in the [Glossary](glossary.md). Known defects live in [/KNOWN_BUGS.md](../../KNOWN_BUGS.md) at the repo root.

## Pages

| Page | Covers | Source |
|---|---|---|
| [Architecture Overview](architecture-overview.md) | How the layers fit together, bootstrap flow, design disciplines | — |
| [Core: Application & Bootstrap](core-application.md) | `create()`, `Application`, config, registries, `window.Caper` / automation bridge | `src/core/` |
| [Display: Container, Scene & Entities](display.md) | `Container` base, `Scene`/`Entity`, `Camera`, scene transitions | `src/display/` |
| [Mixins & the Factory](mixins-and-factory.md) | `this.add`/`this.make`, mixin stack, the import-cycle discipline | `src/mixins/`, `src/importOrder.*.test.ts` |
| [UI: UICanvas, FlexContainer & Widgets](ui.md) | 9-region screen frame, flex layout, Button/Input/Joystick/Popup/Toast | `src/ui/` |
| [Plugins: Contract & Lifecycle](plugins-architecture.md) | `Plugin` base class, registration paths, default plugins, publishing surfaces | `src/plugins/Plugin.ts`, `defaults.ts` |
| [Plugins: Built-in Catalog](plugins-catalog.md) | Every single-file plugin: Assets, SceneManager, Resizer, GSAP, Timer, … | `src/plugins/*.ts` |
| [Plugins: Directory Subsystems](plugins-subsystems.md) | Actions, Audio, Breakpoints, Captions, Focus, Gesture, Input, Spine | `src/plugins/*/` |
| [Signals, Store & Shared Types](signals-and-store.md) | typed-signals wrapper, storage-capable plugins, `AppTypeOverrides` | `src/signals/`, `src/store/`, `src/types/` |
| [Utils & Public Barrel](utils.md) | `define*` markers, `bindAllMethods`, helper reference, `src/index.ts` exports | `src/utils/`, `src/index.ts` |
| [Build: Vite Preset & Asset Pipeline](build-pipeline.md) | `caper()` preset, discovery/virtual modules, SSR stub, assetpack, PWA | `build/` |
| [CLI, Templates & Package Surface](cli-and-package.md) | `create-caper`, `caper add`, templates, exports map, peer deps | `cli/`, `templates/`, `package.json` |

## Maintaining this wiki

- When a subsystem changes shape (new seam, new lifecycle step, renamed public API), update its page in the same PR.
- Line-number references (`path:line`) drift; treat them as "near here," and refresh them when you touch a page.
- New pages: follow the shared skeleton (Purpose / Interface / Module map / Seams / Invariants & gotchas / Recipes) and add a row to the table above.
- Fixed bugs: remove the entry from `KNOWN_BUGS.md` and any matching gotcha on the subsystem page.

*Generated 2026-08-02 from a full read of `packages/core` at commit `1f869eba`.*
