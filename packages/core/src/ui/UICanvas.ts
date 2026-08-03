import type { LayoutOptions } from '@pixi/layout';
import { ContainerChild, Graphics, RenderLayer, Container as PIXIContainer, Text } from 'pixi.js';
import { Application } from '../core/Application';
import { Container } from '../display/Container';
import { Factory } from '../mixins/factory/Factory';
import { WithSignals } from '../mixins/signals';
import type { AppTypeOverrides, Padding, PointLike, Size, SizeLike } from '../utils';
import {
  bindAllMethods,
  createDebugGraphics,
  createDebugLabel,
  DebugAlpha,
  DebugColors,
  ensurePadding,
  Logger,
  registerDebug,
  resolveSizeLike,
  unregisterDebug,
} from '../utils';
import { FlexContainer } from './FlexContainer';

export type UICanvasEdge =
  | 'top right'
  | 'top left'
  | 'top center'
  | 'top'
  | 'bottom right'
  | 'bottom left'
  | 'bottom center'
  | 'bottom'
  | 'left top'
  | 'left bottom'
  | 'left center'
  | 'left'
  | 'right top'
  | 'right bottom'
  | 'right center'
  | 'right'
  | 'center';

export interface UICanvasChildSettings {
  align: UICanvasEdge;
  padding: Padding;
}

/** Anchor box handed to a binding's placement callback, in canvas-local space
 * (origin = canvas top-left), derived from the anchor's computed layout so it
 * never lags the render transform. */
export interface UICanvasBindRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Places a bound (free-floating) element from its anchor's rect. Both the
 * rect and the element's `position` are in canvas-local space. */
export type UICanvasBindFn = (rect: UICanvasBindRect, child: PIXIContainer) => void;

interface UICanvasBinding {
  child: PIXIContainer;
  anchor: PIXIContainer;
  place: UICanvasBindFn;
}

export interface UICanvasChildProps {
  align: UICanvasEdge;
  padding: Partial<Padding> | PointLike;
}

export type UICanvasConfig = {
  debug: boolean;
  padding: Padding;
  size: Size;
  useAppSize: boolean;
  useSafeArea: boolean;
  layout?: Omit<LayoutOptions, 'target'> | null | boolean;
  autoLayoutChildren?: boolean;
};

export const UICanvasConfigKeys: (keyof UICanvasConfig)[] = [
  'debug',
  'padding',
  'size',
  'useAppSize',
  'useSafeArea',
  'layout',
];

export type UICanvasProps = {
  debug: boolean;
  padding: Partial<Padding> | PointLike;
  size?: SizeLike;
  useAppSize?: boolean;
  useSafeArea?: boolean;
  layout?: Omit<LayoutOptions, 'target'> | null | boolean;
  autoLayoutChildren?: boolean;
};

const zeroPadding: Padding = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * The padding the canvas actually lays out with: the configured padding plus the
 * device's safe-area insets. Kept separate from `config.padding` so it can be
 * re-derived on every resize without compounding.
 */
export function computeEffectivePadding(padding: Padding, safeArea: Padding): Padding {
  return {
    top: padding.top + safeArea.top,
    right: padding.right + safeArea.right,
    bottom: padding.bottom + safeArea.bottom,
    left: padding.left + safeArea.left,
  };
}

const defaultLayout = {
  flexGrow: 0,
  flexShrink: 0,
  autoLayoutChildren: true,
};

const _UICanvas = WithSignals(Factory());

export class UICanvas extends _UICanvas {
  public config: UICanvasConfig;
  protected settingsMap = new Map<PIXIContainer, UICanvasChildSettings>();
  protected _childMap = new Map<PIXIContainer, PIXIContainer>();
  protected _debugGraphics: Graphics | null = null;
  protected _debugLabel: Text | null = null;
  protected _regionLabels: Text[] = [];
  private _disableAddChildError: boolean = false;
  private _positionContainers: Map<UICanvasEdge, Container>;
  private _bindings: UICanvasBinding[] = [];

  public topRow: FlexContainer;
  public middleRow: FlexContainer;
  public bottomRow: FlexContainer;

