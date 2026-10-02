import { describe, expect, it, vi } from 'vitest';

// Sensor -> Entity pulls in the app singleton, the plugin, and (through System) Pixi.
// None of it matters to the movement/overlap logic under test. Stub it.
vi.mock('@caperjs/core', () => ({
  Application: { getInstance: () => ({}) },
  bindAllMethods: () => undefined,
  defaultFactoryMethods: {},
  randomUUID: () => 'test-id',
  resolvePointLike: (p: any) => ({ x: p?.x ?? p?.[0] ?? 0, y: p?.y ?? p?.[1] ?? 0 }),
  SignalConnections: class {},
}));
vi.mock('./CrunchPhysicsPlugin', () => ({ default: class {} }));
vi.mock('./System', () => ({ System: class {} }));

import { Sensor } from './Sensor';

type Box = { x: number; y: number; width: number; height: number };
const overlap = (a: Box, b: Box) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

function makeActor(x: number, y: number, size = 10) {
  return { x, y, width: size, height: size, active: true, collisionLayer: 1, collisionMask: 1, type: 'FX' };
}

/**
 * A Sensor with only the fields its movement + overlap code touches, in the style of
 * core's Button tests: no constructor chain, no app, no Pixi.
 */
function makeSensor(actors: ReturnType<typeof makeActor>[], system: Record<string, unknown> = {}) {
  const sensor = Object.create(Sensor.prototype) as any;
  const fakeSystem = {
    gravity: 900,
    maxVelocity: 400,
    getActorsByType: vi.fn(() => actors),
    aabbOverlap: (a: Box, b: Box) => overlap(a, b),
    ...system,
  };
  Object.defineProperty(sensor, 'system', { value: fakeSystem, configurable: true });
  Object.assign(sensor, {
    _x: 0,
    _y: 0,
    width: 48,
    height: 72,
    _xRemainder: 0,
    _yRemainder: 0,
    active: true,
    isStatic: false,
    velocity: { x: 0, y: 0 },
    collisionLayer: 1,
    collisionMask: 1,
    collidableTypes: ['FX'],
    type: 'Sensor',
    overlappingActors: new Set(),
    _currentOverlaps: new Set(),
    _currentSensorOverlaps: new Set(),
    _isRidingSolidCache: null,
  });
  sensor.getSolidsAt = () => [];
  sensor.isRidingSolid = () => false;
  sensor.updateView = () => undefined;
  sensor.onActorEnter = vi.fn();
  sensor.onActorExit = vi.fn();
  return { sensor, system: fakeSystem };
}

describe('Sensor', () => {
  it('caps fall speed at system.maxVelocity, exactly as Actor does', () => {
    const { sensor } = makeSensor([]);
    sensor.moveX = () => undefined;
    sensor.moveY = () => undefined;

    // 5 seconds of free fall at 60fps under gravity 900: uncapped, that is 4500 px/s and rising.
    for (let frame = 0; frame < 300; frame++) sensor.update(1 / 60);

    expect(sensor.velocity.y).toBe(400);
  });

  it('builds the actor list once per move, not once per pixel moved', () => {
    const farAway = Array.from({ length: 300 }, (_, i) => makeActor(5000 + i * 20, 5000));
    const { sensor, system } = makeSensor(farAway);

    sensor.moveY(60);

    expect(sensor.y).toBe(60);
    expect(system.getActorsByType).toHaveBeenCalledTimes(1);
  });

  it('still reports an actor it passes straight through mid-move (no tunnelling)', () => {
    // Sensor spans y 0..72 and moves down 200px. The actor sits at y 120..130: overlapped
    // partway through the move, left behind by the end of it.
    const inThePath = makeActor(10, 120);
    const { sensor } = makeSensor([inThePath, ...Array.from({ length: 50 }, (_, i) => makeActor(3000 + i * 20, 0))]);

    sensor.moveY(200);

    expect(sensor.onActorEnter).toHaveBeenCalledTimes(1);
    expect(sensor.onActorEnter).toHaveBeenCalledWith(inThePath);
    expect(sensor.onActorExit).toHaveBeenCalledTimes(1);
    expect(sensor.onActorExit).toHaveBeenCalledWith(inThePath);
  });

  it('reports an actor that was already overlapping and is left behind by a horizontal move', () => {
    const underneath = makeActor(10, 10);
    const { sensor } = makeSensor([underneath]);
    sensor.checkActorOverlaps();
    expect(sensor.onActorEnter).toHaveBeenCalledTimes(1);

    sensor.moveX(300);

    expect(sensor.onActorExit).toHaveBeenCalledTimes(1);
    expect(sensor.onActorExit).toHaveBeenCalledWith(underneath);
  });
});
