/** City road graph from world/map.json.gz: map drawing + GPS routing (PROMPT §9.8). */

export interface MapData {
  version: number;
  nodes: number[];
  edges: { a: number[]; b: number[]; rank: number[]; flags: number[]; name: number[]; len: number[]; start: number[]; width?: number[] };
  pts: number[];
  labels: { t: string; gu: string | null; x: number; n: number; kind: string; id?: string }[];
  bounds: [number, number, number, number];
  playable: number[][];
  /** Every roundabout island centre [x, n] (newer maps). */
  chowks?: number[][];
}

export const ONEWAY = 1;
export const BRIDGE = 2;
const MIN_ROUTE_RANK = 2; // service roads and above (tracks are drawn, not routed)
const CELL = 100; // node grid for nearest-node queries, metres

class Heap {
  private k: number[] = [];
  private v: number[] = [];
  get size() { return this.k.length; }
  push(key: number, val: number) {
    const k = this.k, v = this.v;
    let i = k.length;
    k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop(): number {
    const k = this.k, v = this.v;
    const top = v[0];
    const lk = k.pop()!, lv = v.pop()!;
    if (k.length) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= k.length) break;
        if (c + 1 < k.length && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[i] = k[c]; v[i] = v[c]; i = c;
      }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
}

/** Distance from (x, n) to a flat [x, n, ...] polyline. */
export function distanceToPolyline(x: number, n: number, pts: number[]): number {
  let best = Infinity;
  for (let q = 0; q + 3 < pts.length; q += 2) {
    const ax = pts[q], an = pts[q + 1], dx = pts[q + 2] - ax, dn = pts[q + 3] - an;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (n - an) * dn) / (dx * dx + dn * dn || 1)));
    best = Math.min(best, Math.hypot(x - ax - t * dx, n - an - t * dn));
  }
  return best;
}

export class RoadGraph {
  readonly nodeCount: number;
  /** Adjacency (CSR): for node u, entries adjStart[u]..adjStart[u+1] hold [edge, forward?]. */
  private adjStart: Int32Array;
  private adjEdge: Int32Array;
  private adjFwd: Uint8Array;
  /** 1 if the node touches at least one road at ground level (not a bridge or flyover). */
  private onGround: Uint8Array;
  /** 1 if the node is in the largest connected part of the routable network. */
  private main: Uint8Array;
  /** Nodes bucketed by 100 m cell (only routable nodes in the main part). */
  private grid = new Map<number, number[]>();

  constructor(readonly data: MapData) {
    const e = data.edges;
    this.nodeCount = data.nodes.length / 2;
    const deg = new Int32Array(this.nodeCount + 1);
    const routable = (k: number) => e.rank[k] >= MIN_ROUTE_RANK;
    for (let k = 0; k < e.a.length; k++) {
      if (!routable(k)) continue;
      deg[e.a[k]]++;
      if (!(e.flags[k] & ONEWAY)) deg[e.b[k]]++;
    }
    this.onGround = new Uint8Array(this.nodeCount);
    for (let k = 0; k < e.a.length; k++) {
      if (!(e.flags[k] & BRIDGE)) { this.onGround[e.a[k]] = 1; this.onGround[e.b[k]] = 1; }
    }
    // Connected parts of the routable network (ignoring one-way), so GPS never snaps to an isolated stub.
    const parent = new Int32Array(this.nodeCount).map((_, k) => k);
    const find = (u: number): number => { while (parent[u] !== u) { parent[u] = parent[parent[u]]; u = parent[u]; } return u; };
    for (let k = 0; k < e.a.length; k++) if (routable(k)) parent[find(e.a[k])] = find(e.b[k]);
    const size = new Map<number, number>();
    for (let u = 0; u < this.nodeCount; u++) { const r = find(u); size.set(r, (size.get(r) ?? 0) + 1); }
    let mainRoot = -1, best = 0;
    for (const [r, n] of size) if (n > best) { best = n; mainRoot = r; }
    this.main = new Uint8Array(this.nodeCount);
    for (let u = 0; u < this.nodeCount; u++) this.main[u] = find(u) === mainRoot ? 1 : 0;
    this.adjStart = new Int32Array(this.nodeCount + 1);
    for (let u = 0; u < this.nodeCount; u++) this.adjStart[u + 1] = this.adjStart[u] + deg[u];
    const fill = this.adjStart.slice(0, this.nodeCount);
    this.adjEdge = new Int32Array(this.adjStart[this.nodeCount]);
    this.adjFwd = new Uint8Array(this.adjStart[this.nodeCount]);
    for (let k = 0; k < e.a.length; k++) {
      if (!routable(k)) continue;
      let s = fill[e.a[k]]++;
      this.adjEdge[s] = k; this.adjFwd[s] = 1;
      if (!(e.flags[k] & ONEWAY)) {
        s = fill[e.b[k]]++;
        this.adjEdge[s] = k; this.adjFwd[s] = 0;
      }
    }
    const nd = data.nodes;
    for (let u = 0; u < this.nodeCount; u++) {
      if (this.adjStart[u + 1] === this.adjStart[u] || !this.main[u]) continue;
      const key = cellKey(Math.floor(nd[2 * u] / CELL), Math.floor(nd[2 * u + 1] / CELL));
      let b = this.grid.get(key);
      if (!b) this.grid.set(key, (b = []));
      b.push(u);
    }
  }