  constructor(config: Partial<UICanvasProps>) {
    super();

    if (!this.app.config.useLayout) {
      throw new Error('You must set useLayout to true in your app config to use UICanvas');
    }

    bindAllMethods(this);
    this._positionContainers = new Map();
    this.config = {
      debug: config.debug === true,
      padding: ensurePadding(config?.padding ?? 0),
      size: config.size !== undefined ? resolveSizeLike(config.size) : { width: 0, height: 0 },
      useAppSize: config.useAppSize === true,
      useSafeArea: config.useSafeArea ?? true,
      autoLayoutChildren: config.autoLayoutChildren ?? true,
    };

    if (config.layout) {
      if (typeof config.layout === 'boolean') {
        this.config.layout = config.layout;
      } else {
        this.config.layout = { ...defaultLayout, ...config.layout };
      }
    } else {
      this.config.layout = { ...defaultLayout };
    }

    if (this.config.useAppSize) {
      this.config.size = this.app.size;
    }
    this.layout = {
      width: this.config.size.width,
      height: this.config.size.height,
      flexDirection: 'column',
      justifyContent: 'space-between',
      ...(typeof this.config.layout === 'object' ? this.config.layout : {}),
    };

    this.on('childRemoved', this._childRemoved);
    this.once('added', this._added);

    this.addSignalConnection(this.app.onResize.connect(this.resize));

    this._initializeLayout();
    this._updateLayout();

    if (this.config.debug) {
      registerDebug(`UICanvas:${this.uid}`, this.label || 'UICanvas', DebugColors.outerBounds);
    }
  }

  private _updateLayout() {
    this.app.ticker.addOnce(this.updateLayout);
  }

  private _initializeLayout() {
    this._disableAddChildError = true;
    // Create top row
    this.topRow = this.add.flexContainer({
      label: 'Top',
      layout: {
        width: '100%',
        height: 'auto',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
      },
    });

    // Create middle row
    this.middleRow = this.add.flexContainer({
      label: 'Middle',
      layout: {
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
      },
    });

    // Create bottom row
    this.bottomRow = this.add.flexContainer({
      label: 'Bottom',
      layout: {
        width: '100%',
        height: 'auto',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
      },
    });

    this._disableAddChildError = false;

    // Create the 9 actual position containers
    const topLeft = this._createPositionContainer(
      this.topRow,
      {
        justifyContent: 'flex-start',
        alignItems: 'flex-start',
        flexGrow: 0,
        flexShrink: 0,
      },
      'Left',
    );
    const topCenter = this._createPositionContainer(
      this.topRow,
      {
        justifyContent: 'center',
        alignItems: 'flex-start',
        flexGrow: 1,
        flexShrink: 0,
      },
      'Center',
    );
    const topRight = this._createPositionContainer(
      this.topRow,
      {
        justifyContent: 'flex-end',
        alignItems: 'flex-start',
        flexGrow: 0,
        flexShrink: 0,
      },
      'Right',
    );

    const middleLeft = this._createPositionContainer(
      this.middleRow,
      {
        justifyContent: 'flex-start',
        alignItems: 'center',
        flexDirection: 'row',
        flexGrow: 0,
        flexShrink: 0,
      },
      'Left',
    );
    const center = this._createPositionContainer(
      this.middleRow,
      {
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'row',
        flexGrow: 1,
        flexShrink: 0,
      },
      'Center',
    );
    const middleRight = this._createPositionContainer(
      this.middleRow,
      {
        justifyContent: 'flex-end',
        alignItems: 'center',
        flexDirection: 'row',
        flexGrow: 0,
        flexShrink: 0,
      },
      'Right',
    );

    const bottomLeft = this._createPositionContainer(
      this.bottomRow,
      {
        justifyContent: 'flex-start',
        alignItems: 'flex-end',
        flexDirection: 'row',
        flexGrow: 0,
        flexShrink: 0,
      },
      'Left',
    );
    const bottomCenter = this._createPositionContainer(
      this.bottomRow,
      {
        justifyContent: 'center',
        alignItems: 'flex-end',
        flexGrow: 1,
        flexShrink: 0,
        flexDirection: 'row',
      },
      'Center',
    );
    const bottomRight = this._createPositionContainer(
      this.bottomRow,
      {
        justifyContent: 'flex-end',
        alignItems: 'flex-end',
        flexDirection: 'row',
        flexGrow: 0,
        flexShrink: 0,
      },
      'Right',
    );

    // Map all edge variants to the appropriate containers
    this._positionContainers.set('top left', topLeft);
    this._positionContainers.set('left top', topLeft);

    this._positionContainers.set('top center', topCenter);
    this._positionContainers.set('top', topCenter);

    this._positionContainers.set('top right', topRight);
    this._positionContainers.set('right top', topRight);

    this._positionContainers.set('left center', middleLeft);
    this._positionContainers.set('left', middleLeft);
    this._positionContainers.set('left bottom', bottomLeft);

    this._positionContainers.set('center', center);

    this._positionContainers.set('right center', middleRight);
    this._positionContainers.set('right', middleRight);
    this._positionContainers.set('right bottom', bottomRight);

    this._positionContainers.set('bottom left', bottomLeft);

    this._positionContainers.set('bottom center', bottomCenter);
    this._positionContainers.set('bottom', bottomCenter);

    this._positionContainers.set('bottom right', bottomRight);
  }

