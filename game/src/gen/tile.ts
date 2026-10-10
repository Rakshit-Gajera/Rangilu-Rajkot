import { decodeTile, type Tile } from '../world/rtile';
import { buildingMeshes, type BuildingMeshes } from './buildings';
import { transferables, type GeoBuf } from './geobuf';
import { areaMeshes, roadMeshes, type AreaMeshes, type RoadMeshes } from './roads';
import { chowkMeshes, type ChowkMeshes } from './chowks';
import { farMesh, type FarBuild } from './far';
import { furnitureMeshes, type FurnitureMeshes } from './furniture';
import { terrainMesh } from './terrain';
import { treeInstances, type TreeInstances } from './trees';

/** Everything the main thread needs to show and collide with one tile. */
export interface TileBuild {
  key: string;
  i: number;
  j: number;
  /** Tile south-west corner relative to the origin: x east, n north (metres). */
  swx: number;
  swn: number;
  heights: Float32Array;
  hn: number;
  terrain: GeoBuf;
  buildings: BuildingMeshes;
  roads: RoadMeshes;
  areas: AreaMeshes;
  chowks: ChowkMeshes;
  furniture: FurnitureMeshes;
  /** Instance matrices per tree species. */
  trees: TreeInstances;
  /** Road centrelines for the minimap: per road [rank, ...x, n pairs] in world metres (x, n). */
  minimapRoads: Float32Array[];
  /** strings.json index per minimap road (0xFFFFFFFF = unnamed). */
  minimapRoadNames: number[];
  landmarks: { name: number; x: number; n: number }[];
  stats: { buildings: number; triangles: number; ms: number };
}

export function buildTile(buf: ArrayBuffer, off: number, len: number, tileSize: number): TileBuild {
  const t0 = performance.now();
  const tile: Tile = decodeTile(buf, off, len);
  const swx = tile.i * tileSize, swn = tile.j * tileSize;
  const terrain = terrainMesh(tile);
  const buildings = buildingMeshes(tile);
  const roads = roadMeshes(tile, swx, swn);
  const areas = areaMeshes(tile, swx, swn);
  const chowks = chowkMeshes(tile);
  const trees = treeInstances(tile);
  const furniture = furnitureMeshes(tile);
  buildings.collider = concatMesh(buildings.collider, furniture.collider);
  // Chowk kerbs, plinths and statues are solid: append them to the building collider.
  buildings.collider = concatMesh(buildings.collider, chowks.solid);
  const shown = tile.roads.filter((r) => !r.tunnel);
  const minimapRoadNames = shown.map((r) => r.name);
  const minimapRoads = shown.map((r) => {
    const n = r.points.length / 3;
    const out = new Float32Array(1 + 2 * n);
    out[0] = r.rank;
    for (let k = 0; k < n; k++) {
      out[1 + 2 * k] = swx + r.points[3 * k];
      out[2 + 2 * k] = swn + r.points[3 * k + 1];
    }
    return out;
  });
  const geos = [terrain, buildings.walls, buildings.roofs, buildings.props, roads.surfaces, roads.markings,
    roads.bridges, areas.grass, areas.water, areas.sand, chowks.solid, chowks.deco, chowks.lamps,
    furniture.solid, furniture.lamps];
  // Generators write vertex colours as sRGB; three.js shades in linear space.
  for (const g of geos) {
    const c = g.attrs.color?.[0];
    if (c) for (let k = 0; k < c.length; k++) c[k] = Math.pow(c[k], 2.2);
  }
  const triangles = geos.reduce((s, g) => s + g.index.length / 3, 0);
  return {
    key: `${tile.i},${tile.j}`, i: tile.i, j: tile.j, swx, swn, heights: tile.heights, hn: tile.hn,
    terrain, buildings, roads, areas, chowks, furniture, trees, minimapRoads, minimapRoadNames,
    landmarks: tile.landmarks.map((l) => ({ name: l.name, x: swx + l.x, n: swn + l.n })),
    stats: { buildings: tile.buildings.length, triangles, ms: performance.now() - t0 },
  };
}

export function tileTransferables(b: TileBuild): ArrayBuffer[] {
  const out: ArrayBuffer[] = [b.heights.buffer as ArrayBuffer];
  for (const g of [b.terrain, b.buildings.walls, b.buildings.roofs, b.buildings.props, b.roads.surfaces,
    b.roads.markings, b.roads.bridges, b.areas.grass, b.areas.water, b.areas.sand, b.chowks.solid, b.chowks.deco,
    b.chowks.lamps, b.furniture.solid, b.furniture.lamps]) transferables(g, out);
  for (const c of [b.buildings.collider, b.roads.bridgeCollider]) out.push(c.position.buffer as ArrayBuffer, c.index.buffer as ArrayBuffer);
  for (const r of b.minimapRoads) out.push(r.buffer as ArrayBuffer);
  for (const t of b.trees) out.push(t.buffer as ArrayBuffer);
  return out;
}

export function buildFarTile(buf: ArrayBuffer, off: number, len: number, tileSize: number): FarBuild {
  const t0 = performance.now();
  const tile = decodeTile(buf, off, len);
  const mesh = farMesh(tile);
  return {
    key: `${tile.i},${tile.j}`, i: tile.i, j: tile.j, swx: tile.i * tileSize, swn: tile.j * tileSize,
    heights: tile.heights, hn: tile.hn, mesh,
    stats: { triangles: mesh.index.length / 3, ms: performance.now() - t0 },
  };
}

export function farTransferables(b: FarBuild): ArrayBuffer[] {
  return transferables(b.mesh, [b.heights.buffer as ArrayBuffer]);
}

function concatMesh(a: { position: Float32Array; index: Uint32Array }, b: { position: Float32Array; index: Uint32Array }) {
  if (!b.index.length) return a;
  const position = new Float32Array(a.position.length + b.position.length);
  position.set(a.position);
  position.set(b.position, a.position.length);
  const index = new Uint32Array(a.index.length + b.index.length);
  index.set(a.index);
  const off = a.position.length / 3;
  for (let k = 0; k < b.index.length; k++) index[a.index.length + k] = b.index[k] + off;
  return { position, index };
}
