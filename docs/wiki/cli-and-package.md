# CLI, Templates & Package Surface
> Part of the Caper core wiki. Index: [Home](Home.md)

## Purpose

This page covers the parts of `@caperjs/core` that ship as developer tooling
rather than runtime code: the `caper`/`create-caper` CLI dispatcher
(`packages/core/cli.mjs`) and its subcommand modules (`packages/core/cli/`),
the scaffolding assets they read from (`packages/core/templates/`), the
shared base tsconfig (`packages/core/config/tsconfig.base.json`), and the
`package.json` fields that define what actually gets published to npm (`bin`,
`exports`, `files`, `peerDependencies`). None of this is imported by a
running game — it's the surface a developer touches before and around
writing game code. The CLI is deliberately thin: most subcommands are a
few dozen lines of `fs`/`child_process` glue, not a framework of their own.

## Package surface

`packages/core/package.json` is the contract with everything downstream
(consumer apps, plugin packages, `npm install @caperjs/core`).

- **`bin`** — two entry points:
  - `caper` → `packages/core/cli.mjs`, the real dispatcher.
  - `create-caper` → `packages/core/cli/create-caper.mjs`, a 9-line shim that
    shells out to `caper create` (see Gotchas — it assumes `caper` is already
    resolvable on `PATH`).
- **`exports`** map, subpath by subpath:
  - `.` → `lib/caper.mjs` + `lib/index.d.ts` — the built framework runtime,
    what `import { Application } from '@caperjs/core'` resolves to.
  - `./vite` → `build/index.mjs` — the `caper()` Vite plugin preset consumer
    `vite.config.ts` files import (see `packages/core/build/`).
  - `./client` → **types only** (`client.d.ts`), no `default`/runtime entry.
    Declares the ambient `caper-runtime` module and the
    `__CAPER_APP_NAME`/`__CAPER_APP_VERSION` build-define globals. Consumed
    by adding `"@caperjs/core/client"` to a project's tsconfig `types` array
    — never `import`ed as a value.
  - `./tsconfig` → `config/tsconfig.base.json` — the base config every app
    and plugin template `extends`.
  - `./extras/llms.txt`, `./extras/css/{accessibility,loader,fullscreen}.css`,
    `./extras/skills/caper/SKILL.md`
    — static assets referenced from app `index.html` (`@import url(...)`)
    or handed to an LLM for framework context.
- **`files`** ships `lib` (build output), `src` (source, for sourcemaps /
  go-to-definition into TS rather than `.d.ts`), `cli`, `build`,
  `config/tsconfig.base.json`, `extras/*`, `templates`, `types`,
  `client.d.ts`; explicitly excludes `build/**/*.test.mjs`. Note `templates`
  ships in full, including `templates/plugin/` which the published CLI never
  reads (see Templates below) — it rides along only because it lives under
  `packages/core`.
- **`peerDependencies`**: `pixi.js@8.23.0` (pinned exact — the renderer;
  exact pin avoids two copies of PixiJS existing in one app),
  `@pixi/sound@^6`, `gsap@^3.15` (tweening, used by scene/UI transitions),
  `vite@^8.0.7` (the `./vite` preset plugs into the *consumer's own* Vite,
  so Vite itself must be a peer, not a bundled dep), `workbox-window@^7.4`
  (PWA service-worker client, used by generated PWA registration code).
  Peer rather than bundled so the consumer's lockfile controls the exact
  version and there's a single instance in the tree. `caper install`
  (`install-peerdeps.mjs`) exists specifically to install these into a
  fresh consumer project.

## CLI commands

**`cli.mjs`** (`packages/core/cli.mjs`) is the single dispatcher registered
as the `caper` bin. It gates on Node ≥ 18 (`cli.mjs:19-27`), prints a version
banner unless the subcommand is `version`/absent, then switches on `args[0]`:

