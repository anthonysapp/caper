---
name: caper
description: Work on a game built with the Caper engine (@caperjs/core, PixiJS v8). Use before touching scenes, entities, popups, UI, plugins, caper.config.ts, assets, generated types, or the dev/verify loop in any app that depends on @caperjs/core. Routes you to the exact section of the shipped reference (llms.txt) instead of the whole engine, and gives the verify loop (typecheck, build, headless automation bridge). Trigger for "caper", "add a scene/entity/popup/plugin", "factory methods", "add.sprite", "defineScene", "actions", "UICanvas", "FlexContainer", "caper.config", "caper-app.d.ts", "assetpack", "window.Caper", or any error mentioning @caperjs.
---

# Caper — how to work in a Caper app

This skill is shipped by `@caperjs/core` and copied here by `caper agent init`.
Do not edit it; re-run `npx caper agent init` after upgrading caper.

## 1. Read the reference by section, never whole

The full consumer reference is `node_modules/@caperjs/core/extras/llms.txt`
(~1,600 lines). Load only the section you need:

```bash
grep -n '^## ' node_modules/@caperjs/core/extras/llms.txt      # section line numbers
sed -n '<start>,<end>p' node_modules/@caperjs/core/extras/llms.txt
```

| You need to…                                  | Read section                       |
| --------------------------------------------- | ---------------------------------- |
| know the rules before writing any code        | §1 Rules of engagement             |
| scaffold a scene / entity / popup / plugin    | §2.2 CLI, §15 Recipes              |
| boot, `create()`, custom `Application`        | §3                                 |
| `caper.config.ts`, actions, contexts, data    | §4                                 |
| scene lifecycle, assets per scene, transitions| §5                                 |
| build a display tree (`add.*` / `make.*`)     | §6 (full catalog at §6.1)          |
| buttons, flex layout, popups, toasts, HUD     | §7                                 |
| `app.scenes / actions / popups / audio / …`   | §8                                 |
| write or fix a plugin                         | §9                                 |
| assets, bundles, AssetPack tags               | §11                                |
| signals, store, mixins                        | §12                                |
| generated types, virtual modules              | §14                                |
| drive the running app headlessly              | §17 Automation bridge              |
| look up one symbol                            | §18 API index (name → section)     |

Engine source also ships: `node_modules/@caperjs/core/src/`. When the doc is
not enough, open the one file the doc cites, not the whole tree.

## 2. The rules (llms.txt §1, condensed)

1. `caper.config.ts` `plugins: [...]` is authoritative; list every plugin,
   including ones other plugins `require`.
2. Fail loud. No silent fallbacks in plugins or config.
3. Metadata goes on `defineScene / defineEntity / definePopup / definePlugin`
   wrappers, not class statics. Default-export the class so discovery finds it.
4. `this.add.*` / `this.make.*` over `new Sprite()` / `new Text()` /
   `new Graphics()` / `new Container()`. Extend Caper's `Container`, not Pixi's.
5. `npx caper add scene|entity|popup|plugin <Name>` before hand-authoring.
6. Verify in the running app, not in isolation (see §3 below).

## 3. Verify loop

```bash
npx caper doctor      # 10 lines: which caper, types fresh?, pointers, peers. Fix ✗/⚠ first
npx caper types       # regenerate caper-app.d.ts + caper-assets.d.ts, no dev server (fresh clone, renames)
pnpm typecheck        # or the app's tsc script; first gate after any .ts change
pnpm build            # vite build; catches asset and discovery errors
```

Then check behaviour live, cheapest first:

- **Use your own browser, never the human's.** Launch a separate Chromium with
  Playwright (a script via `npx tsx`, or the Playwright MCP tools) pointed at the
  dev-server URL. Do **not** attach to or drive the human's own Chrome (for
  example claude-in-chrome tabs) unless they ask you to look at a tab of theirs.
  Headless for checks; headed (`headless: false`) only when a human will watch.

  ```ts
  import { chromium } from 'playwright';
  const browser = await chromium.launch();               // isolated, throwaway profile
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.error('pageerror', e));
  await page.goto('http://localhost:3000/');
  await page.waitForFunction(() => window.Caper?.__readyApps?.size > 0);
  await page.screenshot({ path: 'scratch/after-change.png' });
  await browser.close();
  ```

- **Headless via the automation bridge** (dev server, or `automation: true`
  in config, or `VITE_CAPER_AUTOMATION=true`). Shipped driver, no code:
  `npx caper agent probe <url> [--action name[=json]]… [--until "s => …"] [--screenshot p] [--json]`
  → context, state, action log, page/console errors, exit 1 on failure. For
  anything richer, in Playwright: `const app = await Caper.ready(); const a =
  Caper.automation[app.config.id];` then `a.action('name', data)`,
  `a.getContext()`, `a.getState()`, `await a.waitFor(s => …, { timeoutMs })`,
  and inspect `a.log` (last 200 entries). Details: llms.txt §17.
- **Do not start the dev server yourself** and leave it running in the
  foreground; it never exits. If the human has it running, use it. Otherwise
  ask them to run `pnpm dev` and report.

## 4. Gotchas that cost agents the most time

- Out-of-context actions are **dropped by the ActionsPlugin**. That is the
  phase guard; do not add `if (phase !== …)` checks around `sendAction`.
- `src/types/caper-app.d.ts` and `caper-assets.d.ts` are **generated**. Never
  hand-edit. Missing (fresh clone; they are usually gitignored) or stale after a
  rename → `npx caper types`. No dev server needed.
- Weird asset / name mismatches → `rm -rf .assetpack .cache dist` and rebuild.
- Renamed a scene / popup / entity id? Regenerate types (above) or old ids
  linger in the unions and cause confusing downstream errors.
- If the engine is **linked from a local checkout**, consumer apps resolve the
  built `lib/`; rebuild the engine (`pnpm framework:build` in the caper repo)
  after editing engine source, unless the app's vite config aliases
  `@caperjs/core` to the engine `src/`. `npx caper doctor` reports "linked from
  …" and flags a stale build.
