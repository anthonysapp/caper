import {
  AmbientLight,
  Camera3D,
  Container3D,
  CubeGeometry,
  DirectionalLight,
  Material3D,
  Mesh3D,
  PlaneGeometry,
  PointLight,
  SphereGeometry,
  SpotLight,
} from '@pixi/3d';
import type { Geometry3D, Light, Scene3DSource } from '@pixi/3d';
import { Assets } from 'pixi.js';
import { getEntityCtor, getRegisteredEntityIds } from '@caperjs/core';
import { Model } from './Model';
import { Owned3D } from './owned';
import type {
  Camera3DProps,
  Entity3DId,
  Entity3DInstance,
  Entity3DNodeProps,
  Entity3DProps,
  Light3DProps,
  Material3DProps,
  Mesh3DProps,
  Model3DProps,
  Node3DProps,
} from './props';
import { resolveNodeOptions, toVec3 } from './props';
import type { View3D } from './View3D';

/** Add-on methods on every 3D factory. Augment with the call-site shape:
 * declare module '@caperjs/plugin-3d' { interface Factory3DOverrides { cameraRig: (props?: P) => CameraRig } } */
export interface Factory3DOverrides {}

/** Registered methods receive the view before their call-site arguments. */
export type Factory3DMethods = {
  [K in keyof Factory3DOverrides]: Factory3DOverrides[K] extends (...args: infer A) => infer R
    ? (view: View3D, ...args: A) => R : never;
};

interface BuiltInFactory3D {
  container(props?: Node3DProps): Container3D;
  mesh(props?: Mesh3DProps): Mesh3D;
  /** A material owned by the view: freed with it. Pass it to many meshes. A material has no parent, so add.material and make.material are the same. */
  material(props?: Material3DProps): Material3D;
  entity<K extends Entity3DId>(id: K, props?: Entity3DProps<K> & Entity3DNodeProps): Entity3DInstance<K>;
  model(props: Model3DProps): Model;
  light(props?: Light3DProps): Light;
  camera(props?: Camera3DProps): Camera3D;
  existing<T extends Container3D>(node: T, props?: Node3DProps): T;
}

export interface Factory3D extends BuiltInFactory3D, Factory3DOverrides {}

const BUILT_IN_METHODS = {
  container: true, mesh: true, material: true, entity: true,
  model: true, light: true, camera: true, existing: true,
} satisfies Record<keyof BuiltInFactory3D, true>;
const registered = new Map<string, (...args: any[]) => any>();

/** Register methods for factories built afterwards. Register before creating views: a view builds its
 * factories in its constructor, and an entity builds them on first add/make use. A disposer only affects
 * future factories. Registered methods have the same behavior on add and make; neither parents their result.
 */
export function registerFactory3DMethods(methods: Partial<Factory3DMethods>): () => void {
  const entries = Object.entries(methods) as Array<[string, (...args: any[]) => any]>;
  for (const [name, method] of entries) {
    if (Object.hasOwn(BUILT_IN_METHODS, name)) {
      throw new Error(`[caper] registerFactory3DMethods: "${name}" is a built-in 3D factory method and cannot be replaced. Pick another name.`);
    }
    if (typeof method !== 'function') {
      throw new Error(`[caper] registerFactory3DMethods: "${name}" must be a function.`);
    }
    const previous = registered.get(name);
    if (previous && previous !== method) {
      throw new Error(`[caper] registerFactory3DMethods: "${name}" is already registered (by function "${previous.name || 'anonymous'}"); cannot register function "${method.name || 'anonymous'}" under the same name.`);
    }
  }
  const added = entries.filter(([name]) => !registered.has(name));
  for (const [name, method] of added) registered.set(name, method);
  return () => {
    for (const [name, method] of added) {
      if (registered.get(name) === method) registered.delete(name);
    }
  };
}

const BUILT_IN_GEOMETRY = {
  box: () => new CubeGeometry(),
  plane: () => new PlaneGeometry(),
  sphere: () => new SphereGeometry({ radius: 0.5 }),
};

