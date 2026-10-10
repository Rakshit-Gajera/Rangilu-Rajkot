/** Decoder for `.rtile` v1 (see docs/RTILE.md). Pure; runs in workers and tests. */

export const USES = ['residential', 'mixed', 'commercial', 'industrial', 'religious', 'educational',
  'civic', 'healthcare', 'transport', 'other'] as const;

export interface Building {
  seed: number;
  levels: number;
  zone: number;
  use: number;
  shop: boolean;
  corner: boolean;
  sharedWalls: boolean;
  worship: number;
  height: number; // metres
  baseY: number; // metres (elevation - 100)
  palette: number;
  /** Outline x, n pairs in tile metres, counter-clockwise from above. */
  outline: Float32Array;
  /** Per edge: 0 back/side, 1 front, 2 shared wall. */
  edgeKinds: Uint8Array;
}

export interface RoadLine {
  rank: number;
  surface: number;
  lanes: number;
  oneway: boolean;
  bridge: boolean;
  tunnel: boolean;
  roundabout: boolean;
  width: number;
  layer: number;
  speed: number;
  name: number;
  /** x, n, y triples in tile metres. */
  points: Float32Array;
}

/** One class of ground cover / road surface: polygons with holes (v2 stores outlines, not triangles). */
export interface PolyEntry {
  code: number;
  level: number | null;
  /** polygons[p][ring] = x, n pairs in tile metres; ring 0 is the outline, the rest are holes. */
  polygons: Float32Array[][];
}

/** Triangulated form of a PolyEntry (built in workers by gen/polys.ts). */
export interface MeshEntry {
  code: number;
  level: number | null;
  /** x, n pairs in tile metres. */
  vertices: Float32Array;
  indices: Uint32Array;
}

/** A chowk/circle: island outline and its centrepiece (see pipeline/rajkot_bake/chowks.py). */
export interface Chowk {
  kind: number; // 0 garden, 1 fountain, 2 statue, 3 sculpture, 4 flag, 5 aircraft (MIG-27), 6 big tree
  subject: number; // statue: 1 Gandhi, 2 Indira Gandhi, 3 Vivekananda, 4 Hanuman, 5 Patel, 6 Ambedkar, 7 figure
  island: boolean; // false = a statue on its own plinth (not in a road)
  name: number;
  seed: number;
  x: number;
  n: number;
  y: number;
  /** Island outline x, n pairs (tile metres). */
  ring: Float32Array;
}

export const CHOWK_GARDEN = 0, CHOWK_FOUNTAIN = 1, CHOWK_STATUE = 2, CHOWK_SCULPTURE = 3, CHOWK_FLAG = 4,
  CHOWK_AIRCRAFT = 5, CHOWK_TREE = 6;

export interface Landmark {
  name: number;
  confidence: number;
  x: number;
  n: number;
}

export interface Tile {
  i: number;
  j: number;
  /** n × n heights in metres (y), row 0 = south, 10 m spacing. */
  heights: Float32Array;
  hn: number;
  buildings: Building[];
  roads: RoadLine[];
  roadSurfaces: PolyEntry[];
  areas: PolyEntry[];
  landmarks: Landmark[];
  chowks: Chowk[];
  trees: { x: Float32Array; n: Float32Array; species: Uint8Array; scale: Float32Array };
}

export const AREA_GRASS = 0;
export const AREA_WATER = 1;
export const AREA_SAND = 2;

class Reader {
  off: number;
  constructor(readonly dv: DataView, off: number) {
    this.off = off;
  }
  u8() { return this.dv.getUint8(this.off++); }
  i8() { return this.dv.getInt8(this.off++); }
  u16() { const v = this.dv.getUint16(this.off, true); this.off += 2; return v; }
  i16() { const v = this.dv.getInt16(this.off, true); this.off += 2; return v; }
  u32() { const v = this.dv.getUint32(this.off, true); this.off += 4; return v; }
  /** `count` int16 decimetres -> float metres. */
  dm(count: number): Float32Array {
    const out = new Float32Array(count);
    for (let k = 0; k < count; k++) out[k] = this.i16() / 10;
    return out;
  }
}

function polys(r: Reader, withLevel: (code: number) => boolean): PolyEntry[] {
  const n = r.u8();
  const out: PolyEntry[] = [];
  for (let e = 0; e < n; e++) {
    const code = r.u8();
    const level = withLevel(code) ? r.i16() / 10 : null;
    const np = r.u16();
    const polygons: Float32Array[][] = [];
    for (let p = 0; p < np; p++) {
      const nr = r.u8();
      const rings: Float32Array[] = [];
      for (let q = 0; q < nr; q++) rings.push(r.dm(r.u16() * 2));
      polygons.push(rings);
    }
    out.push({ code, level, polygons });
  }
  return out;
}

