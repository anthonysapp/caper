# Scene Objects & Renderers

## Table of Contents
- [Renderers](#renderers) — WebGL/WebGPU renderer creation, resizing, texture generation
- [Cache As Texture](#cache-as-texture) — cacheAsTexture() for performance optimization
- [Container](#container) — Managing children, sorting, render groups
- [Graphics Fill](#graphics-fill) — Color fills, texture fills, gradients
- [Graphics Pixel Line](#graphics-pixel-line) — Pixel-perfect lines under scaling
- [Graphics](#graphics) — Shape drawing, GraphicsContext, SVG support
- [Scene Objects](#scene-objects) — Overview of all display objects, transforms, bounds
- [Mesh](#mesh) — Custom geometry, shaders, MeshSimple, MeshRope, MeshPlane
- [NineSlice Sprite](#nineslice-sprite) — Scalable UI panels with preserved corners
- [Particle Container](#particle-container) — High-performance particle systems
- [Sprite](#sprite) — Texture display, anchors, scaling
- [Tiling Sprite](#tiling-sprite) — Repeating texture patterns

---

# Renderers

PixiJS renderers are responsible for drawing your scene to a canvas using either **WebGL/WebGL2** or **WebGPU**. These renderers are high-performance GPU-accelerated engines and are composed of modular systems that manage everything from texture uploads to rendering pipelines.

All PixiJS renderers inherit from a common base, which provides consistent methods such as `.render()`, `.resize()`, and `.clear()` as well as shared systems for managing the canvas, texture GC, events, and more.

## Renderer Types

| Renderer         | Description                                                        | Status          |
| ---------------- | ------------------------------------------------------------------ | --------------- |
| `WebGLRenderer`  | Default renderer using WebGL/WebGL2. Well supported and stable.    | ✅ Recommended  |
| `WebGPURenderer` | Modern GPU renderer using WebGPU. More performant, still maturing. | 🚧 Experimental |
| `CanvasRenderer` | Fallback renderer using 2D canvas.                                 | ❌ Coming-soon  |

:::info
The WebGPU renderer is feature complete, however, inconsistencies in browser implementations may lead to unexpected behavior. It is recommended to use the WebGL renderer for production applications.
:::

## Creating a Renderer

You can use `autoDetectRenderer()` to create the best renderer for the environment:

```ts
import { autoDetectRenderer } from 'pixi.js';

const renderer = await autoDetectRenderer({
  preference: 'webgpu', // or 'webgl'
});
```

Or construct one explicitly:

```ts
import { WebGLRenderer, WebGPURenderer } from 'pixi.js';

const renderer = new WebGLRenderer();
await renderer.init(options);
```

## Rendering a Scene

To render a scene, you can use the `render()` method. This will draw the specified container to the screen or a texture:

```ts
import { Container } from 'pixi.js';

const container = new Container();
renderer.render(container);

// or provide a complete set of options
renderer.render({
  target: container,
  clear: true, // clear the screen before rendering
  transform: new Matrix(), // optional transform to apply to the container
});
```

## Resizing the Renderer

To resize the renderer, use the `resize()` method. This will adjust the canvas size and update the resolution:

```ts
renderer.resize(window.innerWidth, window.innerHeight);
```

## Generating Textures

You can generate textures from containers using the `generateTexture()` method. This is useful for creating textures from dynamic content:

```ts
import { Sprite } from 'pixi.js';

const sprite = new Sprite();
const texture = renderer.generateTexture(sprite);
```

## Resetting State

To reset the renderer's state, use the `resetState()` method. This is useful when mixing PixiJS with other libraries like Three.js:

```ts
function render() {
  // Render the Three.js scene
  threeRenderer.resetState();
  threeRenderer.render(scene, camera);

  // Render the PixiJS stage
  pixiRenderer.resetState();
  pixiRenderer.render({ container: stage });

  requestAnimationFrame(render);
}

requestAnimationFrame(render);
```

See our full guide on [mixing PixiJS with Three.js](../../third-party/mixing-three-and-pixi.mdx) for more details.

---

## API Reference

- [Overview](https://pixijs.download/release/docs/rendering.html)
- [AbstractRenderer](https://pixijs.download/release/docs/rendering.AbstractRenderer.html)
- [WebGLRenderer](https://pixijs.download/release/docs/rendering.WebGLRenderer.html)
- [WebGPURenderer](https://pixijs.download/release/docs/rendering.WebGPURenderer.html)
- [AutoDetectRenderer](https://pixijs.download/release/docs/rendering.html#autoDetectRenderer)

---

## Cache As Texture


---

# Cache As Texture

### Using `cacheAsTexture` in PixiJS

The `cacheAsTexture` function in PixiJS is a powerful tool for optimizing rendering in your applications. By rendering a container and its children to a texture, `cacheAsTexture` can significantly improve performance for static or infrequently updated containers. Let's explore how to use it effectively, along with its benefits and considerations.

:::info[Note]
`cacheAsTexture` is PixiJS v8's equivalent of the previous `cacheAsBitmap` functionality. If you're migrating from v7 or earlier, simply replace `cacheAsBitmap` with `cacheAsTexture` in your code.
:::

---

### What Is `cacheAsTexture`?

When you set `container.cacheAsTexture()`, the container is rendered to a texture. Subsequent renders reuse this texture instead of rendering all the individual children of the container. This approach is particularly useful for containers with many static elements, as it reduces the rendering workload.

To update the texture after making changes to the container, call:

```javascript
container.updateCacheTexture();
```

and to turn it off, call:

```javascript
container.cacheAsTexture(false);
```

---

### Basic Usage

Here's an example that demonstrates how to use `cacheAsTexture`:

```javascript
import * as PIXI from 'pixi.js';

(async () => {
  // Create a new application
  const app = new Application();

  // Initialize the application
  await app.init({ background: '#1099bb', resizeTo: window });

  // Append the application canvas to the document body
  document.body.appendChild(app.canvas);

  // load sprite sheet..
  await Assets.load('https://pixijs.com/assets/spritesheet/monsters.json');

  // holder to store aliens
  const aliens = [];
  const alienFrames = [
    'eggHead.png',
    'flowerTop.png',
    'helmlok.png',
    'skully.png',
  ];

  let count = 0;

  // create an empty container
  const alienContainer = new Container();

  alienContainer.x = 400;
  alienContainer.y = 300;

  app.stage.addChild(alienContainer);

  // add a bunch of aliens with textures from image paths
  for (let i = 0; i < 100; i++) {
    const frameName = alienFrames[i % 4];

    // create an alien using the frame name..
    const alien = Sprite.from(frameName);

    alien.tint = Math.random() * 0xffffff;

    alien.x = Math.random() * 800 - 400;
    alien.y = Math.random() * 600 - 300;
    alien.anchor.x = 0.5;
    alien.anchor.y = 0.5;
    aliens.push(alien);
    alienContainer.addChild(alien);
  }

  // this will cache the container and its children as a single texture
  // so instead of drawing 100 sprites, it will draw a single texture!
  alienContainer.cacheAsTexture();
})();
```

In this example, the `container` and its children are rendered to a single texture, reducing the rendering overhead when the scene is drawn.

### Advanced Usage

Instead of enabling cacheAsTexture with true, you can pass a configuration object which is very similar to texture source options.

```typescript
container.cacheAsTexture({
  resolution: 2,
  antialias: true,
});
```

- `resolution` is the resolution of the texture. By default this is the same as you renderer or application.
- `antialias` is the antialias mode to use for the texture. Much like the resolution this defaults to the renderer or application antialias mode.

---

### Benefits of `cacheAsTexture`

- **Performance Boost**: Rendering a complex container as a single texture avoids the need to process each child element individually during each frame.
- **Optimized for Static Content**: Ideal for containers with static or rarely updated children.

---

### Advanced Details

- **Memory Tradeoff**: Each cached texture requires GPU memory. Using `cacheAsTexture` trades rendering speed for increased memory usage.
- **GPU Limitations**: If your container is too large (e.g., over 4096x4096 pixels), the texture may fail to cache, depending on GPU limitations.

---

### How It Works Internally

Under the hood, `cacheAsTexture` converts the container into a render group and renders it to a texture. It uses the same texture cache mechanism as filters:

```javascript
container.enableRenderGroup();
container.renderGroup.cacheAsTexture = true;
```

Once the texture is cached, updating it via `updateCacheTexture()` is efficient and incurs minimal overhead. Its as fast as rendering the container normally.

---

### Best Practices

#### **DO**:

- **Use for Static Content**: Apply `cacheAsTexture` to containers with elements that don't change frequently, such as a UI panel with static decorations.
- **Leverage for Performance**: Use `cacheAsTexture` to render complex containers as a single texture, reducing the overhead of processing each child element individually every frame. This is especially useful for containers that contain expensive effects eg filters.
- **Switch of Antialiasing**: setting antialiasing to false can give a small performance boost, but the texture may look a bit more pixelated around its children's edges.
- **Resolution**: Do adjust the resolution based on your situation, if something is scaled down, you can use a lower resolution.If something is scaled up, you may want to use a higher resolution. But be aware that the higher the resolution the larger the texture and memory footprint.

#### **DON'T**:

- **Apply to Very Large Containers**: Avoid using `cacheAsTexture` on containers that are too large (e.g., over 4096x4096 pixels), as they may fail to cache due to GPU limitations. Instead, split them into smaller containers.
- **Overuse for Dynamic Content**: Flick `cacheAsTexture` on / off frequently on containers, as this results in constant re-caching, negating its benefits. Its better to Cache as texture when you once, and then use `updateCacheTexture` to update it.
- **Apply to Sparse Content**: Do not use `cacheAsTexture` for containers with very few elements or sparse content, as the performance improvement will be negligible.
- **Ignore Memory Impact**: Be cautious of GPU memory usage. Each cached texture consumes memory, so overusing `cacheAsTexture` can lead to resource constraints.

---

### Gotchas

- **Rendering Depends on Scene Visibility**: The cache updates only when the containing scene is rendered. Modifying the layout after setting `cacheAsTexture` but before rendering your scene will be reflected in the cache.

- **Containers are rendered with no transform**: Cached items are rendered at their actual size, ignoring transforms like scaling. For instance, an item scaled down by 50%, its texture will be cached at 100% size and then scaled down by the scene.

- **Caching and Filters**: Filters may not behave as expected with `cacheAsTexture`. To cache the filter effect, wrap the item in a parent container and apply `cacheAsTexture` to the parent.

- **Reusing the texture**: If you want to create a new texture based on the container, its better to use `const texture = renderer.generateTexture(container)` and share that amongst you objects!

By understanding and applying `cacheAsTexture` strategically, you can significantly enhance the rendering performance of your PixiJS projects. Happy coding!

---

## Container


---

# Container

The `Container` class is the foundation of PixiJS's scene graph system. Containers act as groups of scene objects, allowing you to build complex hierarchies, organize rendering layers, and apply transforms or effects to groups of objects.

## What Is a Container?

A `Container` is a general-purpose node that can hold other display objects, **including other containers**. It is used to structure your scene, apply transformations, and manage rendering and interaction.

Containers are **not** rendered directly. Instead, they delegate rendering to their children.

```ts
import { Container, Sprite } from 'pixi.js';

const group = new Container();
const sprite = Sprite.from('bunny.png');

group.addChild(sprite);
```

## Managing Children

PixiJS provides a robust API for adding, removing, reordering, and swapping children in a container:

```ts
const container = new Container();
const child1 = new Container();
const child2 = new Container();

container.addChild(child1, child2);
container.removeChild(child1);
container.addChildAt(child1, 0);
container.swapChildren(child1, child2);
```

You can also remove a child by index or remove all children within a range:

```ts
container.removeChildAt(0);
container.removeChildren(0, 2);
```

To keep a child’s world transform while moving it to another container, use `reparentChild` or `reparentChildAt`:

```ts
otherContainer.reparentChild(child);
```

### Events

Containers emit events when children are added or removed:

```ts
group.on('childAdded', (child, parent, index) => { ... });
group.on('childRemoved', (child, parent, index) => { ... });
```

### Finding Children

Containers support searching children by `label` using helper methods:

```ts
const child = new Container({ label: 'enemy' });
container.addChild(child);
container.getChildByLabel('enemy');
container.getChildrenByLabel(/^enemy/); // all children whose label starts with "enemy"
```

Set `deep = true` to search recursively through all descendants.

```ts
container.getChildByLabel('ui', true);
```

### Sorting Children

Use `zIndex` and `sortableChildren` to control render order within a container:

```ts
child1.zIndex = 1;
child2.zIndex = 10;
container.sortableChildren = true;
```

Call `sortChildren()` to manually re-sort if needed:

```ts
container.sortChildren();
```

:::info
Use this feature sparingly, as sorting can be expensive for large numbers of children.
:::

## Optimizing with Render Groups

Containers can be promoted to **render groups** by setting `isRenderGroup = true` or calling `enableRenderGroup()`.

Use render groups for UI layers, particle systems, or large moving subtrees.
See the [Render Groups guide](../../../concepts/render-groups.md) for more details.

```ts
const uiLayer = new Container({ isRenderGroup: true });
```

## Cache as Texture

The `cacheAsTexture` function in PixiJS is a powerful tool for optimizing rendering in your applications. By rendering a container and its children to a texture, `cacheAsTexture` can significantly improve performance for static or infrequently updated containers.

When you set `container.cacheAsTexture()`, the container is rendered to a texture. Subsequent renders reuse this texture instead of rendering all the individual children of the container. This approach is particularly useful for containers with many static elements, as it reduces the rendering workload.

:::info[Note]
`cacheAsTexture` is PixiJS v8's equivalent of the previous `cacheAsBitmap` functionality. If you're migrating from v7 or earlier, simply replace `cacheAsBitmap` with `cacheAsTexture` in your code.
:::

```ts
const container = new Container();
const sprite = Sprite.from('bunny.png');
container.addChild(sprite);

// enable cache as texture
container.cacheAsTexture();

// update the texture if the container changes
container.updateCacheTexture();

// disable cache as texture
container.cacheAsTexture(false);
```

For more advanced usage, including setting cache options and handling dynamic content, refer to the [Cache as Texture guide](./cache-as-texture.md).

---

## API Reference

- [Container](https://pixijs.download/release/docs/scene.Container.html)
- [ContainerOptions](https://pixijs.download/release/docs/scene.ContainerOptions.html)
- [RenderContainer](https://pixijs.download/release/docs/scene.RenderContainer.html)

---

## Graphics Fill


---

# Graphics Fill

If you are new to graphics, please check out the [graphics guide](../graphics) here. This guide dives a bit deeper into a specific aspect of graphics: how to fill them! The `fill()` method in PixiJS is particularly powerful, enabling you to fill shapes with colors, textures, or gradients. Whether you're designing games, UI components, or creative tools, mastering the `fill()` method is essential for creating visually appealing and dynamic graphics. This guide explores the different ways to use the `fill()` method to achieve stunning visual effects.

:::info Note
The `fillStyles` discussed here can also be applied to Text objects!
:::

## Basic Color Fills

When creating a `Graphics` object, you can easily fill it with a color using the `fill()` method. Here's a simple example:

```ts
const obj = new Graphics()
  .rect(0, 0, 200, 100) // Create a rectangle with dimensions 200x100
  .fill('red'); // Fill the rectangle with a red color
```

![alt text](/assets/guides/components/image.png)

This creates a red rectangle. PixiJS supports multiple color formats for the `fill()` method. Developers can choose a format based on their needs. For example, CSS color strings are user-friendly and readable, hexadecimal strings are compact and widely used in design tools, and numbers are efficient for programmatic use. Arrays and Color objects offer precise control, making them ideal for advanced graphics.

- CSS color strings (e.g., 'red', 'blue')
- Hexadecimal strings (e.g., '#ff0000')
- Numbers (e.g., `0xff0000`)
- Arrays (e.g., `[255, 0, 0]`)
- Color objects for precise color control

### Examples:

```ts
// Using a number
const obj1 = new Graphics().rect(0, 0, 100, 100).fill(0xff0000);

// Using a hex string
const obj2 = new Graphics().rect(0, 0, 100, 100).fill('#ff0000');

// Using an array
const obj3 = new Graphics().rect(0, 0, 100, 100).fill([255, 0, 0]);

// Using a Color object
const color = new Color();
const obj4 = new Graphics().rect(0, 0, 100, 100).fill(color);
```

## Fill with a Style Object

For more advanced fills, you can use a `FillStyle` object. This allows for additional customization, such as setting opacity:

```ts
const obj = new Graphics().rect(0, 0, 100, 100).fill({
  color: 'red',
  alpha: 0.5, // 50% opacity
});
```

![alt text](/assets/guides/components/image-1.png)

## Fill with Textures

Filling shapes with textures is just as simple:

```ts
const texture = await Assets.load('assets/image.png');
const obj = new Graphics().rect(0, 0, 100, 100).fill(texture);
```

![alt text](/assets/guides/components/image-2.png)

### Local vs. Global Texture Space

Textures can be applied in two coordinate spaces:

- **Local Space** (Default): The texture coordinates are mapped relative to the shape's dimensions and position. The texture coordinates use a normalized coordinate system where (0,0) is the top-left and (1,1) is the bottom-right of the shape, regardless of its actual pixel dimensions. For example, if you have a 300x200 pixel texture filling a 100x100 shape, the texture will be scaled to fit exactly within those 100x100 pixels. The texture's top-left corner (0,0) will align with the shape's top-left corner, and the texture's bottom-right corner (1,1) will align with the shape's bottom-right corner, stretching or compressing the texture as needed.

```ts
const shapes = new PIXI.Graphics()
  .rect(50, 50, 100, 100)
  .circle(250, 100, 50)
  .star(400, 100, 6, 60, 40)
  .roundRect(500, 50, 100, 100, 10)
  .fill({
    texture,
    textureSpace: 'local', // default!
  });
```

![alt text](/assets/guides/components/image-13.png)

- **Global Space**: Set `textureSpace: 'global'` to make the texture position and scale relative to the Graphics object's coordinate system. Despite the name, this isn't truly "global" - the texture remains fixed relative to the Graphics object itself, maintaining its position even when the object moves or scales. See how the image goes across all the shapes (in the same graphics) below:

```ts
const shapes = new PIXI.Graphics()
  .rect(50, 50, 100, 100)
  .circle(250, 100, 50)
  .star(400, 100, 6, 60, 40)
  .roundRect(500, 50, 100, 100, 10)
  .fill({
    texture,
    textureSpace: 'global',
  });
```

![alt text](/assets/guides/components/image-11.png)

### Using Matrices with Textures

To modify texture coordinates, you can apply a transformation matrix, which is a mathematical tool used to scale, rotate, or translate the texture. If you're unfamiliar with transformation matrices, they allow for precise control over how textures are rendered, and you can explore more about them [here](https://learnwebgl.brown37.net/10_surface_properties/texture_mapping_transforms.html#:~:text=Overview%C2%B6,by%2D4%20transformation%20matrix).

```ts
const matrix = new Matrix().scale(0.5, 0.5);

const obj = new Graphics().rect(0, 0, 100, 100).fill({
  texture: texture,
  matrix: matrix, // scale the texture down by 2
});
```

![alt text](/assets/guides/components/image-4.png)

### Texture Gotcha's

1. **Sprite Sheets**: If using a texture from a sprite sheet, the entire source texture will be used. To use a specific frame, create a new texture:

```ts
const spriteSheetTexture = Texture.from('assets/my-sprite-sheet.png');
const newTexture = renderer.generateTexture(Sprite.from(spriteSheetTexture));

const obj = new Graphics().rect(0, 0, 100, 100).fill(newTexture);
```

2. **Power of Two Textures**: Textures should be power-of-two dimensions for proper tiling in WebGL1 (WebGL2 and WebGPU are fine).

## Fill with Gradients

PixiJS supports both linear and radial gradients, which can be created using the `FillGradient` class. Gradients are particularly useful for adding visual depth and dynamic styling to shapes and text.

### Linear Gradients

Linear gradients create a smooth color transition along a straight line. Here is an example of a simple linear gradient:

```ts
const gradient = new FillGradient({
  type: 'linear',
  colorStops: [
    { offset: 0, color: 'yellow' },
    { offset: 1, color: 'green' },
  ],
});

const obj = new Graphics().rect(0, 0, 100, 100).fill(gradient);
```

![alt text](/assets/guides/components/image-5.png)

You can control the gradient direction with the following properties:

- `start {x, y}`: These define the starting point of the gradient. For example, in a linear gradient, this is where the first color stop is positioned. These values are typically expressed in relative coordinates (0 to 1), where `0` represents the left/top edge and `1` represents the right/bottom edge of the shape.

- `end {x, y}`: These define the ending point of the gradient. Similar to `start {x, y}`, these values specify where the last color stop is positioned in the shape's local coordinate system.

Using these properties, you can create various gradient effects, such as horizontal, vertical, or diagonal transitions. For example, setting `start` to `{x: 0, y: 0}` and `end` to `{x: 1, y: 1}` would result in a diagonal gradient from the top-left to the bottom-right of the shape.

```ts
const diagonalGradient = new FillGradient({
  type: 'linear',
  start: { x: 0, y: 0 },
  end: { x: 1, y: 1 },
  colorStops: [
    { offset: 0, color: 'yellow' },
    { offset: 1, color: 'green' },
  ],
});
```

![alt text](/assets/guides/components/image-6.png)

### Radial Gradients

Radial gradients create a smooth color transition in a circular pattern. Unlike linear gradients, they blend colors from one circle to another. Here is an example of a simple radial gradient:

```ts
const gradient = new FillGradient({
  type: 'radial',
  colorStops: [
    { offset: 0, color: 'yellow' },
    { offset: 1, color: 'green' },
  ],
});

const obj = new Graphics().rect(0, 0, 100, 100).fill(gradient);
```

![alt text](/assets/guides/components/image-7.png)

You can control the gradient's shape and size using the following properties:

- `center {x, y}`: These define the center of the inner circle where the gradient starts. Typically, these values are expressed in relative coordinates (0 to 1), where `0.5` represents the center of the shape.

- `innerRadius`: The radius of the inner circle. This determines the size of the gradient's starting point.

- `outerCenter {x, y}`: These define the center of the outer circle where the gradient ends. Like `center {x, y}`, these values are also relative coordinates.

- `outerRadius`: The radius of the outer circle. This determines the size of the gradient's ending point.

By adjusting these properties, you can create a variety of effects, such as small, concentrated gradients or large, expansive ones. For example, setting a small `r0` and a larger `r1` will create a gradient that starts does not start to transition until the inner circle radius is reached.

```ts
const radialGradient = new FillGradient({
  type: 'radial',
  center: { x: 0.5, y: 0.5 },
  innerRadius: 0.25,
  outerCenter: { x: 0.5, y: 0.5 },
  outerRadius: 0.5,
  colorStops: [
    { offset: 0, color: 'blue' },
    { offset: 1, color: 'red' },
  ],
});

const obj = new Graphics().rect(0, 0, 100, 100).fill(gradient);
```

![alt text](/assets/guides/components/image-8.png)

### Gradient Gotcha's

1. **Memory Management**: Use `fillGradient.destroy()` to free up resources when gradients are no longer needed.

2. **Animation**: Update existing gradients instead of creating new ones for better performance.

3. **Custom Shaders**: For complex animations, custom shaders may be more efficient.

4. **Texture and Matrix Limitations**: Under the hood, gradient fills set both the texture and matrix properties internally. This means you cannot use a texture fill or matrix transformation at the same time as a gradient fill.

### Combining Textures and Colors

You can combine a texture or gradients with a color tint and alpha to achieve more complex and visually appealing effects. This allows you to overlay a color on top of the texture or gradient, adjusting its transparency with the alpha value.

```ts
const gradient = new FillGradient({
  colorStops: [
    { offset: 0, color: 'blue' },
    { offset: 1, color: 'red' },
  ],
});

const obj = new Graphics().rect(0, 0, 100, 100).fill({
  fill: gradient,
  color: 'yellow',
  alpha: 0.5,
});
```

![alt text](/assets/guides/components/image-10.png)

```ts
const obj = new Graphics().rect(0, 0, 100, 100).fill({
  texture: texture,
  color: 'yellow',
  alpha: 0.5,
});
```

![alt text](/assets/guides/components/image-9.png)

---

Hopefully, this guide has shown you how easy and powerful fills can be when working with graphics (and text!). By mastering the `fill()` method, you can unlock endless possibilities for creating visually dynamic and engaging graphics in PixiJS. Have fun!

---

## Graphics Pixel Line

import { Sandpack } from '@codesandbox/sandpack-react';
import { dracula } from '@codesandbox/sandpack-themes';


---

# Graphics Pixel Line

The `pixelLine` property is a neat feature of the PixiJS Graphics API that allows you to create lines that remain 1 pixel thick, regardless of scaling or zoom level. As part of the Graphics API, it gives developers all the power PixiJS provides for building and stroking shapes. This feature is especially useful for achieving crisp, pixel-perfect visuals, particularly in retro-style or grid-based games, technical drawing, or UI rendering.

In this guide, we'll dive into how this property works, its use cases, and the caveats you should be aware of when using it.

---

```ts
import { Application, Container, Graphics, Text } from 'pixi.js';

/**
 * Creates a grid pattern using Graphics lines
 * @param graphics - The Graphics object to draw on
 * @returns The Graphics object with the grid drawn
 */
function buildGrid(graphics) {
  // Draw 10 vertical lines spaced 10 pixels apart
  for (let i = 0; i < 11; i++) {
    // Move to top of each line (x = i*10, y = 0)
    graphics
      .moveTo(i * 10, 0)
      // Draw down to bottom (x = i*10, y = 100)
      .lineTo(i * 10, 100);
  }

  // Draw 10 horizontal lines spaced 10 pixels apart
  for (let i = 0; i < 11; i++) {
    // Move to start of each line (x = 0, y = i*10)
    graphics
      .moveTo(0, i * 10)
      // Draw across to end (x = 100, y = i*10)
      .lineTo(100, i * 10);
  }

  return graphics;
}

(async () => {
  // Create and initialize a new PixiJS application
  const app = new Application();

  await app.init({ antialias: true, resizeTo: window });
  document.body.appendChild(app.canvas);

  // Create two grids - one with pixel-perfect lines and one without
  const gridPixel = buildGrid(new Graphics()).stroke({
    color: 0xffffff,
    pixelLine: true,
    width: 1,
  });

  const grid = buildGrid(new Graphics()).stroke({
    color: 0xffffff,
    pixelLine: false,
  });

  // Position the grids side by side
  grid.x = -100;
  grid.y = -50;
  gridPixel.y = -50;

  // Create a container to hold both grids
  const container = new Container();

  container.addChild(grid, gridPixel);

  // Center the container on screen
  container.x = app.screen.width / 2;
  container.y = app.screen.height / 2;
  app.stage.addChild(container);

  // Animation variables
  let count = 0;

  // Add animation to scale the grids over time
  app.ticker.add(() => {
    count += 0.01;
    container.scale = 1 + (Math.sin(count) + 1) * 2;
  });

  // Add descriptive label
  const label = new Text({
    text: 'Grid Comparison: Standard Lines (Left) vs Pixel-Perfect Lines (Right)',
    style: { fill: 0xffffff },
  });

  // Position label in top-left corner
  label.position.set(20, 20);
  label.width = app.screen.width - 40;
  label.scale.y = label.scale.x;
  app.stage.addChild(label);
})();
```

## How to use `pixelLine`?

Here’s a simple example:

```ts
// Create a Graphics object and draw a pixel-perfect line
let graphics = new Graphics()
  .moveTo(0, 0)
  .lineTo(100, 100)
  .stroke({ color: 0xff0000, pixelLine: true });

// Add it to the stage
app.stage.addChild(graphics);

// Even if we scale the Graphics object, the line remains 1 pixel wide
graphics.scale.set(2);
```

In this example, no matter how you transform or zoom the `Graphics` object, the red line will always appear 1 pixel thick on the screen.

---

## Why Use `pixelLine`?

Pixel-perfect lines can be incredibly useful in a variety of scenarios. Here are some common use cases:

### 1. **Retro or Pixel Art Games**

- Pixel art games rely heavily on maintaining sharp, precise visuals. The `pixelLine` property ensures that lines do not blur or scale inconsistently with other pixel elements.
- Example: Drawing pixel-perfect grids for tile-based maps.

```ts
// Create a grid of vertical and horizontal lines
const grid = new Graphics();

// Draw 10 vertical lines spaced 10 pixels apart
// Draw vertical lines
for (let i = 0; i < 10; i++) {
  // Move to top of each line (x = i*10, y = 0)
  grid
    .moveTo(i * 10, 0)
    // Draw down to bottom (x = i*10, y = 100)
    .lineTo(i * 10, 100);
}

// Draw horizontal lines
for (let i = 0; i < 10; i++) {
  // Move to start of each line (x = 0, y = i*10)
  grid
    .moveTo(0, i * 10)
    // Draw across to end (x = 100, y = i*10)
    .lineTo(100, i * 10);
}

// Stroke all lines in white with pixel-perfect width
grid.stroke({ color: 0xffffff, pixelLine: true });
```

---

### 2. **UI and HUD Elements**

- For UI elements such as borders, separators, or underlines, a consistent 1-pixel thickness provides a professional, clean look.
- Example: Drawing a separator line in a menu or a progress bar border.

```ts
// Create a separator line that will always be 1 pixel thick
const separator = new Graphics()
  // Start at x=0, y=50
  .moveTo(0, 50)
  // Draw a horizontal line 200 pixels to the right
  .lineTo(200, 50)
  // Stroke in green with pixel-perfect 1px width
  .stroke({ color: 0x00ff00, pixelLine: true });
```

---

### 3. **Debugging and Prototyping**

- Use pixel-perfect lines to debug layouts, collision boxes, or grids. Since the lines don’t scale, they offer a consistent reference point during development.
- Example: Displaying collision boundaries in a physics-based game.

```ts
// Create a debug box with pixel-perfect stroke
const graphicsBox = new Graphics()
  .rect(0, 0, 100, 100)
  .stroke({ color: 0xff00ff, pixelLine: true });

/**
 * Updates the debug box to match the bounds of a given object
 * @param {Container} obj - The object to draw bounds for
 */
function drawDebugBounds(obj) {
  // Get the bounds of the object
  let bounds = obj.getBounds().rectangle;

  // Position and scale the debug box to match the bounds
  // this is faster than using `moveTo` and `lineTo` each frame!
  graphicsBox.position.set(bounds.x, bounds.y);
  graphicsBox.scale.set(bounds.width / 100, bounds.height / 100);
}
```

---

## How it works

This is achieved under the hood using WebGL or WebGPU's native line rendering methods when `pixelLine` is set to `true`.

Fun fact its actually faster to draw a pixel line than a regular line. This is because of two main factors:

1. **Simpler Drawing Process**: Regular lines in PixiJS (when `pixelLine` is `false`) need extra steps to be drawn. PixiJS has to figure out the thickness of the line and create a shape that looks like a line but is actually made up of triangles.

2. **Direct Line Drawing**: When using `pixelLine`, we can tell the graphics card "just draw a line from point A to point B" and it knows exactly what to do. This is much simpler and faster than creating and filling shapes.

Think of it like drawing a line on paper - `pixelLine` is like using a pen to draw a straight line, while regular lines are like having to carefully color in a thin rectangle. The pen method is naturally faster and simpler!

## Caveats and Gotchas

While the `pixelLine` property is incredibly useful, there are some limitations and things to keep in mind:

### 1. **Its 1px thick, thats it!**

- The line is always 1px thick, there is no way to change this as its using the GPU to draw the line.

### 2. **Hardware may render differently**

- Different GPUs and graphics hardware may render the line slightly differently due to variations in how they handle line rasterization. For example, some GPUs may position the line slightly differently or apply different anti-aliasing techniques. This is an inherent limitation of GPU line rendering and is beyond PixiJS's control.

### 4. **Scaling Behavior**

- While the line thickness remains constant, other properties (e.g., position or start/end points) are still affected by scaling. This can sometimes create unexpected results if combined with other scaled objects. This is a feature not a bug :)

### Example: Box with Pixel-Perfect Stroke

Here's an example of a filled box with a pixel-perfect stroke. The box itself scales and grows, but the stroke remains 1 pixel wide:

```ts
// Create a Graphics object and draw a filled box with a pixel-perfect stroke
let box = new Graphics()
  .rect(0, 0, 100, 100)
  .fill('white')
  .stroke({ color: 0xff0000, pixelLine: true });

// Add it to the stage
app.stage.addChild(box);

// Scale the box
box.scale.set(2);
```

In this example, the blue box grows as it scales, but the red stroke remains at 1 pixel thickness, providing a crisp outline regardless of the scaling.

---

## When to Avoid Using `pixelLine`

- **You want a line that is not 1px thick:** Don't use `pixelLine`.
- **You want the line to scale:** Don't use `pixelLine`

---

## Conclusion

The `pixelLine` property is a super useful to have in the PixiJS toolbox for developers looking to create sharp, pixel-perfect lines that remain consistent under transformation. By understanding its strengths and limitations, you can incorporate it into your projects for clean, professional results in both visual and functional elements.

---

## Graphics


---

# Graphics

[Graphics](https://pixijs.download/release/docs/scene.Graphics.html) is a powerful and flexible tool for rendering shapes such as rectangles, circles, stars, and custom polygons. It can also be used to create complex shapes by combining multiple primitives, and it supports advanced features like gradients, textures, and masks.

```ts
import { Graphics } from 'pixi.js';

const graphics = new Graphics().rect(50, 50, 100, 100).fill(0xff0000);
```

## **Available Shapes**

PixiJS v8 supports a variety of shape primitives:

### Basic Primitives

- Line
- Rectangle
- Rounded Rectangle
- Circle
- Ellipse
- Arc
- Bezier / Quadratic Curves

### Advanced Primitives

- Chamfer Rect
- Fillet Rect
- Regular Polygon
- Star
- Rounded Polygon
- Rounded Shape

```ts
const graphics = new Graphics()
  .rect(50, 50, 100, 100)
  .fill(0xff0000)
  .circle(200, 200, 50)
  .stroke(0x00ff00)
  .lineStyle(5)
  .moveTo(300, 300)
  .lineTo(400, 400);
```

### SVG Support

You can also load SVG path data, although complex hole geometries may render inaccurately due to Pixi's performance-optimized triangulation system.

```ts
let shape = new Graphics().svg(`
  
    
  
`);
```

## **GraphicsContext**

The `GraphicsContext` class is the core of PixiJS's new graphics model. It holds all the drawing commands and styles, allowing the same shape data to be reused by multiple `Graphics` instances:

```ts
const context = new GraphicsContext().circle(100, 100, 50).fill('red');

const shapeA = new Graphics(context);
const shapeB = new Graphics(context); // Shares the same geometry
```

This pattern is particularly effective when rendering repeated or animated shapes, such as frame-based SVG swaps:

```ts
let frames = [
  new GraphicsContext().circle(100, 100, 50).fill('red'),
  new GraphicsContext().rect(0, 0, 100, 100).fill('red'),
];

let graphic = new Graphics(frames[0]);

function update() {
  graphic.context = frames[1]; // Very cheap operation
}
```

:::info
If you don't explicitly pass a `GraphicsContext` when creating a `Graphics` object, then internally, it will have its own context, accessible via `myGraphics.context`.
:::

### Destroying a GraphicsContext

When you destroy a `GraphicsContext`, all `Graphics` instances that share it will also be destroyed. This is a crucial point to remember, as it can lead to unexpected behavior if you're not careful.

```ts
const context = new GraphicsContext().circle(100, 100, 50).fill('red');
const shapeA = new Graphics(context);
const shapeB = new Graphics(context); // Shares the same geometry

shapeA.destroy({ context: true }); // Destroys both shapeA and shapeB
```

## **Creating Holes**

Use `.cut()` to remove a shape from the previous one:

```ts
const g = new Graphics()
  .rect(0, 0, 100, 100)
  .fill(0x00ff00)
  .circle(50, 50, 20)
  .cut(); // Creates a hole in the green rectangle
```

Ensure the hole is fully enclosed within the shape to avoid triangulation errors.

## **Graphics Is About Building, Not Drawing**

Despite the terminology of functions like `.rect()` or `.circle()`, `Graphics` does not immediately draw anything. Instead, each method builds up a list of geometry primitives stored inside a `GraphicsContext`. These are then rendered when the object is drawn to the screen or used in another context, such as a mask.

```ts
const graphic = new Graphics().rect(0, 0, 200, 100).fill(0xff0000);

app.stage.addChild(graphic); // The rendering happens here
```

You can think of `Graphics` as a blueprint builder: it defines what to draw, but not when to draw it. This is why `Graphics` objects can be reused, cloned, masked, and transformed without incurring extra computation until they're actually rendered.

## **Performance Best Practices**

- **Do not clear and rebuild graphics every frame**. If your content is dynamic, prefer swapping prebuilt `GraphicsContext` objects instead of recreating them.
- **Use `Graphics.destroy()`** to clean up when done. Shared contexts are not auto-destroyed.
- **Use many simple `Graphics` objects** over one complex one to maintain GPU batching.
- **Avoid transparent overlap** unless you understand blend modes; overlapping semi-transparent primitives will interact per primitive, not post-composition.

## **Caveats and Gotchas**

- **Memory Leaks**: Call `.destroy()` when no longer needed.
- **SVG and Holes**: Not all SVG hole paths triangulate correctly.
- **Changing Geometry**: Use `.clear()` sparingly. Prefer swapping contexts.
- **Transparency and Blend Modes**: These apply per primitive. Use `RenderTexture` if you want to flatten effects.

---

## **API Reference**

- [Graphics](https://pixijs.download/release/docs/scene.Graphics.html)
- [GraphicsContext](https://pixijs.download/release/docs/scene.GraphicsContext.html)
- [FillStyle](https://pixijs.download/release/docs/scene.FillStyle.html)
- [StrokeStyle](https://pixijs.download/release/docs/scene.StrokeStyle.html)

---

## Scene Objects


---

# Scene Objects

In PixiJS, scene objects are the building blocks of your application’s display hierarchy. They include **containers**, **sprites**, **text**, **graphics**, and other drawable entities that make up the **scene graph**—the tree-like structure that determines what gets rendered, how, and in what order.

## Containers vs. Leaf Nodes

Scene objects in PixiJS can be divided into **containers** and **leaf nodes**:

### Containers

`Container` is the **base class** for all scene objects in v8 (replacing the old `DisplayObject`).

- Can have children.
- Commonly used to group objects and apply transformations (position, scale, rotation) to the group.
- Examples: `Application.stage`, user-defined groups.

```ts
const group = new Container();
group.addChild(spriteA);
group.addChild(spriteB);
```

### Leaf Nodes

Leaf nodes are renderable objects that should not have children. In v8, **only containers should have children**.

Examples of leaf nodes include:

- `Sprite`
- `Text`
- `Graphics`
- `Mesh`
- `TilingSprite`
- `HTMLText`

Attempting to add children to a leaf node will not result in a runtime error, however, you may run into unexpected rendering behavior. Therefore, If nesting is required, wrap leaf nodes in a `Container`.

**Before v8 (invalid in v8):**

```ts
const sprite = new Sprite();
sprite.addChild(anotherSprite); // ❌ Invalid in v8
```

**v8 approach:**

```ts
const group = new Container();
group.addChild(sprite);
group.addChild(anotherSprite); // ✅ Valid
```

## Transforms

All scene objects in PixiJS have several properties that control their position, rotation, scale, and alpha. These properties are inherited by child objects, allowing you to apply transformations to groups of objects easily.

You will often use these properties to position and animate objects in your scene.

| Property     | Description                                                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **position** | X- and Y-position are given in pixels and change the position of the object relative to its parent, also available directly as `object.x` / `object.y`  |
| **rotation** | Rotation is specified in radians, and turns an object clockwise (0.0 - 2 \* Math.PI)                                                                    |
| **angle**    | Angle is an alias for rotation that is specified in degrees instead of radians (0.0 - 360.0)                                                            |
| **pivot**    | Point the object rotates around, in pixels - also sets origin for child objects                                                                         |
| **alpha**    | Opacity from 0.0 (fully transparent) to 1.0 (fully opaque), inherited by children                                                                       |
| **scale**    | Scale is specified as a percent with 1.0 being 100% or actual-size, and can be set independently for the x and y axis                                   |
| **skew**     | Skew transforms the object in x and y similar to the CSS skew() function, and is specified in radians                                                   |
| **anchor?**  | Anchor is a percentage-based offset for the sprite's position and rotation. This is different from the `pivot` property, which is a pixel-based offset. |

### **Anchor vs Pivot**

Some leaf nodes have an additional property called `anchor`, which is a percentage-based offset for the nodes position and rotation. This is different from the `pivot` property, which is a pixel-based offset. Understanding the difference between anchor and pivot is critical when positioning or rotating a node.

:::info
Setting either pivot or anchor visually moves the node. This differs from CSS where changing `transform-origin` does not affect the element's position.
:::

#### **Anchor**

- Available only on `Sprite`
- Defined in normalized values `(0.0 to 1.0)`
- `(0, 0)` is the top-left, `(0.5, 0.5)` is the center
- Changes both position and rotation origin

```ts
sprite.anchor.set(0.5); // center
sprite.rotation = Math.PI / 4; // Rotate 45 degrees around the center
```

#### **Pivot**

- Available on all `Container`s
- Defined in **pixels**, not normalized

```ts
const sprite = new Sprite(texture);
sprite.width = 100;
sprite.height = 100;
sprite.pivot.set(50, 50); // Center of the container
container.rotation = Math.PI / 4; // Rotate 45 degrees around the pivot
```

## Measuring Bounds

There are two types of bounds in PixiJS:

- **Local bounds** represent the object’s dimensions in its own coordinate space. Use `getLocalBounds()`.
- **Global bounds** represent the object's bounding box in world coordinates. Use `getBounds()`.

```ts
const local = container.getLocalBounds();
const global = container.getBounds();
```

If performance is critical you can also provide a custom `boundsArea` to avoid per-child measurement entirely.

### Changing size

To change the size of a container, you can use the `width` and `height` properties. This will scale the container to fit the specified dimensions:

```ts
const container = new Container();
container.width = 100;
container.height = 200;
```

Setting the `width` and `height` individually can be an expensive operation, as it requires recalculating the bounds of the container and its children. To avoid this, you can use `setSize()` to set both properties at once:

```ts
const container = new Container();
container.setSize(100, 200);
const size = container.getSize(); // { width: 100, height: 200 }
```

This method is more efficient than setting `width` and `height` separately, as it only requires one bounds calculation.

## Masking Scene Objects

PixiJS supports **masking**, allowing you to restrict the visible area of a scene object based on another object's shape.
This is useful for creating effects like cropping, revealing, or hiding parts of your scene.

### Types of Masks

- **Graphics-based masks**: Use a `Graphics` object to define the shape.
- **Sprite-based masks**: Use a `Sprite` or other renderable object.

```ts
const shape = new Graphics().circle(100, 100, 50).fill(0x000000);

const maskedSprite = new Sprite(texture);
maskedSprite.mask = shape;

stage.addChild(shape);
stage.addChild(maskedSprite);
```

### Inverse Masks

To create an inverse mask, you can use the `setMask` property and set its `inverse` option to `true`. This will render everything outside the mask.

```ts
const inverseMask = new Graphics().rect(0, 0, 200, 200).fill(0x000000);
const maskedContainer = new Container();
maskedContainer.setMask({ mask: inverseMask, inverse: true });
maskedContainer.addChild(sprite);
stage.addChild(inverseMask);
stage.addChild(maskedContainer);
```

### Notes on Masking

- The mask is **not rendered**; it's used only to define the visible area. However, it must be added to the display list.
- Only one mask can be assigned per object.
- For advanced blending, use **alpha masks** or **filters** (covered in later guides).

## Filters

Another common use for Container objects is as hosts for filtered content. Filters are an advanced, WebGL/WebGPU-only feature that allows PixiJS to perform per-pixel effects like blurring and displacements. By setting a filter on a Container, the area of the screen the Container encompasses will be processed by the filter after the Container's contents have been rendered.

```ts
const container = new Container();
const sprite = new Sprite(texture);
const filter = new BlurFilter({ strength: 8, quality: 4, kernelSize: 5 });
container.filters = [filter];
container.addChild(sprite);
```

:::info
Filters should be used somewhat sparingly. They can slow performance and increase memory usage if used too often in a scene.
:::

Below are list of filters available by default in PixiJS. There is, however, a community repository with [many more filters](https://github.com/pixijs/filters).

| Filter             | Description                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| AlphaFilter        | Similar to setting `alpha` property, but flattens the Container instead of applying to children individually. |
| BlurFilter         | Apply a blur effect                                                                                           |
| ColorMatrixFilter  | A color matrix is a flexible way to apply more complex tints or color transforms (e.g., sepia tone).          |
| DisplacementFilter | Displacement maps create visual offset pixels, for instance creating a wavy water effect.                     |
| NoiseFilter        | Create random noise (e.g., grain effect).                                                                     |

Under the hood, each Filter we offer out of the box is written in both glsl (for WebGL) and wgsl (for WebGPU). This means all filters should work on both renderers.

## Tinting

You can tint any scene object by setting the `tint` property. It modifies the color of the rendered pixels, similar to multiplying a tint color over the object.

```ts
const sprite = new Sprite(texture);
sprite.tint = 0xff0000; // Red tint
sprite.tint = 'red'; // Red tint
```

The `tint` is inherited by child objects unless they specify their own. If only part of your scene should be tinted, place it in a separate container.

A value of `0xFFFFFF` disables tinting.

```ts
const sprite = new Sprite(texture);
sprite.tint = 0x00ff00; // Green tint
sprite.tint = 0xffffff; // No tint
```

PixiJS supports a variety of color formats and you can find more information from the [Color documentation](../color.md).

## Blend Modes

Blend modes determine how colors of overlapping objects are combined. PixiJS supports a variety of blend modes, including:

- `normal`: Default blend mode.
- `add`: Adds the colors of the source and destination pixels.
- `multiply`: Multiplies the colors of the source and destination pixels.
- `screen`: Inverts the colors, multiplies them, and inverts again.

We also support may more advanced blend modes, such as `subtract`, `difference`, and `overlay`. You can find the full list of blend modes in the [Blend Modes documentation](../filters.md#advanced-blend-modes).

```ts
const sprite = new Sprite(texture);
sprite.blendMode = 'multiply'; // Multiply blend mode
```

## Interaction

PixiJS provides a powerful interaction system that allows you to handle user input events like clicks/hovers. To enable interaction on a scene object, can be as simple as setting its `interactive` property to `true`.

```ts
const sprite = new Sprite(texture);
sprite.interactive = true;
sprite.on('click', (event) => {
  console.log('Sprite clicked!', event);
});
```

We have a detailed guide on [Interaction](../events.md) that covers how to set up and manage interactions, including hit testing, pointer events, and more. We highly recommend checking it out.

## Using `onRender`

The `onRender` callback allows you to run logic every frame when a scene object is rendered. This is useful for lightweight animation and update logic:

```ts
const container = new Container();
container.onRender = () => {
  container.rotation += 0.01;
};
```

Note: In PixiJS v8, this replaces the common v7 pattern of overriding `updateTransform`, which no longer runs every frame. The `onRender` function is registered with the render group the container belongs to.

To remove the callback:

```ts
container.onRender = null;
```

---

## API Reference

- [Overview](https://pixijs.download/release/docs/scene.html)
- [Container](https://pixijs.download/release/docs/scene.Container.html)
- [ParticleContainer](https://pixijs.download/release/docs/scene.ParticleContainer.html)
- [Sprite](https://pixijs.download/release/docs/scene.Sprite.html)
- [TilingSprite](https://pixijs.download/release/docs/scene.TilingSprite.html)
- [NineSliceSprite](https://pixijs.download/release/docs/scene.NineSliceSprite.html)
- [Graphics](https://pixijs.download/release/docs/scene.Graphics.html)
- [Mesh](https://pixijs.download/release/docs/scene.Mesh.html)
- [Text](https://pixijs.download/release/docs/scene.Text.html)
- [Bitmap Text](https://pixijs.download/release/docs/scene.BitmapText.html)
- [HTMLText](https://pixijs.download/release/docs/scene.HTMLText.html)

---

## Mesh


---

# Mesh

PixiJS v8 offers a powerful `Mesh` system that provides full control over geometry, UVs, indices, shaders, and WebGL/WebGPU state. Meshes are ideal for custom rendering effects, advanced distortion, perspective manipulation, or performance-tuned rendering pipelines.

```ts
import { Texture, Mesh, MeshGeometry, Shader } from 'pixi.js';

const geometry = new MeshGeometry({
  positions: new Float32Array([0, 0, 100, 0, 100, 100, 0, 100]),
  uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
  indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
});

const shader = Shader.from({
  gl: {
    vertex: `
            attribute vec2 aPosition;
            attribute vec2 aUV;
            varying vec2 vUV;
            void main() {
                gl_Position = vec4(aPosition / 100.0 - 1.0, 0.0, 1.0);
                vUV = aUV;
            }
        `,
    fragment: `
            precision mediump float;
            varying vec2 vUV;
            uniform sampler2D uSampler;
            void main() {
                gl_FragColor = texture2D(uSampler, vUV);
            }
        `,
  },
  resources: {
    uSampler: Texture.from('image.png').source,
  },
});

const mesh = new Mesh({ geometry, shader });
app.stage.addChild(mesh);
```

## **What Is a Mesh?**

A mesh is a low-level rendering primitive composed of:

- **Geometry**: Vertex positions, UVs, indices, and other attributes
- **Shader**: A GPU program that defines how the geometry is rendered
- **State**: GPU state configuration (e.g. blending, depth, stencil)

With these elements, you can build anything from simple quads to curved surfaces and procedural effects.

## **MeshGeometry**

All meshes in PixiJS are built using the `MeshGeometry` class. This class allows you to define the vertex positions, UV coordinates, and indices that describe the mesh's shape and texture mapping.

```ts
const geometry = new MeshGeometry({
  positions: Float32Array, // 2 floats per vertex
  uvs: Float32Array, // matching number of floats
  indices: Uint32Array, // 3 indices per triangle
  topology: 'triangle-list',
});
```

You can access and modify buffers directly:

```ts
geometry.positions[0] = 50;
geometry.uvs[0] = 0.5;
geometry.indices[0] = 1;
```

## Built-in Mesh Types

### MeshSimple

A minimal wrapper over `Mesh` that accepts vertex, UV, and index arrays directly. Suitable for fast static or dynamic meshes.

```ts
const mesh = new MeshSimple({
  texture: Texture.from('image.png'),
  vertices: new Float32Array([0, 0, 100, 0, 100, 100, 0, 100]),
  uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
  indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
});
```

- Use `autoUpdate = true` to update geometry per frame.
- Access `mesh.vertices` to read/write data.

### MeshRope

Bends a texture along a series of control points, often used for trails, snakes, and animated ribbons.

```ts
const points = [new Point(0, 0), new Point(100, 0), new Point(200, 50)];
const rope = new MeshRope({
  texture: Texture.from('snake.png'),
  points,
  textureScale: 1, // optional
});
```

- `textureScale > 0` repeats texture; `0` stretches it.
- `autoUpdate = true` re-evaluates geometry each frame.

### MeshPlane

A flexible subdivided quad mesh, suitable for distortion or grid-based warping.

```ts
const plane = new MeshPlane({
  texture: Texture.from('image.png'),
  verticesX: 10,
  verticesY: 10,
});
```

- Automatically resizes on texture update when `autoResize = true`.

### PerspectiveMesh

A special subclass of `MeshPlane` that applies perspective correction by transforming the UVs.

```ts
const mesh = new PerspectiveMesh({
  texture: Texture.from('image.png'),
  verticesX: 20,
  verticesY: 20,
  x0: 0,
  y0: 0,
  x1: 300,
  y1: 30,
  x2: 280,
  y2: 300,
  x3: 20,
  y3: 280,
});
```

- Set corner coordinates via `setCorners(...)`.
- Ideal for emulating 3D projection in 2D.

---

## **API Reference**

- [Mesh](https://pixijs.download/release/docs/scene.Mesh.html)
- [MeshGeometry](https://pixijs.download/release/docs/scene.MeshGeometry.html)
- [MeshSimple](https://pixijs.download/release/docs/scene.MeshSimple.html)
- [MeshRope](https://pixijs.download/release/docs/scene.MeshRope.html)
- [MeshPlane](https://pixijs.download/release/docs/scene.MeshPlane.html)
- [PerspectiveMesh](https://pixijs.download/release/docs/scene.PerspectiveMesh.html)
- [Shader](https://pixijs.download/release/docs/rendering.Shader.html)
- [Texture](https://pixijs.download/release/docs/rendering.Texture.html)

---

## NineSlice Sprite


---

# NineSlice Sprite

`NineSliceSprite` is a specialized type of `Sprite` that allows textures to be resized while preserving the corners and edges. It is particularly useful for building scalable UI elements like buttons, panels, or windows with rounded or decorated borders.

```ts
import { NineSliceSprite, Texture } from 'pixi.js';

const nineSlice = new NineSliceSprite({
  texture: Texture.from('button.png'),
  leftWidth: 15,
  topHeight: 15,
  rightWidth: 15,
  bottomHeight: 15,
  width: 200,
  height: 80,
});

app.stage.addChild(nineSlice);
```

You can also pass just a texture, and the slice values will fall back to defaults or be inferred from the texture’s `defaultBorders`.

## **How NineSlice Works**

Here’s how a nine-slice texture is divided:

```js
    A                          B
  +---+----------------------+---+
C | 1 |          2           | 3 |
  +---+----------------------+---+
  |   |                      |   |
  | 4 |          5           | 6 |
  |   |                      |   |
  +---+----------------------+---+
D | 7 |          8           | 9 |
  +---+----------------------+---+

Areas:
  - 1, 3, 7, 9: Corners (remain unscaled)
  - 2, 8: Top/Bottom center (stretched horizontally)
  - 4, 6: Left/Right center (stretched vertically)
  - 5: Center (stretched in both directions)
```

This ensures that decorative corners are preserved and the center content can scale as needed.

## **Width and Height Behavior**

Setting `.width` and `.height` on a `NineSliceSprite` updates the **geometry vertices**, not the texture UVs. This allows the texture to repeat or stretch correctly based on the slice regions. This also means that the `width` and `height` properties are not the same as the `scale` properties.

```ts
// The texture will stretch to fit the new dimensions
nineSlice.width = 300;
nineSlice.height = 100;

// The nine-slice will increase in size uniformly
nineSlice.scale.set(2); // Doubles the size
```

### **Original Width and Height**

If you need to know the original size of the nine-slice, you can access it through the `originalWidth` and `originalHeight` properties. These values are set when the `NineSliceSprite` is created and represent the dimensions of the texture before any scaling or resizing is applied.

```ts
console.log(nineSlice.originalWidth);
console.log(nineSlice.originalHeight);
```

## **Dynamic Updates**

You can change slice dimensions or size at runtime:

```ts
nineSlice.leftWidth = 20;
nineSlice.topHeight = 25;
```

Each setter triggers a geometry update to reflect the changes.

---

## **API Reference**

- [NineSliceSprite](https://pixijs.download/release/docs/scene.NineSliceSprite.html)

---

## Particle Container


---

# Particle Container

PixiJS v8 introduces a high-performance particle system via the `ParticleContainer` and `Particle` classes. Designed for rendering vast numbers of lightweight visuals—like sparks, bubbles, bunnies, or explosions—this system provides raw speed by stripping away all non-essential overhead.

:::warning **Experimental API Notice**
The Particle API is stable but **experimental**. Its interface may evolve in future PixiJS versions. We welcome feedback to help guide its development.
:::

```ts
import { ParticleContainer, Particle, Texture } from 'pixi.js';

const texture = Texture.from('bunny.png');

const container = new ParticleContainer({
  dynamicProperties: {
    position: true, // default
    vertex: false,
    rotation: false,
    color: false,
  },
});

for (let i = 0; i < 100000; i++) {
  const particle = new Particle({
    texture,
    x: Math.random() * 800,
    y: Math.random() * 600,
  });

  container.addParticle(particle);
}

app.stage.addChild(container);
```

## **Why Use ParticleContainer?**

- **Extreme performance**: Render hundreds of thousands or even millions of particles with high FPS.
- **Lightweight design**: Particles are more efficient than `Sprite`, lacking extra features like children, events, or filters.
- **Fine-grained control**: Optimize rendering by declaring which properties are dynamic (updated every frame) or static (set once).

### **Performance Tip: Static vs. Dynamic**

- **Dynamic properties** are uploaded to the GPU every frame.
- **Static properties** are uploaded only when `update()` is called.

Declare your needs explicitly:

```ts
const container = new ParticleContainer({
  dynamicProperties: {
    position: true,
    rotation: true,
    vertex: false,
    color: false,
  },
});
```

If you later modify a static property or the particle list, you must call:

```ts
container.update();
```

## **Limitations and API Differences**

`ParticleContainer` is designed for speed and simplicity. As such, it doesn't support the full `Container` API:

### ❌ Not Available:

- `addChild()`, `removeChild()`
- `getChildAt()`, `setChildIndex()`
- `swapChildren()`, `reparentChild()`

### ✅ Use Instead:

- `addParticle(particle)`
- `removeParticle(particle)`
- `removeParticles(beginIndex, endIndex)`
- `addParticleAt(particle, index)`
- `removeParticleAt(index)`

These methods operate on the `.particleChildren` array and maintain the internal GPU buffers correctly.

## **Creating a Particle**

A `Particle` supports key display properties, and is far more efficient than `Sprite`.

### **Particle Example**

```ts
const particle = new Particle({
  texture: Texture.from('spark.png'),
  x: 200,
  y: 100,
  scaleX: 0.8,
  scaleY: 0.8,
  rotation: Math.PI / 4,
  tint: 0xff0000,
  alpha: 0.5,
});
```

You can also use the shorthand:

```ts
const particle = new Particle(Texture.from('spark.png'));
```

---

## **API Reference**

- [ParticleContainer](https://pixijs.download/release/docs/scene.ParticleContainer.html)
- [Particle](https://pixijs.download/release/docs/scene.Particle.html)

---

## Sprite


---

# Sprite

Sprites are the foundational visual elements in PixiJS. They represent a single image to be displayed on the screen. Each [Sprite](https://pixijs.download/release/docs/scene.Sprite.html) contains a [Texture](https://pixijs.download/release/docs/rendering.Texture.html) to be drawn, along with all the transformation and display state required to function in the scene graph.

```ts
import { Assets, Sprite } from 'pixi.js';

const texture = await Assets.load('path/to/image.png');
const sprite = new Sprite(texture);

sprite.anchor.set(0.5);
sprite.position.set(100, 100);
sprite.scale.set(2);
sprite.rotation = Math.PI / 4; // Rotate 45 degrees
```

## Updating the Texture

If you change the texture of a sprite, it will automatically:

- Rebind listeners for texture updates
- Recalculate width/height if set so that the visual size remains the same
- Trigger a visual update

```ts
const texture = Assets.get('path/to/image.png');
sprite.texture = texture;
```

## **Scale vs Width/Height**

Sprites inherit `scale` from `Container`, allowing for percentage-based resizing:

```ts
sprite.scale.set(2); // Double the size
```

Sprites also have `width` and `height` properties that act as _convenience setters_ for `scale`, based on the texture’s dimensions:

```ts
sprite.width = 100; // Automatically updates scale.x
// sets: sprite.scale.x = 100 / sprite.texture.orig.width;
```

---

## API Reference

- [Sprite](https://pixijs.download/release/docs/scene.Sprite.html)
- [Texture](https://pixijs.download/release/docs/rendering.Texture.html)
- [Assets](https://pixijs.download/release/docs/assets.Assets.html)

---

## Bitmap Text


---

# Tiling Sprite

A `TilingSprite` is a high-performance way to render a repeating texture across a rectangular area. Instead of stretching the texture, it repeats (tiles) it to fill the given space, making it ideal for backgrounds, parallax effects, terrain, and UI panels.

```ts
import { TilingSprite, Texture } from 'pixi.js';

const tilingSprite = new TilingSprite({
  texture: Texture.from('assets/tile.png'),
  width: 400,
  height: 300,
});

app.stage.addChild(tilingSprite);
```

## What is a TilingSprite?

- It draws a texture repeatedly across a defined area.
- The texture is not scaled by default unless you adjust `tileScale`.
- The sprite's overall `width` and `height` determine how much area the tiles fill, independent of the texture's native size.
- The pattern's offset, scale, and rotation can be controlled independently of the object's transform.

## Key Properties

| Property               | Description                                                            |
| ---------------------- | ---------------------------------------------------------------------- |
| `texture`              | The texture being repeated                                             |
| `tilePosition`         | `ObservablePoint` controlling offset of the tiling pattern             |
| `tileScale`            | `ObservablePoint` controlling scaling of each tile                     |
| `tileRotation`         | Number controlling the rotation of the tile pattern                    |
| `width` / `height`     | The size of the area to be filled by tiles                             |
| `anchor`               | Adjusts origin point of the TilingSprite                               |
| `applyAnchorToTexture` | If `true`, the anchor affects the starting point of the tiling pattern |
| `clampMargin`          | Margin adjustment to avoid edge artifacts (default: `0.5`)             |

### Width & Height vs Scale

Unlike `Sprite`, setting `width` and `height` in a `TilingSprite` directly changes the visible tiling area. It **does not affect the scale** of the tiles.

```ts
// Makes the tiling area bigger
tilingSprite.width = 800;
tilingSprite.height = 600;

// Keeps tiles the same size, just tiles more of them
```

To scale the tile pattern itself, use `tileScale`:

```ts
// Makes each tile appear larger
tilingSprite.tileScale.set(2, 2);
```

### Anchor and applyAnchorToTexture

- `anchor` sets the pivot/origin point for positioning the TilingSprite.
- If `applyAnchorToTexture` is `true`, the anchor also affects where the tile pattern begins.
- By default, the tile pattern starts at (0, 0) in local space regardless of anchor.

---

## API Reference

- [TilingSprite](https://pixijs.download/release/docs/scene.TilingSprite.html)
- [Texture](https://pixijs.download/release/docs/rendering.Texture.html)
