import {
  BasicMultiChannelPerlinNoise,
  BlendCurves,
  FollowBody,
  HardLockToTargetBody,
  HardLookAtAim,
  ImpulseField,
  ImpulseListenerNoise,
  ImpulseShapes,
  Klipp,
  OrbitFollowBody,
  VirtualCamera,
  cameraState,
  targetPose,
  type CameraState,
  type TargetPose,
} from '@pmndrs/klipp';
import { Container3D, Matrix4, Quaternion, Vector3, type Camera3D } from '@pixi/3d';
import { fitFov, type View3D, type View3DPart } from '@caperjs/plugin-3d';
import type { Size } from '@caperjs/core';
import type { Ticker } from 'pixi.js';
import { createDrag } from './drag';

type Point3 = [number, number, number];
export type RigTarget = Container3D | Point3;

export interface CameraRigProps {
  /** Width / height the shots are framed for. Narrower views get a taller field of view. */
  fitAspect?: number;
  /** Default blend time in seconds for cuts and orbit. Default 1. */
  blend?: number;
}
export interface ShotProps {
  priority?: number;
  follow?: RigTarget;
  offset?: Point3;
  damping?: number;
  position?: Point3;
  lookAt?: RigTarget;
  fov?: number;
}
export interface CutOptions { blend?: number }
export interface ShakeOptions { amplitude?: number; duration?: number }
export interface OrbitOptions { target?: RigTarget; distance?: number }

const rigs = new WeakSet<View3D>();
// Scratch for reading a node's world transform.
const matrix = new Matrix4();
const point = new Vector3();
const rotation = new Quaternion();
const scale = new Vector3();

/** The one place where Klipp writes into a Pixi camera. */
class KlippPixi extends Klipp {
  aspect = 1;
  constructor(private camera: Camera3D, private fitAspect: number | undefined, initial: CameraState) {
    super({ initialCameraState: initial });
    cameraState.copy(this.shot, initial);
  }
  protected write(state: CameraState, transformChanged: boolean, lensChanged: boolean): void {
    if (transformChanged) {
      this.camera.position.set(...state.position);
      this.camera.quaternion.set(...state.quaternion);
    }
    if (lensChanged) {
      this.camera.fov = fitFov(state.fov, this.aspect, this.fitAspect);
      this.camera.near = state.near;
      this.camera.far = state.far;
    }
  }
}

/** Directed shots, game-clock shake, and user orbit for one View3D. */
export class CameraRig implements View3DPart {
  readonly klipp: Klipp;
  readonly add: { shot(name: string, props: ShotProps): VirtualCamera };
  private readonly shots = new Map<string, VirtualCamera>();
  private readonly targets = new Map<Container3D, TargetPose>();
  private readonly field = new ImpulseField();
  private readonly shakePiece: { update(out: CameraState, dt: number, justActivated: boolean): boolean };
  private readonly baseFov: number;
  private readonly near: number;
  private readonly far: number;
  private clock = 0;
  private orbitShot?: VirtualCamera;
  private orbitBody?: OrbitFollowBody<TargetPose>;
  private orbitAim?: HardLookAtAim<TargetPose>;
  private drag?: ReturnType<typeof createDrag>;
  private destroyed = false;

  constructor(private readonly view: View3D, private readonly props: CameraRigProps = {}) {
    if (rigs.has(view)) throw new Error('CameraRig: this view already has a camera rig.');
    if (view.camera.parent !== view.root) {
      throw new Error('CameraRig: the camera must be a direct child of view.root because the rig writes its local transform.');
    }
    const c = view.camera;
    this.baseFov = c.fov;
    this.near = c.near;
    this.far = c.far;
    const initial = cameraState.create();
    initial.position = [c.position.x, c.position.y, c.position.z];
    initial.quaternion = [c.quaternion.x, c.quaternion.y, c.quaternion.z, c.quaternion.w];
    initial.fov = this.baseFov;
    initial.near = this.near;
    initial.far = this.far;
    this.klipp = new KlippPixi(c, props.fitAspect, initial);
    const listener = new ImpulseListenerNoise({
      field: this.field,
      shake: new BasicMultiChannelPerlinNoise({
        seed: 1,
        positionAmplitude: [2, 2, 2],
        positionFrequency: [12, 13, 11],
      }),
    });
    this.shakePiece = { update: (out, dt, justActivated) => listener.update(out, dt, justActivated, this.clock) };
    this.add = { shot: (name, shotProps) => this.addShot(name, shotProps) };
    rigs.add(view);
    view.own(this);
  }

  get dragging(): boolean { return this.drag?.dragging ?? false; }

  private pose(target: RigTarget): TargetPose {
    if (target instanceof Container3D) {
      let pose = this.targets.get(target);
      if (!pose) this.targets.set(target, (pose = targetPose.create()));
      this.sync(target, pose);
      return pose;
    }
    const pose = targetPose.create();
    pose.position = [...target];
    pose.hasRotation = false;
    return pose;
  }

  private sync(node: Container3D, pose: TargetPose): void {
    // A destroyed target keeps its last pose (shots still hold it); stop tracking it.
    if (node.destroyed) {
      this.targets.delete(node);
      return;
    }
    node.getGlobalTransform(matrix).decompose(point, rotation, scale);
    pose.position[0] = point.x;
    pose.position[1] = point.y;
    pose.position[2] = point.z;
    pose.rotation[0] = rotation.x;
    pose.rotation[1] = rotation.y;
    pose.rotation[2] = rotation.z;
    pose.rotation[3] = rotation.w;
    pose.hasRotation = true;
  }

