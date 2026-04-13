import type { AssetInitOptions, AssetsManifest, AssetsPreferences, Texture, UnresolvedAsset } from 'pixi.js';
import { Point } from 'pixi.js';
import type { Scene } from '../display/Scene';
import { SceneAssets } from '../display';
import type { FilterBitmapFontNames, FilterCleanAssetNames, FilterSpineAssetNames } from './typefilters';

/**
 * A generic constructor type.
 * @template T The type of the instance that the constructor creates.
 */
export type Constructor<T = NonNullable<unknown>> = new (...args: any[]) => T;

/**
 * A type that requires certain properties of another type.
 * @template T The original type.
 * @template K The keys of the properties that should be required.
 */
export type WithRequiredProps<T, K extends keyof T> = Partial<T> & Pick<T, K>;

/**
 * A type that represents a size, with width and height properties.
 */
export type Size = { width: number; height: number };

/**
 * A type that represents a point, which can be a number, an object with x and y properties, an array of two numbers, or a Point instance.
 */
export type PointLike = number | { x: number; y: number } | [number, number?] | [number] | number[] | Point;
export type Padding = { top: number; right: number; bottom: number; left: number };
export type SizeLike = PointLike | { width: number; height: number } | Size;

/**
 * A type that represents a rectangle, with x, y, width, and height properties.
 */
export type RectLike = Size & { x: number; y: number };

/**
 * A type that maps keys to PointLike values.
 * @template T The keys of the properties that should be PointLike.
 */
export type WithPointLike<T extends keyof any> = { [P in T]: PointLike };

/**
 * A type that represents a container, with position and getGlobalPosition properties, and x, y, width, and height properties.
 */
export type ContainerLike = RectLike & { position: Point; getGlobalPosition: () => Point };

/**
 * A type that represents a texture, which can be a string or a Texture instance.
 */
 
export interface AssetTypeOverrides {}

export type ImportListItemModule<T> = (() => Promise<any>) | Promise<any> | Constructor<T> | T;

/**+
 * A type that represents an item in an import list.
 * @template T The type of the instance that the constructor creates.
 */
export type ImportListItem<T = any> = {
  id: string;
  module: ImportListItemModule<T>;
  namedExport?: string;
  options?: any;
  autoLoad?: boolean;
  /** IDs this item must be initialized after. Used by plugin topo-sort. */
  requires?: string[];
};

export type AssetExtension =
  | 'png'
  | 'jpg'
  | 'jpeg'
  | 'webp'
  | 'gif'
  | 'avif'
  | 'svg'
  | 'json'
  | 'xml'
  | 'txt'
  | 'mp4'
  | 'm4v'
  | 'webm'
  | 'ogg'
  | 'wav'
  | 'mp3'
  | string;

export type AssetLike = {
  alias?: string;
  src: string | string[];
  ext: AssetExtension;
};
export type BundleTypes =
  | AssetTypeOverrides['Bundles']
  | AssetTypeOverrides['Bundles'][]
  | (string & {})
  | (string & {})[];

export type AssetTypes = string | string[] | UnresolvedAsset | UnresolvedAsset[] | AssetLike | AssetLike[];

export type AssetLoadingOptions = {
  manifest?: AssetsManifest | Promise<AssetsManifest> | string | (() => Promise<any>);
  initOptions?: Partial<AssetInitOptions>;
  assetPreferences?: Partial<AssetsPreferences>;
  preload?: {
    assets?: AssetTypes;
    bundles?: BundleTypes;
  };
  background?: {
    assets?: AssetTypes;
    bundles?: BundleTypes;
  };
};

type SceneItemOptions = {
  active?: boolean;
  debugLabel?: string;
  debugGroup?: string;
  debugOrder: number;
  plugins?: string[];
  assets?: SceneAssets;
  autoUnloadAssets?: boolean;
};

export type SceneImportListItem<T> = ImportListItem<T> & Partial<SceneItemOptions>;

/**
 * A type that represents an import list.
 * @template T The type of the instance that the constructor creates.
 */
export type ImportList<T> = ImportListItem<T>[];
export type SceneImportList<T> = SceneImportListItem<T>[];

export type AppSize = {
  width: number;
  height: number;
  screenWidth: number;
  screenHeight: number;
};

export type Eases<T extends string = string> = Record<T, gsap.EaseFunction>;

