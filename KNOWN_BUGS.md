# Known Bugs — packages/core

**No known open defects.** The 2026-08-02 audit backlog (≈50 defects) and every follow-up finding through 2026-08-04 are fixed — each test-first in its own conventional commit. (One reported item — a UICanvas lifecycle double-registration — was investigated and disproved: UICanvas composes `WithSignals(Factory())` directly and never touches the lifecycle mixin.)

CI guards the state on every push and PR: lint (`--max-warnings 0`), core + kitchen-sink typechecks, 373 tests, framework/plugin/demo builds, and a blocking headless boot smoke test.

Process: when a defect is found, add it here with severity + file:line; when fixed, remove it and update any matching wiki gotcha.

## Open defects (first-party plugins)

| Severity | Location | Defect |
|---|---|---|
| Low | `packages/plugin-crunch/src/CrunchPhysicsPlugin.ts:484` | `initialize(options?: Partial<CrunchPhysicsOptions>, _app: IApplication)` puts a required parameter after an optional one — invalid TS (TS1016). Vite's dep-scan logs a non-fatal `[PARSE_ERROR]` on every kitchen-sink dev start. Fix: make `_app` optional or reorder to match the plugin contract. |
| Medium | `packages/plugin-colyseus/src/ColyseusPlugin.ts:49` | Client endpoint is hardcoded to `ws://localhost:${port}`; only the port is configurable. Any deployed build (or a device on the LAN, or a native shell) can never reach a real server. Fix: accept an `endpoint` / `url` option (env `VITE_COLYSEUS_URL`), falling back to localhost only in dev. |
| Low | `packages/plugin-firebase/src/FirebasePlugin.ts:53`, `packages/plugin-google-analytics/src/GoogleAnalyticsPlugin.ts:21` | Both redeclare `_options` as `private`, but the base `Plugin<O>` declares it non-private, so the class "incorrectly extends" its base (TS2415). The declaration-file step logs the error on every `pnpm packages:build`; the build still exits 0, so CI does not catch it. Fix: drop the redeclaration or make it `protected` to match the base. |
| Low | `packages/plugin-crunch/src/Entity.ts:130` | `return this.app.make` — `make` is not on `IApplication` (TS2339). Logged, non-fatal, on every `pnpm packages:build`. Fix: type `app` as the concrete `Application`, or expose `make` on `IApplication`. |
