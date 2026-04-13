// Import from source files directly (not via the `../../utils` barrel) so
// the test runtime doesn't transitively pull in display/Container → the
// Factory mixin chain → const.ts. That cycle is fine for bundled builds
// but breaks vitest module evaluation when the test imports from here.
import { omitKeys } from '../../utils/object';
import {
  resolveAnchor,
  resolvePivot,
  resolvePosition,
  resolveScale,
  resolveUnknownKeys,
} from './utils';

/**
 * Common prop resolvers the schema helper can apply after constructing an
 * instance. Each entry corresponds to one of the `resolveXxx` utilities and
 * reads its inputs from the raw props object — so `'position'` consumes
 * `{ position, x, y }`, `'scale'` consumes `{ scale, scaleX, scaleY }`,
 * etc.
 */
export type FactoryApply = 'position' | 'scale' | 'pivot' | 'anchor';

/**
 * Schema describing a single factory method. Owned by the method's entry in
 * `defaultFactoryMethods`; `buildFactoryMethod` consumes it to produce a
 * typed `(props?: Props) => Instance` function with the standard
 * resolve-position / resolve-scale / resolve-pivot / resolve-anchor
 * post-construct pipeline and an automatic unknown-keys passthrough.
 *
 * The point of pushing every method through this shape is to collapse the
 * copy-paste construction boilerplate in [const.ts](./const.ts): each
 * method becomes (a) `build` — the bespoke constructor call that may
 * reshape the props before handing them to Pixi — and (b) a list of which
 * common resolvers to run. Everything else (unknowns passthrough, optional
 * props guard, etc.) is centralized.
 */
export interface FactorySchema<Props, Instance> {
  /**
   * Bespoke construction. Receives the raw Caper-shaped props (possibly
   * undefined) and returns a new instance. Any reshaping Caper does for DX
   * — Sprite's `{asset, sheet}` → texture resolution, Text's top-level
   * style flattening, Container's config/extras split — lives here.
   */
  build: (props: Props | undefined) => Instance;

  /**
   * Which common resolvers to run on the instance after `build` returns.
   * Defaults to `['position', 'scale', 'pivot']` when omitted — the lowest
   * common denominator that every display object supports. Classes with an
   * `anchor` field (Sprite, Text, AnimatedSprite, Spine) opt in to
   * `'anchor'` explicitly.
   */
  applies?: readonly FactoryApply[];

  /**
   * Keys the `build` callback already consumed — excluded from the
   * unknown-keys passthrough so Caper doesn't try to set them on the
   * instance a second time. For example, Sprite's schema excludes `asset`
   * and `sheet` (consumed by `resolveTexture`), Text's schema excludes
   * `text`, `roundPixels`, `resolution`, `style`, `anchor`, and `pivot`.
   */
  exclude?: readonly string[];
}

const DEFAULT_APPLIES: readonly FactoryApply[] = ['position', 'scale', 'pivot'];

/**
 * Keys automatically excluded from the unknown-keys passthrough because
 * they're either consumed by a resolver listed in `applies` or are a
 * shorthand alias for one that is. Listed here so individual schemas don't
 * have to re-declare them.
 */
const RESOLVER_KEYS: readonly string[] = [
  'position',
  'x',
  'y',
  'scale',
  'scaleX',
  'scaleY',
  'pivot',
  'anchor',
];

/**
 * Build a typed factory method from a schema. The return type preserves
 * the `(props?: Props) => Instance` shape TypeScript uses to drive
 * autocomplete on `this.add.*({...})` call sites.
 *
 * Behavior mirrors the hand-written factory method pattern:
 *  1. Call `schema.build(props)` to get the instance.
 *  2. If props were passed, apply each resolver in `schema.applies`
 *     (position / scale / pivot / anchor).
 *  3. Forward any remaining keys to `resolveUnknownKeys` for the common
 *     pass-through surface (`alpha`, `visible`, `label`, `eventMode`, etc.)
 *     minus any keys the `build` callback already consumed.
 *
 * @example
 * ```ts
 * sprite: buildFactoryMethod<Partial<SpriteProps>, Sprite>({
 *   build: (props) => new Sprite(props ? resolveTexture(props) : undefined),
 *   applies: ['position', 'scale', 'pivot', 'anchor'],
 *   exclude: ['asset', 'sheet'],
 * }),
 * ```
 */
export function buildFactoryMethod<Props, Instance>(
  schema: FactorySchema<Props, Instance>,
): (props?: Props) => Instance {
  const applies = schema.applies ?? DEFAULT_APPLIES;
  const applyPosition = applies.includes('position');
  const applyScale = applies.includes('scale');
  const applyPivot = applies.includes('pivot');
  const applyAnchor = applies.includes('anchor');
  const excludeKeys = [...RESOLVER_KEYS, ...(schema.exclude ?? [])];

  return (props?: Props): Instance => {
    const instance = schema.build(props);
    if (props === undefined || props === null) return instance;

    // Post-construct resolvers. Each reads from the raw props object so the
    // schema doesn't have to pre-extract them.
    const rawProps = props as unknown as Record<string, unknown>;
    if (applyPosition) {
      resolvePosition(
        { position: rawProps.position as never, x: rawProps.x as never, y: rawProps.y as never },
        instance as unknown as object,
      );
    }
    if (applyScale) {
      resolveScale(
        {
          scale: rawProps.scale as never,
          scaleX: rawProps.scaleX as never,
          scaleY: rawProps.scaleY as never,
        },
        instance as unknown as object,
      );
    }
    if (applyPivot) {
      resolvePivot(rawProps.pivot as never, instance as unknown as object);
    }
    if (applyAnchor) {
      resolveAnchor(rawProps.anchor as never, instance as unknown as object);
    }

    // Forward any remaining keys via the passthrough. Excludes the keys
    // already handled by the resolvers above plus anything the schema's
    // `build` callback consumed.
    const rest = omitKeys(excludeKeys, rawProps);
    resolveUnknownKeys(rest, instance);
    return instance;
  };
}
