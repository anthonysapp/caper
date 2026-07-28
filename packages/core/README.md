# @caper-engine/core

> An opinionated HTML game framework built on [PixiJS v8](https://pixijs.com).

`@caper-engine/core` is the framework package of [Caper](https://github.com/anthonysapp/caper), a personal fork of [dill-pixel](https://github.com/relishinc/dill-pixel) by Relish Studios that narrows scope, modernizes the dependency stack, and ships fewer half-finished things.

It sits on top of PixiJS — a renderer, not a game engine — and adds the parts you'd otherwise rebuild for every project: scenes, plugins, asset pipeline, build config, type-safe IDs, signals, and a project layout that scales from a 48-hour jam to something you ship.

## Status

This package is **not yet published to npm**. The recommended way to use it is to clone the [Caper monorepo](https://github.com/anthonysapp/caper), run the kitchen-sink, and either fork it as a starter or vendor `packages/core` into your own project. First publish lands in Phase 7.

## Highlights

- **Pixi v8 native**, pinned to the latest 8.x
- **Auto-discovered scenes / plugins / popups / entities** via the bundled Vite plugin — drop a file in the right directory, the build picks it up
- **Type-safe IDs** for scenes, plugins, popups, entities, locale keys (string-literal unions on every API that takes one)
- **Per-bundle asset types** generated from your AssetPack manifest
- **Plugin `requires: [...]`** declarations + topological sort at bootstrap
- **Build-time validation** for asset bundles, plugin IDs, dependency cycles, duplicate IDs
- **Exported Vite + AssetPack config** (`@caper-engine/core/config/vite`, `@caper-engine/core/config/assetpack`)
- **`caper add` CLI** for scaffolding scenes, plugins, entities, popups
- **Signals** via `typed-signals`
- **Tested** — Vitest covers `Plugin`, `Store`, `Scene`, `SignalRegistry`

## Minimal example

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

The Vite plugin discovers this file on next reload. The id `'menu'` flows into the generated `AppScenes` union, so `app.scenes.load('menu')` is fully typed.

## Documentation

There's no docs site yet — the upstream `apps/docs/` was deleted in Phase 6 because it almost entirely described pre-fork state. A new docs surface will land when there's enough audience to justify it. Until then, the [`plan/`](https://github.com/anthonysapp/caper/tree/main/plan) directory + JSDoc on `Scene` and `IPlugin` are the documentation:

- `plan/fork-plan.md` — long-form architectural rationale
- `plan/tasks.md` — execution log of what's shipped and why
- `CLAUDE.md` — repo conventions and common commands

The kitchen-sink ([`apps/kitchen-sink/`](https://github.com/anthonysapp/caper/tree/main/apps/kitchen-sink)) is the canonical reference implementation — every plugin, every UI primitive, scenes, popups, entities, signals, storage all exercised end-to-end.

## License

MIT. Original dill-pixel framework architecture credit to Relish Studios.
