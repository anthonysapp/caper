# Migration guide

Breaking changes between Caper versions, newest first. Each entry says what changed and what to do.

## 0.8.0

**`pixi.js` peer dependency is now `8.23.0`** (was `8.22.0`). Caper pins Pixi exactly.

- Update your app: `pnpm add pixi.js@8.23.0` alongside the Caper update.
- Upstream behavior change in Pixi 8.23.0: an interactive ancestor now receives each global pointer,
  mouse or touch move (`globalpointermove`, `globalmousemove`, `globaltouchmove`) **once**, not twice.
  If you counted or throttled those events around the double fire, remove that workaround.
- This is the minimum Pixi version for `@pixi/3d`, which upcoming 3D support builds on.

## From dill-pixel

Caper is a fork of [dill-pixel](https://github.com/relishinc/dill-pixel). The main differences:

- **Package scope.** The framework is `@caperjs/core`; first-party plugins are `@caperjs/plugin-*`
  (and `@caperjs/solid`).
- **One plugin contract.** Storage adapters are no longer a separate type. Anything that was a storage
  adapter (for example Firebase) is a regular plugin listed in `plugins: [...]`.
- **Dropped plugins.** `physics-matter`, `physics-snap` and `springroll` are gone. Crunch is the
  first-party physics plugin.
- **Build tooling is a Vite preset.** An app's `vite.config.ts` is `plugins: [caper()]` from
  `@caperjs/core/vite`, and it runs plain `vite` / `vite build`.
- **No `src/index.ts` needed.** The preset injects the runtime entry into `index.html`.
- **Pixi v8 only**, pinned to an exact version.
