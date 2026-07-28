# Caper

> An opinionated HTML game framework built on [PixiJS v8](https://pixijs.com).

Caper sits on top of PixiJS — which is a renderer, not a game engine — and adds the parts you'd otherwise rebuild for every project: scenes, plugins, asset pipeline, build config, type-safe IDs, signals, and a project layout that scales from a 48-hour jam to something you ship.

This is a personal fork of [dill-pixel](https://github.com/relishinc/dill-pixel) by Relish Studios. The fork narrows scope, modernizes the dependency stack, unifies the plugin contract, adds tests, and ships fewer half-finished things. See [`MIGRATION_GUIDE.md`](./MIGRATION_GUIDE.md) if you're moving an existing project across.

---

## Why use it

- **Pixi v8 native.** Pinned to the latest 8.x line. No compatibility shims.
- **Auto-discovered scenes, plugins, popups, entities.** Drop a file in the right directory; the build picks it up. No registry to maintain.
- **Type-safe IDs everywhere.** Scene names, plugin IDs, popup IDs, entity IDs, and locale keys all flow into a generated `caper-app.d.ts` and become string-literal unions on every API that takes one. Typos fail at compile time.
- **Per-bundle asset types.** The build reads your AssetPack manifest and generates types narrowed by bundle, so `Sprite.from('menu/logo')` autocompletes from the textures actually in the menu bundle.
- **Plugin dependency declarations.** `definePlugin({ requires: ['firebase'] })` and the framework topologically sorts at bootstrap. No more "wrong order" foot-guns.
- **Build-time validation.** Missing asset bundles, unknown plugin IDs, plugin dependency cycles, duplicate scene IDs — all caught during the build, before the runtime ever sees them.
- **One CLI.** `caper add scene|plugin|entity|popup` scaffolds a stub that builds and runs immediately.
- **Exported Vite + AssetPack config.** Apps consume `@caper-engine/core/config/vite` instead of duplicating ~300 lines of boilerplate.
- **Signals over events.** Strongly typed pub/sub via `typed-signals`.
- **Tested.** Vitest covers `Plugin`, `Store`, `Scene`, `SignalRegistry`, and the storage interfaces. Not exhaustive, but it catches the bone-headed regressions.

## Who it's for

Solo and small-team HTML game devs who want the structural decisions made for them, but don't want a kitchen-sink engine that hides Pixi underneath. If you already know PixiJS and TypeScript and just want to start building game logic instead of project plumbing, Caper is the layer you'd otherwise write yourself.

If you're new to PixiJS, learn that first — Caper assumes you know how containers, sprites, the ticker, and asset loading work.

## Status

This is **a personal fork in active development**. The package is not yet published to npm under `@caper-engine/core` — that happens in Phase 7. Until then, the recommended way to use it is to clone this repo, run the kitchen-sink, and either fork it as a starter or vendor `packages/core` into your own project.

The original `dill-pixel` package on npm still works for projects that don't want to follow this fork — see [`MIGRATION_GUIDE.md`](./MIGRATION_GUIDE.md) for what changed.

## Repo layout

```
packages/
  core/                       → @caper-engine/core (the framework)
  plugin-crunch/              → @caper-engine/plugin-crunch (Crunch physics)
  plugin-rive/                → @caper-engine/plugin-rive
  plugin-firebase/            → @caper-engine/plugin-firebase
  plugin-google-analytics/    → @caper-engine/plugin-google-analytics
  plugin-rollbar/             → @caper-engine/plugin-rollbar
  plugin-colyseus/            → @caper-engine/plugin-colyseus
apps/
  kitchen-sink/               demo / reference app
plan/                         fork roadmap + execution log
```

## Quick start (running the demo)

```sh
pnpm install
pnpm kitchen-sink:dev
```

The kitchen-sink exercises every plugin, every UI primitive, the asset pipeline, the scene manager, popups, entities, signals, and storage. It's the integration test for the framework — if it runs, the framework works.

## Minimal scene

```ts
// src/scenes/MenuScene.ts
import { defineScene, Scene } from '@caper-engine/core';

export const scene = defineScene({
  id: 'menu',
  assets: { preload: { bundles: ['ui'] } },
});

export default class MenuScene extends Scene {
  initialize() {
    this.add.text({
      text: 'Caper',
      anchor: 0.5,
      style: { fontFamily: 'system-ui', fontSize: 64, fill: 0xffffff },
    });
  }
}
```

The Vite plugin discovers this file on next reload. The id `'menu'` is added to the generated `AppScenes` union, so `app.scenes.load('menu')` is fully typed.

## Minimal plugin

```ts
// src/plugins/AnalyticsPlugin.ts
import { definePlugin, IApplication, Plugin } from '@caper-engine/core';

export const plugin = definePlugin({
  id: 'analytics',
  requires: ['firebase'],   // firebase initializes first, always
});

export default class AnalyticsPlugin extends Plugin {
  public readonly id = 'analytics';

  async initialize(_options, app) {
    this.firebase = app.getPlugin('firebase'); // guaranteed live
  }
}
```

## Documentation

There's no docs site yet — the upstream `apps/docs/` was deleted in Phase 6 because it almost entirely described the pre-fork state. A new docs surface will land when there's enough audience to justify it. Until then, the [`plan/`](plan/) directory + the kitchen-sink + the JSDoc on `Scene` and `IPlugin` are the documentation:

- [`plan/fork-plan.md`](plan/fork-plan.md) — the long-form rationale for every architectural change
- [`plan/tasks.md`](plan/tasks.md) — execution log: what shipped, why, and what came up along the way
- [`CLAUDE.md`](CLAUDE.md) — repo conventions and common commands
- [`apps/kitchen-sink/`](apps/kitchen-sink/) — every framework feature exercised in a real app

## Common commands

```sh
pnpm kitchen-sink:dev          # run the demo
pnpm kitchen-sink:build        # build the demo
pnpm framework:build           # build @caper-engine/core only
pnpm packages:build             # build all @caper-engine/plugin-*
pnpm --filter @caper-engine/core test # run framework tests (23 currently)
pnpm plugin:create              # scaffold a new plugin package
caper add scene MenuScene       # scaffold a new scene/plugin/entity/popup in a Caper app
```

## License

MIT. The original dill-pixel is also MIT. This fork retains the same license; it's a personal project, not a commercial repackaging.

## Acknowledgements

Caper exists because Relish Studios built [dill-pixel](https://github.com/relishinc/dill-pixel) and made the right structural decisions on top of PixiJS. This fork keeps those decisions, narrows the scope, and modernizes the parts that drifted. Credit for the original framework architecture goes to the Relish team.
