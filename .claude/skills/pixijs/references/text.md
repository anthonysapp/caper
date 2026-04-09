# Bitmap Text

`BitmapText` is a high-performance text rendering solution in PixiJS. Unlike the `Text` class, which rasterizes each string into a new texture, `BitmapText` draws characters from a pre-generated texture atlas. This design allows you to render tens of thousands of text objects with minimal overhead.

```ts
import { Assets, BitmapText } from 'pixi.js';

await Assets.load('fonts/MyFont.fnt');

const text = new BitmapText({
  text: 'Loaded font!',
  style: {
    fontFamily: 'MyFont',
    fontSize: 32,
    fill: '#ffcc00',
  },
});
```

## **Why Use `BitmapText`?**

- ✅ **Fast rendering**: Perfect for HUDs, score counters, timers, etc.
- ✅ **No per-frame rasterization**: Text changes are cheap.
- ✅ **Efficient memory usage**: Shares glyph textures across all instances.
- ✅ **Supports MSDF/SDF fonts**: Crisp scaling without blurring.

**Ideal use cases**:

- Frequently updating text
- Large numbers of text instances
- High-performance or mobile projects

## **How to Load and Use Bitmap Fonts**

### Font Loading

PixiJS supports AngelCode BMFont format and MSDF-compatible `.fnt` and `.xml` files. You can load these files using the `Assets` API.

Once loaded, you can create a `BitmapText` instance with the loaded font using the `fontFamily` property.

```ts
import { Assets, BitmapText } from 'pixi.js';

await Assets.load('fonts/MyFont.fnt');

const text = new BitmapText({
  text: 'Loaded font!',
  style: {
    fontFamily: 'MyFont',
    fontSize: 32,
    fill: '#ffcc00',
  },
});
```

### MSDF and SDF Fonts

PixiJS supports **MSDF** (multi-channel signed distance field) and **SDF** formats for crisp, resolution-independent text. These fonts remain sharp at any size and scale.

