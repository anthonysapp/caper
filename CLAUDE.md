# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Documentation

For PixiJS API reference, fetch:
https://pixijs.com/llms.txt

### The wiki — read it before reading framework source

[docs/wiki/](docs/wiki/) is a maintained map of `packages/core`, one page per
subsystem ([Home.md](docs/wiki/Home.md) is the index,
[architecture-overview.md](docs/wiki/architecture-overview.md) the layer map,
[glossary.md](docs/wiki/glossary.md) the vocabulary). Written from a full read
of the source specifically so future sessions don't have to repeat it:

- **Before exploring or extending a subsystem**, read its wiki page first —
  each covers the interface (what callers must know), module map, seams, and
  recipes ("add a plugin", "add a factory method", …). Only drop into source
  for the specific lines you're changing.
- **When planning a new module**, start from the "Seams & extension points"
  and "Recipes" sections of the relevant page, and use the glossary's terms in
  code and discussion.
- **Keep it current**: a PR that changes a subsystem's shape (new seam,
  lifecycle step, renamed public API) updates its wiki page in the same PR.
  Treat `path:line` references as "near here", refreshing them when touched.

### KNOWN_BUGS.md — the defect ledger

[KNOWN_BUGS.md](KNOWN_BUGS.md) tracks confirmed-but-unfixed defects with
severity and `file:line`.

- **Check it before diagnosing** odd framework behavior — it may already be a
  documented defect (and before reporting a "new" bug, confirm it isn't
  listed).
- **Found a real defect you're not fixing now?** Add a row (severity,
  location, one-line what + why wrong) instead of leaving it in a report.
- **Fixed one?** Remove its row and update any matching gotcha in the wiki
  page, in the same PR as the fix. Fixes are test-first: a failing test
  reproduces the row before the fix lands.

## Overview

