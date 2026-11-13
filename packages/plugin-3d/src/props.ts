import type {
  AmbientLightOptions,
  Camera3DOptions,
  Container3D,
  Container3DOptions,
  DirectionalLightOptions,
  Geometry3D,
  Material3DOptions,
  Mesh3DOptions as PixiMesh3DOptions,
  Model3DOptions as PixiModel3DOptions,
  PointLightOptions,
  Scene3DSource,
  SpotLightOptions,
} from '@pixi/3d';
import type { BaseMaterial3D } from '@pixi/3d';
import type { AppTypeOverrides, AssetTypeOverrides } from '@caperjs/core';

export type Vec3 = [number, number, number] | { x: number; y: number; z: number };

export type Node3DProps = Omit<Container3DOptions, 'position' | 'rotation' | 'scale'> & {
  position?: Vec3;
  rotation?: Vec3;
  scale?: Vec3 | number;
  lookAt?: Vec3;
};

export type Material3DProps = Material3DOptions & { /** Shorthand for `baseColor`. */ color?: number };

type EntityClasses = AppTypeOverrides extends { EntityClasses: infer E } ? E : {};
type Entity3DCtor = abstract new (...args: any[]) => Container3D;
/** Ids of discovered entities whose class extends `Container3D` (usually through `Entity3D`). */
export type Entity3DId = {
  [K in keyof EntityClasses]: EntityClasses[K] extends Entity3DCtor ? K : never;
}[keyof EntityClasses] & string;
type OwnProps<C extends Entity3DCtor> = Exclude<ConstructorParameters<C>[0], void | undefined>;
/** The entity's own constructor props; `{}` for a class that takes none (`Entity3D` with no `Props`). */
export type Entity3DProps<K extends Entity3DId> = EntityClasses[K] extends Entity3DCtor
  ? [OwnProps<EntityClasses[K]>] extends [never]
    ? {}
    : OwnProps<EntityClasses[K]>
  : never;
export type Entity3DInstance<K extends Entity3DId> = EntityClasses[K] extends Entity3DCtor
  ? InstanceType<EntityClasses[K]>
  : never;
/** Placement props `view.add.entity` applies to the new entity; everything else is the entity's own. */
export type Entity3DNodeProps = Pick<
  Node3DProps,
  'position' | 'rotation' | 'scale' | 'x' | 'y' | 'z' | 'visible' | 'lookAt' | 'parent'
>;

export type Mesh3DProps = Omit<PixiMesh3DOptions, keyof Node3DProps | 'geometry' | 'material'> &
  Node3DProps & {
    geometry?: 'box' | 'plane' | 'sphere' | 'cylinder' | Geometry3D;
    material?: BaseMaterial3D;
    color?: number;
    roughness?: number;
    metallic?: number;
  };

/**
 * A model's manifest name. Once the app's generated `caper-assets.d.ts` lists models (any `.glb` in the assets
 * folder), this is that union, so unknown names are type errors; until then it is `string`. A model loaded by
 * hand is passed as its `Scene3DSource`.
 */
// Known names autocomplete; any other string is still allowed, the same as texture and spritesheet names.
export type ModelAsset = AssetTypeOverrides extends { Model: infer Name extends string }
  ? Name | (string & {})
  : string;

export type Model3DProps = Omit<PixiModel3DOptions, keyof Node3DProps | 'source'> &
  Node3DProps & { asset: ModelAsset | Scene3DSource };

export type Light3DProps = Omit<
  DirectionalLightOptions & PointLightOptions & SpotLightOptions & AmbientLightOptions,
  keyof Node3DProps
> &
  Node3DProps & { type?: 'directional' | 'point' | 'spot' | 'ambient' };

export type Camera3DProps = Omit<Camera3DOptions, keyof Node3DProps> & Node3DProps;

export function toVec3(value: Vec3): { x: number; y: number; z: number } {
  return Array.isArray(value) ? { x: value[0], y: value[1], z: value[2] } : value;
}

export function resolveNodeOptions<T extends Node3DProps>(
  props: T,
): Omit<T, 'lookAt' | 'position' | 'rotation' | 'scale'> & Pick<Container3DOptions, 'position' | 'rotation' | 'scale'> {
  const options: Record<string, unknown> = { ...props };
  delete options.lookAt;
  for (const key of ['position', 'rotation', 'scale'] as const) {
    const value = options[key];
    if (Array.isArray(value)) options[key] = toVec3(value as Vec3);
  }
  return options as Omit<T, 'lookAt' | 'position' | 'rotation' | 'scale'> &
    Pick<Container3DOptions, 'position' | 'rotation' | 'scale'>;
}
