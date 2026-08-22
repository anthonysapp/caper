# Declarative Pixi for Caper: the official `@pixi/react`, and what a declarative layer actually requires

**Summary.** The official `@pixi/react` (pixijs org) is a maintained React 19 + PixiJS v8 custom renderer built on `react-reconciler`; v8 was a full rewrite (v8.0.0, Feb 2025) whose current release is v8.0.5 (Dec 2025). It is a *thin* declarative layer — `<pixiX>` JSX elements become Pixi instances, props are diffed and written onto those instances on React commits, and the Pixi ticker/renderer run untouched outside React; it deliberately does **not** provide game-framework services (no scenes, no asset/Suspense pipeline, no lifecycle hooks like Caper's `added`/`resize`/`update` — those are Caper's existing job). Embedding it means taking React 19 as a peer, plus `react-reconciler` (React's own, unstable-API package, released in lockstep with React) — react-three-fiber's answer to that coupling is to *vendor* the reconciler. Non-React declarative layers (Solid-pixi, SveltePixi) exist but are small single-maintainer projects with their own gaps.

---

## 1. Official `@pixi/react` — current state (2025–2026)

**Identity & versioning**
- Repo: `pixijs/pixi-react`, under the PixiJS GitHub org — https://github.com/pixijs/pixi-react (org: https://github.com/pixijs)
- Latest release **v8.0.5** (2025-12-01), MIT; release history: v8.0.0 (2025-02-28), v8.0.1 (2025-04-05), v8.0.2 (2025-05-15), v8.0.3 (2025-07-24), v8.0.4 (2025-11-18) — https://github.com/pixijs/pixi-react/releases
- Package manifest: `"version": "8.x"` line, peer deps `pixi.js ^8.2.6` and `react >=19.0.0`; runtime deps are only `react-reconciler 0.31.0` and `its-fine ^2.0.0` — https://github.com/pixijs/pixi-react/blob/main/package.json
- README headline features: "React v19 support", "PixiJS v8 support" — https://github.com/pixijs/pixi-react#features

**Maintenance status**
- 2.9k stars, 205 forks, 1,261 commits, 32 open issues, 11 open PRs (as of Aug 2026 repo page) — https://github.com/pixijs/pixi-react
- Still active but slow cadence: latest merged commit 2026-01-04 (PR #640) — https://api.github.com/repos/pixijs/pixi-react/commits; open PRs dated into June 2026 (e.g. #650, 2026-06-22) — https://api.github.com/repos/pixijs/pixi-react/issues?state=open
- Releases are automated via semantic-release (`release.config.js`, bot-authored releases) — https://github.com/pixijs/pixi-react/blob/main/release.config.js
- Maintainers/contributors (contributor counts via GitHub API): `inlet` (Patrick Brouwer, 706 commits, original author), `trezy` (293, pixijs team, still merging), `thejustinwalsh` (39, primary maintainer of the v8 rewrite), `Zyie` (29, PixiJS core org member) — https://api.github.com/repos/pixijs/pixi-react/contributors

**Docs**: official site react.pixijs.io (v8.x current, v7.x versioned archive) — https://react.pixijs.io/ — with only 9 v8 doc pages: getting-started, extend, components (application/pixi-components/custom-components), hooks (useApplication/useExtend/useTick), typescript — https://github.com/pixijs/pixi-react/tree/main/docs/docs

## 2. Architecture: how it works (from source)

**A real React custom renderer**
- `createReconciler` is literally `react-reconciler`'s `createReconciler` with a typed host config; `rendererPackageName: '@pixi/react'`, `supportsMutation: true`, `supportsHydration: false`, `isPrimaryRenderer: false`, and `reconciler.injectIntoDevTools()` — https://github.com/pixijs/pixi-react/blob/main/src/helpers/createReconciler.ts and https://github.com/pixijs/pixi-react/blob/main/src/core/reconciler.ts
- Root creation: `createRoot(canvas)` builds a `PIXI.Application`, awaits `app.init({...options, canvas})`, then drives `reconciler.updateContainer(...)` — https://github.com/pixijs/pixi-react/blob/main/src/core/createRoot.tsx
- `<Application>` is a normal React component (rendered by *your* DOM renderer) that returns a `<canvas>` and renders its children into a pixi-react root via `createRoot`; it bridges React Context across the renderer boundary with `its-fine` (`FiberProvider`/`useContextBridge`) — https://github.com/pixijs/pixi-react/blob/main/src/components/Application.tsx

**`extend()` registry (the `pixi`-prefixed element catalogue)**
- The catalogue starts empty; `extend({ Container, Graphics, ... })` just does `Object.assign(catalogue, objects)` — https://github.com/pixijs/pixi-react/blob/main/src/helpers/extend.ts and https://github.com/pixijs/pixi-react/blob/main/src/helpers/catalogue.ts
- `createInstance` maps JSX tag → PascalCase name (`parseComponentType` strips a `pixi` prefix), looks it up in the catalogue, `new PixiComponent(props)` (props = constructor options), then applies props; unknown tags throw `X is not part of the PIXI namespace! Did you forget to extend?` — https://github.com/pixijs/pixi-react/blob/main/src/helpers/createInstance.ts and https://github.com/pixijs/pixi-react/blob/main/src/helpers/parseComponentType.ts
- Rationale in README: extend-on-demand keeps bundles small (don't import all of PixiJS) — https://github.com/pixijs/pixi-react#extend

**Component lifecycle vs Pixi object lifecycle**
- Pixi instances are created during React render (`createInstance`), parented via `appendChild`/`insertBefore`/`removeChild` (Pixi `addChild`/`removeChild`), and disposed on unmount (v8.0.0: "handle unmounting `<Application>`") — https://github.com/pixijs/pixi-react/blob/main/src/core/reconciler.ts
- There is no bridge to Caper-style `added`/`removed`/`resize`/`update` lifecycle hooks; the pixi-react host config contains no such hooks (`not found`). React's own `useEffect`/`useLayoutEffect` are the lifecycle mechanism.

**Prop diffing/applying**
- Initial props applied in `createInstance`; updates flow `commitUpdate → prepareUpdate → diffProps → applyProps`; `prepareUpdate` strips `children` and returns a diff only if changes exist — https://github.com/pixijs/pixi-react/blob/main/src/helpers/commitUpdate.ts, https://github.com/pixijs/pixi-react/blob/main/src/helpers/prepareUpdate.ts
- `diffProps` compares old vs new props (`isEqual`, reference equality for objects/arrays by default, shallow as option), supports **dashed "pierced" props** (`foo-bar` → nested `foo.bar`), and resets removed props to defaults (memoized default-constructor instances, else `0`) for HMR/fast-refresh — https://github.com/pixijs/pixi-react/blob/main/src/helpers/diffProps.ts, https://github.com/pixijs/pixi-react/blob/main/src/helpers/compare.ts
- `applyProps` writes each changed prop straight onto the Pixi instance (`currentInstance[key] = value`), with special cases: the `draw` prop (invoked with the `Graphics` instance, Graphics-only), event props, dashed-key resolution — https://github.com/pixijs/pixi-react/blob/main/src/helpers/applyProps.ts

**Refs and events**
- Refs expose the underlying Pixi object (`getPublicInstance`); `useApplication()` returns `{ app, ... }` from React Context (with an invariant check) — https://github.com/pixijs/pixi-react/blob/main/src/hooks/useApplication.ts
- Events: React props `onClick`, `onPointerDown`, `onTap`, `onWheel`, etc. are mapped onto Pixi's `EventEmitter` event names; pascal-case enforced (lowercase forms warn and are rejected) — full mapping table in https://github.com/pixijs/pixi-react/blob/main/src/constants/EventPropNames.ts

**Custom/third-party Pixi classes**: `extend({ Viewport })` + TypeScript module augmentation (`declare module '@pixi/react' { interface PixiElements { viewport: PixiReactElementProps<typeof Viewport> } }`) — https://github.com/pixijs/pixi-react/blob/main/docs/docs/typescript.mdx

## 3. Performance characteristics and caveats (from the repo/docs themselves)

- **The Pixi render loop is untouched by React.** Props are applied at commit time; nothing in the reconciler runs per-frame. The docs' FAQ "Is it slower than plain Threejs? No. There is no overhead" is *commented out* in the current getting-started page (only "Does it have limitations? None." remains) — https://github.com/pixijs/pixi-react/blob/main/docs/docs/getting-started.mdx
- `useTick` attaches a callback to `app.ticker` (`ticker.add(callback, context, priority)`); docs warn the callback is **not memoised** — re-rendering every frame with a fresh callback causes add/remove churn on the ticker (official warning with example) — https://github.com/pixijs/pixi-react/blob/main/docs/docs/hooks/useTick.mdx and https://github.com/pixijs/pixi-react/blob/main/src/hooks/useTick.ts
- Community-raised perf analysis (issue #644): React re-renders/commits are the overhead (not the Pixi rendering); escape hatches are refs + imperative mutation, which the author notes fights React's batching/timing ("timing desync"), and dev/prod React builds differ wildly; the maintainers have not added official performance docs — https://github.com/pixijs/pixi-react/issues/644
- Feature request "Render only on prop change" (#536) is open — i.e., no built-in throttling of React→Pixi prop application — https://github.com/pixijs/pixi-react/issues/536
- Open bug: GPU memory leak when `<pixiGraphics draw>` prop changes without unmount (v8.0.5, pixi.js 8.17.1) — old GPU graphics contexts never destroyed — https://github.com/pixijs/pixi-react/issues/648

## 4. Known DX pain points (from the repo's own issues)

- **TypeScript typing of custom/extended components**: `useApplication`'s `ApplicationState` claims `app` is always set but the context default is `{}` → runtime `undefined` despite typings (issue #645); generic type arguments not preserved (#618); types mis-infer under `strictNullChecks: false` (#609); `HtmlText` "Did you forget to extend?" false error (#603) — https://github.com/pixijs/pixi-react/issues/645, /618, /609, /603
- **React-version coupling**: pinned `react-reconciler@0.31.0` breaks React 19.2 features; users override to 0.33.0 via pnpm overrides (#630); draft PR #638 (by an r3f maintainer) to support 19.2 notes "react-reconciler is published in lockstep with the React package… not seen as forwards compatible since React 19" and that react-three-fiber *bundles* it — https://github.com/pixijs/pixi-react/issues/630, https://github.com/pixijs/pixi-react/pull/638
- **v7→v8 rewrite fallout**: v8.0.0 was a ground-up rewrite ("All traces of v7 are gone", breaking: unprefixed elements now opt-in) with a long bug-fix changelog (types, `extend`, `Application` refs, `useTick`, events) — https://github.com/pixijs/pixi-react/releases/tag/v8.0.0
- **Docs gaps**: open docs issues for Getting Started, Viewport, Tilemap, Pixi UI guides and a performance page (#589, #590, #598, #622, #623, #644); stale README (CRA recommended though deprecated, #641; install command broke, #614) — https://github.com/pixijs/pixi-react/issues/589, /641, /614
- Misc open: React.StrictMode crash with WebGL (#613), `<pixiAnimatedSprite>` semantics unclear (#610), no `createPortal` support (#537), no render-on-change (#536), react-spring v8 support (#553)

## 5. How pixi-react models things a game framework needs

| Game-framework need | What @pixi/react provides (primary sources) |
|---|---|
| **Scene switching** | `not found` — no scene manager or scene API anywhere in the v8 docs/source; scenes are just Pixi containers, and switching is your app's job (React state/conditionals). Docs pages list only Application/extend/components/hooks/typescript — https://github.com/pixijs/pixi-react/tree/main/docs/docs |
| **Asset loading** | No first-party Pixi-Assets integration and **no Suspense hook in shipped v8**: a `useSuspenseAssets` hook existed during the v8 rewrite (commit "fix: useSuspenseAssets", Aug 2024 — https://api.github.com/repos/pixijs/pixi-react/commits/800d9e5) but is absent from the shipped exports (v8.0.5 `src/index.ts` — https://raw.githubusercontent.com/pixijs/pixi-react/v8.0.5/src/index.ts). Official example loads assets with plain `Assets.load()` + `useState` — https://github.com/pixijs/pixi-react/blob/main/docs/src/examples/basic/BunnySprite.jsx |
| **Ticker/update loop** | `useTick(cb, { context, priority, isEnabled })` → `ticker.add(cb, ctx, priority)` — https://github.com/pixijs/pixi-react/blob/main/src/hooks/useTick.ts |
| **Graphics draw callbacks** | `<pixiGraphics draw={g => …}>`: the callback is invoked with the Graphics instance when the prop is applied (mount + whenever the draw prop changes by reference); docs describe it as "drawing will happen on every tick", but the source shows it runs on prop application, not per-frame — https://github.com/pixijs/pixi-react/blob/main/src/helpers/applyProps.ts vs https://github.com/pixijs/pixi-react/blob/main/docs/docs/components/pixi-components.mdx |
| **Text** | `<pixiText>` is just the `Text` class in the catalogue: all class properties are JSX props; `defaultTextStyle` convenience prop on `<Application>` (not retroactive) — https://github.com/pixijs/pixi-react/blob/main/README.md |

## 6. Prior art: declarative layers over imperative scene graphs

**react-three-fiber (the healthy analog)**
- "react-three-fiber is a React renderer for threejs" — https://raw.githubusercontent.com/pmndrs/react-three-fiber/master/readme.md
- Architecture (source): same pattern as pixi-react — `createReconciler` host config, a `catalogue` + `extend()`, `args`/`attach`/`dispose` props, prop diffing with pierced dash-props, event registration into a raycast interaction manager, auto-attach of `geometry`/`material` by constructor name — https://github.com/pmndrs/react-three-fiber/blob/master/packages/fiber/src/core/reconciler.tsx and https://github.com/pmndrs/react-three-fiber/blob/master/packages/fiber/src/core/utils.tsx
- Rendering loop is three.js's, not React's: `renderer.render(scene, camera)` driven by r3f's own loop, with `useFrame` subscribers, `frameloop="always|demand|never"`, and `invalidate()` to request frames — https://github.com/pmndrs/react-three-fiber/blob/master/packages/fiber/src/core/loop.ts; official docs: https://github.com/pmndrs/react-three-fiber/blob/master/docs/tutorials/how-it-works.mdx and https://github.com/pmndrs/react-three-fiber/blob/master/docs/advanced/scaling-performance.mdx (on-demand rendering, instancing, `useLoader` caching + Suspense for assets, concurrency via `startTransition`)
- **r3f vendored react-reconciler**: v9.7.0 declares `react-reconciler ^0.33.0` as a *devDependency* and imports it from in-repo `../../react-reconciler/index.js` — i.e., bundled into the published artifact — https://raw.githubusercontent.com/pmndrs/react-three-fiber/master/packages/fiber/package.json and https://github.com/pmndrs/react-three-fiber/blob/master/packages/fiber/src/core/reconciler.tsx; motivation stated in pixi-react PR #638 (quoted above)
- r3f pairs 1:1 with a React major: "fiber@8 pairs with react@18, fiber@9 pairs with react@19" — https://raw.githubusercontent.com/pmndrs/react-three-fiber/master/readme.md

**Non-React attempts (state and maintenance)**
- **solid-pixi** (`sammccord/solid-pixi`): "Create PIXI applications with JSX and Signals"; v2.0.0, peers `pixi.js ^8.7.0`, `solid-js ^1.8.5` — https://github.com/sammccord/solid-pixi/blob/main/packages/solid-pixi/package.json; not archived, 50 stars, 3 open issues, last push 2025-05-24, single maintainer — https://api.github.com/repos/sammccord/solid-pixi. Notably it *does* ship `useAsset` + `Suspense` for loading — https://github.com/sammccord/solid-pixi/blob/main/README.md (works because Solid's compiler, not a reconciler, drives reactivity)
- **SveltePixi** (`mattjennings/svelte-pixi`): "Create PixiJS apps with Svelte"; v8.0.1 with peers `pixi.js ^8.6.5` and `svelte >=4 || >=5` — https://github.com/mattjennings/svelte-pixi/blob/master/package.json; 153 stars; a fork (`notYou263/svelte-pixijs`, "Updated for use with PixiJS v8") preceded upstream v8 support — https://github.com/notYou263/svelte-pixijs
- Older React attempts are dead: `react-pixi` (Izzimach, last push 2018) and `react-pixi-fiber` (michalochman, last push Mar 2025, v7-era) — https://github.com/Izzimach/react-pixi, https://github.com/michalochman/react-pixi-fiber

## 7. What embedding React costs

- **`react-dom` is not a runtime dependency of `@pixi/react`** (only a devDependency for tests) — https://github.com/pixijs/pixi-react/blob/main/package.json. But `<Application>` renders a `<canvas>` via your DOM renderer, so a React-DOM host is needed to mount it; for a custom host, `createRoot(canvas)` is exported and can be driven directly (it returns the app and takes `{ destroyOptions, rendererDestroyOptions, onInit }`) — https://github.com/pixijs/pixi-react/blob/main/src/index.ts, https://github.com/pixijs/pixi-react/blob/main/src/core/createRoot.tsx
- **Bundle size** (bundlephobia measurements — third-party tool, not first-party; per-entry numbers for React 19 understate the total because the runtime is split across many files):
  - `@pixi/react@8.0.5` incl. its deps (`react-reconciler` ~258KB min of the graph, `its-fine`, `scheduler`): 131,022 B min / 40,621 B gzip; peers `pixi.js` and `react` excluded — https://bundlephobia.com/api/size?package=@pixi/react@8.0.5
  - `react@19.0.0` main entry: 7,576 B min / 2,881 B gzip; `scheduler@0.25.0`: 3,818 B min / 1,633 B gzip — https://bundlephobia.com/api/size?package=react@19.0.0, https://bundlephobia.com/api/size?package=scheduler@0.25.0 (React 19 splits the runtime across `react`, `react-jsx-runtime`, `shared`, `scheduler`, `react-dom/client` — total framework cost is several times the per-entry numbers; exact total not found in first-party sources)
  - Context: `pixi.js@8.20.0` itself is 900,479 B min / 257,745 B gzip — https://bundlephobia.com/api/size?package=pixi.js@8.20.0; `@react-three/fiber@9.7.0` is 163,357 B min / 51,795 B gzip — https://bundlephobia.com/api/size?package=@react-three/fiber@9.7.0
- **Version coupling**: `react-reconciler` is published by the React team in lockstep with React (0.31.0 peers `react ^19.0.0` — https://registry.npmjs.org/react-reconciler/0.31.0; 0.33.0 peers `react ^19.2.0` — https://registry.npmjs.org/react-reconciler/0.33.0). Its own README calls it "an experimental package… API is not as stable… does not follow the common versioning scheme. Use it at your own risk" — https://github.com/facebook/react/blob/main/packages/react-reconciler/README.md

## 8. Reconciler-without-React options

- **`react-reconciler` requires React proper**: it is React's own package (facebook/react, `packages/react-reconciler`) with `react` as a peer dependency — it imports React internals and cannot run without React — https://registry.npmjs.org/react-reconciler/0.31.0, https://github.com/facebook/react/blob/main/packages/react-reconciler/README.md
- **Minimal-host documented approach**: the react-reconciler README's "Usage" is exactly that — a `HostConfig` object (createInstance/appendChild/…, `supportsMutation: true`) + `Reconciler(HostConfig)` + `updateContainer` — https://github.com/facebook/react/blob/main/packages/react-reconciler/README.md. Both r3f and pixi-react implement exactly this; pixi-react even exports its `applyProps` (usable imperatively outside the reconciler) — https://github.com/pixijs/pixi-react/blob/main/src/index.ts
- **Escape from the lockstep coupling**: r3f's precedent is vendoring/bundling the reconciler source so it no longer resolves the npm package (r3f package.json lists `react-reconciler` as a devDependency only) — https://raw.githubusercontent.com/pmndrs/react-three-fiber/master/packages/fiber/package.json; pixi-react instead pins the reconciler as a runtime dep and is stuck on 0.31.0 until it follows suit (issue #630, draft PR #638)
- **Truly React-free declarative layers exist**: Solid-pixi and SveltePixi get declarative JSX over Pixi without any reconciler, because their frameworks' compilers/runtimes provide reactivity directly (Solid signals, Svelte reactivity) — they pay with tiny ecosystems and single-maintainer upkeep (see §6)
- `not found`: any first-party React documentation of a stable custom-renderer API — the only official artifact is the experimental react-reconciler package and its README (above); React docs cover the concept of renderers but not a supported authoring guide

---

**Verdict (factual):** the primary sources establish that the only production-grade declarative-Pixi option is `@pixi/react` — a thin, actively-maintained React 19 custom renderer that would bolt onto Caper's Pixi scene graph but bring React 19 + the unstable, React-lockstep `react-reconciler` as hard dependencies and cover only object creation/props/events, while every game-framework concern (scenes, assets, lifecycle, update loop) would remain Caper's to provide — and that the only escape from the reconciler coupling is r3f-style vendoring or abandoning React for a framework with compiler-level reactivity (Solid/Svelte), each with its own documented trade-offs.