  /** A named shot with the view camera's lens and the rig's shake, registered with klipp. */
  private newShot(name: string, priority: number, fov = this.baseFov): VirtualCamera {
    if (this.shots.has(name)) throw new Error(`CameraRig: a shot named '${name}' already exists.`);
    const shot = new VirtualCamera(name, { priority, initialState: { fov, near: this.near, far: this.far } });
    shot.addNoise(this.shakePiece);
    this.shots.set(name, shot);
    this.klipp.add(shot);
    return shot;
  }

  /** Priorities of every shot but `shot`. */
  private others(shot: VirtualCamera): number[] {
    return [...this.shots.values()].filter((other) => other !== shot).map((other) => other.priority);
  }

  private addShot(name: string, props: ShotProps): VirtualCamera {
    if ((props.follow === undefined) === (props.position === undefined)) {
      throw new Error('CameraRig: a shot needs exactly one of follow or position.');
    }
    const shot = this.newShot(name, props.priority ?? 0, props.fov);
    if (props.follow !== undefined) {
      shot.body = new FollowBody(this.pose(props.follow), { offset: props.offset ?? [0, 0, 0], damping: props.damping ?? 0 });
    } else {
      shot.body = new HardLockToTargetBody(this.pose(props.position!));
    }
    const aimTarget = props.lookAt ?? props.follow;
    if (aimTarget !== undefined) shot.aim = new HardLookAtAim(this.pose(aimTarget));
    return shot;
  }

  private blend(time: number): void {
    this.klipp.defaultBlend = { curve: BlendCurves.easeInOut, time };
  }

  private raise(shot: VirtualCamera): void {
    const highestOther = Math.max(-Infinity, ...this.others(shot));
    if (shot.priority <= highestOther) shot.priority = highestOther + 1;
  }

  cut(name: string, options: CutOptions = {}): void {
    const shot = this.shots.get(name);
    if (!shot) throw new Error(`CameraRig: no shot named '${name}'. Shots: ${[...this.shots.keys()].map((key) => `'${key}'`).join(', ')}.`);
    if (shot === this.orbitShot) throw new Error("CameraRig: 'orbit' is the user-orbit shot. Turn it on with rig.orbit().");
    if (this.drag) this.orbit(false);
    this.blend(options.blend ?? this.props.blend ?? 1);
    this.raise(shot);
  }

  shake(options: ShakeOptions = {}): void {
    const amplitude = options.amplitude ?? 0.3;
    const p = this.klipp.shot.position;
    this.field.generate({ position: [p[0], p[1], p[2]], shape: (t) => amplitude * ImpulseShapes.bump(t),
      duration: options.duration ?? 0.3 }, this.clock);
  }

  orbit(options: OrbitOptions | false = {}): void {
    if (options === false) {
      if (!this.drag) return;
      this.drag.destroy();
      this.drag = undefined;
      // Below every other shot, so the one that was live takes over.
      if (this.orbitShot) this.orbitShot.priority = Math.min(0, ...this.others(this.orbitShot)) - 1;
      return;
    }
    if (this.view.eventMode !== 'static') {
      throw new Error('CameraRig: orbit() needs pointer input, but this view was created with interactive: false. Create it with this.add.view3d({ interactive: true }).');
    }
    const pose = this.pose(options.target ?? [0, 0, 0]);
    const c = this.view.camera.position;
    const radius = options.distance ?? Math.hypot(c.x - pose.position[0], c.y - pose.position[1], c.z - pose.position[2]);
    if (!this.orbitShot) {
      this.orbitShot = this.newShot('orbit', -1);
      this.orbitShot.body = this.orbitBody = new OrbitFollowBody(pose, { radius, bindingMode: 'worldSpace' });
      this.orbitShot.aim = this.orbitAim = new HardLookAtAim(pose);
    }
    this.orbitBody!.target = pose;
    this.orbitAim!.target = pose;
    this.orbitBody!.radius = radius;
    this.orbitBody!.radial.setValue(0);
    this.orbitBody!.primeFrom([c.x, c.y, c.z]);
    this.blend(this.props.blend ?? 1);
    this.raise(this.orbitShot!);
    if (!this.drag) {
      this.drag = createDrag(this.view, {
        onDrag: (dx, dy) => {
          this.orbitBody!.horizontal.applyDelta(-dx * 0.3);
          this.orbitBody!.vertical.applyDelta(dy * 0.2);
        },
        onWheel: (deltaY) => this.orbitBody!.radial.applyDelta(deltaY * 0.001),
      });
    }
  }

  update(ticker: Ticker): void {
    const dt = ticker.deltaMS / 1000;
    this.clock += dt;
    for (const [node, pose] of this.targets) this.sync(node, pose);
    this.klipp.update(dt);
  }

  resize(size: Size): void {
    const klipp = this.klipp as KlippPixi;
    klipp.aspect = size.width / size.height;
    klipp.setSize(size.width, size.height);
    this.view.camera.fov = fitFov(klipp.shot.fov, klipp.aspect, this.props.fitAspect);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.orbit(false);
    this.klipp.mode = 'disabled';
    for (const shot of this.shots.values()) this.klipp.remove(shot);
    this.shots.clear();
    this.targets.clear();
    rigs.delete(this.view);
  }
}
