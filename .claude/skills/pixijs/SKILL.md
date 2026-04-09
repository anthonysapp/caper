---
name: pixijs
description: PixiJS v8 development guide with bundled API references, code patterns, and best practices from official documentation. Use this skill whenever the user is working with PixiJS, imports from 'pixi.js', builds 2D graphics/games on HTML canvas, uses WebGL/WebGPU for 2D rendering, asks about PixiJS APIs (Sprite, Container, Graphics, Ticker, Application, etc.), needs help with the PixiJS ecosystem (pixi-react, pixi-ui, pixi-sound, pixi-filters, AssetPack, Layout), is migrating from PixiJS v7 to v8, or mentions any PixiJS class names like ParticleContainer, BitmapText, TilingSprite, NineSliceSprite, RenderLayer, or RenderGroup. Also trigger when users ask about 2D sprite rendering, texture management, scene graphs for 2D games, or interactive canvas graphics — these are PixiJS's core domain even if the user doesn't name it explicitly.
argument-hint: [question]
allowed-tools: Read, WebFetch, Grep, Glob
---

# PixiJS v8 Development Skill

PixiJS is the fastest, most lightweight 2D rendering library for the web, supporting WebGL and WebGPU. This skill provides comprehensive API references, patterns, and best practices from official PixiJS v8 documentation.

If invoked directly via `/pixijs`, use $ARGUMENTS as the user's question to guide which reference files to read, if arguments are provided.

## How to use this skill

This skill bundles PixiJS documentation organized by topic. Read only the reference file(s) relevant to the user's question — don't load everything at once.

### Reference files

All reference files are in `references/`:

| File | When to read | Topics covered |
|------|-------------|----------------|
| [getting-started.md](references/getting-started.md) | New project setup, ecosystem overview | Ecosystem libraries, scaffolding, `npm create pixi.js`, basic usage example |
| [architecture.md](references/architecture.md) | How PixiJS works internally, performance, rendering pipeline | Architecture, environments, garbage collection, performance tips, render groups, render layers, render loop, scene graph |
| [application.md](references/application.md) | Application setup, game loop, plugins | Application class, Ticker, CullerPlugin, ResizePlugin, TickerPlugin |
| [scene-objects.md](references/scene-objects.md) | Working with display objects | Container, Sprite, Graphics (+ fill, pixel lines), Mesh, NineSliceSprite, ParticleContainer, TilingSprite, Renderers, cacheAsTexture |
| [text.md](references/text.md) | Any text rendering | Text, BitmapText, HTMLText, SplitText, TextStyle |
| [visual-effects.md](references/visual-effects.md) | Colors, filters, math, textures | Color class, filters/blend modes, math utilities, texture lifecycle |
| [interaction.md](references/interaction.md) | Click/touch/pointer events, accessibility | Event system, pointer/mouse/touch events, hit areas, accessibility overlays |
| [assets.md](references/assets.md) | Loading images, audio, fonts, spritesheets | Assets API, background loader, compressed textures, manifests/bundles, resolver, SVGs |
| [migration.md](references/migration.md) | Upgrading from v7, Three.js interop | v8 migration guide (breaking changes, new APIs), mixing PixiJS + Three.js |
| [index.md](references/index.md) | Need deeper detail than reference files provide | URLs to every individual doc page for fetching via WebFetch |

### Workflow

1. **Identify the topic** from the user's question (or from $ARGUMENTS if invoked directly)
2. **Read the relevant reference file(s)** from `references/` — usually just one or two
3. **If the reference file doesn't have enough detail**, look up the specific page URL in `references/index.md` and fetch it with WebFetch to get the full doc page
4. **As a last resort** for broad questions, fetch `https://pixijs.com/llms-full.txt` — but prefer targeted fetches from `index.md`

## Key PixiJS v8 patterns to remember

These are the most common gotchas and patterns that come up. Apply them even without reading the reference files.

### Async initialization (v8 breaking change)
```ts
const app = new Application();
await app.init({ background: '#1099bb', resizeTo: window });
document.body.appendChild(app.canvas);
```
`app.init()` is async because of WebGPU support. Always `await` it before using the app.

### Single package imports
```ts
// v8 — everything from one package
import { Application, Sprite, Container, Assets, Graphics } from 'pixi.js';

// NOT like v7 sub-packages
// import { Sprite } from '@pixi/sprite';  // WRONG in v8
```

### Graphics API (v8 — build shape first, then style)
```ts
const g = new Graphics();
// v8: shape first, then fill/stroke
g.rect(0, 0, 100, 50);
g.fill('red');
g.stroke({ color: 'black', width: 2 });

// NOT v7 style:
// g.beginFill(0xff0000);  // WRONG in v8
// g.drawRect(0, 0, 100, 50);  // WRONG in v8
```

### Asset loading
```ts
// Single asset
const texture = await Assets.load('image.png');

// Multiple assets
const textures = await Assets.load(['bunny.png', 'background.png']);

// With bundles
await Assets.init({ manifest: 'manifest.json' });
await Assets.loadBundle('game-screen');
```

### Game loop
```ts
app.ticker.add((ticker) => {
    sprite.rotation += 0.01 * ticker.deltaTime;
});
```
Always multiply by `ticker.deltaTime` for frame-rate independent movement.

### Vite caveat
When using Vite, wrap your code in an async IIFE — top-level `await` causes issues in production builds (Vite <=6.0.6):
```ts
(async () => {
    const app = new Application();
    await app.init({ ... });
    // ...
})();
```

## Ecosystem quick reference

When the user asks about these libraries, read `references/getting-started.md` for details and links:

- **@pixi/react** — React 19+ bindings for declarative PixiJS
- **@pixi/layout** — Flexbox-style layout via Yoga engine
- **pixi-spine** — Skeletal animation
- **pixi-filters** — Visual effects (blur, glow, color, displacement, etc.)
- **pixi-sound** — WebAudio API playback
- **@pixi/ui** — Pre-built UI components (buttons, sliders, lists, etc.)
- **@pixi/assetpack** — Asset pipeline and optimization

## Freshness

The bundled reference files are a snapshot of PixiJS v8 docs. If the user asks about something that might have changed recently or isn't covered in the references, fetch the specific doc page URL from `references/index.md` using WebFetch. The llms.txt endpoints are:

- Index: `https://pixijs.com/llms.txt`
- Medium: `https://pixijs.com/llms-medium.txt`
- Full: `https://pixijs.com/llms-full.txt`
