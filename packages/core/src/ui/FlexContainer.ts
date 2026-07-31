import type { LayoutOptions, NumberValue } from '@pixi/layout';
import { BitmapText, Graphics, Container as PIXIContainer, Text } from 'pixi.js';
import { Application } from '../core/Application';
import { Container } from '../display/Container';
import { Factory } from '../mixins/factory/Factory';
import { WithSignals } from '../mixins/signals';
import { Signal } from '../signals';
import {
  AppTypeOverrides,
  bindAllMethods,
  type ContainerLike,
  createDebugGraphics,
  createDebugLabel,
  DebugAlpha,
  DebugColors,
  registerDebug,
  unregisterDebug,
} from '../utils';

const _FlexContainer = WithSignals(Factory());

export function isText(child: PIXIContainer): child is Text | BitmapText {
  return child instanceof Text || child instanceof BitmapText;
}

export interface FlexContainerConfig {
  bindTo?: ContainerLike;
  bindToAppSize?: boolean;
  autoLayoutChildren?: boolean;
  layout?: Omit<LayoutOptions, 'target'> | null | boolean;
  debug?: boolean;
}

export const FlexContainerConfigKeys: (keyof FlexContainerConfig)[] = [
  'bindTo',
  'bindToAppSize',
  'autoLayoutChildren',
  'debug',
];

export type FlexWrap = 'wrap' | 'nowrap' | 'wrap-reverse' | undefined;
export type FlexDirection = 'row' | 'column' | 'row-reverse' | 'column-reverse' | undefined;
export type AlignItems = 'center' | 'flex-start' | 'flex-end' | 'stretch' | 'baseline' | undefined;
export type JustifyContent =
  | 'center'
  | 'space-between'
  | 'space-around'
  | 'space-evenly'
  | 'flex-start'
  | 'flex-end'
  | undefined;

export type SizeNumber = NumberValue | 'auto' | 'intrinsic';

export class FlexContainer extends _FlexContainer {
  public onLayoutComplete = new Signal<() => void>();
  public config: Partial<FlexContainerConfig>;
  private _debugGraphics: Graphics | null = null;
  private _debugLabel: Text | null = null;

  constructor(config: Partial<FlexContainerConfig> = {}) {
    super();

    if (!this.app.config.useLayout) {
      throw new Error('You must set useLayout to true in your app config to use FlexContainer');
    }

    bindAllMethods(this);

    this.config = {
      autoLayoutChildren: true,
      ...config,
    };

    // Set up layout
    this.layout = this.createLayout(config);

    // Set up event listeners
    this.on('added', this.handleAdded);
    this.on('childAdded', this.handleChildAdded);
    this.on('childRemoved', this.handleChildRemoved);

    if (this.config.bindToAppSize) {
      this.app.onResize.connect(this.handleResize);
    }

    if (this.config.bindTo && 'on' in this.config.bindTo) {
      (this.config.bindTo as PIXIContainer).on('layout', this.handleBindToResize);
    }
  }

  private createLayout(config: Partial<FlexContainerConfig>): Omit<LayoutOptions, 'target'> | null | boolean {
    if (config?.layout === true) {
      config.layout = {};
    }
    const layout: Omit<LayoutOptions, 'target'> | null | boolean = { ...(config?.layout ?? {}) };

    if (this.config.bindToAppSize) {
      layout.width = this.app.size.width;
      layout.height = this.app.size.height;
    } else if (this.config.bindTo) {
      layout.width = this.config.bindTo.width;
      layout.height = this.config.bindTo.height;
    }

    return layout;
  }

  private handleAdded() {
    this.updateLayout();
  }

  private _updateLayout() {
    this.app.ticker.addOnce(this.updateLayout);
  }

  private handleChildAdded(child: PIXIContainer) {
    if (this.config.autoLayoutChildren) {
      if (!(child.layout as unknown as boolean)) {
        // No layout yet — set isLeaf (original behavior)
        child.layout = { isLeaf: true };
      } else if (isText(child) && !child.layout?.style?.isLeaf) {
        // Text/BitmapText with existing layout props (e.g. marginTop) but missing isLeaf.
        // Without isLeaf, Yoga won't measure the text's intrinsic bounds.
        // The layout setter merges, so existing props are preserved.
        child.layout = { isLeaf: true };
      }
    }

    Container.childAdded(child);
    child.on('layout', this._updateLayout);
    this._updateLayout();
  }