  private _createPositionContainer(parent: FlexContainer, layout: Partial<LayoutOptions>, label: string): Container {
    const container = parent.add.container({
      layout: {
        width: 'auto',
        height: 'auto',
        ...layout,
      },
    });
    container.label = label;
    container.on('childAdded', this._updateLayout);
    container.on('childRemoved', this._updateLayout);
    container.on('layout', this._updateLayout);
    return container;
  }

  protected _canvasChildren: PIXIContainer[] = [];

  public get canvasChildren(): PIXIContainer[] {
    return this._canvasChildren;
  }

  /**
   * Get the application instance.
   */
  public get app(): AppTypeOverrides['App'] {
    return Application.getInstance();
  }

  destroy() {
    // Must be set before any child.destroy() call — PixiJS's destroy cascade
    // calls child.removeFromParent() → parent.removeChild() internally.
    this._disableAddChildError = true;

    // Clean up debug
    if (this.config.debug) {
      unregisterDebug(`UICanvas:${this.uid}`);
    }
    if (this._debugGraphics) {
      this._debugGraphics.destroy();
      this._debugGraphics = null;
    }
    if (this._debugLabel) {
      this._debugLabel.destroy();
      this._debugLabel = null;
    }
    for (const rl of this._regionLabels) {
      rl.destroy();
    }
    this._regionLabels = [];

    this.canvasChildren?.forEach((child) => {
      child.off('layout', this._updateLayout);
    });

    this.children.forEach((child) => {
      child.off('layout', this._updateLayout);
    });

    this.off('childAdded', this._updateLayout);
    this.off('childRemoved', this._updateLayout);

    this._positionContainers.forEach((container) => {
      container.off('childAdded', this._updateLayout);
      container.off('childRemoved', this._updateLayout);
    });

    this._bindings = [];

    super.destroy();
  }

  set size(value: SizeLike) {
    this.config.size = value === undefined ? { width: 0, height: 0 } : resolveSizeLike(value);

    this.layout = { width: this.config.size.width, height: this.config.size.height };

    this.updateLayout();
  }

  set padding(value: Partial<Padding> | PointLike) {
    this.config.padding = ensurePadding(value);
    // Update position to account for padding
    this._applyPadding();
    this._updateLayout();
  }

  /** Writes the effective padding (configured padding + safe-area insets) into the layout. */
  private _applyPadding() {
    const padding = computeEffectivePadding(
      this.config.padding,
      this.config.useSafeArea ? this.app.safeArea : zeroPadding,
    );
    this.layout = {
      paddingLeft: padding.left,
      paddingTop: padding.top,
      paddingRight: padding.right,
      paddingBottom: padding.bottom,
    };
  }

  private static isFlexContainer(child: PIXIContainer): boolean {
    return child instanceof FlexContainer;
  }

  /**
   * Removes all the children from the container
   */
  public removeChildren = (beginIndex?: number, endIndex?: number): PIXIContainer[] => {
    return super.removeChildren(beginIndex, endIndex) as PIXIContainer[];
  };

  /**
   * Removes a child from the container at the specified index
   */
  public removeChildAt = <U extends PIXIContainer | RenderLayer>(index: number): U => {
    return super.removeChildAt(index) as U;
  };

  /**
   * Adds a child to the container at the specified index
   */
  public addChildAt = <U extends PIXIContainer | RenderLayer>(_child: U, _index: number): U => {
    throw new Error(
      `UICanvas: Do not call addChildAt() directly. Use addElement(child, { align }) instead.\n` +
        `Example: uiCanvas.addElement(myChild, { align: 'top right' })`,
    );
  };

  /**
   * Sets the index of the child in the container
   */
  public setChildIndex = <U extends PIXIContainer>(_child: U, _index: number): void => {
    throw new Error(
      `UICanvas: Do not call setChildIndex() directly. Use reorderElement(child, index), bringToFront(child), or sendToBack(child) instead.\n` +
        `Example: uiCanvas.reorderElement(myChild, 0)`,
    );
  };