**Caper** (`@caperjs/core`) is an opinionated **HTML game framework built on PixiJS v8**. It adds scene management, plugins, asset pipeline, build config, and project tooling on top of PixiJS, which is a renderer — not a game engine. Caper is a personal fork of [dill-pixel](https://github.com/relishinc/dill-pixel) by Relish Studios; the fork narrows scope, modernizes the dep stack, unifies the plugin contract (no more separate "storage adapter" type), and ships fewer half-finished things. Full rationale in [plan/fork-plan.md](plan/fork-plan.md).

This repo is a **pnpm + Turborepo monorepo** containing the framework, first-party plugins, and a kitchen-sink demo app. (The original `apps/docs/` site was deleted in Phase 6 — it was almost entirely upstream content that no longer matched the fork. A new docs surface will be designed from scratch when one is needed.)

## Repo layout

- [packages/core](packages/core/) — the `@caperjs/core` npm package. Source in [packages/core/src](packages/core/src/): `core/` (Application, config, create, registries), `display/`, `mixins/`, `plugins/`, `signals/`, `store/`, `ui/`, `utils/`. Ships a CLI ([cli.mjs](packages/core/cli.mjs), `create-caper`, plus `caper add scene|plugin|entity|popup`) and reusable vite/assetpack/tsconfig in `config/`. Agent-facing: `extras/llms.txt` is the consumer reference (read it by section), `extras/skills/caper/SKILL.md` the shipped skill, `caper agent init` installs both into an app, `caper types` regenerates the app's generated `.d.ts` without a dev server, `caper doctor` is the one-screen health check, and `caper agent probe <url>` drives a running app headlessly via the automation bridge.
- [packages/plugin-\*](packages/) — first-party plugins, flat siblings of `core/`. Current set: `plugin-colyseus`, `plugin-crunch` (Crunch physics), `plugin-firebase`, `plugin-google-analytics`, `plugin-rive`, `plugin-rollbar`. Each is an independent publishable package under the `@caperjs` npm scope. The `physics-matter` / `physics-snap` / `springroll` plugins were dropped in Phase 3; storage adapters were merged into the unified plugin contract in Phase 1 (Firebase is now a regular plugin).
- [apps/kitchen-sink](apps/kitchen-sink/) — demo / reference app exercising the framework; the canonical place to see real usage of scenes, plugins, popups, entities, UI. Configured via [caper.config.ts](apps/kitchen-sink/caper.config.ts). Doubles as the integration test for every framework change.
- [scripts/](scripts/) — monorepo-wide build/publish/version scripts and `create-plugin` generator.
- [plan/](plan/) — fork roadmap ([plan/fork-plan.md](plan/fork-plan.md)) and execution log ([plan/tasks.md](plan/tasks.md)) — read these for the *why* behind any architectural decision.

Workspaces are declared in [pnpm-workspace.yaml](pnpm-workspace.yaml); Turbo tasks in [turbo.json](turbo.json) (only `build` with `^build` deps, and a persistent uncached `dev`).

## Common commands

Run from the repo root (package manager is **pnpm@9.3.0**):

- `pnpm kitchen-sink:dev` — run the kitchen-sink demo app (turbo-filtered).
- `pnpm kitchen-sink:build` — build the kitchen-sink app.
- `pnpm framework:build` — build the `caper` framework package only.
- `pnpm framework:publish` / `pnpm framework:all` — publish framework (build + npm publish).
- `pnpm packages:build` — build all plugins + storage adapters (`scripts/build-packages.sh`).
- `pnpm packages:update` — bump versions across plugin/adapter packages.
- `pnpm packages:publish` — publish plugins + storage adapters.
- `pnpm packages:all` — update versions, build, then publish all plugins/adapters.
- `pnpm build-publish-all` — full release pipeline: version bump → framework build/publish → packages build/publish.
- `pnpm plugin:create` / `pnpm storage-adapter:create` — scaffold a new plugin or adapter via the interactive generators in `scripts/`.
- `pnpm cli:create` — smoke-test the `create-caper` CLI by scaffolding `../cli-test-app`.

There is **no repo-level test command** (root `test` script is a stub). Core checks run per-package: `pnpm --filter @caperjs/core test` / `lint` / `lint:fix`. CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs lint, typecheck, tests, and the kitchen-sink + plugin builds on every push and PR to `main`.

## Architecture notes

- **Application is the entry point.** Games extend [`Application`](packages/core/src/core/Application.ts) from `caper`. The framework auto-detects scenes and wires plugins/storage adapters through a registries system ([core/registries.ts](packages/core/src/core/registries.ts)) during bootstrap. Kitchen-sink's [`KitchenSinkApplication.ts`](apps/kitchen-sink/src/KitchenSinkApplication.ts) is the canonical example.
- **Plugins and storage adapters are first-class.** They are registered via the app config (see `caper.config.ts`) and loaded during bootstrap — not imported ad-hoc. When adding features that touch third-party services (analytics, physics, networking, persistence), prefer creating/extending a plugin or adapter over inlining it in game code.
- **PixiJS v8 peer dep.** The framework pins `pixi.js@8.10.2`, `@pixi/sound@^6`, and `gsap@^3.13` as peer deps. Plugins/adapters should follow the same peer-dep pattern, not bundle Pixi.
- **Build tooling is a Vite preset.** `@caperjs/core/vite` exports `caper()`; an app's `vite.config.ts` is `plugins: [caper()]` and it runs plain `vite` / `vite build`. The preset lives in `packages/core/build/`. Shared `tsconfig.json` and prettier config are still exported from `config/`.
- **Signals over events.** The framework uses `typed-signals` for cross-system communication (see `src/signals/`).

## Prefer the caper way

When writing or changing **app / kitchen-sink / example** presentation code (scenes,
entities, UI, popups), use Caper APIs — not raw Pixi constructors — whenever a Caper
equivalent exists. Kitchen-sink is the canonical usage reference; factory methods live
in [`packages/core/src/mixins/factory/`](packages/core/src/mixins/factory/).

**Do this:**

1. **Extend Caper's `Container` / `Entity` / `Scene`**, not Pixi's `Container`.
   Caper's `Container` brings the factory mixin (`this.add` / `this.make`), signals,
   and lifecycle (`added` / `removed` / `resize` / `update`). UI widgets and composite
   views should subclass `Container` from `@caperjs/core`.
2. **Build display trees with factory methods**, not `new Sprite()` / `new Text()` /
   `new Graphics()` / `new Container()`:
   - `this.add.sprite({ asset: "…" })` / `this.add.text({…})` /
     `this.add.graphics()` / `this.add.container({…})` — create **and** parent.
   - `this.make.*` — same constructors, **no** auto-parent (when you need the
     instance before attaching, or to hand to `UICanvas.addElement`).
   - `this.add.existing(view)` — parent an already-built node.
   - `this.add.entity("id", props)` / `this.add.ui("id", props)` — typed registry
     lookups for discovered entities/UI (`defineEntity` / `defineUI`).
3. **Use Caper UI primitives** for chrome and layout: `UICanvas`, `FlexContainer`,
   `Button`, `Popup` / popup manager, `Toaster`. Prefer `this.add.uiCanvas` /
   `this.add.button` / `this.add.flexContainer` over hand-rolled layout. Wire
   interactive chrome through `app.controls.touch.addButton(...)` and
   `app.action(...)` when an action context fits — not ad-hoc pointer handlers.
4. **Scenes / entities / popups / UI** — `defineScene` / `defineEntity` /
   `definePopup` / `defineUI` + default-export the class so Vite discovery and
   generated `caper-app.d.ts` stay in sync. Prefer `caper add scene|entity|popup`
   when scaffolding.

**Don't do this (unless no Caper API fits):**

- `import { Container, Sprite, Text } from "pixi.js"` then `new …` inside scenes/UI
  that already extend Caper `Container`.
- Reimplementing flex/edge layout, buttons, or toasts with raw Pixi.

Exceptions that are fine: ephemeral debug/overlay `Graphics`, one-off particles, or
framework internals in `packages/core` that *implement* the factories/UI (those must
touch Pixi). When editing legacy kitchen-sink code that still uses raw Pixi
constructors, prefer migrating the touched lines to factories rather than spreading
the old pattern.

Consumer games (e.g. bankshot-web) mirror this rule in their own `CLAUDE.md`.

## App entry, client types, and the automation bridge

- **Client types.** Apps add `"@caperjs/core/client"` to their tsconfig `types` array (shipped as `packages/core/client.d.ts`) to get the ambient `declare module 'caper-runtime'` and the `__CAPER_APP_NAME`/`__CAPER_APP_VERSION` build-define globals.
- **Auto-injected runtime entry.** The vite runtime plugin's `transformIndexHtml` hook injects `<script type="module">import("caper-runtime")</script>` for you, so new apps need **no** `src/index.ts`. Legacy HTML that already references `caper-runtime` or a `src/index.(ts|js)` entry is left untouched and still works.
- **Automation bridge (`src/core/globals.ts`).** Every app is registered on `window.Caper`: `Caper.apps` (Map keyed by `config.id`), `Caper.app` (last created), and `Caper.ready(id?)` (resolves even if called before the app exists; no-id resolves the first app). When gated on — dev env, `config.automation === true`, or `VITE_CAPER_AUTOMATION === 'true'` — a facade lands at `Caper.automation[id]` (and `app.automation`) exposing `action/getContext/getState/registerStateGetter/notifyStateChanged/waitFor` plus a 200-entry log fed by the ActionsPlugin's new `onActionDispatched` signal (emitted only for allowed/dispatched actions) and `onActionContextChanged`. `globals.ts` touches **no browser globals at module load** and guards all `import.meta.env` access (SSR constraint).

## SSR / Node evaluation of the framework entry

`@caperjs/core`'s built entry (`lib/caper.mjs` → `lib/registries-*.js`) bundles
`@pixi/sound` and GSAP, both of which run **browser-only top-level side effects**
(`document.createElement('audio')` format probe, `window` reads in the sound
singleton, GSAP CSSPlugin's `'transform' in div.style` probe). Importing the entry
in plain Node therefore throws `document is not defined`. This bites anything that
evaluates an app's `caper.config.ts` server-side — notably `validateCaperConfig` in
[packages/core/build/plugins/caperConfig.mjs](packages/core/build/plugins/caperConfig.mjs), which `ssrLoadModule`s
the config on dev start and on HMR of the config graph. That function installs a
minimal, scoped `document`/`window` stub around the load (removed in `finally`, never
overwriting an existing DOM). If a future dep adds a new browser-only top-level side
effect, extend that stub — smoke-test with a bare `node -e "import('.../lib/caper.mjs')"`
under the stub rather than guessing.

## Model delegation — plan at the frontier, implement downstream

When a frontier model (Fable/Opus-tier) orchestrates work in this repo, it should
**diagnose, spec, and review — not type**. Delegate implementation via the Agent tool
with a model override (this repo has no `.claude/agents/`): `model: "sonnet"` for
mechanical, fully-specified changes (single-file edits, spec'd fixes, renames);
`model: "opus"` for judgment-heavy work (package export surgery, build/bundling
changes, anything spanning core + plugins or affecting the published API).

- **Specs must be self-contained** — subagents have zero conversation context. Include
  the completed diagnosis (root-cause chain, not just the symptom), exact file paths,
  the fix specification, and the verify commands. Tell the agent not to re-investigate
  and not to commit.
- **Verification stays with the orchestrator.** Require the diff + evidence of what was
  run from the subagent, then independently re-run the key check yourself before
  presenting.
- **Iterate with follow-up agents** when verification surfaces new failures: pass the
  prior agent's findings forward in full rather than re-deriving them.
- **Don't delegate trivia** — edits under ~20 lines in one file are cheaper to make
  directly than to spec, hand off, and review.

## Conventions

- **Commits follow Conventional Commits** (`commitlint.config.js` + `@commitlint/config-conventional`). Releases are automated via release-please; commit prefixes (`feat:`, `fix:`, `chore:`, etc.) drive version bumps and changelogs.
- **TypeScript throughout.** Contributors are expected to know PixiJS, TypeScript, and general game-dev patterns (per [README.md](README.md)).
- See [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md) for breaking-change history between major framework versions.