  private handleChildRemoved(child: PIXIContainer) {
    child.off('layout', this._updateLayout);
    Container.childRemoved(child);
    this._updateLayout();
  }

  private handleResize() {
    if (this.config.bindToAppSize) {
      this.layout = {
        width: this.app.size.width,
        height: this.app.size.height,
      };
    }
    this._updateLayout();
  }

  private handleBindToResize() {
    if (!this.config.bindTo) return;
    this.layout = {
      width: this.config.bindTo.width,
      height: this.config.bindTo.height,
    };
    this._updateLayout();
  }

  public updateLayout() {
    if (this.destroyed || !this.layout || !this.app?.renderer.layout) return;
    this.app.renderer.layout.update(this);
    this.onLayoutComplete.emit();
    if (this.config.debug) {
      this.drawDebug();
    }
  }

  public get app(): AppTypeOverrides['App'] {
    return Application.getInstance();
  }

  /**
   * Set multiple layout properties at once, triggering a single deferred layout update.
   */
  public configure(styles: Partial<Omit<LayoutOptions, 'target'>>): void {
    this.layout = styles;
    this._updateLayout();
  }

  // Convenience getters/setters for common layout properties
  get gap(): number {
    return (this.layout?.style?.gap as number) ?? 0;
  }

  set gap(value: number) {
    this.layout = { gap: value };
    this._updateLayout();
  }

  get flexWrap(): FlexWrap {
    return this.layout?.style?.flexWrap as FlexWrap;
  }

  set flexWrap(value: FlexWrap) {
    this.layout = { flexWrap: value };
    this._updateLayout();
  }

  get flexDirection(): FlexDirection {
    return this.layout?.style?.flexDirection as FlexDirection;
  }

  set flexDirection(value: FlexDirection) {
    this.layout = { flexDirection: value };
    this._updateLayout();
  }

  get alignItems(): AlignItems {
    return this.layout?.style?.alignItems as AlignItems;
  }

  set alignItems(value: AlignItems) {
    this.layout = { alignItems: value };
    this._updateLayout();
  }

  get justifyContent(): JustifyContent {
    return this.layout?.style?.justifyContent as JustifyContent;
  }

  set justifyContent(value: JustifyContent) {
    this.layout = { justifyContent: value };
    this._updateLayout();
  }

  get size(): { width: SizeNumber; height: SizeNumber } {
    return {
      width: this.layout?.style?.width as SizeNumber,
      height: this.layout?.style?.height as SizeNumber,
    };
  }

  set size(size: { width: SizeNumber; height: SizeNumber } | [SizeNumber, SizeNumber] | SizeNumber) {
    if (Array.isArray(size)) {
      size = { width: size[0], height: size[1] };
    }
    if (typeof size === 'number' || typeof size === 'string') {
      size = { width: size, height: size };
    }
    this.layout = { ...size };
    this._updateLayout();
  }

  get layoutWidth(): SizeNumber {
    return this.layout?.style?.width as SizeNumber;
  }

  set layoutWidth(width: SizeNumber) {
    this.layout = { width };
    this._updateLayout();
  }

  get layoutHeight(): SizeNumber {
    return this.layout?.style?.height as SizeNumber;
  }

  set layoutHeight(height: SizeNumber) {
    this.layout = { height };
    this._updateLayout();
  }

  // Padding convenience
  get padding(): NumberValue | undefined {
    return this.layout?.style?.padding as NumberValue | undefined;
  }

  set padding(value: NumberValue) {
    this.layout = { padding: value };
    this._updateLayout();
  }

  get paddingTop(): NumberValue | undefined {
    return this.layout?.style?.paddingTop as NumberValue | undefined;
  }

  set paddingTop(value: NumberValue) {
    this.layout = { paddingTop: value };
    this._updateLayout();
  }

  get paddingRight(): NumberValue | undefined {
    return this.layout?.style?.paddingRight as NumberValue | undefined;
  }

  set paddingRight(value: NumberValue) {
    this.layout = { paddingRight: value };
    this._updateLayout();
  }