  /**
   * Gets the index of a child in the container
   */
  public getChildIndex = <U extends PIXIContainer>(child: U): number => {
    return super.getChildIndex(child);
  };

  /**
   * Gets the child at the specified index
   */
  public getChildAt = <U extends PIXIContainer | RenderLayer>(index: number): U => {
    return super.getChildAt(index) as U;
  };

  public addChild<U extends (ContainerChild | RenderLayer)[]>(...children: U): U[0] {
    if (this._disableAddChildError) {
      return super.addChild(...children);
    }
    throw new Error(
      `UICanvas: Do not call addChild() directly. Use addElement(child, { align }) instead.\n` +
        `Example: uiCanvas.addElement(myChild, { align: 'top right' })`,
    );
  }

  /**
   * Removes one or more children from the container
   */
  public removeChild(..._children: (PIXIContainer | RenderLayer)[]): PIXIContainer {
    if (this._disableAddChildError) {
      return super.removeChild(...(_children as PIXIContainer[]));
    }
    throw new Error(`UICanvas: Do not call removeChild() directly. Use removeElement(child) instead.`);
  }

  public resize() {
    // Re-derived rather than cached: the safe area changes with the viewport.
    this._applyPadding();
    if (this.config.useAppSize) {
      this.size = { width: this.app.size.width, height: this.app.size.height };
      this.position.set(-this.app.size.width * 0.5, -this.app.size.height * 0.5);
    } else {
      this._updateLayout();
    }
  }

  public updateLayout() {
    if (this.destroyed || !this.layout || !this.app?.renderer.layout) return;
    this.app.renderer.layout.update(this);

    this._positionContainers.forEach((container) => {
      this.app.renderer.layout.update(container);
    });

    if (this.config.useAppSize) {
      this.position.set(-this.config.size.width * 0.5, -this.config.size.height * 0.5);
    }

    this._updateBindings();

    if (this.config.debug) {
      this.app.ticker.addOnce(this.drawDebug);
    }
  }

  /**
   * Bind a free-floating element to a UICanvas-managed anchor without adding it
   * to the flex flow. The element is parented to the canvas as a `layout: false`
   * child (so it never re-measures a region — it can't "shift everything left"),
   * and `place` re-runs on every layout pass with the anchor's current box in
   * canvas-local space. Use it for popovers, tooltips, and dropdowns anchored to
   * laid-out chrome. Idempotent per child — binding the same child again replaces
   * the previous binding.
   *
   * The bound element must NOT be a `@pixi/layout` node: re-enabling `.layout` on
   * it (a layout-enabled direct child of the canvas joins the column flow and
   * bottom-docks + reflows the canvas). Position its own subtree manually.
   */
  public bindElement(child: PIXIContainer, anchor: PIXIContainer, place: UICanvasBindFn): void {
    if (child.parent !== this) {
      this._disableAddChildError = true;
      super.addChild(child);
      this._disableAddChildError = false;
    }
    child.layout = false;
    this._bindings = this._bindings.filter((b) => b.child !== child);
    this._bindings.push({ child, anchor, place });
    this._updateLayout();
  }

  /** Remove a binding created by `bindElement` and detach the element. */
  public unbindElement(child: PIXIContainer): void {
    const had = this._bindings.some((b) => b.child === child);
    this._bindings = this._bindings.filter((b) => b.child !== child);
    if (had && child.parent === this) {
      this._disableAddChildError = true;
      super.removeChild(child);
      this._disableAddChildError = false;
    }
  }

  private _updateBindings(): void {
    for (const { child, anchor, place } of this._bindings) {
      const rect = this._anchorRect(anchor);
      if (rect) place(rect, child);
    }
  }

  /** The anchor's box in canvas-local space, summed from the computed-layout
   * offsets up to this canvas — deterministic and free of render-transform lag
   * (the same source the debug overlay uses to draw regions). */
  private _anchorRect(anchor: PIXIContainer): UICanvasBindRect | null {
    const own = anchor.layout?.computedLayout;
    if (!own) return null;
    let left = 0;
    let top = 0;
    for (let node: PIXIContainer | null = anchor; node && node !== this; node = node.parent) {
      const cl = node.layout?.computedLayout;
      if (cl) {
        left += cl.left;
        top += cl.top;
      }
    }
    return { left, top, width: own.width, height: own.height };
  }

