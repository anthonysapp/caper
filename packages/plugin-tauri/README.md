# @caperjs/plugin-tauri

Native-shell integration for [Caper](https://github.com/anthonysapp/caper) games
packaged with [Tauri v2](https://v2.tauri.app/).

A Tauri app is your `dist/` running inside the system webview. That webview is
not a browser tab, and three things differ enough to break a game:

- **There is no HTML Fullscreen API.** `requestFullscreen` does not exist, so
  core's `app.fullScreen` cannot work. This plugin installs a `FullscreenDriver`
  that drives the real native window instead.
- **A hidden or occluded window freezes the page** — `requestAnimationFrame` and
  timers simply stop. This plugin pauses the app before that happens, so it
  comes back in a sane state instead of jumping.
- **`localStorage` may be evicted by WebKit.** This plugin backs `save`/`load`
  with `@tauri-apps/plugin-store`, a real file on disk.

It also suppresses the webview's own right-click menu in production builds.

## Install

```bash
pnpm add @caperjs/plugin-tauri @tauri-apps/api @tauri-apps/plugin-store
```

`@tauri-apps/api` and `@tauri-apps/plugin-store` are peer dependencies.

## Use

```ts
// caper.config.ts
export default defineConfig({
  plugins: [
    'tauri',
    // or, with options:
    // ['tauri', { options: { pauseOnBlur: true, storeFile: 'slots.json' } }],
  ],
});
```

```ts
// anywhere in the game
await app.store.save('tauri', 'progress', { level: 3 });
const progress = await app.store.load('tauri', 'progress');
```

## Works on the web too

Leave the plugin in `plugins: [...]` for every target. Off-native it is inert:
nothing from `@tauri-apps/*` is ever imported (all native code sits behind
`await import(...)` guarded by `isTauri`), nothing is paused, no fullscreen
driver is installed, and `quit()` is a logged no-op. Only `save`/`load` still
do something — they fall back to `localStorage`, JSON-encoded under keys
prefixed `caper:` — so a game can name this plugin as its store adapter on
desktop and on the web without branching.

## Options

| Option               | Default                  | What it does                                                                      |
| -------------------- | ------------------------ | --------------------------------------------------------------------------------- |
| `pauseOnHide`        | `true`                   | `app.pause()` when the webview is hidden, `app.resume()` when it comes back.       |
| `pauseOnBlur`        | `false`                  | Same, driven by the native window losing and regaining focus.                      |
| `nativeFullscreen`   | `true`                   | Desktop only: install a fullscreen driver on `app.fullScreen` backed by the native window. On Android/iOS the webview's own fullscreen is kept (Tauri's `setFullscreen` is unsupported there). |
| `disableContextMenu` | `true` in prod, `false` in dev | `preventDefault()` on `contextmenu`, hiding the webview's own menu.          |
| `storeFile`          | `'caper-save.json'`      | File under the app data dir that `save`/`load` persist to.                         |
| `backButtonKey`      | `'GoBack'`               | Android only: the key a back press is delivered as. Bind it in `controls.keyboard` like any key (`close: ['Escape', 'GoBack']`); action contexts route it. Back never closes the app while this is on. `false` keeps Android's default. |

Pausing is ownership-aware: the plugin only resumes an app it paused itself, so
a game already paused by its own menu is not resumed out from under the player.

## What the Rust side needs

The plugin talks to Tauri over the IPC bridge, which is deny-by-default. In
`src-tauri`:

1. Add the store plugin crate to `src-tauri/Cargo.toml`:

   ```toml
   [dependencies]
   tauri-plugin-store = "2"
   ```

   and register it in `src-tauri/src/lib.rs`:

   ```rust
   tauri::Builder::default()
       .plugin(tauri_plugin_store::Builder::new().build())
   ```

2. Grant these permissions in `src-tauri/capabilities/default.json`:

   | Permission                        | Needed for                    |
   | --------------------------------- | ----------------------------- |
   | `store:default`                   | `save` / `load`               |
   | `core:window:allow-set-fullscreen`| entering / leaving fullscreen |
   | `core:window:allow-is-fullscreen` | reading the fullscreen state  |
   | `core:window:allow-close`         | `quit()`                      |

Without them the matching calls reject at runtime; the plugin surfaces the
rejection rather than swallowing it.

`caper native plugin` wires both steps up for you.

## License

MIT
