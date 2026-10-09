import RAPIER from '@dimforge/rapier3d-compat';
import type { TileBuild } from '../gen/tile';

export type Rapier = typeof RAPIER;

/** Collision groups (PROMPT §9.1): membership << 16 | filter. */
export const GROUP_WORLD = 0x0001;
export const GROUP_PLAYER = 0x0002;
export const GROUP_VEHICLE = 0x0004;
export const groups = (member: number, filter: number) => (member << 16) | filter;

export class Physics {
  readonly world: RAPIER.World;
  private tileColliders = new Map<string, RAPIER.Collider[]>();

  private constructor(readonly R: Rapier) {
    this.world = new R.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = 1 / 60;
  }

  static async create(): Promise<Physics> {
    await RAPIER.init();
    return new Physics(RAPIER);
  }

  /** Static trimesh colliders for a tile's terrain, buildings and bridge decks. */
  addTile(b: TileBuild) {
    const R = this.R;
    const body = this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(b.swx, 0, -b.swn));
    const cols: RAPIER.Collider[] = [];
    const add = (pos: Float32Array, idx: Uint32Array) => {
      if (!idx.length) return;
      const d = R.ColliderDesc.trimesh(pos, idx).setCollisionGroups(groups(GROUP_WORLD, 0xffff)).setFriction(0.9);
      cols.push(this.world.createCollider(d, body));
    };
    add(b.terrain.position, b.terrain.index);
    add(b.buildings.collider.position, b.buildings.collider.index);
    add(b.roads.bridgeCollider.position, b.roads.bridgeCollider.index);
    this.tileColliders.set(b.key, cols);
  }

  removeTile(key: string) {
    const cols = this.tileColliders.get(key);
    if (!cols) return;
    const body = cols[0]?.parent();
    if (body) this.world.removeRigidBody(body);
    this.tileColliders.delete(key);
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
