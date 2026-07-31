import { BitmapText, Graphics, HTMLText, Sprite, Text, TilingSprite } from 'pixi.js';

import { AnimatedSprite } from '../../display/AnimatedSprite';
import { Container, ContainerConfigKeys } from '../../display/Container';
import { ParticleContainer, ParticleContainerConfigKeys } from '../../display/ParticleContainer';
import { SpineAnimation } from '../../display/SpineAnimation';
import { Svg } from '../../display/Svg';
import type { ButtonConfig } from '../../ui/Button';
import { Button, ButtonConfigKeys } from '../../ui/Button';
import type { FlexContainerConfig } from '../../ui/FlexContainer';
import { FlexContainer, FlexContainerConfigKeys } from '../../ui/FlexContainer';
import type { ToastConfig } from '../../ui/Toast';
import type { ToasterConfig } from '../../ui/Toaster';
import { Toaster } from '../../ui/Toaster';
import type { UICanvasProps } from '../../ui/UICanvas';
import { UICanvas, UICanvasConfigKeys } from '../../ui/UICanvas';
import type { EntityId, EntityInstance, EntityProps, UIId, UIInstance, UIProps } from '../../utils';
import { pluck, resolvePointLike, Spine, WithRequiredProps } from '../../utils';

import { setDefaultFactoryMethods } from './defaults';
import type { EntityFactoryProps } from './props';
import {
  AnimatedSpriteProps,
  BitmapTextProps,
  ButtonProps,
  ContainerProps,
  ExistingProps,
  FlexContainerProps,
  GraphicsProps,
  HTMLTextProps,
  ParticleContainerProps,
  SpineProps,
  SpriteProps,
  SvgProps,
  TextProps,
  TilingSpriteProps,
  UICanvasFactoryProps,
} from './props';
import { getEntityCtor, getRegisteredEntityIds } from './registry';
import { getUICtor, getRegisteredUIIds } from './ui-registry';
import { buildFactoryMethod } from './schema';
import {
  resolveAnchor,
  resolvePivot,
  resolvePosition,
  resolveScale,
  resolveTexture,
  resolveUnknownKeys,
} from './utils';

/**
 * Keys consumed by text-family factory builds (`text`, `htmlText`,
 * `bitmapText`). Shared here so the three schemas don't drift — each one
 * flattens `{text, style, roundPixels, resolution, anchor, pivot}` into
 * the Pixi constructor options in `build`, so all those keys must be
 * excluded from the schema's unknown-keys passthrough.
 */
const TEXT_CONSUMED_KEYS = ['text', 'roundPixels', 'resolution', 'style', 'anchor', 'pivot'] as const;

/**
 * Factory method table consumed by the `Factory()` mixin. Almost every
 * entry is built via `buildFactoryMethod({ build, applies, exclude })`:
 * the `build` callback owns the bespoke constructor call (including any
 * DX reshaping Caper applies — asset-name resolution, text style
 * flattening, config-vs-extras splits), and the helper centralizes
 * position/scale/pivot/anchor + unknown-keys passthrough.
 *
 * The five bespoke entries (`existing`, `texture`, `svg`, `toaster`,
 * `entity`) don't fit the `(props?) → instance` shape — `existing` takes
 * `(entity, props)`, `texture` is a plain resolver re-bind, `svg` takes
 * a required `ctx` field, `toaster` takes two config objects, and
 * `entity` takes `(id, props)` with a generic narrowed to discovered
 * entity ids — so they stay hand-written.
 */
