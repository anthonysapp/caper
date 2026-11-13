import type { Ticker } from 'pixi.js';

type Resource = { destroy(): void };
type Player = { destroyed: boolean; update(ticker: Ticker): void };

export class Owned3D {
  private readonly geometries = new Map<string, Resource>();
  private readonly materials = new Set<Resource>();
  private readonly players = new Set<Player>();

  /** One geometry per kind per view: bounded, and meshes that share a geometry can batch. */
  geometry<T extends Resource>(kind: string, build: () => T): T {
    if (!this.geometries.has(kind)) this.geometries.set(kind, build());
    return this.geometries.get(kind) as T;
  }

  material<T extends Resource>(material: T): T {
    this.materials.add(material);
    return material;
  }

  player<T extends Player>(player: T): T {
    this.players.add(player);
    return player;
  }

  update(ticker: Ticker): void {
    for (const player of this.players) {
      if (player.destroyed) this.players.delete(player);
      else player.update(ticker);
    }
  }

  destroy(): void {
    for (const resource of [...this.geometries.values(), ...this.materials]) resource.destroy();
    this.geometries.clear();
    this.materials.clear();
    this.players.clear();
  }
}
