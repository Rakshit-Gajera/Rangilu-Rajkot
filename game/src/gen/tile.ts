import { decodeTile, type Tile } from '../world/rtile';
import { buildingMeshes, type BuildingMeshes } from './buildings';
import { transferables, type GeoBuf } from './geobuf';
import { areaMeshes, roadMeshes, type AreaMeshes, type RoadMeshes } from './roads';
import { terrainMesh } from './terrain';

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
  /** Road centrelines for the minimap: per road [rank, ...x, n pairs] in world metres (x, n). */
  minimapRoads: Float32Array[];
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
  const minimapRoads = tile.roads.filter((r) => !r.tunnel).map((r) => {
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
    roads.bridges, areas.grass, areas.water, areas.sand];
  const triangles = geos.reduce((s, g) => s + g.index.length / 3, 0);
  return {
    key: `${tile.i},${tile.j}`, i: tile.i, j: tile.j, swx, swn, heights: tile.heights, hn: tile.hn,
    terrain, buildings, roads, areas, minimapRoads,
    landmarks: tile.landmarks.map((l) => ({ name: l.name, x: swx + l.x, n: swn + l.n })),
    stats: { buildings: tile.buildings.length, triangles, ms: performance.now() - t0 },
  };
}

export function tileTransferables(b: TileBuild): ArrayBuffer[] {
  const out: ArrayBuffer[] = [b.heights.buffer as ArrayBuffer];
  for (const g of [b.terrain, b.buildings.walls, b.buildings.roofs, b.buildings.props, b.roads.surfaces,
    b.roads.markings, b.roads.bridges, b.areas.grass, b.areas.water, b.areas.sand]) transferables(g, out);
  for (const c of [b.buildings.collider, b.roads.bridgeCollider]) out.push(c.position.buffer as ArrayBuffer, c.index.buffer as ArrayBuffer);
  for (const r of b.minimapRoads) out.push(r.buffer as ArrayBuffer);
  return out;
}