export const defaultFactoryMethods = {
  existing: <TEntity>(entity: TEntity, props?: Partial<ExistingProps>): TEntity => {
    if (!props) return entity;
    const { position, x, y, pivot, scale, scaleX, scaleY, ...rest } = props;
    resolvePosition({ position, x, y }, entity);
    resolveScale({ scale, scaleX, scaleY }, entity);
    resolvePivot(pivot, entity);
    resolveUnknownKeys(rest, entity);
    return entity;
  },

  container: buildFactoryMethod({
    build: (props?: Partial<ContainerProps>): Container =>
      new Container(props ? pluck(props, ContainerConfigKeys) : undefined),
    applies: ['position', 'scale', 'pivot'],
    exclude: ContainerConfigKeys as readonly string[],
  }),

  particleContainer: buildFactoryMethod({
    build: (props?: Partial<ParticleContainerProps>): ParticleContainer =>
      new ParticleContainer(props ? pluck(props, ParticleContainerConfigKeys) : undefined),
    applies: ['position', 'scale', 'pivot'],
    exclude: ParticleContainerConfigKeys as readonly string[],
  }),

  texture: resolveTexture,

  sprite: buildFactoryMethod({
    build: (props?: Partial<SpriteProps>) =>
      new Sprite(props ? resolveTexture(props) : undefined),
    applies: ['position', 'scale', 'pivot', 'anchor'],
    exclude: ['asset', 'sheet'],
  }),

  tilingSprite: buildFactoryMethod({
    build: (props?: Partial<TilingSpriteProps>) =>
      new TilingSprite(props ? resolveTexture(props) : undefined),
    applies: ['position', 'scale', 'pivot', 'anchor'],
    exclude: ['asset', 'sheet'],
  }),

  animatedSprite: buildFactoryMethod({
    // AnimatedSprite's Caper-side constructor consumes the full props bag
    // (animations, autoPlay, autoUpdate, sheet, texturePrefix, etc.), so
    // the schema's `build` just forwards them. Position/scale/pivot are
    // applied by the helper from the same object.
    build: (props?: Partial<AnimatedSpriteProps>): AnimatedSprite => new AnimatedSprite(props),
    applies: ['position', 'scale', 'pivot'],
    exclude: [
      'sheet',
      'texturePrefix',
      'zeroPad',
      'animations',
      'autoPlay',
      'autoUpdate',
      'defaultAnimation',
      'reversible',
      'animationSpeed',
      'startIndex',
      'animation',
    ],
  }),

  graphics: buildFactoryMethod({
    build: (_props?: Partial<GraphicsProps>) => new Graphics(),
    applies: ['position', 'scale', 'pivot'],
  }),

  svg(props: WithRequiredProps<SvgProps, 'ctx'>) {
    const entity = new Svg(props.ctx);
    const { position, x, y, pivot, scale, scaleX, scaleY, ctx: _ctx, ...rest } = props;
    resolvePosition({ position, x, y }, entity);
    resolveScale({ scale, scaleX, scaleY }, entity);
    resolvePivot(pivot, entity);
    resolveUnknownKeys(rest, entity);
    return entity;
  },

  text: buildFactoryMethod({
    // Text flattens Pixi's nested `style: {...}` into top-level props for
    // DX (e.g. `{fontFamily, fontSize, fill}` without the `style:` wrapper
    // — see TextStyle type in props.ts). The build callback rebuilds the
    // Pixi-shape options object, including `anchor`/`pivot` pre-resolved
    // via `resolvePointLike(..., true)` the way the hand-written method
    // did. Post-construct resolvers handle position/scale/pivot.
    build: (props?: Partial<TextProps>) =>
      new Text(
        props
          ? {
              text: props.text,
              roundPixels: props.roundPixels,
              resolution: props.resolution,
              style: props.style,
              anchor: props.anchor ? resolvePointLike(props.anchor, true) : undefined,
              pivot: props.pivot ? resolvePointLike(props.pivot, true) : undefined,
            }
          : {},
      ),
    applies: ['position', 'scale', 'pivot'],
    exclude: [...TEXT_CONSUMED_KEYS],
  }),

  htmlText: buildFactoryMethod({
    build: (props?: Partial<HTMLTextProps>) =>
      new HTMLText(
        props
          ? {
              text: props.text,
              roundPixels: props.roundPixels,
              resolution: props.resolution,
              style: props.style,
              anchor: props.anchor ? resolvePointLike(props.anchor, true) : undefined,
              pivot: props.pivot ? resolvePointLike(props.pivot, true) : undefined,
            }
          : {},
      ),
    applies: ['position', 'scale', 'pivot'],
    exclude: [...TEXT_CONSUMED_KEYS],
  }),

  bitmapText: buildFactoryMethod({
    // BitmapText's ctor doesn't take `resolution` — that's the only field
    // that differs from Text/HTMLText here.
    build: (props?: Partial<BitmapTextProps>) =>
      new BitmapText(
        props
          ? {
              text: props.text,
              roundPixels: props.roundPixels,
              style: props.style,
              anchor: props.anchor ? resolvePointLike(props.anchor, true) : undefined,
              pivot: props.pivot ? resolvePointLike(props.pivot, true) : undefined,
            }
          : {},
      ),
    applies: ['position', 'scale', 'pivot'],
    exclude: [...TEXT_CONSUMED_KEYS],
  }),

  button: buildFactoryMethod({
    build: (props?: Partial<ButtonProps>): Button =>
      new Button((props ? pluck(props, ButtonConfigKeys) : undefined) as Partial<ButtonConfig>),
    applies: ['position', 'scale', 'pivot'],
    exclude: ButtonConfigKeys as readonly string[],
  }),

  flexContainer: buildFactoryMethod({
    // FlexContainer takes the full props bag (minus position/scale/pivot)
    // as its constructor config — historical: the hand-written method
    // passed `props as Partial<FlexContainerConfig>` directly rather than
    // plucking FlexContainerConfigKeys. Preserving that shape.
    build: (props?: Partial<FlexContainerProps>): FlexContainer =>
      new FlexContainer(props as Partial<FlexContainerConfig>),
    applies: ['position', 'scale', 'pivot'],
    exclude: FlexContainerConfigKeys as readonly string[],
  }),

  uiCanvas: buildFactoryMethod({
    build: (props?: Partial<UICanvasFactoryProps>): UICanvas =>
      // UICanvas's ctor takes Partial<UICanvasProps>, which is a superset
      // of UICanvasConfig — the pluck narrows, so cast back.
      new UICanvas(props ? (pluck(props, UICanvasConfigKeys) as Partial<UICanvasProps>) : ({} as Partial<UICanvasProps>)),
    applies: ['position', 'scale', 'pivot'],
    exclude: UICanvasConfigKeys as readonly string[],
  }),

  spine: buildFactoryMethod({
    build: (props?: Partial<SpineProps>): Spine => {
      // Resolve Caper's `{data: 'spine/foo'}` shorthand into the Pixi
      // `{skeleton, atlas}` pair expected by Spine.from().
      let spineData: { skeleton: string; atlas: string } | string = '';
      const data = props?.data;
      if (typeof data === 'string') {
        // If the asset name is missing an extension, default to .json. If
        // it has one, strip it so we can re-append both skeleton + atlas
        // paths from the base name.
        let ext = data.slice(-5);
        if (ext !== '.json' && ext !== '.skel') {
          ext = '.json';
        } else {
          spineData = data.substring(0, data.length - 5);
        }
        spineData = { skeleton: data + ext, atlas: data + '.atlas' };
      }
      const entity: Spine = (window as unknown as { Spine: { from: (d: unknown) => Spine } }).Spine.from(
        spineData,
      );
      // Spine-specific post-construct setup. Has to happen here (not in
      // `applies`) because the helper doesn't know about spine state.
      if (props?.autoUpdate !== undefined) entity.autoUpdate = props.autoUpdate;
      if (props?.animationName) {
        entity.state.setAnimation(props.trackIndex ?? 0, props.animationName, props.loop);
      }
      return entity;
    },
    applies: ['position', 'scale', 'pivot', 'anchor'],
    exclude: ['data', 'autoUpdate', 'animationName', 'trackIndex', 'loop'],
  }),

  spineAnimation: <ANames extends string = string>(
    props?: Partial<SpineProps>,
  ): SpineAnimation<ANames> => {
    // Hand-written rather than schema-driven because `buildFactoryMethod`
    // can't carry the `<ANames>` generic through to the call site —
    // kitchen-sink's SpineScene narrows the animation-name union via
    // `this.add.spineAnimation<CharacterAnimations>({...})`, which
    // requires the method itself to declare the generic.
    const entity = new SpineAnimation<ANames>(props);
    if (!props) return entity;
    const { position, x, y, anchor, pivot, scale, scaleX, scaleY, ...rest } = props;
    resolvePosition({ position, x, y }, entity);
    resolveScale({ scale, scaleX, scaleY }, entity);
    resolveAnchor(anchor, entity);
    resolvePivot(pivot, entity);
    resolveUnknownKeys(rest, entity);
    return entity;
  },

  toaster: (toasterConfig?: Partial<ToasterConfig>, defaultToastConfig: Partial<ToastConfig> = {}): Toaster => {
    return new Toaster(toasterConfig, defaultToastConfig);
  },

  /**
   * Construct an entity from the auto-discovered registry. `id` is narrowed
   * to the union of entity ids declared under `src/entities/` (see the
   * generated `caper-app.d.ts`), and `props` is typed from the entity's
   * constructor signature via `ConstructorParameters<typeof Entity>[0]`.
   *
   * Throws if `id` isn't registered. Discovery runs at build time, so the
   * only way to hit this at runtime is a stale virtual module — fail loud
   * and list the known ids so the user can see what's wrong.
   *
   * @example
   *   this.add.entity('actor', { color: 0xff0000, x: 50, y: 100 });
   */
  entity: <K extends EntityId>(
    id: K,
    props?: EntityProps<K> & EntityFactoryProps,
  ): EntityInstance<K> => {
    const Ctor = getEntityCtor(id as string);
    if (!Ctor) {
      const known = getRegisteredEntityIds();
      throw new Error(
        `[caper] Unknown entity id '${String(id)}'. ` +
          `Known: ${known.length > 0 ? known.map((k) => `'${k}'`).join(', ') : '(none — discovery may have failed)'}`,
      );
    }
    const instance = new (Ctor as new (props?: EntityProps<K>) => EntityInstance<K>)(props);
    if (props) {
      const { position, x, y, pivot, scale, scaleX, scaleY, alpha, visible } = props as EntityFactoryProps;
      resolvePosition({ position, x, y }, instance);
      resolveScale({ scale, scaleX, scaleY }, instance);
      resolvePivot(pivot, instance);
      if (alpha !== undefined) (instance as unknown as { alpha: number }).alpha = alpha;
      if (visible !== undefined) (instance as unknown as { visible: boolean }).visible = visible;
    }
    return instance;
  },

  /**
   * Construct a UI element from the auto-discovered registry. `id` is
   * narrowed to the union of UI ids declared under `src/ui/` (see the
   * generated `caper-app.d.ts`), and `props` is typed from the UI
   * element's constructor signature via `ConstructorParameters<...>[0]`.
   *
   * @example
   *   this.add.ui('close-button', { x: 100, y: 50 });
   */
  ui: <K extends UIId>(
    id: K,
    props?: UIProps<K> & EntityFactoryProps,
  ): UIInstance<K> => {
    const Ctor = getUICtor(id as string);
    if (!Ctor) {
      const known = getRegisteredUIIds();
      throw new Error(
        `[caper] Unknown ui id '${String(id)}'. ` +
          `Known: ${known.length > 0 ? known.map((k) => `'${k}'`).join(', ') : '(none — discovery may have failed)'}`,
      );
    }
    const instance = new (Ctor as new (props?: UIProps<K>) => UIInstance<K>)(props);
    if (props) {
      const { position, x, y, pivot, scale, scaleX, scaleY, alpha, visible } = props as EntityFactoryProps;
      resolvePosition({ position, x, y }, instance);
      resolveScale({ scale, scaleX, scaleY }, instance);
      resolvePivot(pivot, instance);
      if (alpha !== undefined) (instance as unknown as { alpha: number }).alpha = alpha;
      if (visible !== undefined) (instance as unknown as { visible: boolean }).visible = visible;
    }
    return instance;
  },
};

// Hand the table to the import-free registration slot the moment it exists, so
// `Factory()` can read it without importing this module. See ./defaults.ts.
setDefaultFactoryMethods(defaultFactoryMethods);
