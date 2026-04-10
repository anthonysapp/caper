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

- [!] User generates `SyncopateBold.{png,fnt}` — same character set as the old
      bitmap (A–Z, a–z, 0–9, punctuation, ℠), 128pt recommended, ~821×821 atlas
- [ ] Drop into `apps/kitchen-sink/assets/required{m}/bitmap-fonts{copy}/`
- [ ] Delete `KumbhSansBlack.{png,fnt}` from source and
      `public/assets/required/bitmap-fonts/` output
- [ ] Rename `FONT_LEGACY_BITMAP` → `FONT_DISPLAY_BITMAP` in
      `Constants.ts`, point at `'SyncopateBold'`
- [ ] Commit: `feat(kitchen-sink): replace legacy Kumbh bitmap font with Syncopate Bold`

## Phase 5 — Core template sync

> Why: the default template under `packages/core/templates/app/default/` also
> ships Kumbh Sans (4 ttfs + 3 fontFamily refs). Leaving it stale means
> `caper create` scaffolds new apps branded to the old fork. Migrating it in
> the same revamp keeps the template on-brand for future users.

- [ ] Replace `packages/core/templates/app/default/assets/required{m}/fonts{fix}/KumbhSans-*.ttf`
      with matching Syncopate-Bold + SpaceGrotesk ttfs (same tags as Phase 2)
- [ ] Sweep `fontFamily: 'KumbhSans'` in
      `packages/core/templates/app/default/src/scenes/Start.ts` (lines 30, 56)
      and `Game.ts` (line 14) → Space Grotesk literal (template has no
      Constants.ts to centralize through; keep it inline for minimal template
      surface)
- [ ] `pnpm cli:create` smoke test — scaffolds `../cli-test-app`, verify the
      scaffolded Start scene renders text correctly
- [ ] Commit: `feat(core): update default template to Syncopate + Space Grotesk`

## Phase 6 — Shell rewrite

> Why: the current HTML shell is a leftover from the dill-pixel days — neutral
> gray palette, generic nav, `while (!nav)` busy-wait in main.ts. This phase
> rebuilds it around the new brand without changing its core function (sidebar
> scene picker + canvas). Explicit non-goal: don't break the hash-based scene
> routing that already works.

- [ ] Rewrite `apps/kitchen-sink/src/css/styles.css` — full palette + typography
      pass, new sidebar states, custom scrollbar, subtle noise overlay
- [ ] Rewrite `apps/kitchen-sink/index.html` header — inline
      `public/static/caper.svg` (mascot) + `caper-text.svg` (wordmark) side by
      side, drop the old `caper.png` img reference, add version meta slot
      (`v{version} · pixi {pixiVersion}` from `import.meta.env`), add hamburger
      button (hidden until Phase 8 media queries kick in)
- [ ] Extract sidebar DOM building from `main.ts` into a new
      `apps/kitchen-sink/src/ui/sidebar.ts` `Sidebar` class. Constructor takes
      the app, owns active-state tracking. `main.ts` becomes `new Sidebar(app).mount()`
- [ ] Replace the `while (!nav)` busy-wait at `main.ts:12-16` with a fail-loud
      assert — `nav` is static in `index.html`, so a missing element is a bug
      (aligns with the fail-loud-over-silent-fallbacks principle)
- [ ] Swap `innerHTML` → `textContent` for group labels and scene names — no
      reason to keep the XSS vector when plain text suffices
- [ ] `pnpm kitchen-sink:dev` — verify sidebar populates, hash routing still
      works, active state tracks, scene transitions still disable the nav
- [ ] Commit: `feat(kitchen-sink): redesign shell around Caper brand`

## Phase 7 — Sidebar interactions

> Why: "modern and flashy but still functional to select scenes" — the sidebar
> is the primary navigation and 47+ scenes is a lot to scroll. Keyboard nav +
> fuzzy filter makes the picker actually usable without breaking anything for
> mouse users.

- [ ] Add a tiny search input above the nav; `/` focuses it, `Esc` clears.
      Client-side filter over `app.scenes.debugGroupsList`, pill shows
      `{matched}/{total}`
- [ ] Keyboard nav — `j`/`k` and arrow keys cycle scenes within the current
      group; `J`/`K` jump groups. Hash stays source of truth; keys just mutate
      `location.hash`
- [ ] Hint row at the bottom of the sidebar: `j/k ↕   /  filter`
- [ ] Don't break: existing `hashchange` listener, `onSceneChangeComplete`
      disabled toggle
- [ ] Commit: `feat(kitchen-sink): add keyboard nav and scene filter to sidebar`

## Phase 8 — Responsive overlay

> Why: below ~960px the 280px fixed sidebar starts eating too much canvas.
> Below 480px the current behavior hides the sidebar entirely and we lose scene
> selection. Hamburger overlay keeps the picker reachable at every size.

- [ ] `<960px`: sidebar collapses to a top bar with wordmark + hamburger;
      clicking hamburger slides nav in as an overlay with backdrop-blur on the
      canvas column
- [ ] `<480px` / `<480h`: canvas full-bleed as today, but hamburger stays
      accessible in the top-left corner
- [ ] `prefers-reduced-motion`: static noise overlay, instant slide-ins, no
      active-bar animation
- [ ] Commit: `feat(kitchen-sink): add mobile sidebar overlay`

## Phase 9 — Start scene + shared scene chrome

> Why: the current Start scene is an upstream demo placeholder. Replacing it
> with the brand splash (mascot + wordmark + tagline) makes the first thing
> you see when running the kitchen sink feel like *Caper*, not a stale fork.
> `CaperSceneBackground` extends that consistency across every scene without
> forcing each one to re-implement its backdrop.

- [ ] New `apps/kitchen-sink/src/ui/CaperSceneBackground.ts` — `--caper-ink`
      fill, faint olive vignette, 1px olive grid at 32px spacing with 0.04 alpha
- [ ] Use as default background on scenes that don't override (base class
      tweak in the kitchen-sink app only, not the framework)
- [ ] Rewrite Start scene — mascot centered (SVG or high-res PNG via Pixi),
      wordmark below, tagline in Space Grotesk, idle animation (eye-blink every
      ~4s, breathing scale) via GSAP, "Pick a scene →" CTA that briefly flashes
      the sidebar
- [ ] Palette/typography pass on Display/UI/Audio/Framework scenes — use the
      new constants, no content rewrites
- [ ] Commit: `feat(kitchen-sink): rebrand Start scene and shared scene chrome`

## Phase 10 — CaperPanel / CaperButton migration

> Why: the most-visited scenes (UI, Display, Audio) already have ad-hoc
> panels and buttons. Extracting shared `CaperPanel` / `CaperButton` components
> gives them a consistent look without touching every scene at once.

- [ ] New `apps/kitchen-sink/src/ui/CaperPanel.ts` — olive hairline,
      `--caper-panel` fill, 12px radius, optional Syncopate header slot
- [ ] New `apps/kitchen-sink/src/ui/CaperButton.ts` — matches the sidebar
      hover treatment (olive inset bar slide-in)
- [ ] Migrate buttons/panels in 3–5 highest-traffic scenes: Start, UI
      (UICanvasScene, PopupScene), Display, Audio, Framework
- [ ] Remaining scenes get the new background + font only — left for organic
      migration when they're next touched
- [ ] Commit: `feat(kitchen-sink): migrate core scenes to Caper UI kit`

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