export function decodeTile(buf: ArrayBuffer, byteOffset = 0, byteLength = buf.byteLength - byteOffset): Tile {
  const dv = new DataView(buf, byteOffset, byteLength);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== 'RJKT') throw new Error(`bad tile magic ${magic}`);
  const version = dv.getUint16(4, true);
  if (version !== 2) throw new Error(`unsupported tile version ${version}`);
  const tile: Tile = {
    i: dv.getInt16(8, true), j: dv.getInt16(10, true), heights: new Float32Array(0), hn: 0,
    buildings: [], roads: [], roadSurfaces: [], areas: [], landmarks: [], chowks: [],
    trees: { x: new Float32Array(0), n: new Float32Array(0), species: new Uint8Array(0), scale: new Float32Array(0) },
  };
  const nsec = dv.getUint16(12, true);
  for (let s = 0; s < nsec; s++) {
    const t = 16 + s * 12;
    const tag = String.fromCharCode(dv.getUint8(t), dv.getUint8(t + 1), dv.getUint8(t + 2), dv.getUint8(t + 3));
    const r = new Reader(dv, dv.getUint32(t + 4, true));
    switch (tag) {
      case 'HGHT': {
        const n = r.u16();
        tile.hn = n;
        tile.heights = r.dm(n * n);
        break;
      }
      case 'BLDG': {
        const count = r.u32();
        for (let k = 0; k < count; k++) {
          const seed = r.u32();
          const levels = r.u8();
          const zone = r.u8();
          const use = r.u8();
          const flags = r.u8();
          const height = r.u16() / 10;
          const baseY = r.i16() / 10;
          const palette = r.u8();
          const worship = r.u8();
          const nv = r.u16();
          const outline = r.dm(nv * 2);
          const edgeKinds = new Uint8Array(nv);
          const nb = (nv + 3) >> 2;
          for (let b = 0; b < nb; b++) {
            const byte = r.u8();
            for (let q = 0; q < 4 && b * 4 + q < nv; q++) edgeKinds[b * 4 + q] = (byte >> (2 * q)) & 3;
          }
          tile.buildings.push({
            seed, levels, zone, use, shop: !!(flags & 1), corner: !!(flags & 2), sharedWalls: !!(flags & 4),
            worship, height, baseY, palette, outline, edgeKinds,
          });
        }
        break;
      }
      case 'RDLN': {
        const count = r.u32();
        for (let k = 0; k < count; k++) {
          const rank = r.u8();
          const surface = r.u8();
          const lanes = r.u8();
          const flags = r.u8();
          const width = r.u16() / 100;
          const layer = r.i8();
          const speed = r.u8();
          const name = r.u32();
          const np = r.u16();
          tile.roads.push({
            rank, surface, lanes, oneway: !!(flags & 1), bridge: !!(flags & 2), tunnel: !!(flags & 4),
            roundabout: !!(flags & 8), width, layer, speed, name, points: r.dm(np * 3),
          });
        }
        break;
      }
      case 'RDSF':
        tile.roadSurfaces = polys(r, () => false);
        break;
      case 'AREA':
        tile.areas = polys(r, (code) => code === AREA_WATER);
        break;
      case 'LMRK': {
        const count = r.u16();
        for (let k = 0; k < count; k++) {
          tile.landmarks.push({ name: r.u32(), confidence: r.u8(), x: r.i16() / 10, n: r.i16() / 10 });
        }
        break;
      }
      case 'TREE': {
        const count = r.u32();
        const t = { x: new Float32Array(count), n: new Float32Array(count), species: new Uint8Array(count), scale: new Float32Array(count) };
        for (let k = 0; k < count; k++) {
          t.x[k] = r.i16() / 10;
          t.n[k] = r.i16() / 10;
          t.species[k] = r.u8();
          t.scale[k] = r.u8() / 100;
        }
        tile.trees = t;
        break;
      }
      case 'CHWK': {
        const count = r.u16();
        for (let k = 0; k < count; k++) {
          const kind = r.u8(), subject = r.u8(), flags = r.u8(), name = r.u32(), seed = r.u32();
          const x = r.i16() / 10, n = r.i16() / 10, y = r.i16() / 10;
          const ring = r.dm(r.u16() * 2);
          tile.chowks.push({ kind, subject, island: !!(flags & 1), name, seed, x, n, y, ring });
        }
        break;
      }
      default:
        break; // unknown sections are skipped (forward compatible)
    }
  }
  return tile;
}

/** Bilinear terrain height (y, metres) at tile-local (x, n). */
export function heightAt(tile: Pick<Tile, 'heights' | 'hn'>, x: number, n: number, spacing = 10): number {
  const max = tile.hn - 1;
  const fx = Math.min(Math.max(x / spacing, 0), max);
  const fy = Math.min(Math.max(n / spacing, 0), max);
  const c0 = Math.min(Math.floor(fx), max - 1);
  const r0 = Math.min(Math.floor(fy), max - 1);
  const tx = fx - c0;
  const ty = fy - r0;
  const h = tile.heights;
  const a = h[r0 * tile.hn + c0], b = h[r0 * tile.hn + c0 + 1];
  const c = h[(r0 + 1) * tile.hn + c0], d = h[(r0 + 1) * tile.hn + c0 + 1];
  // Same triangle split as the terrain mesh (diagonal from south-west to north-east corner),
  // so anything draped with this sits exactly on the rendered ground.
  return tx >= ty ? a + (b - a) * tx + (d - b) * ty : a + (c - a) * ty + (d - c) * tx;
}
