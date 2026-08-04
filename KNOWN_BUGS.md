# Known Bugs — packages/core

The 2026-08-02 audit backlog (≈50 defects across High/Medium/Low) and the follow-up sweeps are **fully fixed** — every fix test-first in its own conventional commit. CI runs lint (`--max-warnings 0`), typecheck, 371 tests, real builds, and a blocking headless boot test on every push and PR.

Current open items (observations from the 2026-08-04 display-lifecycle unification; none urgent):

| Location | Note |
|---|---|
| `packages/core/src/display/ParticleContainer.ts` | Caper's per-frame `update()` hook shadows Pixi's own `ParticleContainer.update()` (which flags particle buffers for re-upload). Pre-existing since the class was written; the particles demo works because Pixi flags via other paths, but calling `super.update()` semantics deserve a design look. |
| `packages/core/src/ui/UICanvas.ts` | Its private `_added` shadows the lifecycle mixin's private `_added`, so UICanvas never receives `autoResize`/`autoUpdate` wiring and registers its own `added` listener alongside the mixin's. Works today (UICanvas manages its own resize), but the double registration is subtle. |
| `packages/core/src/mixins/lifecycle.ts` | `?? 'highest'` fallback on resize priority is dead code (merged config always defines it); carried over verbatim from `Container`. |

Process: when a defect is found, add it here with severity + file:line; when fixed, remove it and update any matching wiki gotcha.
