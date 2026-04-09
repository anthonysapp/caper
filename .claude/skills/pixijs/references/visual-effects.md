# Color

The `Color` class in PixiJS is a flexible utility for representing colors. It is used throughout the rendering pipeline for things like tints, fills, strokes, gradients, and more.

```ts
import { Color, Sprite, Texture, Graphics } from 'pixi.js';

const red = new Color('red'); // Named color
const green = new Color(0x00ff00); // Hex
const blue = new Color('#0000ff'); // Hex string
const rgba = new Color({ r: 255, g: 0, b: 0, a: 0.5 }); // RGBA object

console.log(red.toArray()); // [1, 0, 0, 1]
console.log(green.toHex()); // "#00ff00"

const sprite = new Sprite(Texture.WHITE);
sprite.tint = red; // Works directly with a Color instance
```

## Using `Color` and `ColorSource`

PixiJS supports many color formats through the `ColorSource` type:

- Color names: `'red'`, `'white'`, `'blue'`, etc.
- Hex integers: `0xffcc00`
- Hex strings: `'ffcc00'`, `'#f00'`, `'0xffcc00ff'`
- RGB(A) objects: `{ r: 255, g: 0, b: 0 }`, `{ r: 255, g: 0, b: 0, a: 0.5 }`
- RGB(A) strings: `'rgb(255,0,0)'`, `'rgba(255,0,0,0.5)'`
- RGB(A) arrays: `[1, 0, 0]`, `[1, 0, 0, 0.5]`
- Typed arrays: `Uint8Array`, `Float32Array`
- HSL/HSV objects and strings
- `Color` instances

Whenever you see a color-related property (e.g., `fill`, `tint`, `stroke`), you can use any of these formats. The library will automatically convert them to the appropriate format internally.

```ts
import { Graphics, Sprite, Texture } from 'pixi.js';

const sprite = new Sprite(Texture.WHITE);
sprite.tint = 'red'; // converted internally

const graphics = new Graphics();
graphics.fill({ color: '#00ff00' }); // Also converted internally
```

---

## API Reference

