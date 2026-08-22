// A SolidJS "universal renderer" whose host nodes are Pixi display objects.
//
// This file plays the role of framework internals, so raw Pixi is fine here.

import {
  Application,
  FlexContainer,
  resolveAnchor,
  resolvePivot,
  resolvePosition,
  resolveScale,
  resolveUnknownKeys,
} from '@caperjs/core';
import { Container, Graphics, Text } from 'pixi.js';
import { createRenderer } from 'solid-js/universal';

import { createCatalogNode } from './catalog';

export type PixiNode = Container;

/**
 * Re-measure and relayout a FlexContainer child whose content just changed.
 *
 * Solid inserts a node first and sets `text` / `style` after, so yoga measures
 * the child while it is still empty and caches a zero-width intrinsic size — the
 * child then renders scaled to nothing. `FlexContainer.updateLayout()` alone
 * doesn't fix it: `@pixi/layout` throttles its intrinsic-size pass to 100ms, and
 * caper runs the layout system with `autoUpdate: false`, so nothing ever
 * re-measures. Drive that pass directly instead.
 */
function invalidateFlexChild(node: any) {
  const parent = node.parent;
  if (!(parent instanceof FlexContainer)) return;
  node.layout?.forceUpdate?.();
  const layoutSystem = Application.getInstance().renderer.layout as any;
  layoutSystem._updateSize(parent);
  layoutSystem.updateLayout(parent);
}

const renderer = createRenderer<PixiNode>({
  createElement(tag: string): PixiNode {
    const node = createCatalogNode(tag);
    // Text is decoration by default — opting into events is what `on*` props (or
    // an explicit `eventMode` prop, applied after creation) are for.
    if (node instanceof Text) node.eventMode = 'none';
    return node;
  },

  createTextNode(value: string): PixiNode {
    const node = new Text({ text: String(value) });
    node.eventMode = 'none';
    // Marks this as a JSX text node so `<text>` elements aren't mistaken for one.
    (node as any).__isTextNode = true;
    return node;
  },

  replaceText(node: PixiNode, value: string) {
    (node as Text).text = String(value);
  },

  isTextNode(node: PixiNode) {
    return node instanceof Text && (node as any).__isTextNode === true;
  },

  setProperty(node: any, name: string, value: any, prev?: any) {
    if (name === 'draw') {
      if (!(node instanceof Graphics)) {
        throw new Error(
          `[@caperjs/solid] The \`draw\` prop is only valid on <graphics>, received it on ${node?.constructor?.name}.`,
        );
      }
      node.clear();
      value?.(node);
      return;
    }

    if (name.startsWith('on') && typeof value === 'function') {
      const ev = name.slice(2).toLowerCase();
      if (prev) node.off(ev, prev);
      node.on(ev, value);
      node.eventMode = 'static';
      return;
    }

    // Point-like props go through the same resolvers `this.add.*` uses, so
    // `scale={2}`, `scale={{ x, y }}` and `scale={[x, y]}` behave identically in
    // JSX and in factory config.
    switch (name) {
      case 'position':
        resolvePosition({ position: value }, node);
        return;
      case 'scale':
        resolveScale({ scale: value }, node);
        return;
      case 'pivot':
        resolvePivot(value, node);
        return;
      case 'anchor':
        resolveAnchor(value, node);
        return;
    }

    resolveUnknownKeys({ [name]: value }, node);
    invalidateFlexChild(node);
  },

  insertNode(parent: PixiNode, node: PixiNode, anchor?: PixiNode) {
    if (anchor) {
      parent.addChildAt(node, parent.getChildIndex(anchor));
    } else {
      parent.addChild(node);
    }

    // Solid may set a node's props before inserting it, so re-measure on the next
    // tick — by then the whole tree has been built and every prop is applied.
    if (parent instanceof FlexContainer) {
      Application.getInstance().ticker.addOnce(() => invalidateFlexChild(node));
    }
  },

  removeNode(parent: PixiNode, node: PixiNode) {
    parent.removeChild(node);
    node.destroy({ children: true });
  },

  getParentNode(node: PixiNode) {
    return node.parent ?? undefined;
  },

  getFirstChild(node: PixiNode) {
    return node.children[0] as PixiNode | undefined;
  },

  getNextSibling(node: PixiNode) {
    const parent = node.parent;
    if (!parent) return undefined;
    return parent.children[parent.getChildIndex(node) + 1] as PixiNode | undefined;
  },
});

// The babel universal transform imports its runtime from this module.
export const {
  render,
  effect,
  memo,
  createComponent,
  createElement,
  createTextNode,
  insertNode,
  insert,
  spread,
  setProp,
  mergeProps,
  use,
} = renderer;