| subcommand | handler | notes |
|---|---|---|
| `install` | `installPeerDeps()` (`cli/install-peerdeps.mjs`) | installs the peer deps listed above into the consumer project |
| `version` | (banner only) | no-op past the version print |
| `dev`/`start`/`build`/`preview` | rejected, exit 1 (`cli.mjs:57-67`) | removed in 0.2.0; kept as named cases purely to print "run vite directly" instead of "unknown subcommand" |
| `add` | `add(args.slice(1))` (`cli/add.mjs`) | scaffold scene/plugin/entity/popup (`entity` accepts `--3d`), or `add 3d` / `add klipp` to opt into plugins (`cli/add3d.mjs`, `cli/addKlipp.mjs`) |
| `agent init [--dir <skillsDir>]` | `agent(args.slice(1))` (`cli/agent.mjs`) | copies the shipped `caper` agent skill into the app (default `.claude/skills/`) and upserts a marker-delimited pointer block into `AGENTS.md`/`CLAUDE.md`; when the app depends on `@caperjs/plugin-3d`, prints the `pixijs-3d` skill install command (`npx skills add … --skill pixijs-3d`) without running it |
| `native init [--title <name>] [--identifier <id>] [--port <n>] [--icon <png>]` | `native(args.slice(1))` (`cli/native.mjs`) | one-shot Tauri v2 scaffolding — see [Native (Tauri)](#native-tauri) below |
| `native plugin` | `native(args.slice(1))` (`cli/native.mjs`) | wires an already-`native init`'d app up for `@caperjs/plugin-tauri` — see [Native (Tauri)](#native-tauri) below |
| `native android` | `native(args.slice(1))` (`cli/native.mjs`) | sets an already-`native init`'d app up for Android builds; `native android dev|build [...tauri args]` runs `tauri android dev|build` with the resolved Android env; see [Native (Tauri)](#native-tauri) below |
| `native ios [--team <ID>]` | `native(args.slice(1))` (`cli/native.mjs`) | sets an already-`native init`'d app up for iOS builds (macOS only); `native ios dev|build [...tauri args]` runs `tauri ios dev|build` with the resolved iOS env; see [Native (Tauri)](#native-tauri) below |
| `agent probe <url> [opts]` | `probe(args)` (`cli/probe.mjs`, via `cli/agent.mjs`) | launches the app's own `playwright` Chromium, waits for `Caper.__readyApps`, sends `--action`s, optional `--until` predicate via `Caper.automation[id].waitFor`, returns context/state/log/errors (+ `--screenshot`); exit 1 on boot/until timeout or page errors, 2 if playwright is missing |
| `types [--no-assets]` | `types(args)` (`cli/types.mjs`) | `vite.resolveConfig` on the app's own `vite.config`, then calls the `api` seams: `vite-plugin-assetpack.api.runOnce()` → `vite-plugin-caper-config.api.generateTypes()` → `vite-plugin-asset-types.api.generateTypes()`; same output as a dev-server start, no server |
| `doctor [--offline] [--json]` | `doctor(args)` (`cli/doctor.mjs`) | installed vs npm latest, registry vs linked engine (+ stale `lib/` vs `src/` mtimes), `caper-app.d.ts` present/fresh vs `caper.config.ts` + `src/{scenes,plugins,popups,entities,ui,locales}`, asset dts + manifest, agent pointer block + skill file + version, peer deps, solid tsconfig (`jsx`/`jsxFactory`/`types` — only when the app depends on `@caperjs/solid`), caches, native (Tauri) toolchain — only when `src-tauri/` exists, plus a `native-plugin` row when the app also depends on `@caperjs/plugin-tauri`, six `native-android-*` rows once `src-tauri/gen/android/` exists, and six `native-ios-*` rows on macOS once `src-tauri/gen/apple/` exists, see [Native (Tauri)](#native-tauri); when the app depends on `@caperjs/plugin-3d` or lists `'3d'` in `plugins`, also `3d-plugin`, `3d-engine`, `3d-pixi`, and `3d-config` (fail if `autoLoad: false`; warn when installed but not listed); when the app depends on `@caperjs/plugin-klipp` or lists `'klipp'`, also `klipp-plugin`, `klipp-engine`, and `klipp-config` (`'klipp'` must load after `'3d'`); exit 1 on any `fail` |
| `create` | `create(projectPath, packageManager)` (`cli/create.mjs`) | parses `--use-yarn`/`--use-pnpm` and a positional path before delegating |
| `update` | `update()` (`cli/update.mjs`) | installs `@caperjs/core@latest` |
| `vo generate [inputDir] [csvDir]` | `generateVoiceoverCSV()` (`cli/voiceover/`) | |
| `audio compress [dir]` | `compress()` (`cli/audio/index.mjs`) | |
| `audio captions [csvDir] [outDir]` | `generateCaptions()` (`cli/audio/cc.mjs`) | |
| anything else | error, exit 1 | |

**`caper add <kind> <Name> [--dir path]`** (`packages/core/cli/add.mjs`) —
scaffolds a single file for `scene`, `plugin`, `entity`, or `popup` directly
into the *consumer app's* `src/` tree. The four templates are hardcoded
template-literal strings in `TEMPLATES` (`add.mjs:43-142`), not files copied
from `templates/`. `normalizeName()` (`add.mjs:19-41`) turns any input
casing ("my cool scene", "MyCoolScene") into a PascalCase class name plus a
kebab-case `id`. `DIRS` maps kind → conventional directory
(`src/scenes`, `src/plugins`, `src/entities`, `src/popups`); `SUFFIXES`
appends `Plugin`/`Popup` to the class and file name. Refuses to overwrite an
existing file. For the four file kinds, `add()` never touches `caper.config.ts` or any
registry — the new file is inert until the app's Vite-plugin discovery
(outside this page's scope) picks it up on the next dev reload, and for a
plugin, until it's also added to `caper.config.ts`'s `plugins` array.

**`caper add 3d`** and **`caper add klipp`** (`packages/core/cli/add3d.mjs`,
`packages/core/cli/addKlipp.mjs`, routed from `add.mjs`) are the `add` kinds that edit app config.
Shared body: `addPlugin(cwd, spec, deps)` in `packages/core/cli/addPlugin.mjs` (package-manager
detection, pinned engine install from the plugin's peer or `npm view`, release-age exception on pnpm,
comment- and string-aware `readPluginConfig` / `addPluginToConfig`, sample scene write, symlink
guards). Each thin entry passes a spec: plugin id, plugin package, engine package, sample scene path
and template, the `manualPlugins` snippet to print when the config cannot be edited, optional
`extraInstalls` (3d may upgrade `pixi.js` to core's pin), optional `autoLoadFalse` warning. Idempotent: announces packages and
the install command before running it.
Under npm the pinned specs (`name@version`) go in a second `npm install --save-exact`, because npm saves
`^version` even for an explicit version and a pinned beta engine must not drift (`installCommands`).

**`caper add 3d`** installs `@caperjs/plugin-3d` and `@pixi/3d@<pin>`, may upgrade `pixi.js` when
older than core's pin, appends `'3d'` to `plugins` (or prints the line when there is no `plugins`
array), writes `src/scenes/Sample3DScene.ts` (`sample-3d`) when missing, and prints next steps
including the `pixijs-3d` skill install command.

**`caper add klipp`** first checks order: `'klipp'` listed without `'3d'` before it stops the command
with a plain message, before anything is installed or written. It then runs `add3d` unless 3D is fully
set up (declared, listed without `autoLoad: false`, and `@pixi/3d` installed at the plugin's pin),
installs `@caperjs/plugin-klipp` and `@pmndrs/klipp@<pin>` (pin from the plugin's peer), appends
`'klipp'` to `plugins` (so it lands after `'3d'`), writes
`src/scenes/SampleCameraRigScene.ts` (`sample-camera-rig`) when missing, and prints next steps.

Safety rules for both commands: every version that reaches a command line must pass `isPlainVersion`;
commands run without a shell (except on Windows, where package managers are `.cmd` shims: untested
there); a symlinked `caper.config.ts`, `pnpm-workspace.yaml` or `src/scenes` is never written through,
the step is printed instead. The commands suggest restarting a running dev server, because they
install packages; a new scene file on its own is picked up without a restart.

**`caper add entity <Name> [--3d]`** (`add.mjs`): `--3d` is valid only for `entity`, either side of
the name. It writes the same file path as a normal entity scaffold but subclasses `Entity3D` from
`@caperjs/plugin-3d` (otherwise identical `defineEntity` / discovery layout). Using `--3d` with
`scene`, `plugin`, `popup`, `3d`, or `klipp` is an error.

### Native (Tauri)

**`caper native init [--title <name>] [--identifier <id>] [--port <n>] [--icon <png>]`**
(`packages/core/cli/native.mjs`) is the one-shot setup for packaging an app
with Tauri v2 — see the wiki's [build-pipeline Native (Tauri)
section](build-pipeline.md#native-tauri) for how the Vite preset itself
detects and configures for Tauri. `native init`:

1. Exits 0 with "already initialized" and touches nothing if `./src-tauri`
   already exists.
2. Adds `@tauri-apps/cli@^2` as a devDependency if it isn't one already.
3. Runs `tauri init --ci` with a generated `--app-name`/`--window-title`
   (the `package.json` name title-cased by `displayTitle`, `my-game` → "My Game",
   or `--title`), `--frontend-dist ../dist`, a pinned `--dev-url`,
   and `--before-dev-command`/`--before-build-command`: `vite --port N`
   (pins the dev server's port) and a bare `vite build`. Deliberately not the
   app's own `build` script: those often clean first, and cleaning Vite's
   `cacheDir` (`.cache`) during a native build 504s every pre-bundled dep on
   a dev server running out of the same folder. Apps with extra build steps
   edit `build.beforeBuildCommand` in `src-tauri/tauri.conf.json`.
4. Patches the generated `src-tauri/tauri.conf.json` (sets `identifier` and
   window 0's `title`/`width: 1280`/`height: 720`, or `450`x`800` when
   `caper.config.ts` sets `orientation: 'portrait'`; leaves everything else,
   including `app.security.csp`, untouched) and adds `native:dev: "tauri
   dev"` / `native:build: "tauri build"` scripts to `package.json` without
   overwriting either if already present.
5. Runs `tauri icon <path>` only when `--icon` is given.

**`caper native plugin`** (`native.mjs:285` `addNativePlugin`) wires an
already-`native init`'d app up for the runtime plugin `@caperjs/plugin-tauri`
(pause-on-hide, native fullscreen, durable saves, quit). Fails with "run
`caper native init` first" if `./src-tauri` doesn't exist. Otherwise:

1. Adds whichever of `@caperjs/plugin-tauri` and `@tauri-apps/api@^2` are
   missing as runtime dependencies, in one `run` call (`missingDeps`,
   `native.mjs:168`).
2. Runs `tauri add store` — the Tauri CLI's own one-shot for a plugin: edits
   `src-tauri/Cargo.toml` and `src-tauri/src/lib.rs` to register the
   `tauri-plugin-store` crate, adds its permission, and installs the JS
   package `@tauri-apps/plugin-store` — but only if `Cargo.toml` doesn't
   already mention `tauri-plugin-store`.
3. Patches `src-tauri/capabilities/default.json`, appending whichever of
   `TAURI_PLUGIN_PERMISSIONS` (`native.mjs:149`:
   `core:window:allow-set-fullscreen`, `core:window:allow-is-fullscreen`,
   `core:window:allow-close`) are missing from its `permissions` array
   (`patchCapabilities`, `native.mjs:156` — object-form entries and existing
   order are left alone; the file is rewritten only if something changed).
   Fails naming the file if it's missing or not valid JSON.
4. Prints the line to add to `caper.config.ts` to register the plugin, and
   the reminder to use `tauri` as the Store adapter id for durable saves.

Idempotent: a second run makes zero `run` calls and zero writes, and reports
that nothing was needed.

**`caper native android`** (`androidNative` in `native.mjs`) automates the
Android steps in [native-tauri.md](native-tauri.md#android). Fails with "run
`caper native init` first" if `./src-tauri/tauri.conf.json` doesn't exist, and
with a plain-English list if the NDK, a JDK or rustup can't be found
(`resolveAndroidEnv`, pure, also used by `caper doctor`). Every child process
gets the resolved env (`ANDROID_HOME`, `NDK_HOME`, `JAVA_HOME`, and a `PATH`
with rustup's proxies first). Otherwise:

1. Runs `rustup target add` for whichever of `ANDROID_RUST_TARGETS` (the four
   Android triples) `rustup target list --installed` lacks.
2. Runs `tauri android init --ci` if `src-tauri/gen/android/` doesn't exist.
3. Writes the 16 KB page-alignment `build.rs` if the file is missing or still
   Tauri's stock one (`planBuildRs`); skips it if `max-page-size=16384` is
   already there; otherwise leaves it and returns a warning.
4. Replaces `MainActivity.kt` (found by searching
   `gen/android/app/src/main/java/`, since Tauri mangles the identifier into
   the path) with the immersive version if it's still Tauri's stock template,
   keeping its `package` line (`planMainActivity`, `renderMainActivity`);
   skips it if it already hides `WindowInsetsCompat.Type.systemBars()`;
   otherwise warns.
5. When `caper.config.ts` sets `orientation`, sets `android:screenOrientation`
   on the `.MainActivity` element of `gen/android/app/src/main/AndroidManifest.xml`
   (`patchManifestOrientation`: `portrait`, or `sensorLandscape` for landscape;
   replaces a different value, so a re-run applies a changed config). Unset
   leaves the manifest alone. A missing manifest or MainActivity element is a
   warning. Returns `orientation` and `orientationPatched`.
6. Adds `native:android:dev` / `native:android:build` scripts
   (`patchAndroidScripts`) without overwriting existing ones.

Idempotent: a second run makes zero `run` calls and zero writes. The CLI
wrapper prints what changed, warnings, the next commands, and the `NDK_HOME` /
`JAVA_HOME` values to export for the `native:android:*` scripts.

**`caper native android dev|build [...tauri args]`** (`runAndroidTauri` in
`native.mjs`) is what the `native:android:dev` / `native:android:build`
scripts run (setup writes them; the old bare `tauri android ...` values are
upgraded on re-run). It requires `src-tauri/gen/android/` ("no Android
project, run `caper native android` first"), resolves the env with
`resolveAndroidEnv` (same plain-English toolchain error), and runs
`<pm runner> tauri android <mode> ...args` with that env and inherited stdio.
Everything after the mode passes through untouched. The wrapper exits with the
child's exit code and prints one red line, never a stack trace.

**`caper native ios [--team <ID>]`** (`iosNative` in `native.mjs`) automates the
iOS steps in [native-tauri.md](native-tauri.md#ios). Same "run `caper native
init` first" error as Android. It validates `--team` (`isValidTeamId`, 10
uppercase letters or digits) before doing anything, fails off macOS, and fails
with the `sudo xcode-select -s /Applications/Xcode.app` fix unless
`xcode-select -p` points at a full Xcode (`isFullXcode`). The env comes from
`resolveIosEnv` (pure, also used by `caper doctor`): a rustup-first `PATH`
(shared with `resolveAndroidEnv`) that also reaches `pod` and `xcodegen`
(appending `/opt/homebrew/bin` when only it has them), plus
`npm_config_user_agent=pnpm/caper` for pnpm apps so Tauri writes
`pnpm tauri ios xcode-script` into the Xcode project. Then:

1. Runs `brew install` for whichever of `cocoapods` / `xcodegen` is missing;
   without Homebrew it fails with install help. Fails if rustup is missing.
2. Runs `rustup target add` for whichever of `IOS_RUST_TARGETS` is missing.
3. Runs `tauri ios init --ci` if `src-tauri/gen/apple/` doesn't exist, then
   fails if it still doesn't (Tauri exits 0 when it gives up). Warns when
   `gen/apple/project.yml` runs the Rust build through `node tauri`
   (`xcodeScriptRunner`).
4. Writes `src-tauri/Info.ios.plist` (`renderInfoIosPlist`, `planInfoIosPlist`):
   status bar hidden, plus the iPhone/iPad orientation arrays and
   `UIRequiresFullScreen` when `caper.config.ts` sets `orientation`
   (`IOS_ORIENTATIONS`). A file without caper's marker comment is left alone
   with a warning.
5. With `--team`, sets `bundle.iOS.developmentTeam` in `tauri.conf.json`
   (`patchIosTeam`, keeping its indent). With no team in the options, the
   config or `APPLE_DEVELOPMENT_TEAM`, it warns: fine for the Simulator,
   needed for a device.
6. Adds `native:ios:dev` / `native:ios:build` and `tauri` scripts
   (`patchIosScripts`), upgrading old bare `tauri ios ...` values.

Idempotent: a second run makes zero `run` calls and zero writes.
**`caper native ios dev|build [...tauri args]`** (`runIosTauri`) requires
`src-tauri/gen/apple/` ("no iOS project, run `caper native ios` first"),
resolves the same env, and runs `<pm runner> tauri ios <mode> ...args` with
inherited stdio.

**Reading `caper.config.ts` from the CLI.** `native init`, `native android`, `native ios` and
`doctor` need only `orientation`, so they read it with
`readConfigOrientation(root)` (`build/internal/buildFlags.mjs`): the same oxc AST
parse as the preset's build flags, so nothing executes and no DOM stub is
needed. It reads the lock from either form, `orientation: 'portrait'` or the
`lock` property of `orientation: { lock: 'portrait', overlay }` (`overlay` is
never read; it may hold a function). It throws on a parse error, a missing
`defineConfig({...})` literal, or a lock that is not `'portrait'` /
`'landscape'` as a string literal; `readOrientation` (`native.mjs`) turns that
into a "could not read caper.config.ts orientation" warning and the step is
skipped. Each command takes an injectable `loadConfig(cwd)` returning the config
object, which is what the tests pass. Both paths normalize through
`resolveOrientation` (`src/utils/orientation.js`), the same helper the runtime
plugin uses.

**Identifier rule**: defaults to `dev.caper.<slug>` (slug = the app's
`package.json` name, scope stripped, lowercased, non-alnum runs collapsed to
`-`). Must match a reverse-DNS shape
(`/^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*)+$/`); Tauri's own placeholder
`com.tauri.dev` is always rejected, including when passed via `--identifier`.

**Port rule**: defaults to a stable integer in `3100-3999`, hashed from the
same slug (same app, same port every run; never `3000`, which every Caper
app's own dev server defaults to). `--port` accepts any integer
`1024-65535`.

`caper doctor` (below) adds five rows once `src-tauri/` exists:
`native-rust` (needs rustc ≥ 1.88.0), `native-tauri-cli` (`@tauri-apps/cli`
major 2 resolvable from the app), `native-identifier` (fails on
`com.tauri.dev`, warns on the `dev.caper.*` default), `native-dev-port`
(warns when `tauri.conf.json`'s `devUrl` port disagrees with
`beforeDevCommand`'s `--port`, or is the shared default `3000`), and — macOS
only — `native-xcode-clt` (`xcode-select -p`). A sixth row,
`native-plugin`, appears only when the app also depends on
`@caperjs/plugin-tauri`: `fail` if `src-tauri/Cargo.toml` doesn't mention
`tauri-plugin-store` (hint: `caper native plugin`); else `warn` naming any of
`TAURI_PLUGIN_PERMISSIONS` missing from `capabilities/default.json` (same
hint); else `ok`. Unreadable `Cargo.toml`/`capabilities/default.json` ->
`fail` naming the file. Five `native-android-*` rows appear once
`src-tauri/gen/android/` exists: `native-android-rust` (rustup reachable and
all four Android targets installed), `native-android-ndk` and
`native-android-java` (`ok` when `NDK_HOME` / `JAVA_HOME` is set to a
directory, also `ok` when unset but found, since the `native:android:*` scripts set it,
else `fail`),
`native-android-16kb` (`build.rs` has `max-page-size=16384`, else `fail`), and
`native-android-bars` (`MainActivity.kt` hides the system bars, else `warn`),
and `native-android-orientation` (`ok` when the manifest's
`android:screenOrientation` matches `caper.config.ts`'s `orientation`, or neither
sets one; `warn` hinting `caper native android` when config is set and the
manifest disagrees; `warn` hinting to set the config or remove the attribute
when only the manifest has a lock; `warn` when the config can't be read).
Failing rows hint `caper native android`. `native-android-rust` also `warn`s
(hint `export PATH="<rustup bin>:$PATH"`) when the real `PATH` resolves `rustc`
to `/opt/homebrew/bin` (Homebrew's formula) while rustup exists: the scripts
handle it, plain `tauri android` would fail.
On macOS, once `src-tauri/gen/apple/` exists, six `native-ios-*` rows:
`native-ios-xcode` (full Xcode selected, else `fail` with the `xcode-select -s`
hint), `native-ios-rust` (like the Android row, for the three iOS targets),
`native-ios-tools` (`pod` and `xcodegen` found, else `fail`),
`native-ios-team` (`warn` without a team: fine for the Simulator, needed for a
device; hint `caper native ios --team <ID>`), `native-ios-plist`
(`Info.ios.plist` hides the status bar, else `warn`), and
`native-ios-orientation` (like the Android row, comparing
`readPlistOrientation` of `Info.ios.plist`).

**`caper create [path] [--yes] [--use-yarn|--use-pnpm]`**
(`packages/core/cli/create.mjs`; `create-caper.mjs` is a thin wrapper around
it) is the interactive project scaffolder. Without a terminal on stdin and stdout it stops with a
plain message (`interactiveError`) instead of crashing at the first prompt. `--yes` / `-y` skips every
prompt for scripts and agents: path as given, the `default` template, no plugins, the name derived from
the folder, plain log lines instead of the spinner, and a non-empty folder is refused, never written
into. It:
1. Lists `templates/app/*` via `fs.readdirSync` (`create.mjs:264-276`) and
   reads each dir's `.meta.json` (`{title, description}`) to build the
   template-choice prompt.
2. Prompts for a plugin multiselect sourced from the hardcoded
   `AVAILABLE_PLUGINS` array (`create.mjs:13-44`) — six first-party plugins
   listed by hand, not derived from the published `@caperjs/plugin-*` set.
3. Prompts for a project name, then `write_template_files()`
   (`create.mjs:99-219`) copies `templates/<template>` verbatim and does
   token substitution: `package.template.json` → `package.json` (sets the
   name, resolves `~PACKAGE_MANAGER~` in scripts, stamps in the current
   framework version and its `peerDependencies`, adds selected plugins as
   dependencies); `~NAME~` in `index.html`/`README.md`; `__APPLICATION_NAME__`
   in `caper.config.ts` and recursively across every file under `src/`
   (including renaming `src/__APPLICATION_NAME__.ts` itself); a plugins-array
   patch in `caper.config.ts` that handles both an empty `plugins: []` and a
   non-empty array (matching brackets, then inserting alongside existing
   entries).
4. Deletes `.meta.json`/`package.template.json`, writes a
   `shamefully-hoist=true` `.npmrc`, and runs `<packageManager> install`.

**`caper update`** (`cli/update.mjs`) runs
`<package_manager> install @caperjs/core@latest`.

**`caper install`** (`cli/install-peerdeps.mjs`) reads its *own*
`package.json`'s `peerDependencies`, detects the consumer's package manager
(`packageManager` field → lockfile sniffing → npm fallback), and shells out
to install every peer dep at the version this package declares.

**`caper vo generate [inputDir] [csvDir]`**
(`cli/voiceover/generateVoiceoverCSV.mjs`) scans one or more
comma-separated locale directories for `.js`/`.ts`/`.json` files, coerces
`.js`/`.ts` source to JSON with a regex pass (strip comments, single→double
quotes, quote bare keys — not a real parser, see Gotchas), then emits a
tab-separated CSV per input file. It merges into any pre-existing CSV by
filename key, so hand-edited voice/gender/language/caption columns survive
regeneration.

**`caper audio compress <dir>`** (`cli/audio/index.mjs`) shells out to
`ffmpeg` per file under `<dir>/source`, producing `.webm` (libvorbis) and
`.mp3` (libmp3lame) into `<dir>/output`. Requires `ffmpeg` on `PATH`; no
existence check.

**`caper audio captions <csvDir> <outDir>`** (`cli/audio/cc.mjs`) reads clip
durations via `ffprobe` from already-compressed `output/` files, parses
caption CSVs (tolerant of `FILENAME`/`File Name` and `LINE`/`VO Line`
column-name variants), splits multi-line VO text on `--`, and apportions
timing across the clip's duration proportional to character count, writing
`cc.json`. Contains one hardcoded per-file special case
(`fixSpecialCases`, `cc.mjs:118-124`) — a leftover project-specific patch,
not general logic.

## Templates

- **`templates/app/<name>/`** — one directory per `caper create` app
  template; today only `default`. Each needs `.meta.json`
  (`{title, description}`, surfaced in the wizard) and
  `package.template.json` (becomes `package.json`). Everything else is
  copied byte-for-byte except the three placeholder tokens described above
  (`~NAME~`, `~PACKAGE_MANAGER~`, `__APPLICATION_NAME__`). The `assets/`
  subtree uses AssetPack folder-tag suffixes — `{m}` (manifest bundle),
  `{tps}` (texture-packer sheet), `{fix}` (fixed, no content-hash),
  `{family=...}`/`{wf}` (webfont) — consumed by the app's own AssetPack
  build step (`packages/core/build/assetpack.mjs`) at bundle time, not by
  the CLI itself.
- **`templates/plugin/`** — **not** consumed by anything under
  `packages/core/cli`. It scaffolds a first-party `@caperjs/plugin-*`
  package for *this monorepo*, driven instead by the repo-root generator
  `scripts/create-plugin.mjs` (invoked via the root `plugin:create` script).
  It uses a different placeholder dialect —
  `~pluginName~`/`~PluginName~`/`~PLUGIN_NAME~`/`@pluginName` — substituted
  by that script's own `replacePlaceholders()`, entirely independent of
  `create.mjs`'s token set. It ships inside the published npm package only
  as a side effect of `templates/` shipping wholesale; end users of the
  published `caper` CLI have no path that reads it.

## Seams & extension points

- **New `caper add` kind**: add the string to `KINDS`, a template function
  to `TEMPLATES`, a directory to `DIRS`, and (if it needs one) a suffix to
  `SUFFIXES` in `add.mjs` — all four maps key off the same string, and
  `add()` has no other logic assuming exactly four kinds. Closed, mechanical
  edit.
- **New `caper create` app template**: add `templates/app/<name>/` with
  `.meta.json` + `package.template.json`. `create.mjs` auto-lists every
  directory under `templates/app` (`create.mjs:264-276`) — no code change
  needed beyond the new directory and its files.
- **New first-party plugin in the create wizard**: must be added by hand to
  `AVAILABLE_PLUGINS` (`create.mjs:13-44`). Publishing a new
  `packages/plugin-*` package does **not** automatically surface it here —
  this list is the wizard's only source of truth for "plugins that exist."
- **New CLI subcommand**: add a `case` to the switch in `cli.mjs` and a
  module under `cli/`.
- **New "opt in to a plugin" command**: add a spec object and a thin `addFoo.mjs` that calls
  `addPlugin` from `cli/addPlugin.mjs`, route `foo` in `add.mjs`, add a presentation wrapper if
  needed, and add matching `doctor` rows (see `addKlipp.mjs`, `addKlipp.test.mjs`, and the klipp
  block in `doctor.mjs`). Tests for scaffold flags live in `add.test.mjs`.

## Invariants & gotchas

- `create-caper.mjs` (`cli/create-caper.mjs:1-9`) shells out to a bare
  `caper create` via `child_process.exec`, with no path resolution and no
  check of the child's exit code. It only works once `caper`'s own bin is
  already resolvable on `PATH` (true after npm/pnpm bin-linking), and any
  failure is silently swallowed.
- `caper update` (`cli/update.mjs`) runs `<pm> install @caperjs/core@latest`, so it
  upgrades the actual dependency a consumer project depends on, matching
  `cli.mjs`'s "Updating Caper to the latest version..." message.
- `caper create`'s "Enter to use default" prompt does what it says: if the user
  presses Enter with empty input, `appName` falls back to `defaultName` (PascalCase,
  derived from the target directory), so a directory named `my-cool-game` produces
  class name `MyCoolGame` as promised.
- The `caper.config.ts` plugins-array patch (`create.mjs`) handles both cases: a
  literally-empty `plugins: []` is replaced directly; a non-empty array is found by
  matching brackets and has the selected plugins inserted alongside the existing
  entries.
- `audio/index.mjs` and `audio/cc.mjs` shell out to `ffmpeg`/`ffprobe` with
  no existence check or version pin; failures surface only as opaque `exec`
  errors, not an actionable "ffmpeg not found."
- `generateVoiceoverCSV`'s `.js`/`.ts` "parser"
  (`voiceover/generateVoiceoverCSV.mjs:124-141`) is a regex-based JSON
  coercion, not a real parser — it mishandles any locale file whose string
  values contain single quotes, colons in odd positions, or trailing-line
  comments it doesn't strip.

## Recipes

- **Add a `caper add hud` kind**: in `add.mjs`, push `'hud'` onto `KINDS`,
  add `hud: ({className, id}) => \`...\`` to `TEMPLATES`, `hud: 'src/uis'`
  to `DIRS`, and (optionally) a suffix to `SUFFIXES`. No other file changes
  needed — `add()` is generic over the kind string.
- **Ship a new `caper create` template (e.g. a "minimal" app)**: create
  `templates/app/minimal/` with `.meta.json` + `package.template.json` +
  the rest of the app skeleton, reusing the same three placeholder tokens
  as `templates/app/default/`. It appears in the wizard automatically.
- **Add a newly published plugin to the create wizard**: add an entry to
  `AVAILABLE_PLUGINS` in `create.mjs` (name/displayName/description) — this
  is the only wiring needed for it to show up as a multiselect option and
  get injected into `caper.config.ts` + `package.json` on selection.
- **Trace what a `caper create` run touches, end to end**: `cli.mjs` →
  `create.mjs:create()` → `write_template_files()` copies
  `templates/app/<template>` → token substitution across
  `package.json`/`index.html`/`README.md`/`caper.config.ts`/`src/**` →
  `.meta.json`/`package.template.json` deleted → `.npmrc` written →
  `<packageManager> install` shelled out. New template files ride this
  pipeline for free; only `index.html`, `README.md`, `caper.config.ts`, and
  `src/__APPLICATION_NAME__.ts` get substitution beyond the generic
  `__APPLICATION_NAME__` sweep over `src/**`.
