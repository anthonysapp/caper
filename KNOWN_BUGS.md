# Known Bugs — packages/core

**One open core defect (plugin ordering, below).** The 2026-08-02 audit backlog (≈50 defects) and every follow-up finding through 2026-08-04 are fixed — each test-first in its own conventional commit. (One reported item — a UICanvas lifecycle double-registration — was investigated and disproved: UICanvas composes `WithSignals(Factory())` directly and never touches the lifecycle mixin.)

CI guards the state on every push and PR: lint (`--max-warnings 0`), core + kitchen-sink typechecks, 373 tests, framework/plugin/demo builds, and a blocking headless boot smoke test.

Process: when a defect is found, add it here with severity + file:line; when fixed, remove it and update any matching wiki gotcha.

## Open defects (core)

| Severity | Location | Defect |
|---|---|---|
| Medium | `packages/core/build/internal/discovery.mjs:232-235`, `packages/core/src/core/Application.ts:1053`, `src/core/config.ts:87` | **`requires` declared on an npm plugin's class is never read.** Discovery hardcodes `requires: []` for every `@caperjs/plugin-*` package, with a comment claiming "the runtime topo-sort reads from the live instance". It does not: `sortPluginsByRequires(this.plugins, ...)` only looks at the list items, before any plugin is instantiated. So `public readonly requires = ['firebase']` on a published plugin gives no ordering and no "missing required plugin" bootstrap error. Harmless for `@caperjs/plugin-tauri` (it needs only the built-in `fullscreen`, registered earlier, and wires it in `postInitialize`). Fix: read a static `requires` from the package at discovery time (e.g. a `caper.requires` field in its `package.json`), or re-sort after import, and make the comment true. |

## Open defects (first-party plugins)

| Severity | Location | Defect |
|---|---|---|
| Low | `packages/plugin-crunch/src/CrunchPhysicsPlugin.ts:484` | `initialize(options?: Partial<CrunchPhysicsOptions>, _app: IApplication)` puts a required parameter after an optional one — invalid TS (TS1016). Vite's dep-scan logs a non-fatal `[PARSE_ERROR]` on every kitchen-sink dev start. Fix: make `_app` optional or reorder to match the plugin contract. |
| Medium | `packages/plugin-colyseus/src/ColyseusPlugin.ts:49` | Client endpoint is hardcoded to `ws://localhost:${port}`; only the port is configurable. Any deployed build (or a device on the LAN, or a native shell) can never reach a real server. Fix: accept an `endpoint` / `url` option (env `VITE_COLYSEUS_URL`), falling back to localhost only in dev. |
| Low | `packages/plugin-firebase/src/FirebasePlugin.ts:53`, `packages/plugin-google-analytics/src/GoogleAnalyticsPlugin.ts:21` | Both redeclare `_options` as `private`, but the base `Plugin<O>` declares it non-private, so the class "incorrectly extends" its base (TS2415). The declaration-file step logs the error on every `pnpm packages:build`; the build still exits 0, so CI does not catch it. Fix: drop the redeclaration or make it `protected` to match the base. |
| Low | `packages/plugin-crunch/src/Entity.ts:130` | `return this.app.make` — `make` is not on `IApplication` (TS2339). Logged, non-fatal, on every `pnpm packages:build`. Fix: type `app` as the concrete `Application`, or expose `make` on `IApplication`. |
| Low | `packages/plugin-crunch/src/Entity.ts:511` (`onCull`), `Sensor.ts` / `Actor.ts` `update` | A culled entity that is not removed (`shouldRemoveOnCull: false`, the default for sensors) is hidden but keeps simulating forever: a sensor or actor with nothing beneath it falls without end, its `y` growing unbounded. Since 2026-09-18 this is cheap (velocity is clamped to `maxVelocity` for sensors too, and a sensor move scans only nearby actors), so it costs a fraction of a millisecond per frame instead of freezing the game. Not frozen-on-cull on purpose: an entity that arcs out of bounds and comes back (a high jump) must keep moving. Possible fix: stop simulating entities that are out of bounds AND moving away from the boundary. |
