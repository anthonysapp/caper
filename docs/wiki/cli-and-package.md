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
- **`peerDependencies`**: `pixi.js@8.19.0` (pinned exact — the renderer;
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
as the `caper` bin. It gates on Node ≥ 18 (`cli.mjs:16-23`), prints a version
banner unless the subcommand is `version`/absent, then switches on `args[0]`:

| subcommand | handler | notes |
|---|---|---|
| `install` | `installPeerDeps()` (`cli/install-peerdeps.mjs`) | installs the peer deps listed above into the consumer project |
| `version` | (banner only) | no-op past the version print |
| `dev`/`start`/`build`/`preview` | rejected, exit 1 (`cli.mjs:50-63`) | removed in 0.2.0; kept as named cases purely to print "run vite directly" instead of "unknown subcommand" |
| `add` | `add(args.slice(1))` (`cli/add.mjs`) | scaffold one scene/plugin/entity/popup file |
| `agent init [--dir <skillsDir>]` | `agent(args.slice(1))` (`cli/agent.mjs`) | copies the shipped `caper` agent skill into the app (default `.claude/skills/`) and upserts a marker-delimited pointer block into `AGENTS.md`/`CLAUDE.md` |
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
existing file. Critically, `add()` never touches `caper.config.ts` or any
registry — the new file is inert until the app's Vite-plugin discovery
(outside this page's scope) picks it up on the next dev reload, and for a
plugin, until it's also added to `caper.config.ts`'s `plugins` array.

**`caper create [path] [--use-yarn|--use-pnpm]`**
(`packages/core/cli/create.mjs`; `create-caper.mjs` is a thin wrapper around
it) is the interactive project scaffolder. It:
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
