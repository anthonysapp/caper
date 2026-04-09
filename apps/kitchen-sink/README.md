# Caper Kitchen Sink

The reference / integration-test app for [Caper](../../README.md). Exercises every plugin, every UI primitive, the asset pipeline, the scene manager, popups, entities, signals, and storage. If this runs end-to-end, the framework works.

## Development

```sh
pnpm install            # from the repo root
pnpm kitchen-sink:dev   # vite dev server, http://localhost:3000
```

## What's in here

- `src/scenes/` — every framework feature gets its own demo scene (UI, audio, physics, accessibility, animation, store, etc.)
- `src/plugins/` — local example plugins (e.g. `TestPlugin`) wired through discovery
- `src/popups/` — example popup with focus management + animations
- `src/entities/` — example entities used by the physics scenes
- `src/locales/` — i18n examples
- `caper.config.ts` — the canonical config: every plugin registered, default scene, asset bundles, actions, contexts, data schema

## Purpose

- Used to develop the framework — every architectural change in `packages/core` is verified here before commit
- Doubles as a reference implementation: copy patterns out of here to bootstrap your own Caper game