  /** Carriageway width of edge k in metres (older maps without widths: a guess from the road rank). */
  width(k: number): number {
    const w = this.data.edges.width;
    if (w) return w[k] / 10;
    const r = this.data.edges.rank[k];
    return r >= 7 ? 12 : r >= 6 ? 9 : r >= 5 ? 7 : r >= 3 ? 5 : 4;
  }

  static async load(url: string): Promise<RoadGraph> {
    const r = await fetch(url);
    if (!r.ok || !r.body) throw new Error(`map ${url}: ${r.status}`);
    const body = url.endsWith('.gz') ? r.body.pipeThrough(new DecompressionStream('gzip')) : r.body;
    return new RoadGraph(await new Response(body).json());
  }

  /** Routable edges leaving node u: [edge, forward] pairs (one-way streets only forward). */
  outgoing(u: number): [number, boolean][] {
    const out: [number, boolean][] = [];
    for (let q = this.adjStart[u]; q < this.adjStart[u + 1]; q++) out.push([this.adjEdge[q], !!this.adjFwd[q]]);
    return out;
  }

  private cumCache = new Map<number, Float32Array>();

  /** Cumulative length along an edge's polyline (forward direction), cached. */
  cumulative(k: number): Float32Array {
    let c = this.cumCache.get(k);
    if (!c) {
      const e = this.data.edges, p = this.data.pts;
      const n = e.start[k + 1] - e.start[k];
      c = new Float32Array(n);
      for (let q = 1; q < n; q++) {
        const a = 2 * (e.start[k] + q - 1);
        c[q] = c[q - 1] + Math.hypot(p[a + 2] - p[a], p[a + 3] - p[a + 1]);
      }
      if (this.cumCache.size > 20000) this.cumCache.clear();
      this.cumCache.set(k, c);
    }
    return c;
  }

  /** Point and unit direction at distance s along edge k (forward or reversed). */
  pointAt(k: number, forward: boolean, s: number): { x: number; n: number; dx: number; dn: number } {
    const e = this.data.edges, p = this.data.pts;
    const c = this.cumulative(k);
    const L = c[c.length - 1];
    const sf = Math.min(Math.max(forward ? s : L - s, 0), L);
    let q = 1;
    while (q < c.length - 1 && c[q] < sf) q++;
    const a = 2 * (e.start[k] + q - 1);
    const seg = c[q] - c[q - 1] || 1;
    const t = (sf - c[q - 1]) / seg;
    let dx = (p[a + 2] - p[a]) / seg, dn = (p[a + 3] - p[a + 1]) / seg;
    if (!forward) { dx = -dx; dn = -dn; }
    return { x: p[a] + (p[a + 2] - p[a]) * t, n: p[a + 1] + (p[a + 3] - p[a + 1]) * t, dx, dn };
  }

  edgeLength(k: number): number {
    const c = this.cumulative(k);
    return c[c.length - 1];
  }

  nodeXY(u: number): [number, number] {
    return [this.data.nodes[2 * u], this.data.nodes[2 * u + 1]];
  }

