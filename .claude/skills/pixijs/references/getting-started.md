# PixiJS Documentation for LLMs

> PixiJS is the fastest, most lightweight 2D library available for the web, working across all devices and allowing you to create rich, interactive graphics and cross-platform applications using WebGL and WebGPU.

This file contains all documentation content in a single document following the llmtxt.org standard.

## Ecosystem

PixiJS itself is just a rendering engine. However, there is a foundation of a robust ecosystem of libraries and tools that enhance and expand its capabilities. These tools integrate seamlessly with PixiJS, empowering developers to create richer, more interactive applications with ease.

## Core Ecosystem Libraries

### [DevTools](https://pixijs.io/devtools/)

Optimize and debug your PixiJS projects with DevTools. This browser extension offers real-time insights into application performance, rendering hierarchies, and texture management, ensuring your projects run smoothly.

### [React Integration](https:/react.pixijs.io/)

:::info
PixiJS React requires React 19 or higher.
:::

Simplify the use of PixiJS in React applications with the Pixi-React library. This library provides bindings that allow you to manage PixiJS components as React elements, making it easy to incorporate powerful graphics into React's declarative framework.

### [Layout](https://layout.pixijs.io/)

Add flexbox-style layouting to PixiJS with the PixiJS Layout library, which is powered by Facebook’s [Yoga](https://www.yogalayout.dev/) engine. It introduces a declarative way to control positioning, alignment, and sizing of PixiJS display objects using familiar CSS-like rules.

Key features include:

- Built on Yoga for standardized, reliable layouts
- Fully opt-in: apply layout only where you need it
- Any PixiJS object can now be layout-aware
- Supports PixiJS React
- New web-style features: objectFit, objectPosition, and overflow scrolling

### [Spine Integration](https://esotericsoftware.com/spine-pixi)

Bring animations to life with Spine-Pixi. This integration combines the power of PixiJS and Spine, a leading animation tool, to create smooth, skeletal-based animations for games and interactive content.

### [Filters](https://github.com/pixijs/filters)

Transform your visuals with PixiJS Filters. This extensive collection of high-performance effects includes options like blur, glow, and color adjustments, giving you the tools to create visually stunning graphics.

### [Sound](https://github.com/pixijs/sound)

Add audio to your projects with PixiJS Sound a WebAudio API playback library, with filters.

### [UI](https://github.com/pixijs/ui)

Streamline the creation of user interfaces with PixiJS UI. This library offers pre-built components:

- Buttons
- Sliders
- Progress bars
- Lists
- Scrollbox
- Radio Groups
- Checkboxes
- Switches

All the essentials for building interactive interfaces in PixiJS.

### [AssetPack](https://pixijs.io/assetpack/)

Simplify asset management with AssetPack. This tool organizes, packages, and loads assets efficiently, reducing load times and improving resource handling for your projects.

## [PixiJS Userland](https://github.com/pixijs-userland) - Community-Driven Repositories

PixiJS Userland is a dedicated space for hosting community-driven repositories. This organization allows developers to collaborate on PixiJS-related projects and share their work with the wider community.

If you have an idea for a new library or tool, you can request access to PixiJS Userland to create and maintain a repository within the organization. This is a great opportunity to contribute to the growing PixiJS ecosystem and engage with like-minded developers.

Note that userland repositories are community-driven and may not be up to date with the latest PixiJS releases. However, they offer a wealth of resources and inspiration for developers looking to enhance their PixiJS projects.

## Getting Started with the Ecosystem

To explore these libraries, visit their respective documentation and GitHub repositories for installation instructions and usage guides. Additionally, PixiJS offers [**Creation Templates**](https://pixijs.io/create-pixi/docs/guide/creations/intro/) through the [PixiJS Create CLI](https://pixijs.io/create-pixi/) that combine many of these libraries into pre-configured setups, ideal for specific use cases and platforms.

For inspiration, you can also check out the [open-games repository](https://github.com/pixijs/open-games), which showcases a variety of games built with PixiJS and its ecosystem libraries.

---

## Quick Start


---

# Quick Start

---

## Try PixiJS Online

- To quickly get a taste of PixiJS, you can try it directly in our [PixiJS Playground](/8.x/playground).

---

## Creating a New Project

:::info[Prerequisites]

- Familiarity with the command line and a basic understanding of JavaScript.
- Install [Node.js](https://nodejs.org/en/) v20.0 or higher.
  :::

In this section, we will introduce how to scaffold a PixiJS application on your local machine. The created project will use a pre-configured build setup, allowing you to quickly get started with PixiJS development.

Make sure your current working directory is where you want to create your project. Run the following command in your terminal:

```sh
npm create pixi.js@latest
```

This command will install and execute the [PixiJS Create](https://pixijs.io/create-pixi/) CLI and begin scaffolding your project. You will be prompted to configure your project by selecting various options, including selecting a template type for setting up your project. There are two main types of templates to choose from:

#### Creation Templates (Recommended)

Creation templates are tailored for specific platforms and include additional configurations and dependencies to streamline development for a particular use case. These templates are more opinionated and are perfect for beginners or those looking for a ready-to-go setup.

#### Bundler Templates

Bundler templates are general templates designed to scaffold a PixiJS project with a specific bundler. They include the necessary configurations and dependencies but leave the project structure flexible, making them ideal for experienced developers who prefer more control.

We recommended using the Vite + PixiJS template for most projects when using bundler templates, as it provides a modern and fast setup for PixiJS applications with minimal configuration.

After selecting your desired template, the scaffolding tool will create a new project directory with the chosen configuration. Navigate to the project directory and install the dependencies:

```bash
cd
npm install
npm run dev
```

You can also add PixiJS to an existing project:

```bash
npm install pixi.js
```

## Usage

Once you've set up your project, here's a simple example to get started with PixiJS:

```ts
// description: This example demonstrates how to use a Container to group and manipulate multiple sprites
import { Application, Assets, Container, Sprite } from 'pixi.js';

(async () => {
  // Create a new application
  const app = new Application();

  // Initialize the application
  await app.init({ background: '#1099bb', resizeTo: window });

  // Append the application canvas to the document body
  document.body.appendChild(app.canvas);

  // Create and add a container to the stage
  const container = new Container();

  app.stage.addChild(container);

  // Load the bunny texture
  const texture = await Assets.load('https://pixijs.com/assets/bunny.png');

  // Create a 5x5 grid of bunnies in the container
  for (let i = 0; i < 25; i++) {
    const bunny = new Sprite(texture);

    bunny.x = (i % 5) * 40;
    bunny.y = Math.floor(i / 5) * 40;
    container.addChild(bunny);
  }

  // Move the container to the center
  container.x = app.screen.width / 2;
  container.y = app.screen.height / 2;

  // Center the bunny sprites in local container coordinates
  container.pivot.x = container.width / 2;
  container.pivot.y = container.height / 2;

  // Listen for animate update
  app.ticker.add((time) => {
    // Continuously rotate the container!
    // * use delta to create frame-independent transform *
    container.rotation -= 0.01 * time.deltaTime;
  });
})();
```

:::warning
If using Vite you still need to wrap your code in an async function. There is an issue when using top level await with PixiJS when building for production.

This issue is known to affect Vite \<=6.0.6. Future versions of Vite may resolve this issue.
:::

---

## Architecture