  get paddingBottom(): NumberValue | undefined {
    return this.layout?.style?.paddingBottom as NumberValue | undefined;
  }

  set paddingBottom(value: NumberValue) {
    this.layout = { paddingBottom: value };
    this._updateLayout();
  }

  get paddingLeft(): NumberValue | undefined {
    return this.layout?.style?.paddingLeft as NumberValue | undefined;
  }

  set paddingLeft(value: NumberValue) {
    this.layout = { paddingLeft: value };
    this._updateLayout();
  }

  // Margin convenience
  get margin(): NumberValue | undefined {
    return this.layout?.style?.margin as NumberValue | undefined;
  }

  set margin(value: NumberValue) {
    this.layout = { margin: value };
    this._updateLayout();
  }

  get marginTop(): NumberValue | undefined {
    return this.layout?.style?.marginTop as NumberValue | undefined;
  }

  set marginTop(value: NumberValue) {
    this.layout = { marginTop: value };
    this._updateLayout();
  }

  get marginRight(): NumberValue | undefined {
    return this.layout?.style?.marginRight as NumberValue | undefined;
  }

  set marginRight(value: NumberValue) {
    this.layout = { marginRight: value };
    this._updateLayout();
  }

  get marginBottom(): NumberValue | undefined {
    return this.layout?.style?.marginBottom as NumberValue | undefined;
  }

  set marginBottom(value: NumberValue) {
    this.layout = { marginBottom: value };
    this._updateLayout();
  }

  get marginLeft(): NumberValue | undefined {
    return this.layout?.style?.marginLeft as NumberValue | undefined;
  }

  set marginLeft(value: NumberValue) {
    this.layout = { marginLeft: value };
    this._updateLayout();
  }

  // --- Debug visualization ---
  get debug(): boolean {
    return this.config.debug ?? false;
  }

  set debug(value: boolean) {
    this.config.debug = value;
    if (value) {
      const uid = `FlexContainer:${this.uid}`;
      registerDebug(uid, this.label || 'FlexContainer', DebugColors.bounds);
      this.drawDebug();
    } else {
      unregisterDebug(`FlexContainer:${this.uid}`);
      if (this._debugGraphics) {
        this._debugGraphics.clear();
      }
      if (this._debugLabel) {
        this._debugLabel.visible = false;
      }
    }
  }