  public addElement<U extends PIXIContainer = PIXIContainer>(
    child: PIXIContainer,
    settings?: Partial<UICanvasChildProps>,
  ): U {
    const position = settings?.align ?? 'top left';
    const container = this._positionContainers.get(position);

    if (!container) {
      Logger.error(`UICanvas:: Invalid position "${position}" for element`);
      return child as U;
    }

    if (UICanvas.isFlexContainer(child as PIXIContainer)) {
      this.addSignalConnection((child as unknown as FlexContainer).onLayoutComplete.connect(this._updateLayout));
    }

    this.settingsMap.set(child, {
      align: position,
      padding: settings?.padding ? ensurePadding(settings.padding) : { top: 0, left: 0, bottom: 0, right: 0 },
    });

    this._childMap.set(child, container);
    this._canvasChildren = Array.from(this._childMap.keys());

    container.add.existing(child);
    this._childAdded(child);

    return child as U;
  }

  public removeElement(child: PIXIContainer): PIXIContainer {
    const container = this._childMap.get(child);
    if (!container) {
      throw new Error(
        `UICanvas: Cannot remove element — it was not added via addElement().\n` +
          `Child label: "${child.label ?? '(unlabeled)'}"`,
      );
    }

    container.removeChild(child);
    child.off('layout', this._updateLayout);
    this.settingsMap.delete(child);
    this._childMap.delete(child);
    this._canvasChildren = Array.from(this._childMap.keys());
    this._updateLayout();
    return child;
  }

  /**
   * Reorders an element within its region container, changing its position in
   * the flex layout and paint order.
   */
  public reorderElement<U extends PIXIContainer>(child: U, index: number): U {
    const container = this._childMap.get(child);
    if (!container) {
      throw new Error(
        `UICanvas: Cannot reorder element — it was not added via addElement().\n` +
          `Child label: "${child.label ?? '(unlabeled)'}"`,
      );
    }

    container.setChildIndex(child, index);
    this._updateLayout();
    return child;
  }

  /** Moves an element to the last index (painted/laid-out last) within its region. */
  public bringToFront<U extends PIXIContainer>(child: U): U {
    const container = this._childMap.get(child);
    if (!container) {
      throw new Error(
        `UICanvas: Cannot reorder element — it was not added via addElement().\n` +
          `Child label: "${child.label ?? '(unlabeled)'}"`,
      );
    }

    return this.reorderElement(child, container.children.length - 1);
  }

  /** Moves an element to the first index (painted/laid-out first) within its region. */
  public sendToBack<U extends PIXIContainer>(child: U): U {
    return this.reorderElement(child, 0);
  }

  private _childAdded(child: PIXIContainer) {
    if (this.config.autoLayoutChildren) {
      if (!child.layout) {
        child.layout = true;
      }
      if (!child.layout?.style?.width) {
        child.layout = { width: 'auto' };
      }
      if (!child.layout?.style?.height) {
        child.layout = { height: 'auto' };
      }
    }
    child.on('layout', this._updateLayout);
    Container.childAdded(child);
    this._updateLayout();
  }

  private _childRemoved(child: any) {
    this.settingsMap.delete(child);
    this._childMap.delete(child as PIXIContainer);
    this._canvasChildren = Array.from(this._childMap.keys());
    Container.childRemoved(child);
  }

  private _added() {
    this._updateLayout();
  }

  // --- Debug visualization ---
  get debug(): boolean {
    return this.config.debug;
  }

  set debug(value: boolean) {
    this.config.debug = value;
    if (value) {
      const uid = `UICanvas:${this.uid}`;
      registerDebug(uid, this.label || 'UICanvas', DebugColors.outerBounds);
      this.drawDebug();
    } else {
      unregisterDebug(`UICanvas:${this.uid}`);
      if (this._debugGraphics) {
        this._debugGraphics.clear();
      }
      if (this._debugLabel) {
        this._debugLabel.visible = false;
      }
      for (const rl of this._regionLabels) {
        rl.visible = false;
      }
    }
  }

