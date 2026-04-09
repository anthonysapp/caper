# Background Loader

PixiJS provides a **background loader** that allows you to load assets in the background while your application is running. This is useful for loading large assets or multiple assets without blocking the main thread. This can help improve the responsiveness of your application, reduce the initial loading time, and potentially void showing multiple loading screens to the user.

## Loading Bundles

The most effective way to use the background loader is to load bundles of assets. Bundles are groups of assets that are related to each other in some way, such as all the assets for a specific screen or level in your game. By loading bundles in the background, you can ensure that the assets are available when you need them without blocking the main thread.

```ts
const manifest = {
  bundles: [
    {
      name: 'home-screen',
      assets: [
        { alias: 'flowerTop', src: 'https://pixijs.com/assets/flowerTop.png' },
      ],
    },
    {
      name: 'game-screen',
      assets: [
        { alias: 'eggHead', src: 'https://pixijs.com/assets/eggHead.png' },
      ],
    },
  ],
};

// Initialize the asset system with a manifest
await Assets.init({ manifest });

// Start loading both bundles in the background
Assets.backgroundLoadBundle(['game-screen']);

// Load only the first screen assets immediately
const resources = await Assets.loadBundle('home-screen');
```

## Loading Individual Assets

You can also load individual assets in the background using the `Assets.backgroundLoad()` method. This is useful for loading assets that are not part of a bundle or for loading additional assets after the initial load.

```ts
// Load an individual asset in the background
Assets.backgroundLoad({
  alias: 'flowerTop',
  src: 'https://pixijs.com/assets/flowerTop.png',
});

// Load another asset in the background
Assets.backgroundLoad({
  alias: 'eggHead',
  src: 'https://pixijs.com/assets/eggHead.png',
});
```

## API Reference