  /** Nearest routable node to (x, n) in the main network: grid rings outwards, then a full scan as a fallback. */
  nearestNode(x: number, n: number, groundOnly = false): number {
    const nd = this.data.nodes;
    const cx = Math.floor(x / CELL), cn = Math.floor(n / CELL);
    let best = -1, bd = Infinity;
    for (let ring = 0; ring <= 30; ring++) {
      // Every node in ring r is at least (r − 1) cells away: stop once nothing closer can remain.
      if (best >= 0 && ((ring - 1) * CELL) ** 2 > bd) break;
      for (let i = -ring; i <= ring; i++) {
        for (let j = -ring; j <= ring; j++) {
          if (Math.max(Math.abs(i), Math.abs(j)) !== ring) continue;
          const b = this.grid.get(cellKey(cx + i, cn + j));
          if (!b) continue;
          for (const u of b) {
            if (groundOnly && !this.onGround[u]) continue;
            const d = (nd[2 * u] - x) ** 2 + (nd[2 * u + 1] - n) ** 2;
            if (d < bd) { bd = d; best = u; }
          }
        }
      }
    }
    if (best >= 0) return best;
    for (const b of this.grid.values()) {
      for (const u of b) {
        if (groundOnly && !this.onGround[u]) continue;
        const d = (nd[2 * u] - x) ** 2 + (nd[2 * u + 1] - n) ** 2;
        if (d < bd) { bd = d; best = u; }
      }
    }
    return best;
  }

  /** Polyline of an edge in travel direction. */
  edgePoints(k: number, forward: boolean): number[] {
    const e = this.data.edges, p = this.data.pts;
    const out = p.slice(2 * e.start[k], 2 * e.start[k + 1]);
    if (forward) return out;
    const rev: number[] = [];
    for (let i = out.length - 2; i >= 0; i -= 2) rev.push(out[i], out[i + 1]);
    return rev;
  }

  /**
   * A* route from (x0, n0) to (x1, n1) respecting one-way streets.
   * Returns a flat [x, n, ...] polyline (metres from the origin) and its length, or null.
   */
  route(x0: number, n0: number, x1: number, n1: number): { points: number[]; length: number } | null {
    const s = this.nearestNode(x0, n0), t = this.nearestNode(x1, n1);
    if (s < 0 || t < 0) return null;
    const [tx, tn] = this.nodeXY(t);
    const g = new Float64Array(this.nodeCount).fill(Infinity);
    const via = new Int32Array(this.nodeCount).fill(-1);
    const viaFwd = new Uint8Array(this.nodeCount);
    const done = new Uint8Array(this.nodeCount);
    const h = (u: number) => Math.hypot(this.data.nodes[2 * u] - tx, this.data.nodes[2 * u + 1] - tn);
    const heap = new Heap();
    g[s] = 0;
    heap.push(h(s), s);
    const e = this.data.edges;
    while (heap.size) {
      const u = heap.pop();
      if (done[u]) continue;
      if (u === t) break;
      done[u] = 1;
      for (let q = this.adjStart[u]; q < this.adjStart[u + 1]; q++) {
        const k = this.adjEdge[q], fwd = this.adjFwd[q];
        const v = fwd ? e.b[k] : e.a[k];
        // Slight preference for bigger roads, like a local would ride.
        const cost = (e.len[k] / 10) * (e.rank[k] >= 6 ? 0.85 : e.rank[k] >= 4 ? 0.95 : 1.1);
        const ng = g[u] + cost;
        if (ng < g[v]) {
          g[v] = ng; via[v] = k; viaFwd[v] = fwd;
          heap.push(ng + h(v) * 0.85, v);
        }
      }
    }
    if (!Number.isFinite(g[t])) return null;
    const edges: [number, boolean][] = [];
    for (let v = t; v !== s; ) {
      const k = via[v];
      edges.push([k, !!viaFwd[v]]);
      v = viaFwd[v] ? e.a[k] : e.b[k];
    }
    edges.reverse();
    const points: number[] = [];
    let length = 0;
    for (const [k, fwd] of edges) {
      const p = this.edgePoints(k, fwd);
      points.push(...(points.length ? p.slice(2) : p));
      length += e.len[k] / 10;
    }
    if (!points.length) points.push(...this.nodeXY(s));
    return { points, length };
  }
}

function cellKey(i: number, j: number) {
  return (i + 32768) * 65536 + (j + 32768);
}