  private drawDebug() {
    // Create or re-add debug graphics if orphaned by removeChildren()
    if (!this._debugGraphics || this._debugGraphics.parent !== this) {
      if (!this._debugGraphics) {
        this._debugGraphics = createDebugGraphics(`${this.label ?? 'FlexContainer'}:debug`);
      }
      this.addChild(this._debugGraphics);
      this._debugGraphics.layout = false; // override auto-isLeaf from handleChildAdded
    }
    if (!this._debugLabel || this._debugLabel.parent !== this) {
      if (!this._debugLabel) {
        this._debugLabel = createDebugLabel(this.label || 'FlexContainer', DebugColors.bounds);
      }
      this.addChild(this._debugLabel);
      this._debugLabel.layout = false;
    }

    // Update label text in case label changed
    this._debugLabel.text = this.label || 'FlexContainer';
    this._debugLabel.visible = true;

    // Ensure debug graphics render on top
    this.setChildIndex(this._debugGraphics, this.children.length - 1);
    this.setChildIndex(this._debugLabel, this.children.length - 1);

    this._debugGraphics.clear();

    const computedLayout = this.layout?.computedLayout;
    if (!computedLayout) return;

    const w = computedLayout.width;
    const h = computedLayout.height;
    const direction = (this.layout?.style?.flexDirection as string) ?? 'row';
    const gap = (this.layout?.style?.gap as number) ?? 0;

    // 1. Container bounds (cyan)
    this._debugGraphics
      .rect(0, 0, w, h)
      .stroke({ width: 1, color: DebugColors.bounds, alpha: DebugAlpha.stroke, pixelLine: true });

    // 2. Padding visualization (red subtle fill)
    const pt = (this.layout?.style?.paddingTop as number) ?? 0;
    const pr = (this.layout?.style?.paddingRight as number) ?? 0;
    const pb = (this.layout?.style?.paddingBottom as number) ?? 0;
    const pl = (this.layout?.style?.paddingLeft as number) ?? 0;
    if (pt > 0) {
      this._debugGraphics.rect(0, 0, w, pt).fill({ color: DebugColors.outerBounds, alpha: DebugAlpha.fill });
    }
    if (pb > 0) {
      this._debugGraphics.rect(0, h - pb, w, pb).fill({ color: DebugColors.outerBounds, alpha: DebugAlpha.fill });
    }
    if (pl > 0) {
      this._debugGraphics.rect(0, pt, pl, h - pt - pb).fill({ color: DebugColors.outerBounds, alpha: DebugAlpha.fill });
    }
    if (pr > 0) {
      this._debugGraphics
        .rect(w - pr, pt, pr, h - pt - pb)
        .fill({ color: DebugColors.outerBounds, alpha: DebugAlpha.fill });
    }

    // 3. Flex direction arrow (yellow)
    const arrowLen = Math.min(w, h, 40);
    const cx = w / 2;
    const cy = h / 2;
    const isRow = direction === 'row' || direction === 'row-reverse';
    if (isRow) {
      const dir = direction === 'row' ? 1 : -1;
      const startX = cx - (dir * arrowLen) / 2;
      const endX = cx + (dir * arrowLen) / 2;
      this._debugGraphics
        .moveTo(startX, cy)
        .lineTo(endX, cy)
        .moveTo(endX, cy)
        .lineTo(endX - dir * 6, cy - 4)
        .moveTo(endX, cy)
        .lineTo(endX - dir * 6, cy + 4)
        .stroke({ width: 1, color: DebugColors.direction, alpha: 0.8, pixelLine: true });
    } else {
      const dir = direction === 'column' ? 1 : -1;
      const startY = cy - (dir * arrowLen) / 2;
      const endY = cy + (dir * arrowLen) / 2;
      this._debugGraphics
        .moveTo(cx, startY)
        .lineTo(cx, endY)
        .moveTo(cx, endY)
        .lineTo(cx - 4, endY - dir * 6)
        .moveTo(cx, endY)
        .lineTo(cx + 4, endY - dir * 6)
        .stroke({ width: 1, color: DebugColors.direction, alpha: 0.8, pixelLine: true });
    }

    // 4. Gap indicators between children (magenta fills)
    if (gap > 0) {
      for (let i = 0; i < this.children.length - 1; i++) {
        const child = this.children[i];
        if (child === this._debugGraphics || child === this._debugLabel) continue;
        if (!child.layout?.computedLayout) continue;
        const cl = child.layout.computedLayout;
        if (isRow) {
          const gapX = cl.left + cl.width;
          this._debugGraphics.rect(gapX, 0, gap, h).fill({ color: DebugColors.gap, alpha: DebugAlpha.fill });
        } else {
          const gapY = cl.top + cl.height;
          this._debugGraphics.rect(0, gapY, w, gap).fill({ color: DebugColors.gap, alpha: DebugAlpha.fill });
        }
      }
    }

    // 5. Child bounding boxes (green outlines)
    for (const child of this.children) {
      if (child === this._debugGraphics || child === this._debugLabel) continue;
      if (!child.layout?.computedLayout) continue;
      const cl = child.layout.computedLayout;
      this._debugGraphics
        .rect(cl.left, cl.top, cl.width, cl.height)
        .stroke({ width: 1, color: DebugColors.innerBounds, alpha: 0.4, pixelLine: true });
    }

    // Position label at top-left with slight offset
    this._debugLabel.position.set(2, 2);
  }

  destroy() {
    // Clean up debug
    if (this.config.debug) {
      unregisterDebug(`FlexContainer:${this.uid}`);
    }
    if (this._debugGraphics) {
      this._debugGraphics.destroy();
      this._debugGraphics = null;
    }
    if (this._debugLabel) {
      this._debugLabel.destroy();
      this._debugLabel = null;
    }

    this.off('added', this.handleAdded);
    this.off('childAdded', this.handleChildAdded);
    this.off('childRemoved', this.handleChildRemoved);

    if (this.config.bindToAppSize) {
      this.app.onResize.disconnect(this.handleResize);
    }

    if (this.config.bindTo && 'off' in this.config.bindTo) {
      (this.config.bindTo as PIXIContainer).off('layout', this.handleBindToResize);
    }

    super.destroy();
  }
}