const ENTITY_PLACEMENT = ['position', 'rotation', 'scale', 'x', 'y', 'z', 'visible', 'lookAt', 'parent'] as const;

const LIGHTS = { directional: DirectionalLight, point: PointLight, spot: SpotLight, ambient: AmbientLight };

export function createFactory3D(root: Container3D, owned: Owned3D, parent: boolean, view: View3D): Factory3D {
  const options = <T extends Node3DProps>(props: T) => {
    const resolved = resolveNodeOptions(props);
    return parent && !resolved.parent ? { ...resolved, parent: root } : resolved;
  };
  const finish = <T extends Container3D>(node: T, props: Node3DProps): T => {
    if (props.lookAt) node.lookAt(toVec3(props.lookAt));
    return node;
  };
  const existing = <T extends Container3D>(node: T, props: Node3DProps = {}): T => {
    const { parent: to = root, ...rest } = resolveNodeOptions(props);
    Object.assign(node, rest);
    if (parent) to.addChild(node);
    // After parenting: lookAt aims in world space.
    return finish(node, props);
  };

  const builtIns: BuiltInFactory3D = {
    container(props = {}) {
      return finish(new Container3D(options(props)), props);
    },
    material(props = {}) {
      const { color, ...options } = props;
      return owned.material(new Material3D(color === undefined ? options : { baseColor: color, ...options }));
    },
    entity(id, props) {
      const Ctor = getEntityCtor(id);
      if (!Ctor) {
        const known = getRegisteredEntityIds();
        throw new Error(
          `Unknown entity id '${id}'. Known: ${known.length ? known.map((key) => `'${key}'`).join(', ') : '(none)'}`,
        );
      }
      if (!(Ctor.prototype instanceof Container3D)) {
        throw new Error(
          `Entity '${id}' is not a 3D entity (its class does not extend Container3D). Use this.add.entity for 2D entities.`,
        );
      }
      const node = new (Ctor as new (props?: unknown) => Container3D)(props);
      // Only placement is applied to the node; every other prop is the entity's own.
      const placement: Entity3DNodeProps = Object.fromEntries(
        ENTITY_PLACEMENT.filter((key) => props && key in props).map((key) => [key, props![key]]),
      );
      return existing(node, placement) as Entity3DInstance<typeof id>;
    },
    mesh(props = {}) {
      const { geometry = 'box', material, color, ...nodeProps } = props;
      let actualGeometry: Geometry3D;
      if (typeof geometry !== 'string') actualGeometry = geometry;
      else if (geometry in BUILT_IN_GEOMETRY) actualGeometry = owned.geometry(geometry, BUILT_IN_GEOMETRY[geometry]);
      else throw new Error(`Unknown 3D geometry '${geometry}'. Use box, plane, or sphere.`);
      const actualMaterial = material ?? owned.material(new Material3D({ baseColor: color ?? 0xffffff }));
      return finish(new Mesh3D({ ...options(nodeProps), geometry: actualGeometry, material: actualMaterial }), props);
    },
    model(props) {
      const { asset, ...nodeProps } = props;
      const source = typeof asset === 'string' ? Assets.get<Scene3DSource>(asset) : asset;
      if (!source)
        throw new Error(`Model asset '${asset}' is not loaded. Add its bundle to the scene's assets.preload.`);
      const model = finish(new Model({ ...options(nodeProps), source, autoUpdate: false }), props);
      if (model.player) owned.player(model.player);
      return model;
    },
    light(props = {}) {
      const { type = 'directional', ...nodeProps } = props;
      const lightOptions = options(nodeProps);
      if (type === 'directional' && !props.rotation && !props.quaternion && !props.lookAt) {
        lightOptions.rotation = { x: -Math.PI / 4, y: Math.PI / 6, z: 0 };
      }
      const light = new LIGHTS[type](lightOptions);
      return finish(light, props);
    },
    camera(props = {}) {
      return finish(new Camera3D(options(props)), props);
    },
    existing,
  };
  const bound = Object.fromEntries(
    [...registered].map(([name, method]) => [name, (...args: any[]) => method(view, ...args)]),
  );
  return Object.assign(builtIns, bound) as Factory3D;
}
