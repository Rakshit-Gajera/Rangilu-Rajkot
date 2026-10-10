import type * as RAPIER from '@dimforge/rapier3d';
import type { TileBuild } from '../gen/tile';
import { heightfieldData } from './heightfield';

export { heightfieldData };

export type Rapier = typeof RAPIER;

/** Collision groups (PROMPT §9.1): membership << 16 | filter. */
export const GROUP_WORLD = 0x0001;
export const GROUP_PLAYER = 0x0002;
export const GROUP_VEHICLE = 0x0004;
export const groups = (member: number, filter: number) => (member << 16) | filter;

/** Which sides of a tile have no neighbour (the edge of the playable world). */
export interface OpenSides { w: boolean; e: boolean; s: boolean; n: boolean }

interface TileColliders {
  body: RAPIER.RigidBody;
  /** Collider creation steps still to run (spread over frames to avoid hitches). */
  todo: (() => void)[];
}

const TRIS_PER_CHUNK = 1500;

/** Split a triangle mesh into compact chunks of at most `maxTris` triangles. */
export function chunkTrimesh(pos: Float32Array, idx: Uint32Array, maxTris = TRIS_PER_CHUNK): [Float32Array, Uint32Array][] {
  const out: [Float32Array, Uint32Array][] = [];
  for (let t0 = 0; t0 < idx.length; t0 += maxTris * 3) {
    const sub = idx.subarray(t0, Math.min(idx.length, t0 + maxTris * 3));
    const remap = new Map<number, number>();
    const verts: number[] = [];
    const local = new Uint32Array(sub.length);
    for (let k = 0; k < sub.length; k++) {
      let v = remap.get(sub[k]);
      if (v === undefined) {
        v = remap.size;
        remap.set(sub[k], v);
        verts.push(pos[3 * sub[k]], pos[3 * sub[k] + 1], pos[3 * sub[k] + 2]);
      }
      local[k] = v;
    }
    out.push([new Float32Array(verts), local]);
  }
  return out;
}

export class Physics {
  readonly world: RAPIER.World;
  private tiles = new Map<string, TileColliders>();
  /** Keys with collider work left, oldest first. */
  private queue: string[] = [];

  private constructor(readonly R: Rapier) {
    this.world = new R.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = 1 / 60;
  }

  /** Loads the physics engine (its WASM is a separate download, fetched in parallel with the world). */
  static async create(): Promise<Physics> {
    const R = await import('@dimforge/rapier3d');
    return new Physics(R);
  }

  hasTile(key: string) {
    return this.tiles.has(key);
  }

  /** All of the tile's colliders exist. */
  tileReady(key: string) {
    const t = this.tiles.get(key);
    return !!t && t.todo.length === 0;
  }

  get tileCount() {
    return this.tiles.size;
  }

  get pending() {
    return this.queue.length;
  }

  /**
   * Queue static colliders for a tile: heightfield terrain first (cheap, so you can stand on the tile
   * immediately), invisible walls at the world's edge, then buildings and bridge decks in small chunks.
   */
  addTile(b: TileBuild, open: OpenSides) {
    if (this.tiles.has(b.key)) return;
    const R = this.R;
    const body = this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(b.swx, 0, -b.swn));
    const todo: (() => void)[] = [];
    const group = groups(GROUP_WORLD, 0xffff);
    const span = (b.hn - 1) * 10;
    const hf = heightfieldData(b.heights, b.hn);
    todo.push(() => this.world.createCollider(
      R.ColliderDesc.heightfield(b.hn - 1, b.hn - 1, hf, { x: span, y: 1, z: span })
        .setTranslation(span / 2, 0, -span / 2).setCollisionGroups(group).setFriction(0.9), body));
    const wall = (hx: number, hz: number, cx: number, cz: number) => todo.push(() => this.world.createCollider(
      R.ColliderDesc.cuboid(hx, 400, hz).setTranslation(cx, 0, cz).setCollisionGroups(group), body));
    if (open.w) wall(1, span / 2, -1, -span / 2);
    if (open.e) wall(1, span / 2, span + 1, -span / 2);
    if (open.s) wall(span / 2, 1, span / 2, 1);
    if (open.n) wall(span / 2, 1, span / 2, -span - 1);
    for (const [pos, idx] of [
      ...chunkTrimesh(b.buildings.collider.position, b.buildings.collider.index),
      ...chunkTrimesh(b.roads.bridgeCollider.position, b.roads.bridgeCollider.index),
    ]) {
      todo.push(() => this.world.createCollider(R.ColliderDesc.trimesh(pos, idx).setCollisionGroups(group).setFriction(0.9), body));
    }
    this.tiles.set(b.key, { body, todo });
    this.queue.push(b.key);
  }

  /** Run queued collider steps for up to `budgetMs` (at least one step). */
  pump(budgetMs: number) {
    const t0 = performance.now();
    while (this.queue.length) {
      const t = this.tiles.get(this.queue[0]);
      if (!t || !t.todo.length) {
        this.queue.shift();
        continue;
      }
      t.todo.shift()!();
      if (performance.now() - t0 >= budgetMs) break;
    }
  }

  removeTile(key: string) {
    const t = this.tiles.get(key);
    if (!t) return;
    this.world.removeRigidBody(t.body);
    this.tiles.delete(key);
  }

  /** Ground height under (x, z) by ray cast, or null. */
  groundAt(x: number, z: number, fromY = 500): number | null {
    const ray = new this.R.Ray({ x, y: fromY, z }, { x: 0, y: -1, z: 0 });
    const hit = this.world.castRay(ray, 2000, true, undefined, GROUP_WORLD << 16 | GROUP_WORLD);
    return hit ? fromY - hit.timeOfImpact : null;
  }

  step() {
    this.world.step();
  }
}
