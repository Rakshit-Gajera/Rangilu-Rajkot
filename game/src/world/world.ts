import * as THREE from 'three';
import type { FarBuild } from '../gen/far';
import type { GeoBuf } from '../gen/geobuf';
import type { TileBuild } from '../gen/tile';
import type { Physics } from '../physics/physics';
import {
  facadeMaterial, farMaterial, lampMaterial, lightPoolMaterial, grassMaterial, roadMaterial, sandMaterial, vertexColorMaterial, waterMaterial,
} from '../render/materials';
import { N_SPECIES, GULMOHAR, treeModel } from '../gen/trees';
import { TreeLayer } from './treelayer';
import { readMaybeGzip } from './gunzip';
import { signAtlas, signMaterial } from '../render/signAtlas';
import { WorkerPool } from './pool';
import { heightAt } from './rtile';

export interface Manifest {
  version: number;
  tileSize: number;
  yOffset: number;
  tiles: Record<string, [string, number, number]>;
  strings: string;
  spawn: { x: number; z: number; heading: number };
  slice: [number, number, number, number] | null;
  map?: string;
}

/** Streaming distances in metres from the tile edge (PROMPT §8.3; Low preset halves them). */
export interface StreamConfig {
  near: number; // full detail (LOD0/1)
  far: number; // merged low-detail mesh (LOD2)
  props: number; // rooftop props and lane markings
  trees: number; // street and park trees
  colliders: number; // physics colliders (PROMPT §9.1: ~300 m)
}

interface NearTile {
  build: TileBuild;
  group: THREE.Group;
  detail: THREE.Mesh[]; // hidden beyond `props`
  pending: number; // meshes not shown yet
}

interface FarTile {
  build: FarBuild;
  mesh: THREE.Mesh;
}

type Lod = 'near' | 'far';
type Point = { x: number; n: number };

const HYSTERESIS = 250;
const PACK_CACHE = 32;
/** Uploads per frame: one near tile (MBs of geometry) or a few far ones, so the GPU never gets a burst. */
const NEAR_UPLOADS_PER_FRAME = 1;
const FAR_UPLOADS_PER_FRAME = 3;

/**
 * Streams the city around the player (PROMPT §8.2): fetch gzipped region packs → workers generate
 * near or far tiles → meshes are uploaded a little per frame; tiles are evicted with hysteresis,
 * and colliders exist only close to the player and to any parked vehicle.
 */