- [Color](https://pixijs.download/release/docs/color.Color.html)

---

## Events / Interaction


---

# Filters / Blend Modes

PixiJS filters allow you to apply post-processing visual effects to any scene object and its children. Filters can be used for effects such as blurring, color adjustments, noise, or custom shader-based operations.

```ts
import { Sprite, BlurFilter } from 'pixi.js';

// Apply the filter
sprite.filters = [new BlurFilter({ strength: 8 })];
```

---

## Applying Filters

Applying filters is straightforward. You can assign a filter instance to the `filters` property of any scene object, such as `Sprite`, `Container`, or `Graphics`.
You can apply multiple filters by passing an array of filter instances.

```ts
import { BlurFilter, NoiseFilter } from 'pixi.js';

sprite.filters = new BlurFilter({ strength: 5 });

sprite.filters = [
  new BlurFilter({ strength: 4 }),
  new NoiseFilter({ noise: 0.2 }),
];
```

:::info
Order matters — filters are applied in sequence.
:::

---

## Advanced Blend Modes

PixiJS v8 introduces advanced blend modes for filters, allowing for more complex compositing effects. These blend modes can be used to create unique visual styles and effects.
To use advanced modes like `HARD_LIGHT`, you must manually import the advanced blend mode extension:

```ts
import 'pixi.js/advanced-blend-modes';
import { HardMixBlend } from 'pixi.js';

sprite.filters = [new HardMixBlend()];
```

---

## Built-In Filters Overview

PixiJS v8 provides a variety of filters out of the box:

| Filter Class         | Description                                 |
| -------------------- | ------------------------------------------- |
| `AlphaFilter`        | Applies transparency to an object.          |
| `BlurFilter`         | Gaussian blur.                              |
| `ColorMatrixFilter`  | Applies color transformations via a matrix. |
| `DisplacementFilter` | Distorts an object using another texture.   |
| `NoiseFilter`        | Adds random noise for a grainy effect.      |

:::info
To explore more community filters, see [pixi-filters](https://pixijs.io/filters/docs/).
:::

**Blend Filters**: Used for custom compositing modes

| Filter Class       | Description                                        |
| ------------------ | -------------------------------------------------- |
| `ColorBurnBlend`   | Darkens the base color to reflect the blend color. |
| `ColorDodgeBlend`  | Brightens the base color.                          |
| `DarkenBlend`      | Retains the darkest color components.              |
| `DivideBlend`      | Divides the base color by the blend color.         |
| `HardMixBlend`     | High-contrast blend.                               |
| `LinearBurnBlend`  | Darkens using linear formula.                      |
| `LinearDodgeBlend` | Lightens using linear formula.                     |
| `LinearLightBlend` | Combination of linear dodge and burn.              |
| `PinLightBlend`    | Selective replacement of colors.                   |
| `SubtractBlend`    | Subtracts the blend color from base.               |

---

## Creating a Custom Filter

To define a custom filter in PixiJS v8, you use `Filter.from()` with shader programs and GPU resources.

```ts
import { Filter, GlProgram, Texture } from 'pixi.js';

const vertex = `
  in vec2 aPosition;
  out vec2 vTextureCoord;

  uniform vec4 uInputSize;
  uniform vec4 uOutputFrame;
  uniform vec4 uOutputTexture;

  vec4 filterVertexPosition( void )
  {
      vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;

      position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
      position.y = position.y * (2.0*uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;

      return vec4(position, 0.0, 1.0);
  }

  vec2 filterTextureCoord( void )
  {
      return aPosition * (uOutputFrame.zw * uInputSize.zw);
  }

  void main(void)
  {
      gl_Position = filterVertexPosition();
      vTextureCoord = filterTextureCoord();
  }
`;

const fragment = `
  in vec2 vTextureCoord;
  in vec4 vColor;

  uniform sampler2D uTexture;
  uniform float uTime;

  void main(void)
  {
      vec2 uvs = vTextureCoord.xy;

      vec4 fg = texture2D(uTexture, vTextureCoord);

      fg.r = uvs.y + sin(uTime);

      gl_FragColor = fg;

  }
`;

const customFilter = new Filter({
  glProgram: new GlProgram({
    fragment,
    vertex,
  }),
  resources: {
    timeUniforms: {
      uTime: { value: 0.0, type: 'f32' },
    },
  },
});

// Apply the filter
sprite.filters = [customFilter];

// Update uniform
app.ticker.add((ticker) => {
  filter.resources.timeUniforms.uniforms.uTime += 0.04 * ticker.deltaTime;
});
```

:::info **Tip**
Shaders must be WebGL- or WebGPU-compatible. For dual-renderer support, include a `gpuProgram`.
:::

---

## API Reference

- [Overview](https://pixijs.download/release/docs/filters.html)
- [Filter](https://pixijs.download/release/docs/filters.Filter.html)

---

## Math


---

# Math

PixiJS includes a several math utilities for 2D transformations, geometry, and shape manipulation. This guide introduces the most important classes and their use cases, including optional advanced methods enabled via `math-extras`.

## Matrix

The `Matrix` class represents a 2D affine transformation matrix. It is used extensively for transformations such as scaling, translation, and rotation.

```ts
import { Matrix, Point } from 'pixi.js';

const matrix = new Matrix();
matrix.translate(10, 20).scale(2, 2);

const point = new Point(5, 5);
const result = matrix.apply(point); // result is (20, 30)
```

---

## Point and ObservablePoint

### `Point`

The Point object represents a location in a two-dimensional coordinate system, where `x` represents the position on the horizontal axis and `y` represents the position on the vertical axis. Many Pixi functions accept the `PointData` type as an alternative to `Point`, which only requires `x` and `y` properties.

```ts
import { Point } from 'pixi.js';
const point = new Point(5, 10);

point.set(20, 30); // set x and y
```

### `ObservablePoint`

Extends `Point` and triggers a callback when its values change. Used internally for reactive systems like position and scale updates.

```ts
import { Point, ObservablePoint } from 'pixi.js';

const observer = {
  _onUpdate: (point) => {
    console.log(`Point updated to: (${point.x}, ${point.y})`);
  },
};
const reactive = new ObservablePoint(observer, 1, 2);
reactive.set(3, 4); // triggers call to _onUpdate
```

---

## Shapes

PixiJS includes several 2D shapes, used for hit testing, rendering, and geometry computations.

### `Rectangle`

Axis-aligned rectangle defined by `x`, `y`, `width`, and `height`.

```ts
import { Rectangle } from 'pixi.js';

const rect = new Rectangle(10, 10, 100, 50);
rect.contains(20, 20); // true
```

### `Circle`

Defined by `x`, `y` (center) and `radius`.

```ts
import { Circle } from 'pixi.js';

const circle = new Circle(50, 50, 25);
circle.contains(50, 75); // true
```

### `Ellipse`

Similar to `Circle`, but supports different width and height (radii).

```ts
import { Ellipse } from 'pixi.js';

const ellipse = new Ellipse(0, 0, 20, 10);
ellipse.contains(5, 0); // true
```

### `Polygon`

Defined by a list of points. Used for complex shapes and hit testing.

```ts
import { Polygon } from 'pixi.js';

const polygon = new Polygon([0, 0, 100, 0, 100, 100, 0, 100]);
polygon.contains(50, 50); // true
```

### `RoundedRectangle`

Rectangle with rounded corners, defined by a radius.

```ts
import { RoundedRectangle } from 'pixi.js';

const roundRect = new RoundedRectangle(0, 0, 100, 100, 10);
roundRect.contains(10, 10); // true
```

### `Triangle`

A convenience wrapper for defining triangles with three points.

```ts
import { Triangle } from 'pixi.js';

const triangle = new Triangle(0, 0, 100, 0, 50, 100);
triangle.contains(50, 50); // true
```

---

## Optional: `math-extras`

Importing `pixi.js/math-extras` extends `Point` and `Rectangle` with additional vector and geometry utilities.

### To enable:

```ts
import 'pixi.js/math-extras';
```

### Enhanced `Point` Methods

| Method                          | Description                                                  |
| ------------------------------- | ------------------------------------------------------------ |
| `add(other[, out])`             | Adds another point to this one.                              |
| `subtract(other[, out])`        | Subtracts another point from this one.                       |
| `multiply(other[, out])`        | Multiplies this point with another point component-wise.     |
| `multiplyScalar(scalar[, out])` | Multiplies the point by a scalar.                            |
| `dot(other)`                    | Computes the dot product of two vectors.                     |
| `cross(other)`                  | Computes the scalar z-component of the 3D cross product.     |
| `normalize([out])`              | Returns a normalized (unit-length) vector.                   |
| `magnitude()`                   | Returns the Euclidean length.                                |
| `magnitudeSquared()`            | Returns the squared length (more efficient for comparisons). |
| `project(onto[, out])`          | Projects this point onto another vector.                     |
| `reflect(normal[, out])`        | Reflects the point across a given normal.                    |

### Enhanced `Rectangle` Methods

| Method                       | Description                                           |
| ---------------------------- | ----------------------------------------------------- |
| `containsRect(other)`        | Returns true if this rectangle contains the other.    |
| `equals(other)`              | Checks if all properties are equal.                   |
| `intersection(other[, out])` | Returns a new rectangle representing the overlap.     |
| `union(other[, out])`        | Returns a rectangle that encompasses both rectangles. |

---

## API Reference

- [Overview](https://pixijs.download/release/docs/maths.html)
- [Matrix](https://pixijs.download/release/docs/maths.Matrix.html)
- [Point](https://pixijs.download/release/docs/maths.Point.html)
- [ObservablePoint](https://pixijs.download/release/docs/maths.ObservablePoint.html)
- [Rectangle](https://pixijs.download/release/docs/maths.Rectangle.html)
- [Circle](https://pixijs.download/release/docs/maths.Circle.html)
- [Ellipse](https://pixijs.download/release/docs/maths.Ellipse.html)
- [Polygon](https://pixijs.download/release/docs/maths.Polygon.html)
- [RoundedRectangle](https://pixijs.download/release/docs/maths.RoundedRectangle.html)
- [Triangle](https://pixijs.download/release/docs/maths.Triangle.html)

---

## Textures


---

# Textures

Textures are one of the most essential components in the PixiJS rendering pipeline. They define the visual content used by Sprites, Meshes, and other renderable objects. This guide covers how textures are loaded, created, and used, along with the various types of data sources PixiJS supports.

## Texture Lifecycle

The texture system is built around two major classes:

- **`TextureSource`**: Represents a pixel source, such as an image, canvas, or video.
- **`Texture`**: Defines a view into a `TextureSource`, including sub-rectangles, trims, and transformations.

### Lifecycle Flow

```
Source File/Image -> TextureSource -> Texture -> Sprite (or other display object)
```

### Loading Textures

Textures can be loaded asynchronously using the `Assets` system:

```ts
const texture = await Assets.load('myTexture.png');

const sprite = new Sprite(texture);
```

### Preparing Textures

Even after you've loaded your textures, the images still need to be pushed to the GPU and decoded. Doing this for a large number of source images can be slow and cause lag spikes when your project first loads. To solve this, you can use the [Prepare](https://pixijs.download/release/docs/rendering.PrepareSystem.html) plugin, which allows you to pre-load textures in a final step before displaying your project.

## Texture vs. TextureSource

The `TextureSource` handles the raw pixel data and GPU upload. A `Texture` is a lightweight view on that source, with metadata such as trimming, frame rectangle, UV mapping, etc. Multiple `Texture` instances can share a single `TextureSource`, such as in a sprite sheet.

```ts
const sheet = await Assets.load('spritesheet.json');
const heroTexture = sheet.textures['hero.png'];
```

## Texture Creation

You can manually create textures using the constructor:

```ts
const mySource = new TextureSource({ resource: myImage });
const texture = new Texture({ source: mySource });
```

Set `dynamic: true` in the `Texture` options if you plan to modify its `frame`, `trim`, or `source` at runtime.

## Destroying Textures

Once you're done with a Texture, you may wish to free up the memory (both WebGL-managed buffers and browser-based) that it uses. To do so, you should call `Assets.unload('texture.png')`, or `texture.destroy()` if you have created the texture outside of Assets.

This is a particularly good idea for short-lived imagery like cut-scenes that are large and will only be used once. If a texture is destroyed that was loaded via `Assets` then the assets class will automatically remove it from the cache for you.

## Unload Texture from GPU

If you want to unload a texture from the GPU but keep it in memory, you can call `texture.source.unload()`. This will remove the texture from the GPU but keep the source in memory.

```ts
// Load the texture
const texture = await Assets.load('myTexture.png');

// ... Use the texture

// Unload the texture from the GPU
texture.source.unload();
```

## Texture Types

PixiJS supports multiple `TextureSource` types, depending on the kind of input data:

| Texture Type          | Description                                                       |
| --------------------- | ----------------------------------------------------------------- |
| **ImageSource**       | HTMLImageElement, ImageBitmap, SVG's, VideoFrame, etc.            |
| **CanvasSource**      | HTMLCanvasElement or OffscreenCanvas                              |
| **VideoSource**       | HTMLVideoElement with optional auto-play and update FPS           |
| **BufferImageSource** | TypedArray or ArrayBuffer with explicit width, height, and format |
| **CompressedSource**  | Array of compressed mipmaps (Uint8Array\[])                       |

## Common Texture Properties

Here are some important properties of the `Texture` class:

- `frame`: Rectangle defining the visible portion within the source.
- `orig`: Original untrimmed dimensions.
- `trim`: Defines trimmed regions to exclude transparent space.
- `uvs`: UV coordinates generated from `frame` and `rotate`.
- `rotate`: GroupD8 rotation value for atlas compatibility.
- `defaultAnchor`: Default anchor when used in Sprites.
- `defaultBorders`: Used for 9-slice scaling.
- `source`: The `TextureSource` instance.

## Common TextureSource Properties

Here are some important properties of the `TextureSource` class:

- `resolution`: Affects render size relative to actual pixel size.
- `format`: Texture format (e.g., `rgba8unorm`, `bgra8unorm`, etc.)
- `alphaMode`: Controls how alpha is interpreted on upload.
- `wrapMode` / `scaleMode`: Controls how texture is sampled outside of bounds or when scaled.
- `autoGenerateMipmaps`: Whether to generate mipmaps on upload.

You can set these properties when creating a `TextureSource`:

```ts
texture.source.scaleMode = 'linear';
texture.source.wrapMode = 'repeat';
```

---

## API Reference

- [Texture](https://pixijs.download/release/docs/rendering.Texture.html)
- [TextureSource](https://pixijs.download/release/docs/rendering.TextureSource.html)
- [TextureStyle](https://pixijs.download/release/docs/rendering.TextureStyle.html)
- [RenderTexture](https://pixijs.download/release/docs/rendering.RenderTexture.html)

---

## Ticker


---

# Compressed Textures

Compressed textures significantly reduce memory usage and GPU upload time, especially on mobile devices or lower-end hardware. PixiJS supports multiple compressed texture formats, but **you must configure the appropriate loaders** before using them.

## Supported Compressed Texture Formats

PixiJS provides built-in support for several widely-used compressed texture formats:

| Format    | File Extension | Description                                                             |
| --------- | -------------- | ----------------------------------------------------------------------- |
| **DDS**   | `.dds`         | DirectDraw Surface format, supports DXT variants (S3TC)                 |
| **KTX**   | `.ktx`         | Khronos format, supports ETC and other schemes                          |
| **KTX2**  | `.ktx2`        | Modern container supporting Basis Universal and Supercompressed formats |
| **Basis** | `.basis`       | Highly compressed format that can transcode to multiple GPU formats     |

## Registering Loaders

PixiJS does **not automatically include compressed texture support**. To use these formats, you must explicitly import the necessary loaders before loading any assets:

```ts
import 'pixi.js/dds';
import 'pixi.js/ktx';
import 'pixi.js/ktx2';
import 'pixi.js/basis';
```

:::info
You only need to import the loaders for the formats you're using. These imports must run **before** any call to `Assets.load`.
:::

## Using Compressed Textures in Assets

Once loaders are registered, you can load compressed textures just like any other asset:

```ts
import 'pixi.js/ktx2'; // Import the KTX2 loader
import { Assets } from 'pixi.js';

await Assets.load('textures/background.ktx2');
```

PixiJS will parse and upload the texture using the correct loader and GPU-compatible transcoding path based on the user's device.

---

## Integration with AssetPack

[**AssetPack**](https://pixijs.io/assetpack) supports automatic generation of compressed texture variants during the build step. You can:

- Convert `.png` or `.jpg` files into `.basis`, `.ktx2`, or `.dds` formats.
- Reference compressed files in your manifest using the same aliases or wildcard patterns.
- Use the **same manifest and loading workflow** — PixiJS will resolve and load the best available variant based on the device.

### Example

Your manifest might include:

```json
{
  "bundles": [
    {
      "name": "scene",
      "assets": [
        {
          "alias": "bg",
          "src": ["assets/bg.ktx2", "assets/bg.basis", "assets/bg.png"]
        }
      ]
    }
  ]
}
```

PixiJS will try to load `bg.ktx2` or `bg.basis` first if the device supports it, falling back to `bg.png` as needed.

---

## Assets