// from gsap
export type EaseString =
  | 'none'
  | 'power1'
  | 'power1.in'
  | 'power1.out'
  | 'power1.inOut'
  | 'power2'
  | 'power2.in'
  | 'power2.out'
  | 'power2.inOut'
  | 'power3'
  | 'power3.in'
  | 'power3.out'
  | 'power3.inOut'
  | 'power4'
  | 'power4.in'
  | 'power4.out'
  | 'power4.inOut'
  | 'back'
  | 'back.in'
  | 'back.out'
  | 'back.inOut'
  | 'bounce'
  | 'bounce.in'
  | 'bounce.out'
  | 'bounce.inOut'
  | 'circ'
  | 'circ.in'
  | 'circ.out'
  | 'circ.inOut'
  | 'elastic'
  | 'elastic.in'
  | 'elastic.out'
  | 'elastic.inOut'
  | 'expo'
  | 'expo.in'
  | 'expo.out'
  | 'expo.inOut'
  | 'sine'
  | 'sine.in'
  | 'sine.out'
  | 'sine.inOut';

export type KeyboardKey =
  | 'Backspace'
  | 'Tab'
  | 'Enter'
  | 'Shift'
  | 'Control'
  | 'Alt'
  | 'Pause'
  | 'CapsLock'
  | 'Escape'
  | 'Space'
  | 'PageUp'
  | 'PageDown'
  | 'End'
  | 'Home'
  | 'ArrowLeft'
  | 'ArrowUp'
  | 'ArrowRight'
  | 'ArrowDown'
  | 'PrintScreen'
  | 'Insert'
  | 'Delete'
  | '0'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | 'A'
  | 'B'
  | 'C'
  | 'D'
  | 'E'
  | 'F'
  | 'G'
  | 'H'
  | 'i'
  | 'J'
  | 'K'
  | 'L'
  | 'M'
  | 'N'
  | 'O'
  | 'P'
  | 'Q'
  | 'R'
  | 'S'
  | 't'
  | 'U'
  | 'V'
  | 'W'
  | 'X'
  | 'Y'
  | 'Z'
  | 'NumLock'
  | 'NumpadDivide'
  | 'NumpadMultiply'
  | 'NumpadSubtract'
  | 'NumpadAdd'
  | 'NumpadEnter'
  | 'Numpad0'
  | 'Numpad1'
  | 'Numpad2'
  | 'Numpad3'
  | 'Numpad4'
  | 'Numpad5'
  | 'Numpad6'
  | 'Numpad7'
  | 'Numpad8'
  | 'Numpad9'
  | 'NumpadDecimal'
  | 'F1'
  | 'F2'
  | 'F3'
  | 'F4'
  | 'F5'
  | 'F6'
  | 'F7'
  | 'F8'
  | 'F9'
  | 'F10'
  | 'F11'
  | 'F12'
  | 'Semicolon'
  | 'Equal'
  | 'Comma'
  | 'Minus'
  | 'Period'
  | 'Slash'
  | 'Backquote'
  | 'BracketLeft'
  | 'Backslash'
  | 'BracketRight'
  | 'Quote'
  | 'IntlBackslash'
  | 'MetaLeft'
  | 'MetaRight'
  | 'ContextMenu';

export type { Spine } from '../plugins/spine/pixi-spine';

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};


export interface AppTypeOverrides {}

// ============================================================================
// Typed factory helpers (entities / popups / scenes)
// ----------------------------------------------------------------------------
// The Vite plugin's `generateTypes()` emits `SceneClasses` / `PopupClasses` /
// `EntityClasses` into the `AppTypeOverrides` augmentation as keyed
// `{ [id]: typeof import('@/...').default }` maps. The helpers below pull
// constructor params and instance types out of those maps via plain
// TypeScript — no AST type extraction, full fidelity on generics and
// imports. If the generated maps are missing (framework built in isolation
// or no entities/popups discovered), the helpers degrade to `never`.
// ============================================================================

type _EntityClassMap = AppTypeOverrides extends { EntityClasses: infer E } ? E : Record<string, never>;
type _PopupClassMap = AppTypeOverrides extends { PopupClasses: infer P } ? P : Record<string, never>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _SceneClassMap = AppTypeOverrides extends { SceneClasses: infer S } ? S : Record<string, never>;

/** Any-constructor shape. */
type AnyCtor = abstract new (...args: any[]) => any;

type _UIClassMap = AppTypeOverrides extends { UIClasses: infer U } ? U : Record<string, never>;

/** Union of discovered entity IDs from `src/entities/`. */
export type EntityId = keyof _EntityClassMap & string;
/** Constructor type of the entity class registered under `K`. */
export type EntityCtor<K extends EntityId> = _EntityClassMap[K] extends AnyCtor
  ? _EntityClassMap[K]
  : never;
