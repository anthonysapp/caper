# Kitchen-sink Revamp

Living checklist tracking the kitchen-sink app rebrand: new brand (masked-olive
mascot + CAPER wordmark in Syncopate Bold), full Kumbh Sans → Syncopate +
Space Grotesk rip, HTML shell redesign, Start scene + shared scene chrome
refresh. Full rationale and design in the approved plan at
`/Users/anthony/.claude/plans/concurrent-zooming-key.md` (local); the why-notes
that matter for future contributors are inlined here per the plan-files-are-first-class
principle.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[-]` skipped · `[!]` blocked

---

## Phase 1 — Foundations

- [x] Write this plan file
- [x] Add `apps/kitchen-sink/src/theme.ts` — Caper palette as TS constants so
      Pixi scenes can share the same colors as the CSS shell. Mirrors the
      `--caper-*` custom properties added later to `styles.css`. Using `as const`
      for type narrowing when Pixi consumes the hex values.
- [ ] Commit: `docs(kitchen-sink): add revamp plan and theme constants`

## Phase 2 — Font assets (unified AssetPack pipeline)

> Why a single pipeline: today Kumbh Sans lives in three places —
> `public/fonts/`, `public/static/fonts/`, and AssetPack's output at
> `public/assets/splash/fonts/`. The first two are hand-synced duplicates of
> the third. Unifying on AssetPack means one ttf source, one output, both the
> HTML shell CSS and the PixiJS splash bundle reading from the same place.
> Self-hosted throughout (no Google CDN) so offline dev and the PWA plugin
> keep working.

- [x] Fetch ttf sources: Syncopate-Bold from `apache/syncopate/` on Google Fonts
      GitHub; SpaceGrotesk-{Regular,Medium,Bold} static weights from the font's
      own repo (`floriankarsten/space-grotesk/fonts/ttf/static/`). Note: Google
      Fonts only ships a variable Space Grotesk — static weights sourced from
      upstream. AssetPack webfont transform expects static ttfs (confirmed by
      existing KumbhSans sources).
- [x] Dropped into `assets/splash{m}/fonts{fix}/` with AssetPack tags
- [x] Deleted the four `KumbhSans-*{family=KumbhSans}{wf}.ttf` sources
- [x] `pnpm kitchen-sink:build` — AssetPack emits **plain (unhashed)** filenames:
      `SpaceGrotesk-Bold.woff2`, `SpaceGrotesk-Medium.woff2`,
      `SpaceGrotesk-Regular.woff2`, `Syncopate-Bold.woff2`. No CSS stub
      generated; direct URL paths work.
- [x] Rewrote `src/css/styles.css` `@font-face` to read from `/assets/splash/fonts/...`;
      updated `font-family` on body from `'Kumbh Sans'` to `'Space Grotesk'`
- [x] Grepped — only `styles.css` referenced `public/fonts/` or `public/static/fonts/`
- [x] Deleted `apps/kitchen-sink/public/fonts/` entirely
- [x] Deleted `apps/kitchen-sink/public/static/fonts/` entirely
- [ ] `pnpm kitchen-sink:dev` — verify splash + shell render in new fonts
- [ ] Commit: `feat(kitchen-sink): unify font pipeline on AssetPack with Syncopate + Space Grotesk`

## Phase 3 — Constants + fontFamily sweep

> Why: today `src/utils/Constants.ts` exports `FONT_KUMBH_SANS` and
> `FONT_KUMBH_SANS_BLACK`, but only 5 files use them — the other 10+ scene
> files hard-code `fontFamily: 'KumbhSans'`. 36 references across 14 files.
> Centralizing on semantic-role constants (`FONT_BODY`, `FONT_DISPLAY`) makes
> the next font swap a one-line change instead of another 36-edit sweep.

- [x] Rewrite `apps/kitchen-sink/src/utils/Constants.ts`:
  - `FONT_BODY = 'Space Grotesk'`, `FONT_DISPLAY = 'Syncopate'`,
    `FONT_LEGACY_BITMAP = 'KumbhSansBlack'`. Also migrated `COLOR_*`
    constants to use `CaperColors` from `@/theme`.
- [x] Sweep the 14 scene files with hard-coded `fontFamily: 'KumbhSans'` →
      `fontFamily: FONT_BODY` via import from `@/utils/Constants`. All 36
      references replaced. Files touched: Start.ts, PauseScene.ts, TimerScene.ts,
      UIToasterScene.ts, UICanvasScene.ts, FlexContainerScene.ts, PopupScene.ts,
      AnimatedSpriteScene.ts, AudioScene.ts, MusicScene.ts, FocusScene.ts.
- [x] Updated files already using constants: Splash.ts, TextScene.ts,
      CrunchPhysicsScene.ts, ExamplePopup.ts — renamed imports.
- [x] TextScene.ts:61 now uses `FONT_LEGACY_BITMAP`
- [x] Exit criterion verified: only `FONT_LEGACY_BITMAP = 'KumbhSansBlack'`
      and auto-generated `caper-assets.d.ts` bitmap-font asset names remain.
      No hand-authored code references `'KumbhSans'` outside the legacy bitmap.
- [ ] `pnpm kitchen-sink:dev` — walk every affected scene, confirm text renders
- [ ] Commit: `refactor(kitchen-sink): centralize font family via FONT_BODY/FONT_DISPLAY`

## Phase 4 — Bitmap font replacement (deferred, user-blocked)

> Why deferred: generating a 128pt 91-glyph bitmap font atlas needs external
> tooling (bmglyph / Hiero / snowb.org). User is producing it; meanwhile the
> legacy `KumbhSansBlack.{png,fnt}` stays in place as the single allowed Kumbh
> residue, gated behind `FONT_LEGACY_BITMAP`. Phases 5+ do NOT block on this.

- [x] User delivered `Syncopate.{png,fnt}` (face name: `Syncopate Bold`, 128pt,
      91 chars, 897×902 atlas) into `assets/required{m}/bitmap-fonts/`
- [x] Old `KumbhSansBlack.{png,fnt}` already removed by user
- [x] Renamed `FONT_LEGACY_BITMAP` → `FONT_DISPLAY_BITMAP = 'Syncopate Bold'`
- [x] Updated TextScene.ts to import `FONT_DISPLAY_BITMAP`
- [x] Rebuilt — AssetPack output shows Syncopate.{fnt,png,webp} with @0.5x variants
- [x] Exit: `grep KumbhSans apps/kitchen-sink/src` returns empty
- [x] Commit: `feat(kitchen-sink): replace legacy Kumbh bitmap font with Syncopate Bold`

## Phase 5 — Core template sync

> Why: the default template under `packages/core/templates/app/default/` also
> ships Kumbh Sans (4 ttfs + 3 fontFamily refs). Leaving it stale means
> `caper create` scaffolds new apps branded to the old fork. Migrating it in
> the same revamp keeps the template on-brand for future users.

- [x] Replaced template font TTFs with Syncopate-Bold + SpaceGrotesk (same tags)
- [x] Swept `fontFamily: 'KumbhSans'` → `'Space Grotesk'` in template Start.ts
      and Game.ts (inline, no Constants.ts in template)
- [x] Updated JSDoc @example strings in `packages/core/config/vite.mjs` codegen
      (`'KumbhSans-Regular'` → `'SpaceGrotesk-Regular'`, etc.)
- [x] `pnpm framework:build` passes
- [ ] `pnpm cli:create` smoke test (deferred — scaffolds to `../cli-test-app`)
- [x] Commit: `feat(core): update default template to Syncopate + Space Grotesk`

## Phase 6 — Shell rewrite

> Why: the current HTML shell is a leftover from the dill-pixel days — neutral
> gray palette, generic nav, `while (!nav)` busy-wait in main.ts. This phase
> rebuilds it around the new brand without changing its core function (sidebar
> scene picker + canvas). Explicit non-goal: don't break the hash-based scene
> routing that already works.

- [x] Full rewrite of `styles.css` — Caper palette as CSS custom properties,
      noise texture overlay, olive-tinted canvas shadow, Syncopate headers,
      Space Grotesk body, custom scrollbar, olive inset-bar hover states,
      active state with box-shadow + glow bar, prefers-reduced-motion guards
- [x] Rewrote `index.html` header — mascot SVG (44px) + wordmark SVG side by
      side via `<img>`, version meta slot (#version-meta), olive divider,
      Syncopate "EXAMPLES" label. SVGs referenced as img src (too large to inline
      at 18KB + 8KB). Hamburger deferred to Phase 8.
- [x] Extracted sidebar DOM into `src/ui/sidebar.ts` `Sidebar` class — owns
      nav population, active-state sync, hash binding, version meta population.
      `main.ts` reduced to `new Sidebar(app).mount()`.
- [x] Replaced `while (!nav)` busy-wait with `throw new Error(...)` — fail-loud
- [x] All `innerHTML` → `textContent` for group labels and scene names
- [x] `pnpm kitchen-sink:build` passes
- [ ] `pnpm kitchen-sink:dev` — visual verification
- [x] Commit: `feat(kitchen-sink): redesign shell around Caper brand`

## Phase 7 — Sidebar interactions

> Why: "modern and flashy but still functional to select scenes" — the sidebar
> is the primary navigation and 47+ scenes is a lot to scroll. Keyboard nav +
> fuzzy filter makes the picker actually usable without breaking anything for
> mouse users.

- [x] Search input above nav; `/` focuses, `Esc` clears + blurs. Filters
      visible links by substring match. Count pill shows `{matched}/{total}`.
      Groups with zero visible links are hidden entirely.
- [x] Keyboard nav: `j`/`k`/ArrowDown/ArrowUp cycle within visible links;
      `J`/`K` (shift) jump to first link of next/prev group. Wraps at boundaries.
- [x] Hint row at sidebar bottom: `/ filter  j k navigate`
- [x] Does not break: hashchange listener, onSceneChangeComplete disabled toggle
- [x] `pnpm kitchen-sink:build` passes
- [x] Commit: `feat(kitchen-sink): add keyboard nav and scene filter to sidebar`

## Phase 8 — Responsive overlay

> Why: below ~960px the 280px fixed sidebar starts eating too much canvas.
> Below 480px the current behavior hides the sidebar entirely and we lose scene
> selection. Hamburger overlay keeps the picker reachable at every size.

- [x] `<960px`: hamburger button (fixed top-left), sidebar slides in as overlay
      with backdrop-blur. Clicking backdrop or selecting a scene closes it.
- [x] `<480px` / `<480h`: same overlay behavior, narrower sidebar (280px)
- [x] `prefers-reduced-motion`: all transitions disabled (sidebar, backdrop,
      nav hover bars, noise overlay)
- [x] Hamburger animates to X on open (3 spans rotate/fade)
- [x] Commit: `feat(kitchen-sink): add mobile sidebar overlay`

## Phase 9 — Start scene + shared scene chrome

> Why: the current Start scene is an upstream demo placeholder. Replacing it
> with the brand splash (mascot + wordmark + tagline) makes the first thing
> you see when running the kitchen sink feel like *Caper*, not a stale fork.
> `CaperSceneBackground` extends that consistency across every scene without
> forcing each one to re-implement its backdrop.

- [x] Updated BaseScene._bg to use CaperColors.ink + 32px olive grid (alpha 0.04)
      directly in existing `resize()` method. No separate CaperSceneBackground
      class needed — the background was already in BaseScene, just needed new
      colors and the grid. Every scene inheriting BaseScene gets it for free.
- [x] Rewrite Start scene — mascot sprite centered, "CAPER" wordmark in
      Syncopate Bold with letter-spacing, tagline in Space Grotesk, idle
      breathing animation via GSAP, pulsing CTA "Pick a scene from the sidebar →"
- [x] Palette/typography pass on all scenes via BaseScene + Constants already
      done in Phase 3; no additional per-scene content rewrites needed.
- [x] Commit: `feat(kitchen-sink): rebrand Start scene and shared scene chrome`

## Phase 10 — CaperPanel / CaperButton migration

> Why: the most-visited scenes (UI, Display, Audio) already have ad-hoc
> panels and buttons. Extracting shared `CaperPanel` / `CaperButton` components
> gives them a consistent look without touching every scene at once.

- [x] New `src/ui/CaperPanel.ts` — olive hairline, caper-panel fill, 12px
      radius, optional Syncopate header slot, resizable
- [x] New `src/ui/CaperButton.ts` — olive inset bar on hover, caper-panel fill,
      pointer events, onClick callback
- [ ] Migrate buttons/panels in high-traffic scenes: Start, UI, Display, Audio,
      Framework — left for organic migration when those scenes are next touched,
      now that the components exist and every scene already has the new fonts/bg.
- [x] Commit: `feat(kitchen-sink): add CaperPanel and CaperButton UI components`

---

## Explicit non-goals

- **No framework-level changes** in `packages/core/src/`. Scene base classes get
  tweaked in the kitchen-sink app only. If a change really needs to live in
  core, it gets its own plan file and commit series.
- **No scene content rewrites** for Crunch Physics, Rive, or anything doing
  something domain-specific — palette and typography only on those.
- **No docs site rebuild**. `apps/docs/` is already gone (Phase 6 of the fork
  plan); a new docs surface is out of scope for this revamp.
- **No new first-party plugins** spun out of this work.
