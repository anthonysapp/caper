# Known Bugs — packages/core

**No known open defects.** The 2026-08-02 audit backlog (≈50 defects) and every follow-up finding through 2026-08-04 are fixed — each test-first in its own conventional commit. (One reported item — a UICanvas lifecycle double-registration — was investigated and disproved: UICanvas composes `WithSignals(Factory())` directly and never touches the lifecycle mixin.)

CI guards the state on every push and PR: lint (`--max-warnings 0`), core + kitchen-sink typechecks, 373 tests, framework/plugin/demo builds, and a blocking headless boot smoke test.

Process: when a defect is found, add it here with severity + file:line; when fixed, remove it and update any matching wiki gotcha.

## Open defects (first-party plugins)

| Severity | Location | Defect |
|---|---|---|
| Low | `packages/plugin-crunch/src/CrunchPhysicsPlugin.ts:484` | `initialize(options?: Partial<CrunchPhysicsOptions>, _app: IApplication)` puts a required parameter after an optional one — invalid TS (TS1016). Vite's dep-scan logs a non-fatal `[PARSE_ERROR]` on every kitchen-sink dev start. Fix: make `_app` optional or reorder to match the plugin contract. |
