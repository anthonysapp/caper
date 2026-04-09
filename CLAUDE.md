# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Documentation

For PixiJS API reference, fetch:
https://pixijs.com/llms.txt

## Overview

**Caper** (`@caper/core`) is an opinionated **HTML game framework built on PixiJS v8**. It adds scene management, plugins, asset pipeline, build config, and project tooling on top of PixiJS, which is a renderer — not a game engine. Caper is a personal fork of [dill-pixel](https://github.com/relishinc/dill-pixel) by Relish Studios; the fork narrows scope, modernizes the dep stack, unifies the plugin contract (no more separate "storage adapter" type), and ships fewer half-finished things. Full rationale in [plan/fork-plan.md](plan/fork-plan.md).

This repo is a **pnpm + Turborepo monorepo** containing the framework, first-party plugins, and a kitchen-sink demo app. (The original `apps/docs/` site was deleted in Phase 6 — it was almost entirely upstream content that no longer matched the fork. A new docs surface will be designed from scratch when one is needed.)

## Repo layout

- [packages/core](packages/core/) — the `@caper/core` npm package. Source in [packages/core/src](packages/core/src/): `core/` (Application, config, create, registries), `display/`, `mixins/`, `plugins/`, `signals/`, `store/`, `ui/`, `utils/`. Ships a CLI ([cli.mjs](packages/core/cli.mjs), `create-caper`, plus `caper add scene|plugin|entity|popup`) and reusable vite/assetpack/tsconfig in `config/`.
- [packages/plugin-\*](packages/) — first-party plugins, flat siblings of `core/`. Current set: `plugin-colyseus`, `plugin-crunch` (Crunch physics), `plugin-firebase`, `plugin-google-analytics`, `plugin-rive`, `plugin-rollbar`. Each is an independent publishable package under the `@caper` npm scope. The `physics-matter` / `physics-snap` / `springroll` plugins were dropped in Phase 3; storage adapters were merged into the unified plugin contract in Phase 1 (Firebase is now a regular plugin).
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

There is **no repo-level test command** (root `test` script is a stub). Lint lives inside `packages/core`: `pnpm --filter caper lint` / `lint:fix`.

## Architecture notes

- **Application is the entry point.** Games extend [`Application`](packages/core/src/core/Application.ts) from `caper`. The framework auto-detects scenes and wires plugins/storage adapters through a registries system ([core/registries.ts](packages/core/src/core/registries.ts)) during bootstrap. Kitchen-sink's [`KitchenSinkApplication.ts`](apps/kitchen-sink/src/KitchenSinkApplication.ts) is the canonical example.
- **Plugins and storage adapters are first-class.** They are registered via the app config (see `caper.config.ts`) and loaded during bootstrap — not imported ad-hoc. When adding features that touch third-party services (analytics, physics, networking, persistence), prefer creating/extending a plugin or adapter over inlining it in game code.
- **PixiJS v8 peer dep.** The framework pins `pixi.js@8.10.2`, `@pixi/sound@^6`, and `gsap@^3.13` as peer deps. Plugins/adapters should follow the same peer-dep pattern, not bundle Pixi.
- **Build tooling is centralized.** The framework exports reusable Vite and AssetPack configs (`caper/config/vite`, `caper/config/assetpack`) plus shared `tsconfig.json` and prettier config — apps and plugins should consume these rather than duplicating build setup.
- **Signals over events.** The framework uses `typed-signals` for cross-system communication (see `src/signals/`).

## Conventions

- **Commits follow Conventional Commits** (`commitlint.config.js` + `@commitlint/config-conventional`). Releases are automated via release-please; commit prefixes (`feat:`, `fix:`, `chore:`, etc.) drive version bumps and changelogs.
- **TypeScript throughout.** Contributors are expected to know PixiJS, TypeScript, and general game-dev patterns (per [README.md](README.md)).
- See [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md) for breaking-change history between major framework versions.