  private drawDebug() {
    // Lazily create debug graphics as a child of this canvas
    if (!this._debugGraphics) {
      this._disableAddChildError = true;
      this._debugGraphics = createDebugGraphics(`${this.label ?? 'UICanvas'}:debug`);
      super.addChild(this._debugGraphics);
      this._debugGraphics.layout = false;
      this._disableAddChildError = false;
    }

    if (!this._debugLabel) {
      this._disableAddChildError = true;
      this._debugLabel = createDebugLabel(this.label || 'UICanvas', DebugColors.outerBounds);
      super.addChild(this._debugLabel);
      this._debugLabel.layout = false;
      this._disableAddChildError = false;
    }

    this._debugLabel.text = this.label || 'UICanvas';
    this._debugLabel.visible = true;
    this._debugLabel.position.set(2, 2);

    this._debugGraphics.clear();

    const w = this.config.size.width;
    const h = this.config.size.height;
    const pad = this.config.padding;

    // 1. Outer bounds (red)
    this._debugGraphics
      .rect(0, 0, w, h)
      .stroke({ width: 1, color: DebugColors.outerBounds, alpha: DebugAlpha.stroke, pixelLine: true });

    // 2. Padding areas (red subtle fill)
    if (pad.top > 0) {
      this._debugGraphics.rect(0, 0, w, pad.top).fill({ color: DebugColors.outerBounds, alpha: DebugAlpha.fill });
    }
    if (pad.bottom > 0) {
      this._debugGraphics
        .rect(0, h - pad.bottom, w, pad.bottom)
        .fill({ color: DebugColors.outerBounds, alpha: DebugAlpha.fill });
    }
    if (pad.left > 0) {
      this._debugGraphics
        .rect(0, pad.top, pad.left, h - pad.top - pad.bottom)
        .fill({ color: DebugColors.outerBounds, alpha: DebugAlpha.fill });
    }
    if (pad.right > 0) {
      this._debugGraphics
        .rect(w - pad.right, pad.top, pad.right, h - pad.top - pad.bottom)
        .fill({ color: DebugColors.outerBounds, alpha: DebugAlpha.fill });
    }

    // 3. Inner bounds (green)
    const innerX = pad.left;
    const innerY = pad.top;
    const innerW = w - pad.left - pad.right;
    const innerH = h - pad.top - pad.bottom;
    this._debugGraphics
      .rect(innerX, innerY, innerW, innerH)
      .stroke({ width: 1, color: DebugColors.innerBounds, alpha: DebugAlpha.stroke, pixelLine: true });

    // 4. 9-grid region visualization
    // Build a name map from edge → container for labeling
    const edgeNames = new Map<Container, string>();
    this._positionContainers.forEach((container, edge) => {
      // Use the shortest edge name for each unique container
      if (!edgeNames.has(container) || edge.length < edgeNames.get(container)!.length) {
        edgeNames.set(container, edge);
      }
    });

    const uniqueContainers = [...new Set(this._positionContainers.values())];

    // Ensure we have enough region labels
    while (this._regionLabels.length < uniqueContainers.length) {
      this._disableAddChildError = true;
      const rl = createDebugLabel('', DebugColors.region);
      super.addChild(rl);
      rl.layout = false;
      this._regionLabels.push(rl);
      this._disableAddChildError = false;
    }

    uniqueContainers.forEach((container, i) => {
      if (!container.layout?.computedLayout) return;
      const cl = container.layout.computedLayout;
      const parent = container.parent;
      if (!parent?.layout?.computedLayout) return;
      const parentCL = parent.layout.computedLayout;

      const rx = parentCL.left + cl.left;
      const ry = parentCL.top + cl.top;
      const rw = cl.width;
      const rh = cl.height;
      const hasChildren = container.children.length > 0;

      // Region fill (different alpha for occupied vs empty)
      this._debugGraphics!
        .rect(rx, ry, rw, rh)
        .fill({ color: DebugColors.region, alpha: hasChildren ? DebugAlpha.fillActive : DebugAlpha.fill })
        .stroke({ width: 1, color: DebugColors.region, alpha: 0.3, pixelLine: true });

      // Region label
      const rl = this._regionLabels[i];
      rl.text = edgeNames.get(container) ?? '';
      rl.visible = true;
      rl.position.set(rx + 2, ry + 2);
    });

    // Hide unused region labels
    for (let i = uniqueContainers.length; i < this._regionLabels.length; i++) {
      this._regionLabels[i].visible = false;
    }

    // 5. Center crosshairs
    const centerX = w / 2;
    const centerY = h / 2;
    this._debugGraphics
      .moveTo(centerX, centerY - 10)
      .lineTo(centerX, centerY + 10)
      .stroke({ width: 1, color: DebugColors.outerBounds, alpha: DebugAlpha.crosshair, pixelLine: true })
      .moveTo(centerX - 10, centerY)
      .lineTo(centerX + 10, centerY)
      .stroke({ width: 1, color: DebugColors.outerBounds, alpha: DebugAlpha.crosshair, pixelLine: true });
  }
}