- [Assets](https://pixijs.download/release/docs/assets.Assets.html)
- [BackgroundLoader](https://pixijs.download/release/docs/assets.BackgroundLoader.html)

---

## Compressed Textures


---

# Assets

PixiJS has the `Assets` singleton which is used to streamline resource loading. It’s modern, Promise-based, cache-aware, and highly extensible—making it the one stop shop for all PixiJS resource management!

```ts
import { Assets } from 'pixi.js';

await Assets.init({ ... });

const texture = await Assets.load('path/to/hero.png');
```

## Key Capabilities

- **Asynchronous loading** of assets via Promises or async/await.
- **Caching** prevents redundant network requests.
- **Built-in support** for common media formats (images, video, fonts).
- **Custom parsers** and **resolvers** for flexibility.
- **Background loading, manifest-based bundles,** and **smart fallbacks**.

## Supported File Types

| Type                | Extensions                                                       | Loaders                           |
| ------------------- | ---------------------------------------------------------------- | --------------------------------- |
| Textures            | `.png`, `.jpg`, `.gif`, `.webp`, `.avif`, `.svg`                 | `loadTextures`, `loadSvg`         |
| Video Textures      | `.mp4`, `.m4v`, `.webm`, `.ogg`, `.ogv`, `.h264`, `.avi`, `.mov` | `loadVideoTextures`               |
| Sprite Sheets       | `.json`                                                          | `spritesheetAsset`                |
| Bitmap Fonts        | `.fnt`, `.xml`, `.txt`                                           | `loadBitmapFont`                  |
| Web Fonts           | `.ttf`, `.otf`, `.woff`, `.woff2`                                | `loadWebFont`                     |
| JSON                | `.json`                                                          | `loadJson`                        |
| Text                | `.txt`                                                           | `loadTxt`                         |
| Compressed Textures | `.basis`, `.dds`, `.ktx`, `.ktx2`                                | `loadBasis`, `loadDDS`, `loadKTX` |

> Need more? Add custom parsers!

---

## Getting started

### Loading Assets

Loading an asset with PixiJS is as simple as calling `Assets.load()` and passing in the asset’s URL. This function returns a `Promise` that resolves to the loaded resource—whether that’s a texture, font, JSON, or another supported format.

You can provide either an **absolute URL** (e.g. from a CDN):

```ts
const texture = await Assets.load('https://example.com/assets/hero.png');
```

Or a **relative path** within your project:

```ts
const texture = await Assets.load('assets/hero.png');
```

PixiJS will **_typically_** automatically determine how to load the asset based on its **file extension** and will cache the result to avoid redundant downloads.

```typescript
import { Application, Assets, Texture } from 'pixi.js';

const app = new Application();
// Application must be initialized before loading assets
await app.init({ backgroundColor: 0x1099bb });

// Load a single asset
const bunnyTexture = await Assets.load('path/to/bunny.png');
const sprite = new Sprite(bunnyTexture);

// Load multiple assets at once
const textures = await Assets.load(['path/to/bunny.png', 'path/to/cat.png']);
const bunnySprite = new Sprite(textures['path/to/bunny.png']);
const catSprite = new Sprite(textures['path/to/cat.png']);
```

### Repeated Loads Are Safe

`Assets` caches by URL or alias. Requests for the same resource return the **same texture**.

```ts
const p1 = await Assets.load('bunny.png');
const p2 = await Assets.load('bunny.png');
console.log(p1 === p2); // true
```

### Asset Aliases

You can also use aliases to refer to assets instead of their full URLs. This provides a more convenient way to manage assets, especially when you have long or complex URLs.

```ts
await Assets.load({ alias: 'bunny', src: 'path/to/bunny.png' });
const bunnyTexture = Assets.get('bunny');
```

All Asset APIs support aliases, including `Assets.load()`, `Assets.get()`, and `Assets.unload()`.

There is more complex ways of defining assets and you can read about them in the [Resolver](./resolver.md) section.

### Retrieving Loaded Assets

You can also retrieve assets that have already been loaded using `Assets.get()`:

```ts
await Assets.load('path/to/bunny.png');
const bunnyTexture = Assets.get('path/to/bunny.png');
const sprite = new Sprite(bunnyTexture);
```

This is useful for when you have preloaded your assets elsewhere in your code and want to access them later without having to pass round references from the initial load.

### Unloading Assets

To unload an asset, you can use `Assets.unload()`. This will remove the asset from the cache and free up memory. Note that if you try to access the asset after unloading it, you will need to load it again.

```ts
await Assets.load('path/to/bunny.png');
const bunnyTexture = Assets.get('path/to/bunny.png');
const sprite = new Sprite(bunnyTexture);
// Unload the asset
await Assets.unload('path/to/bunny.png');
```

### Customizing Asset Loading

You can customize the asset loading process by providing options to the `Assets.init()` method. This allows you to set preferences for how assets are loaded, specify a base path for assets, and more.

```ts
import { Assets } from 'pixi.js';

await Assets.init({...});
```

| Option                | Type                      | Description                                                   |
| --------------------- | ------------------------- | ------------------------------------------------------------- |
| `basePath`            | `string`                  | Prefix applied to all relative asset paths (e.g. for CDNs).   |
| `defaultSearchParams` | `string`                  | A default URL parameter string to append to all assets loaded |
| `skipDetections`      | `boolean`                 | Skip environment detection parsers for assets.                |
| `manifest`            | `Manifest`                | A descriptor of named asset bundles and their contents.       |
| `preferences`         | `AssetPreferences`        | Specifies preferences for each loader                         |
| `bundleIdentifier`    | `BundleIdentifierOptions` | **Advanced** - Override how bundlesIds are generated.         |

---

## Advanced Usage

There are several advanced features available in the `Assets` API that can help you manage your assets more effectively.
You can read more about these features in the rest of the documentation:

- [Resolving Assets](./resolver.md)
- [Manifests & Bundles (Recommended)](./manifest.md)
- [Background Loading](./background-loader.md)
- [Compressed Textures](./compressed-textures.md)

---

## API Reference

- [Overview](https://pixijs.download/release/docs/assets.html)
- [Assets](https://pixijs.download/release/docs/assets.Assets.html)

---

## Manifests & Bundles


---

# Manifests & Bundles

PixiJS has a structured and scalable approach to asset management through **Manifests** and **Bundles**. This is the recommended way to manage assets in your PixiJS applications, especially for larger projects or those that require dynamic loading of assets based on context or user interaction. This guide explains what they are, how to use them, and how to generate them efficiently using [AssetPack](https://github.com/pixijs/AssetPack) — a tool designed to automate manifest and bundle creation.

---

## What Is a Manifest?

A **Manifest** is a descriptor object that defines your asset loading strategy. It lists all bundles, each of which contains grouped assets by name and alias. This structure allows for lazy-loading assets based on application context (e.g. load screen assets, level-specific content, etc.).

```js
const manifest = {
  bundles: [
    {
      name: 'load-screen',
      assets: [
        { alias: 'background', src: 'sunset.png' },
        { alias: 'bar', src: 'load-bar.{png,webp}' },
      ],
    },
    {
      name: 'game-screen',
      assets: [
        { alias: 'character', src: 'robot.png' },
        { alias: 'enemy', src: 'bad-guy.png' },
      ],
    },
  ],
};
```

### Initializing With a Manifest

To initialize PixiJS asset handling with a manifest:

```js
import { Assets } from 'pixi.js';

await Assets.init({ manifest });
```

Once initialized, you can load bundles by name:

```js
const loadScreenAssets = await Assets.loadBundle('load-screen');
const gameScreenAssets = await Assets.loadBundle('game-screen');
```

It should be noted that you can still load assets directly without loading an entire bundle via their alias:

```js
await Assets.init({ manifest });
const background = await Assets.load('background');
const bar = await Assets.load('bar');
```

---

## What Is a Bundle?

A **Bundle** is a group of assets that are identified by a shared name. While bundles can be pre-defined in a manifest, they can also be dynamically registered at runtime.

### Adding a Bundle Dynamically

This approach is helpful for scenarios where you want to define bundles on the fly:

```js
import { Assets } from 'pixi.js';

Assets.addBundle('animals', [
  { alias: 'bunny', src: 'bunny.png' },
  { alias: 'chicken', src: 'chicken.png' },
  { alias: 'thumper', src: 'thumper.png' },
]);

const assets = await Assets.loadBundle('animals');

// or load a specific asset from the bundle
const bunny = await Assets.load('bunny');
```

---

## Recommended Tool: AssetPack

Managing manifests and bundles manually can be error-prone. [**AssetPack**](https://pixijs.io/assetpack) is a CLI tool that scans your assets folder and generates optimized manifests and bundles automatically.

### Key Benefits

- Organizes assets by directory or pattern
- Supports output in PixiJS manifest format
- Reduces boilerplate and risk of manual mistakes

You can integrate AssetPack into your build pipeline to generate the manifest file and load it using `Assets.init({ manifest })`.

---

## Resolver


---

# Resolver

In PixiJS, asset management centers around the concept of `UnresolvedAsset` and `ResolvedAsset`. This system is designed to support multi-format assets, conditional loading, and runtime optimization based on platform capabilities (e.g., WebP support, device resolution, or performance constraints).

Rather than specifying a fixed URL, developers describe what assets _could_ be loaded — and PixiJS selects the best option dynamically.

## Resolver Lifecycle

The resolution process involves four key steps:

1. **UnresolvedAsset Creation**
   Assets defined using a string or object are internally normalized into `UnresolvedAsset` instances. These include metadata such as aliases, wildcard paths, parser hints, and custom data.

2. **Source Expansion**
   The `src` field of an `UnresolvedAsset` can be a string or array of strings. PixiJS expands any wildcard patterns (e.g. `myAsset@{1,2}x.{png,webp}`) into a list of concrete candidate URLs.

3. **Best-Match Selection**
   PixiJS evaluates all candidate URLs and uses platform-aware heuristics to pick the most suitable source. Factors include supported formats (e.g. WebP vs PNG), device pixel ratio, and custom configuration such as preferred formats.

4. **ResolvedAsset Output**
   The result is a `ResolvedAsset` containing a specific URL and all required metadata, ready to be passed to the relevant parser and loaded into memory.

## Using Unresolved Assets

An `UnresolvedAsset` is the primary structure used to define assets in PixiJS. It allows you to specify the source URL(s), alias(es), and any additional data needed for loading. They are more complex, but are also more powerful.

| Field              | Type                 | Description                                                                  |
| ------------------ | -------------------- | ---------------------------------------------------------------------------- |
| `alias`            | `string \| string[]` | One or more aliases used to reference this asset later.                      |
| `src`              | `string \| string[]` | Path or paths to one or more asset candidates. Supports wildcards.           |
| `loadParser` (opt) | `string`             | A specific parser to handle the asset (e.g. `'loadTextures'`, `'loadJson'`). |
| `data` (opt)       | `any`                | Extra data to pass into the loader. This varies by parser type.              |

## Examples

### Loading a Single Asset

```ts
import { Assets } from 'pixi.js';

await Assets.load({
  alias: 'bunny',
  src: 'images/bunny.png',
});
```

### Loading with Explicit Parser and Loader Options

```ts
await Assets.load({
  alias: 'bunny',
  src: 'images/bunny.png',
  loadParser: 'loadTextures',
  data: {
    alphaMode: 'no-premultiply-alpha',
  },
});
```

### Using Wildcards for Responsive and Format-Aware Loading

```ts
await Assets.load({
  alias: 'bunny',
  src: 'images/bunny@{0.5,1,2}x.{png,webp}',
});
```

This pattern expands internally to:

```ts
[
  'images/bunny@0.5x.png',
  'images/bunny@0.5x.webp',
  'images/bunny@1x.png',
  'images/bunny@1x.webp',
  'images/bunny@2x.png',
  'images/bunny@2x.webp',
];
```

PixiJS will select the best match depending on runtime capabilities (e.g. chooses WebP if supported, 2x if on a high-res display).

---

## Related Tools and Features

- **AssetPack**: If you're managing large asset sets, [AssetPack](https://pixijs.io/assetpack) can generate optimized manifests using glob patterns and output `UnresolvedAsset` structures automatically.
- **Asset Manifests & Bundles**: Use [manifests and bundles](./manifest.md) to predefine groups of unresolved assets and load them via `Assets.loadBundle`.

---

## SVG's


---

# SVG's

### Overview

PixiJS provides powerful support for rendering SVGs, allowing developers to integrate scalable vector graphics seamlessly into their projects. This guide explores different ways to use SVGs in PixiJS, covering real-time rendering, performance optimizations, and potential pitfalls.

---

### Why Use SVGs?

SVGs have several advantages over raster images like PNGs:

- ✅ **Smaller File Sizes** – SVGs can be significantly smaller than PNGs, especially for large but simple shapes. A high-resolution PNG may be several megabytes, while an equivalent SVG could be just a few kilobytes.
- ✅ **Scalability** – SVGs scale without losing quality, making them perfect for responsive applications and UI elements.
- ✅ **Editable After Rendering** – Unlike textures, SVGs rendered via Graphics can be modified dynamically (e.g., changing stroke colors, modifying shapes).
- ✅ **Efficient for Simple Graphics** – If the graphic consists of basic shapes and paths, SVGs can be rendered efficiently as vector graphics.

However, SVGs can also be computationally expensive to parse, particularly for intricate illustrations with many paths or effects.

---

### Ways to Render SVGs in PixiJS

PixiJS offers two primary ways to render SVGs:

1. **As a Texture** – Converts the SVG into a texture for rendering as a sprite.
2. **As a Graphics Object** – Parses the SVG and renders it as vector geometry.

Each method has its advantages and use cases, which we will explore below.

---

## 1. Rendering SVGs as Textures

### Overview

SVGs can be loaded as textures and used within Sprites. This method is efficient but does not retain the scalability of vector graphics.

### Example

```ts
const svgTexture = await Assets.load('tiger.svg');
const mySprite = new Sprite(svgTexture);
```

```ts
// description: This example demonstrates loading and displaying SVG graphics using the Graphics class
import { Application, Assets, Graphics } from 'pixi.js';

(async () => {
  // Create a new application
  const app = new Application();

  // Initialize the application
  await app.init({ antialias: true, resizeTo: window });

  // Append the application canvas to the document body
  document.body.appendChild(app.canvas);

  const tigerSvg = await Assets.load({
    src: 'https://pixijs.com/assets/tiger.svg',
    data: {
      parseAsGraphicsContext: true,
    },
  });

  const graphics = new Graphics(tigerSvg);

  // line it up as this svg is not centered
  const bounds = graphics.getLocalBounds();

  graphics.pivot.set(
    (bounds.x + bounds.width) / 2,
    (bounds.y + bounds.height) / 2,
  );

  graphics.position.set(app.screen.width / 2, app.screen.height / 2);

  app.stage.addChild(graphics);

  app.ticker.add(() => {
    graphics.rotation += 0.01;
    graphics.scale.set(2 + Math.sin(graphics.rotation));
  });
})();
```

```ts
// description: This example demonstrates how to create and display SVG graphics using the Graphics class
import { Application, Graphics } from 'pixi.js';

(async () => {
  // Create a new application
  const app = new Application();

  // Initialize the application
  await app.init({
    antialias: true,
    backgroundColor: 'white',
    resizeTo: window,
  });

  // Append the application canvas to the document body
  document.body.appendChild(app.canvas);

  const graphics = new Graphics().svg(`
            <svg height="400" width="450" xmlns="http://www.w3.org/2000/svg">
                <!-- Draw the paths -->
                <path id="lineAB" d="M 100 350 l 150 -300" stroke="red" stroke-width="4"/>
                <path id="lineBC" d="M 250 50 l 150 300" stroke="red" stroke-width="4"/>
                <path id="lineMID" d="M 175 200 l 150 0" stroke="green" stroke-width="4"/>
                <path id="lineAC" d="M 100 350 q 150 -300 300 0" stroke="blue" fill="none" stroke-width="4"/>

                <!-- Mark relevant points -->
                <g stroke="black" stroke-width="3" fill="black">
                    <circle id="pointA" cx="100" cy="350" r="4" />
                    <circle id="pointB" cx="250" cy="50" r="4" />
                    <circle id="pointC" cx="400" cy="350" r="4" />
                </g>
            </svg>
        `);

  app.stage.addChild(graphics);
})();
```

```ts
// description: This example demonstrates loading a large SVG texture and displaying it as a sprite
import { Application, Assets, Sprite } from 'pixi.js';

(async () => {
  // Create a new application
  const app = new Application();

  // Initialize the application
  await app.init({ antialias: true, resizeTo: window });

  // Append the application canvas to the document body
  document.body.appendChild(app.canvas);

  const tigerTexture = await Assets.load({
    src: 'https://pixijs.com/assets/tiger.svg',
  });

  const sprite = new Sprite(tigerTexture);

  // line it up as this svg is not centered
  const bounds = sprite.getLocalBounds();

  sprite.pivot.set(
    (bounds.x + bounds.width) / 2,
    (bounds.y + bounds.height) / 2,
  );

  sprite.position.set(app.screen.width / 2, app.screen.height / 2);

  app.stage.addChild(sprite);

  app.ticker.add(() => {
    sprite.rotation += 0.01;
    sprite.scale.set(2 + Math.sin(sprite.rotation));
  });
})();
```

```ts
// description: This example demonstrates loading a large SVG texture and displaying it as a sprite
import { Application, Assets, Sprite } from 'pixi.js';

(async () => {
  // Create a new application
  const app = new Application();

  // Initialize the application
  await app.init({ antialias: true, resizeTo: window });

  // Append the application canvas to the document body
  document.body.appendChild(app.canvas);

  const tigerTexture = await Assets.load({
    src: 'https://pixijs.com/assets/tiger.svg',
    data: {
      resolution: 4,
    },
  });

  const sprite = new Sprite(tigerTexture);

  // line it up as this svg is not centered
  const bounds = sprite.getLocalBounds();

  sprite.pivot.set(
    (bounds.x + bounds.width) / 2,
    (bounds.y + bounds.height) / 2,
  );

  sprite.position.set(app.screen.width / 2, app.screen.height / 2);

  app.stage.addChild(sprite);

  app.ticker.add(() => {
    sprite.rotation += 0.01;
    sprite.scale.set(2 + Math.sin(sprite.rotation));
  });
})();
```

### Scaling Textures

You can specify a resolution when loading an SVG as a texture to control its size:
This does increase memory usage, but it be of a higher fidelity.

```ts
const svgTexture = await Assets.load('path/to.svg', {
  resolution: 4, // will be 4 times as big!
});
const mySprite = new Sprite(svgTexture);
```

This ensures the texture appears at the correct size and resolution.

### Pros & Cons

- ✅ **Fast to render** (rendered as a quad, not geometry)
- ✅ **Good for static images**
- ✅ **Supports resolution scaling for precise sizing**
- ✅ **Ideal for complex SVGs that do not need crisp vector scaling** (e.g., UI components with fixed dimensions)
- ❌ **Does not scale cleanly** (scaling may result in pixelation)
- ❌ **Less flexibility** (cannot modify the shape dynamically)
- ❌ **Texture Size Limit** A texture can only be up to 4096x4096 pixels, so if you need to render a larger SVG, you will need to use the Graphics method.

### Best Use Cases

- Background images
- Decorative elements
- Performance-critical applications where scaling isn’t needed
- Complex SVGs that do not require crisp vector scaling (e.g., fixed-size UI components)

---

## 2. Rendering SVGs as Graphics

### Overview

PixiJS can render SVGs as real scalable vector graphics using the `Graphics` class.

### Example

```ts
const graphics = new Graphics().svg('');
```

If you want to use the same SVG multiple times, you can use `GraphicsContext` to share the parsed SVG data across multiple graphics objects, improving performance by parsing it once and reusing it.

```ts
const context = new GraphicsContext().svg('');

const graphics1 = new Graphics(context);
const graphics2 = new Graphics(context);
```

### Loading SVGs as Graphics

Instead of passing an SVG string directly, you can load an SVG file using PixiJS’s `Assets.load` method. This will return a `GraphicsContext` object, which can be used to create multiple `Graphics` objects efficiently.

```ts
const svgContext = await Assets.load('path/to.svg', {
  parseAsGraphicsContext: true, // If false, it returns a texture instead.
});
const myGraphics = new Graphics(svgContext);
```

Since it's loaded via `Assets.load`, it will be cached and reused, much like a texture.

### Pros & Cons

- ✅ **Retains vector scalability** (no pixelation when zooming)
- ✅ **Modifiable after rendering** (change colors, strokes, etc.)
- ✅ **Efficient for simple graphics**
- ✅ **fast rendering if SVG structure does not change** (no need to reparse)
- ❌ **More expensive to parse** (complex SVGs can be slow to render)
- ❌ **Not ideal for static images**

### Best Use Cases

- Icons and UI elements that need resizing
- A game world that needs to remain crisp as a player zooms in
- Interactive graphics where modifying the SVG dynamically is necessary

---

## SVG Rendering Considerations

### Supported Features

PixiJS supports most SVG features that can be rendered in a Canvas 2D context. Below is a list of common SVG features and their compatibility:

| Feature                                 | Supported |
| --------------------------------------- | --------- |
| Basic Shapes (rect, circle, path, etc.) | ✅        |
| Gradients                               | ✅        |
| Stroke & Fill Styles                    | ✅        |
| Text Elements                           | ❌        |
| Filters (Blur, Drop Shadow, etc.)       | ❌        |
| Clipping Paths                          | ✅        |
| Patterns                                | ❌        |
| Complex Paths & Curves                  | ✅        |

### Performance Considerations

- **Complex SVGs:** Large or intricate SVGs can slow down rendering start up due to high parsing costs. Use `GraphicsContext` to cache and reuse parsed data.
- **Vector vs. Texture:** If performance is a concern, consider using SVGs as textures instead of rendering them as geometry. However, keep in mind that textures take up more memory.
- **Real-Time Rendering:** Avoid rendering complex SVGs dynamically. Preload and reuse them wherever possible.

---

## Best Practices & Gotchas

### Best Practices

- ✅ **Use Graphics for scalable and dynamic SVGs**
- ✅ **Use Textures for performance-sensitive applications**
- ✅ **Use `GraphicsContext` to avoid redundant parsing**
- ✅ **Consider `resolution` when using textures to balance quality and memory**

### Gotchas

- ⚠ **Large SVGs can be slow to parse** – Optimize SVGs before using them in PixiJS.
- ⚠ **Texture-based SVGs do not scale cleanly** – Use higher resolution if necessary.
- ⚠ **Not all SVG features are supported** – Complex filters and text elements may not work as expected.

---

By understanding how PixiJS processes SVGs, developers can make informed decisions on when to use `Graphics.svg()`, `GraphicsContext`, or SVG textures, balancing quality and performance for their specific use case.

---

## Renderers