export class World {
  readonly root = new THREE.Group();
  /** Near (full-detail) tiles by key. */
  readonly tiles = new Map<string, NearTile>();
  readonly farTiles = new Map<string, FarTile>();
  strings: string[] = [];
  private keys: { key: string; swx: number; swn: number }[];
  /** Builds requested and not yet added (or rejected): "lod:key" -> promise. Prevents duplicate work. */
  private jobs = new Map<string, Promise<TileBuild | FarBuild>>();
  private running = 0;
  private packs = new Map<string, Promise<ArrayBuffer>>();
  private pool: WorkerPool;
  private uploads: (TileBuild | FarBuild)[] = [];
  private focus: Point = { x: 0, n: 0 };
  private anchors: Point[] = [];
  private lastPlan = -1;
  private lastPlanPos = { x: Infinity, n: Infinity };
  failures = 0;
  /** Worst time (ms) per update section since the last reset (performance probes). */
  readonly worst = { plan: 0, uploads: 0, colliders: 0 };
  /** Tiles wanted but not yet requested at the last plan. */
  private backlog = 0;
  private mats = {
    facade: facadeMaterial(),
    roof: vertexColorMaterial({ roughness: 0.95 }),
    props: vertexColorMaterial({ roughness: 0.7 }),
    terrain: vertexColorMaterial({ roughness: 1 }),
    road: roadMaterial(),
    marking: vertexColorMaterial({ roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
    bridge: vertexColorMaterial({ roughness: 0.85 }),
    grass: grassMaterial(),
    water: waterMaterial(),
    sand: sandMaterial(),
    far: farMaterial(),
    lamps: lampMaterial(),
    pool: lightPoolMaterial(),
    tree: vertexColorMaterial({ roughness: 0.95 }),
  };

  /** Every loaded tree, near ones in full detail (PROMPT §8.4). */
  private treeLayer: TreeLayer;

  constructor(readonly manifest: Manifest, private base: string, private physics: Physics, private shadows: boolean,
    public config: StreamConfig, month = new Date().getMonth()) {
    // Gulmohar flowers flame-red in May and June (PROMPT §3.4, §8.7).
    const bloom = month === 4 || month === 5;
    for (const [k, m] of Object.entries(this.mats)) m.name = k; // for debug breakdowns
    const treeGeos = (lo: boolean) => Array.from({ length: N_SPECIES }, (_, k) => {
      const g = toGeometry(treeModel(k, k === GULMOHAR && bloom, lo), false);
      g.userData.shared = true;
      return g;
    });
    this.treeLayer = new TreeLayer(treeGeos(false), treeGeos(true), this.mats.tree, this.root, shadows);
    this.pool = new WorkerPool(manifest.tileSize);
    const ts = manifest.tileSize;
    this.keys = Object.keys(manifest.tiles).map((key) => {
      const [i, j] = key.split(',').map(Number);
      return { key, swx: i * ts, swn: j * ts };
    });
  }

  static async load(base: string, physics: Physics, shadows: boolean, config: StreamConfig): Promise<World> {
    const manifest: Manifest = await (await fetch(`${base}/manifest.json`)).json();
    const w = new World(manifest, base, physics, shadows, config);
    w.strings = await (await fetch(`${base}/${manifest.strings}`)).json();
    return w;
  }

  /** Distance (m) from a point to a tile's square (0 inside). */
  private dist(t: { swx: number; swn: number }, x: number, n: number) {
    const ts = this.manifest.tileSize;
    const dx = Math.max(t.swx - x, 0, x - (t.swx + ts));
    const dn = Math.max(t.swn - n, 0, n - (t.swn + ts));
    return Math.hypot(dx, dn);
  }

  /** Distance to the nearest point that needs colliders (the player and any parked vehicle). */
  private anchorDist(t: { swx: number; swn: number }) {
    let d = this.dist(t, this.focus.x, this.focus.n);
    for (const a of this.anchors) d = Math.min(d, this.dist(t, a.x, a.n));
    return d;
  }

  /** Load full-detail tiles and their colliders around (x, z) and wait for them (boot / fast travel). */
  async ensure(x: number, z: number, radius: number, onProgress?: (done: number, total: number) => void) {
    const n = -z;
    // Move the streaming focus first, so the tiles we are about to load count as wanted.
    this.focus = { x, n };
    this.lastPlan = -1;
    const want = this.keys.filter((t) => this.dist(t, x, n) <= radius).map((t) => t.key);
    let done = 0;
    await Promise.all(want.map(async (k) => {
      if (!this.tiles.has(k)) {
        try {
          this.addNear((await this.request(k, 'near')) as TileBuild);
        } catch (e) {
          this.failures++;
          console.warn(e);
        }
      }
      onProgress?.(++done, want.length);
    }));
    this.reveal(Infinity); // loading screen / teleport fade: show everything at once
    this.syncColliders();
    this.physics.pump(Infinity);
  }

  /**
   * Per-frame streaming step. (x, z) is where the player is, (vx, vz) their velocity; `anchors` are
   * other points that need ground under them (a parked scooter).
   */
  update(x: number, z: number, vx = 0, vz = 0, budgetMs = 4, anchors: { x: number; z: number }[] = []) {
    const t0 = performance.now();
    // Prioritise where the player will be in ~3 s (PROMPT §8.2).
    const px = x + vx * 3, pn = -(z + vz * 3);
    this.focus = { x, n: -z };
    this.anchors = anchors.map((a) => ({ x: a.x, n: -a.z }));
    const moved = Math.hypot(px - this.lastPlanPos.x, pn - this.lastPlanPos.n);
    const hungry = this.backlog > 0 && this.running < this.pool.size * 2;
    if (moved > 20 || t0 - this.lastPlan > 500 || hungry) {
      this.plan(px, pn);
      this.worst.plan = Math.max(this.worst.plan, performance.now() - t0);
      this.lastPlan = t0;
      this.lastPlanPos = { x: px, n: pn };
    }
    const tu = performance.now();
    let near = 0, far = 0;
    for (let k = 0; k < this.uploads.length && performance.now() - t0 < budgetMs; ) {
      const b = this.uploads[k];
      const isFar = 'mesh' in b;
      if (isFar ? far >= FAR_UPLOADS_PER_FRAME : near >= NEAR_UPLOADS_PER_FRAME) { k++; continue; }
      this.uploads.splice(k, 1);
      if (isFar) { this.addFar(b); far++; } else { this.addNear(b); near++; }
    }
    this.worst.uploads = Math.max(this.worst.uploads, performance.now() - tu);
    const tc = performance.now();
    this.reveal(fixedBudget(budgetMs));
    this.syncColliders();
    this.physics.pump(Math.max(0.5, budgetMs - (performance.now() - t0)));
    this.worst.colliders = Math.max(this.worst.colliders, performance.now() - tc);
    this.syncDetail();
  }

  private plan(px: number, pn: number) {
    const c = this.config;
    const candidates: { key: string; d: number; lod: Lod }[] = [];
    for (const t of this.keys) {
      const d = this.dist(t, px, pn);
      const dn = Math.min(d, this.dist(t, this.focus.x, this.focus.n));
      // Evict with hysteresis. A near tile only goes once its far mesh is ready, so no holes appear.
      if (this.tiles.has(t.key) && dn > c.near + HYSTERESIS && (this.farTiles.has(t.key) || dn > c.far)) {
        this.removeNear(t.key);
      }
      if (this.farTiles.has(t.key) && dn > c.far + HYSTERESIS) this.removeFar(t.key);
      if (d <= c.near && !this.tiles.has(t.key)) candidates.push({ key: t.key, d, lod: 'near' });
      // Every tile in range also gets a far mesh (after the near work), ready for when it leaves near range.
      if (d <= c.far && !this.farTiles.has(t.key)) {
        candidates.push({ key: t.key, d: this.tiles.has(t.key) || d <= c.near ? d + c.far : d, lod: 'far' });
      }
    }
    candidates.sort((a, b) => a.d - b.d);
    const limit = this.pool.size * 2;
    let waiting = 0;
    for (const cand of candidates) {
      if (this.jobs.has(`${cand.lod}:${cand.key}`)) continue;
      if (this.running >= limit) {
        waiting++;
        continue;
      }
      this.request(cand.key, cand.lod).then((b) => this.uploads.push(b), () => {});
    }
    this.backlog = waiting;
  }

  /** Start (or join) a build. The job stays registered until the tile is added or rejected. */
  private request(key: string, lod: Lod): Promise<TileBuild | FarBuild> {
    const id = `${lod}:${key}`;
    let job = this.jobs.get(id);
    if (job) return job;
    this.running++;
    job = (async () => {
      try {
        const [file, off, len] = this.manifest.tiles[key];
        const pack = await this.pack(file);
        const buf = pack.slice(off, off + len);
        return lod === 'near' ? await this.pool.build(buf, 'near') : await this.pool.build(buf, 'far');
      } finally {
        this.running--;
      }
    })();
    job.catch((e) => {
      this.jobs.delete(id);
      this.failures++;
      console.warn(e);
    });
    this.jobs.set(id, job);
    return job;
  }

  private async pack(file: string): Promise<ArrayBuffer> {
    let p = this.packs.get(file);
    if (p) {
      this.packs.delete(file); // LRU: move to the end
      this.packs.set(file, p);
      return p;
    }
    p = fetch(`${this.base}/packs/${file}`).then(async (r) => {
      if (!r.ok) throw new Error(`pack ${file}: ${r.status}`);
      return readMaybeGzip(r);
    });
    p.catch(() => this.packs.delete(file)); // allow a retry later
    this.packs.set(file, p);
    while (this.packs.size > PACK_CACHE) this.packs.delete(this.packs.keys().next().value!);
    return p;
  }

  private wanted(t: { swx: number; swn: number }, radius: number) {
    return this.anchorDist(t) <= radius + HYSTERESIS;
  }

  private addNear(b: TileBuild) {
    this.jobs.delete(`near:${b.key}`);
    if (this.tiles.has(b.key) || !this.wanted(b, this.config.near)) return;
    const g = new THREE.Group();
    g.name = `tile ${b.key}`;
    g.position.set(b.swx, 0, -b.swn);
    const m = this.mats;
    const detail: THREE.Mesh[] = [];
    const add = (geo: GeoBuf, mat: THREE.Material, cast: boolean, isDetail = false, uvName = 'fuv') => {
      if (!geo.index.length) return;
      const mesh = new THREE.Mesh(toGeometry(geo, true, uvName), mat);
      mesh.castShadow = cast && this.shadows;
      mesh.receiveShadow = this.shadows;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      // Shown a few meshes per frame (see reveal()): the GPU upload happens on first draw.
      mesh.visible = false;
      mesh.userData.pending = true;
      this.revealQueue.push({ mesh, key: b.key, verts: geo.position.length / 3 });
      pending++;
      g.add(mesh);
      if (isDetail) detail.push(mesh);
    };
    let pending = 0;
    add(b.terrain, m.terrain, false);
    add(b.areas.grass, m.grass, false);
    add(b.areas.sand, m.sand, false);
    add(b.areas.water, m.water, false);
    add(b.roads.surfaces, m.road, false);
    add(b.roads.markings, m.marking, false, true);
    add(b.roads.bridges, m.bridge, true);
    add(b.buildings.walls, m.facade, true);
    add(b.buildings.roofs, m.roof, true);
    // Small detail (rooftop tanks, poles) casts no shadow: cheap to skip, hard to miss.
    add(b.buildings.props, m.props, false, true);
    add(b.chowks.solid, m.props, true);
    add(b.chowks.deco, m.props, true);
    add(b.chowks.lamps, m.lamps, false);
    add(b.furniture.solid, m.props, false, true);
    add(b.furniture.lamps, m.lamps, false);
    add(b.furniture.pools, m.pool, false, false, 'uv');
    if (b.signs.specs.length) {
      const tex = signAtlas(b.signs.specs);
      const mat = signMaterial(tex);
      add(b.signs.mesh, mat, false, true, 'uv');
      g.userData.dispose = () => { tex.dispose(); mat.dispose(); };
    }
    g.updateMatrixWorld(true);
    this.root.add(g);
    // The GPU copies are all we need now; drop the CPU-side render arrays (colliders keep their own).
    for (const geo of [b.terrain, b.areas.grass, b.areas.sand, b.areas.water, b.roads.surfaces, b.roads.markings,
      b.roads.bridges, b.buildings.walls, b.buildings.roofs, b.buildings.props, b.chowks.solid, b.chowks.deco,
      b.chowks.lamps, b.furniture.solid, b.furniture.lamps, b.furniture.pools, b.signs.mesh]) releaseGeoBuf(geo);
    this.tiles.set(b.key, { build: b, group: g, detail, pending });
    this.treeLayer.invalidate();
    if (!pending) this.revealed(b.key);
  }

  /** Meshes waiting for their first draw, oldest first. */
  private revealQueue: { mesh: THREE.Mesh; key: string; verts: number }[] = [];

  /**
   * Show queued meshes within a per-frame vertex budget, so a new tile's GPU upload is spread over a few
   * frames instead of one hitch. The far mesh under a tile is hidden only once all of it is visible.
   */
  private reveal(budget: number) {
    let used = 0;
    while (this.revealQueue.length && (used === 0 || used + this.revealQueue[0].verts <= budget)) {
      const { mesh, key, verts } = this.revealQueue.shift()!;
      used += verts;
      mesh.userData.pending = false;
      mesh.visible = true; // detail meshes are re-checked by syncDetail() right after
      const t = this.tiles.get(key);
      if (t && --t.pending === 0) this.revealed(key);
    }
  }

  private revealed(key: string) {
    const far = this.farTiles.get(key);
    if (far) far.mesh.visible = false;
  }

  private addFar(b: FarBuild) {
    this.jobs.delete(`far:${b.key}`);
    if (this.farTiles.has(b.key) || !this.wanted(b, this.config.far)) return;
    const mesh = new THREE.Mesh(toGeometry(b.mesh), this.mats.far);
    releaseGeoBuf(b.mesh);
    mesh.position.set(b.swx, 0, -b.swn);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.receiveShadow = false;
    mesh.visible = this.tiles.get(b.key)?.pending !== 0; // hidden only under a fully shown near tile
    this.root.add(mesh);
    this.farTiles.set(b.key, { build: b, mesh });
  }

  private removeNear(key: string) {
    const t = this.tiles.get(key);
    if (!t) return;
    this.physics.removeTile(key);
    disposeTree(t.group);
    t.group.userData.dispose?.();
    this.root.remove(t.group);
    this.tiles.delete(key);
    this.revealQueue = this.revealQueue.filter((q) => q.key !== key);
    this.treeLayer.invalidate();
    const far = this.farTiles.get(key);
    if (far) far.mesh.visible = true;
  }

  private removeFar(key: string) {
    const t = this.farTiles.get(key);
    if (!t) return;
    t.mesh.geometry.dispose();
    this.root.remove(t.mesh);
    this.farTiles.delete(key);
  }

  /** Queue colliders for near tiles close to the player or a parked vehicle; drop distant ones. */
  private syncColliders() {
    for (const [key, t] of this.tiles) {
      const d = this.anchorDist(t.build);
      const has = this.physics.hasTile(key);
      if (!has && d <= this.config.colliders) {
        const { i, j } = t.build;
        const open = (di: number, dj: number) => !(`${i + di},${j + dj}` in this.manifest.tiles);
        this.physics.addTile(t.build, { w: open(-1, 0), e: open(1, 0), s: open(0, -1), n: open(0, 1) });
      } else if (has && d > this.config.colliders + 200) {
        this.physics.removeTile(key);
      }
    }
  }

  /** Horizontal camera direction (three.js x, z), for skipping distant detail behind the camera. */
  viewDir = { x: 0, z: 0 };

  private *treeSources() {
    for (const t of this.tiles.values()) yield { swx: t.build.swx, swn: t.build.swn, trees: t.build.trees };
  }

  /** LOD0 vs LOD1: props and lane markings only close to the player. */
  /** Places shown in full detail whatever the preset (e.g. the player's home neighbourhood). */
  detailZones: { x: number; n: number; r: number }[] = [];

  private inZone(x: number, n: number, pad = 0) {
    return this.detailZones.some((z) => Math.hypot(z.x - x, z.n - n) <= z.r + pad);
  }

  private syncDetail() {
    for (const t of this.tiles.values()) {
      const d = this.dist(t.build, this.focus.x, this.focus.n);
      const zone = this.detailZones.some((z) => this.dist(t.build, z.x, z.n) <= z.r);
      for (const m of t.detail) if (!m.userData.pending) m.visible = d <= this.config.props || (zone && d <= Math.max(this.config.props, 900));
    }
    const trees = this.config.trees;
    const hiR = this.inZone(this.focus.x, this.focus.n) ? 220 : Math.min(160, Math.max(70, this.config.props * 0.45));
    this.treeLayer.update(this.treeSources(), this.focus.x, -this.focus.n, hiR, trees, this.viewDir.x, this.viewDir.z);
  }

  private keyAt(x: number, z: number) {
    const ts = this.manifest.tileSize;
    return `${Math.floor(x / ts)},${Math.floor(-z / ts)}`;
  }

  /** Terrain height (y) at world (x, z) from loaded tiles, ignoring buildings; null if not loaded. */
  terrainAt(x: number, z: number): number | null {
    const key = this.keyAt(x, z);
    const t = this.tiles.get(key)?.build ?? this.farTiles.get(key)?.build;
    if (!t) return null;
    return heightAt(t, x - t.swx, -z - t.swn);
  }

  /** Whether the tile under (x, z) has all its colliders. */
  readyAt(x: number, z: number): boolean {
    return this.physics.tileReady(this.keyAt(x, z));
  }

  /** Whether (x, z) is inside the playable world. */
  isTile(x: number, z: number): boolean {
    return this.keyAt(x, z) in this.manifest.tiles;
  }

  stats() {
    let triangles = 0, buildings = 0;
    for (const t of this.tiles.values()) {
      triangles += t.build.stats.triangles;
      buildings += t.build.stats.buildings;
    }
    let farTriangles = 0;
    for (const t of this.farTiles.values()) if (t.mesh.visible) farTriangles += t.build.stats.triangles;
    return {
      tiles: this.tiles.size, farTiles: this.farTiles.size, colliders: this.physics.tileCount, triangles,
      farTriangles, buildings, queued: this.jobs.size + this.uploads.length + this.backlog + this.physics.pending,
      packs: this.packs.size, failures: this.failures, treesNear: this.treeLayer.hiCount, treesFar: this.treeLayer.loCount,
    };
  }
}

/** Replace a GeoBuf's arrays with empty ones once three.js owns copies of them. */
function releaseGeoBuf(g: GeoBuf) {
  const empty = new Float32Array(0);
  g.position = empty;
  g.normal = empty;
  g.uv = g.uv ? empty : undefined;
  g.index = new Uint32Array(0);
  g.attrs = {};
}

function disposeTree(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    if ((m as THREE.InstancedMesh).isInstancedMesh) (m as THREE.InstancedMesh).dispose();
    if (!m.geometry.userData.shared) m.geometry.dispose();
  });
}

/** BufferGeometry whose CPU arrays are dropped right after the first GPU upload. */
/** `uvName`: our shaders read world-metre UVs as `fuv`; textured standard materials need `uv`. */
function toGeometry(g: GeoBuf, dropAfterUpload = true, uvName = 'fuv'): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const attr = (data: Float32Array | Uint32Array, size: number) => {
    const a = new THREE.BufferAttribute(data, size);
    if (dropAfterUpload) a.onUpload(function (this: THREE.BufferAttribute) {
      this.array = new (this.array.constructor as Float32ArrayConstructor)(0);
    });
    return a;
  };
  geo.setAttribute('position', attr(g.position, 3));
  geo.setAttribute('normal', attr(g.normal, 3));
  if (g.uv) geo.setAttribute(uvName, attr(g.uv, 2));
  for (const [name, [data, size]] of Object.entries(g.attrs)) geo.setAttribute(name, attr(data, size));
  geo.setIndex(attr(g.index, 1));
  geo.computeBoundingSphere();
  return geo;
}

/** Vertices shown per frame: ~200k normally (a typical tile in 2–4 frames), unlimited for test views. */
function fixedBudget(budgetMs: number) {
  return budgetMs > 20 ? Infinity : 200_000;
}