You can generate MSDF/SDF fonts using tools like [AssetPack](https://pixijs.io/assetpack/) which can take a `.ttf` or `.otf` font and generate a bitmap font atlas with MSDF/SDF support.

Using MSDF/SDF fonts is similar to using regular bitmap fonts and just requires you to load the appropriate font file:

```ts
import { Assets, BitmapText } from 'pixi.js';

await Assets.load('fonts/MyMSDFFont.fnt');

const text = new BitmapText({
  text: 'Loaded MSDF font!',
  style: {
    fontFamily: 'MyMSDFFont',
  },
});
```

# **Limitations and Caveats**

### ❌ Cannot Update Resolution

`BitmapText.resolution` is not mutable. It must be handled by the `BitmapFont`

```ts
text.resolution = 2;
// ⚠️ [BitmapText] dynamically updating the resolution is not supported.
```

### ⚠️ Large Character Sets Not Practical

Bitmap fonts are limited by texture size. CJK or emoji-rich sets may require too much memory. Use `Text` or `HTMLText` for dynamic internationalization or emoji support.

---

## **API Reference**

- [BitmapText](https://pixijs.download/release/docs/scene.BitmapText.html)
- [BitmapFont](https://pixijs.download/release/docs/text.BitmapFont.html)
- [Assets](https://pixijs.download/release/docs/assets.Assets.html)
- [TextStyle](https://pixijs.download/release/docs/text.TextStyle.html)
- [FillStyle](https://pixijs.download/release/docs/scene.FillStyle.html)
- [StrokeStyle](https://pixijs.download/release/docs/scene.StrokeStyle.html)

---

## Text (Canvas)


---

# Text (Canvas)

The `Text` class in PixiJS allows you to render styled, dynamic strings as display objects in your scene. Under the hood, PixiJS rasterizes the text using the browser’s canvas text API, then converts that into a texture. This makes `Text` objects behave like sprites: they can be moved, rotated, scaled, masked, and rendered efficiently.

```ts
import { Text, TextStyle, Assets } from 'pixi.js';

// Load font before use
await Assets.load({
  src: 'my-font.woff2',
  data: {
    family: 'MyFont', // optional
  },
});

const myText = new Text({
  text: 'Hello PixiJS!',
  style: {
    fill: '#ffffff',
    fontSize: 36,
    fontFamily: 'MyFont',
  },
  anchor: 0.5,
});

app.stage.addChild(myText);
```

## Text Styling

The `TextStyle` class allows you to customize the appearance of your text. You can set properties like:

- `fontFamily`
- `fontSize`
- `fontWeight`
- `fill` (color)
- `align`
- `stroke` (outline)

See the guide on [TextStyle](./style.md) for more details.

## **Changing Text Dynamically**

You can update the text string or its style at runtime:

```ts
text.text = 'Updated!';
text.style.fontSize = 40; // Triggers re-render
```

:::warning
Changing text or style re-rasterizes the object. Avoid doing this every frame unless necessary.
:::

## Text Resolution

The `resolution` property of the `Text` class determines the pixel density of the rendered text. By default, it uses the resolution of the renderer.

However, you can set text resolution independently from the renderer for sharper text, especially on high-DPI displays.

```ts
const myText = new Text('Hello', {
  resolution: 2, // Higher resolution for sharper text
});

// change resolution
myText.resolution = 1; // Reset to default
```

## Font Loading

PixiJS supports loading custom fonts via the `Assets` API. It supports many of the common font formats:

- `woff`
- `woff2`
- `ttf`
- `otf`

It is recommended to use `woff2` for the best performance and compression.

```js
await Assets.load({
  src: 'my-font.woff2',
  data: {},
});
```

Below is a list of properties you can pass in the `data` object when loading a font:

| Property            | Description                                             |
| ------------------- | ------------------------------------------------------- |
| **family**          | The font family name.                                   |
| **display**         | The display property of the FontFace interface.         |
| **featureSettings** | The featureSettings property of the FontFace interface. |
| **stretch**         | The stretch property of the FontFace interface.         |
| **style**           | The style property of the FontFace interface.           |
| **unicodeRange**    | The unicodeRange property of the FontFace interface.    |
| **variant**         | The variant property of the FontFace interface.         |
| **weights**         | The weights property of the FontFace interface.         |

---

## API Reference

- [Text](https://pixijs.download/release/docs/scene.Text.html)
- [TextStyle](https://pixijs.download/release/docs/text.TextStyle.html)
- [FillStyle](https://pixijs.download/release/docs/scene.FillStyle.html)
- [StrokeStyle](https://pixijs.download/release/docs/scene.StrokeStyle.html)

---

## HTML Text


---

# HTML Text

`HTMLText` enables styled, formatted HTML strings to be rendered as part of the PixiJS scene graph. It uses an SVG `` to embed browser-native HTML inside your WebGL canvas.

This makes it ideal for rendering complex typography, inline formatting, emojis, and layout effects that are hard to replicate using traditional canvas-rendered text.

```ts
import { HTMLText } from 'pixi.js';

const html = new HTMLText({
  text: 'Hello PixiJS!',
  style: {
    fontFamily: 'Arial',
    fontSize: 24,
    fill: '#ff1010',
    align: 'center',
  },
});

app.stage.addChild(html);
```

## **Why Use `HTMLText`?**

- ✅ Supports inline tags like `, `, ``, etc.
- ✅ Compatible with emojis, Unicode, and RTL text
- ✅ Fine-grained layout control via CSS
- ✅ Tag-based style overrides (`, `, etc.)

## **Async Rendering Behavior**

HTML text uses SVG `` to draw HTML inside the canvas. As a result:

- Rendering occurs **asynchronously**. Typically after the next frame.
- Text content is not immediately visible after instantiation.

## **Styling HTMLText**

`HTMLTextStyle` extends `TextStyle` and adds:

- **HTML-aware tag-based styles** via `tagStyles`
- **CSS override support** via `cssOverrides`

```ts
const fancy = new HTMLText({
  text: 'Red, Blue',
  style: {
    fontFamily: 'DM Sans',
    fontSize: 32,
    fill: '#ffffff',
    tagStyles: {
      red: { fill: 'red' },
      blue: { fill: 'blue' },
    },
  },
});
```

### **CSS Overrides**

You can apply CSS styles to the text using the `cssOverrides` property. This allows you to set properties like `text-shadow`, `text-decoration`, and more.

```ts
fancy.style.addOverride('text-shadow: 2px 2px 4px rgba(0,0,0,0.5)');
```

---

## **API Reference**

- [HTMLText](https://pixijs.download/release/docs/scene.HTMLText.html)
- [HTMLTextStyle](https://pixijs.download/release/docs/text.HTMLTextStyle.html)

---

## Text


---

# Text

Text is essential in games and applications, and PixiJS provides three different systems to cover different needs:

- **`Text`**: High-quality, styled raster text
- **`BitmapText`**: Ultra-fast, GPU-optimized bitmap fonts
- **`HTMLText`**: Richly formatted HTML inside the Pixi scene

Each approach has tradeoffs in fidelity, speed, and flexibility. Let’s look at when and how to use each one.

## `Text`: Rich Dynamic Text with Styles

The `Text` class renders using the browser's native text engine, and then converts the result into a texture. This allows for:

- Full CSS-like font control
- Drop shadows, gradients, and alignment
- Support for dynamic content and layout

**Use it when**:

- You need detailed font control
- Text changes occasionally
- Fidelity is more important than speed

**Avoid when**:

- You're changing text every frame
- You need to render hundreds of instances

---

## `BitmapText`: High-Performance Glyph Rendering

`BitmapText` uses a pre-baked bitmap font image for glyphs, bypassing font rasterization entirely. This gives:

- High rendering speed
- Ideal for thousands of changing labels
- Low memory usage

**Use it when**:

- You need to render lots of dynamic text
- You prioritize performance over styling
- You predefine the characters and styles

**Avoid when**:

- You need fine-grained style control
- You change fonts or font sizes frequently

To use `BitmapText`, you must first register a bitmap font via:

- `BitmapFont.from(...)` to create on the fly, or
- `Assets.load(...)` if using a 3rd-party BMFont or AngelCode export

---

## `HTMLText`: Styled HTML Inside the Scene

`HTMLText` lets you render actual HTML markup in your PixiJS scene. This allows:

- `, `, `` style formatting
- Fine layout and text flow
- Emoji, RTL, links, and more

**Use it when**:

- You want complex HTML-style markup
- Static or semi-dynamic content
- Your users expect "document-like" layout

**Avoid when**:

- You need pixel-perfect performance
- You're rendering hundreds of text blocks
- You need GPU text effects

## Next Steps

Each text type has a corresponding guide that covers setup, font loading, style options, and limitations in more detail:

- [Text Guide →](./canvas.md)
- [BitmapText Guide →](./bitmap.md)
- [HTMLText Guide →](./html.md)

---

## API Reference

- [Text](https://pixijs.download/release/docs/scene.Text.html)
- [BitmapText](https://pixijs.download/release/docs/scene.BitmapText.html)
- [HTMLText](https://pixijs.download/release/docs/scene.HTMLText.html)
- [TextStyle](https://pixijs.download/release/docs/text.TextStyle.html)
- [BitmapFont](https://pixijs.download/release/docs/text.BitmapFont.html)
- [FillStyle](https://pixijs.download/release/docs/scene.FillStyle.html)
- [StrokeStyle](https://pixijs.download/release/docs/scene.StrokeStyle.html)

---

## SplitText & SplitBitmapText


---

# SplitText & SplitBitmapText

The `SplitText` and `SplitBitmapText` classes let you break a string into individual lines, words, and characters—each as its own display object—unlocking rich, per-segment animations and advanced text layout effects.

These classes work just like regular `Text` or `BitmapText`, but provide fine-grained control over every part of your text.

:::warning
**Experimental:** These features are new and may evolve in future versions.
:::

---

## What Are SplitText & SplitBitmapText?

Both `SplitText` and `SplitBitmapText` extend PixiJS containers, generating nested display objects for each line, word, and character of your string.

The difference is in the underlying text rendering:

| Class             | Base Type    | Best For                      |
| ----------------- | ------------ | ----------------------------- |
| `SplitText`       | `Text`       | Richly styled text            |
| `SplitBitmapText` | `BitmapText` | High-performance dynamic text |

**Perfect for:**

- Per-character or per-word animations
- Line-based entrance or exit effects
- Interactive text elements
- Complex animated typography

---

## Basic Usage

### SplitText Example

```ts
import { SplitText } from 'pixi.js';

const text = new SplitText({
  text: 'Hello World',
  style: { fontSize: 32, fill: 0xffffff },

  // Optional: Anchor points (0-1 range)
  lineAnchor: 0.5, // Center lines
  wordAnchor: { x: 0, y: 0.5 }, // Left-center words
  charAnchor: { x: 0.5, y: 1 }, // Bottom-center characters
  autoSplit: true,
});

app.stage.addChild(text);
```

### SplitBitmapText Example

```ts
import { SplitBitmapText, BitmapFont } from 'pixi.js';

// Ensure your bitmap font is installed
BitmapFont.install({
  name: 'Game Font',
  style: { fontFamily: 'Arial', fontSize: 32 },
});

const text = new SplitBitmapText({
  text: 'High Performance',
  style: { fontFamily: 'Game Font', fontSize: 32 },
  autoSplit: true,
});

app.stage.addChild(text);
```

---

## Accessing Segments

Both classes provide convenient segment arrays:

```ts
console.log(text.lines); // Array of line containers
console.log(text.words); // Array of word containers
console.log(text.chars); // Array of character display objects
```

Each line contains its words, and each word contains its characters.

---

## Anchor Points Explained

Segment anchors control the origin for transformations like rotation or scaling.

Normalized range: `0` (start) to `1` (end)

| Anchor    | Meaning      |
| --------- | ------------ |
| `0,0`     | Top-left     |
| `0.5,0.5` | Center       |
| `1,1`     | Bottom-right |

**Example:**

```ts
const text = new SplitText({
  text: 'Animate Me',
  lineAnchor: { x: 1, y: 0 }, // Top-right lines
  wordAnchor: 0.5, // Center words
  charAnchor: { x: 0, y: 1 }, // Bottom-left characters
});
```

---

## Animation Example (with GSAP)

```ts
import { gsap } from 'gsap';

const text = new SplitBitmapText({
  text: 'Split and Animate',
  style: { fontFamily: 'Game Font', fontSize: 48 },
});

app.stage.addChild(text);

// Animate characters one by one
text.chars.forEach((char, i) => {
  gsap.from(char, {
    alpha: 0,
    delay: i * 0.05,
  });
});

// Animate words with scaling
text.words.forEach((word, i) => {
  gsap.to(word.scale, {
    x: 1.2,
    y: 1.2,
    yoyo: true,
    repeat: -1,
    delay: i * 0.2,
  });
});
```

---

## Creating from Existing Text

Convert existing text objects into segmented versions:

```ts
import { Text, SplitText, BitmapText, SplitBitmapText } from 'pixi.js';

const basicText = new Text({
  text: 'Standard Text',
  style: { fontSize: 32 },
});
const splitText = SplitText.from(basicText);

const bitmapText = new BitmapText({
  text: 'Bitmap Example',
  style: { fontFamily: 'Game Font', fontSize: 32 },
});
const splitBitmap = SplitBitmapText.from(bitmapText);
```

---

## Configuration Options

Shared options for both classes:

| Option       | Description                                         | Default    |
| ------------ | --------------------------------------------------- | ---------- |
| `text`       | String content to render and split                  | _Required_ |
| `style`      | Text style configuration (varies by text type)      | `{}`       |
| `autoSplit`  | Auto-update segments when text or style changes     | `true`     |
| `lineAnchor` | Anchor for line containers (`number` or `{x, y}`)   | `0`        |
| `wordAnchor` | Anchor for word containers (`number` or `{x, y}`)   | `0`        |
| `charAnchor` | Anchor for character objects (`number` or `{x, y}`) | `0`        |

---

## Global Defaults

Change global defaults for each class:

```ts
SplitText.defaultOptions = {
  lineAnchor: 0.5,
  wordAnchor: { x: 0, y: 0.5 },
  charAnchor: { x: 0.5, y: 1 },
};

SplitBitmapText.defaultOptions = {
  autoSplit: false,
};
```

---

## Limitations

⚠️ **Character Spacing:**
Splitting text into individual objects removes browser or font kerning. Expect slight differences in spacing compared to standard `Text`.

---

## Performance Notes

Splitting text creates additional display objects. For simple static text, a regular `Text` object is more efficient. Use `SplitText` when you need:

- Per-segment animations
- Interactive or responsive text effects
- Complex layouts

The same performance limitations outlined [here](./index.md) apply for these classes as well.

---

## API Reference

- [Text](https://pixijs.download/release/docs/scene.Text.html)
- [TextStyle](https://pixijs.download/release/docs/text.TextStyle.html)
- [BitmapFont](https://pixijs.download/release/docs/text.BitmapFont.html)
- [SplitText](https://pixijs.download/release/docs/text.SplitText.html)
- [SplitBitmapText](https://pixijs.download/release/docs/text.SplitBitmapText.html)

---

## Text Style


---

# Text Style

The `TextStyle` class encapsulates all visual styling properties for text. You can define colors, font families, stroke, shadows, alignment, line spacing, word wrapping, and more.

A `TextStyle` instance can be reused across multiple `Text` objects, making your code cleaner and improving memory efficiency.

```ts
import { TextStyle } from 'pixi.js';

const style = new TextStyle({
  fontFamily: 'Arial',
  fontSize: 30,
  fill: '#ffffff',
  stroke: '#000000',
  strokeThickness: 3,
  dropShadow: {
    color: '#000000',
    blur: 5,
    distance: 4,
    angle: Math.PI / 4,
    alpha: 0.5,
  },
});

const label = new Text({
  text: 'Score: 1234',
  style,
});
```

## Fill and Stroke

Using fills and strokes are identical to that of the `Graphics` class. You can find more details about them in the [Graphics Fills](../graphics/graphics-fill.md) section.

```ts
// Using a number
const fill = 0xff0000;

// Using a hex string
const fill = '#ff0000';

// Using an array
const fill = [255, 0, 0];

// Using a Color object
const color = new Color();
const obj4 = color;

// Using a gradient
const fill = new FillGradient({
  type: 'linear',
  colorStops: [
    { offset: 0, color: 'yellow' },
    { offset: 1, color: 'green' },
  ],
});

// Using a pattern
const txt = await Assets.load('https://pixijs.com/assets/bg_scene_rotate.jpg');
const fill = new FillPattern(txt, 'repeat');

// Use the fill in a TextStyle
const style = new TextStyle({
  fontSize: 48,
  fill: fill,
  stroke: {
    fill,
    width: 4,
  },
});
```

## Drop Shadow

In v8 `dropShadow` and its properties are now objects. To update a drop shadow, you can set the properties directly on the `dropShadow` object.

```ts
const style = new TextStyle({
  dropShadow: {
    color: '#000000',
    alpha: 0.5,
    angle: Math.PI / 4,
    blur: 5,
    distance: 4,
  },
});

style.dropShadow.color = '#ff0000'; // Change shadow color
```

---

## **API Reference**

- [TextStyle](https://pixijs.download/release/docs/text.TextStyle.html)
- [Text](https://pixijs.download/release/docs/scene.Text.html)
- [BitmapText](https://pixijs.download/release/docs/scene.BitmapText.html)
- [HTMLText](https://pixijs.download/release/docs/scene.HTMLText.html)
- [FillStyle](https://pixijs.download/release/docs/scene.FillStyle.html)
- [StrokeStyle](https://pixijs.download/release/docs/scene.StrokeStyle.html)

---

## Tiling Sprite