/**
 * Props accepted by the entity's constructor — derived from the first
 * parameter of its constructor signature. Enforces the single-options-object
 * convention at the call site of `this.add.entity(id, props)`.
 */
export type EntityProps<K extends EntityId> = EntityCtor<K> extends AnyCtor
  ? ConstructorParameters<EntityCtor<K>>[0]
  : never;
/** Instance type returned by `this.add.entity(id, props)`. */
export type EntityInstance<K extends EntityId> = EntityCtor<K> extends AnyCtor
  ? InstanceType<EntityCtor<K>>
  : never;

/** Union of discovered UI element IDs from `src/ui/`. */
export type UIId = keyof _UIClassMap & string;
/** Constructor type of the UI class registered under `K`. */
export type UICtor<K extends UIId> = _UIClassMap[K] extends AnyCtor ? _UIClassMap[K] : never;
/**
 * Props accepted by the UI element's constructor — derived from the first
 * parameter of its constructor signature.
 */
export type UIProps<K extends UIId> = UICtor<K> extends AnyCtor
  ? ConstructorParameters<UICtor<K>>[0]
  : never;
/** Instance type returned by `this.add.ui(id, props)`. */
export type UIInstance<K extends UIId> = UICtor<K> extends AnyCtor
  ? InstanceType<UICtor<K>>
  : never;

/** Union of discovered popup IDs from `src/popups/`. */
export type PopupId = keyof _PopupClassMap & string;
/** Constructor type of the popup class registered under `K`. */
export type PopupCtor<K extends PopupId> = _PopupClassMap[K] extends AnyCtor
  ? _PopupClassMap[K]
  : never;
/**
 * Config accepted by `app.popups.show(id, config)` — the second constructor
 * parameter of the popup class. If the popup declares its data generic
 * (e.g. `class Foo extends Popup<MyDataType>`), `config.data` narrows to
 * that type at the call site.
 */
export type PopupProps<K extends PopupId> = PopupCtor<K> extends abstract new (
  id: any,
  config?: infer C,
) => any
  ? C
  : never;
/** Instance type returned by `app.popups.show(id, config)`. */
export type PopupInstance<K extends PopupId> = PopupCtor<K> extends AnyCtor
  ? InstanceType<PopupCtor<K>>
  : never;

/** Union of discovered scene IDs from `src/scenes/`. */
export type SceneId = keyof _SceneClassMap & string;
/** Constructor type of the scene class registered under `K`. */
export type SceneCtor<K extends SceneId> = _SceneClassMap[K] extends AnyCtor
  ? _SceneClassMap[K]
  : never;
/** Instance type returned by `app.scenes.load(id, props)`. */
export type SceneInstance<K extends SceneId> = SceneCtor<K> extends AnyCtor
  ? InstanceType<SceneCtor<K>>
  : never;
/**
 * Props accepted by `app.scenes.load(id, props)`. Derived from the scene's
 * `Scene<Props>` generic — scenes that don't declare a generic resolve to
 * `void`, so callers don't pass a second argument. Scenes that declare
 * `class LevelScene extends Scene<{ levelId: number }>` require the prop
 * object at the call site.
 */
export type SceneProps<K extends SceneId> = SceneInstance<K> extends Scene<infer P> ? P : void;
/**
 * Tuple form of `SceneProps<K>` — `[]` when `void`, `[props: P]` otherwise.
 * Used in overloaded `loadScene` signatures so unparameterized scenes keep
 * the `load('menu')` shape without a second arg.
 */
export type SceneLoadArgs<K extends SceneId> = SceneProps<K> extends void
  ? []
  : [props: SceneProps<K>];

export type TextureAsset =
  | FilterCleanAssetNames<AssetTypeOverrides['Texture']>
  | AssetTypeOverrides['TPSFrames']
  | (string & {})
  | Texture;

export type TPSFramesAsset = AssetTypeOverrides['TPSFrames'] & (string & {});

export type SpritesheetAsset = FilterCleanAssetNames<AssetTypeOverrides['SpriteSheet']> | (string & {});

export type AudioAsset = FilterCleanAssetNames<AssetTypeOverrides['Audio']> | (string & {});

export type FontFamilyAsset = FilterCleanAssetNames<AssetTypeOverrides['FontFamily']> | (string & {}) | (string[] & {});

export type BitmapFontFamilyAsset =
  | FilterBitmapFontNames<AssetTypeOverrides['BitmapFontFamily']>
  | (string & {})
  | (string[] & {});

export type SpineAsset = FilterSpineAssetNames<AssetTypeOverrides['SpineData']> | (string & {});
