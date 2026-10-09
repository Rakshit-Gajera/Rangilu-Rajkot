/** Growable typed-array geometry builder shared by generators (worker-safe, no three.js). */

export interface GeoBuf {
  position: Float32Array;
  normal: Float32Array;
  uv?: Float32Array;
  index: Uint32Array;
  /** Extra per-vertex attributes: name -> [data, itemSize]. */
  attrs: Record<string, [Float32Array, number]>;
}

class Grow {
  data: Float32Array;
  length = 0;
  constructor(cap = 1024) {
    this.data = new Float32Array(cap);
  }
  push(...v: number[]) {
    if (this.length + v.length > this.data.length) {
      const next = new Float32Array(Math.max(this.data.length * 2, this.length + v.length));
      next.set(this.data.subarray(0, this.length));
      this.data = next;
    }
    for (const x of v) this.data[this.length++] = x;
  }
  done() {
    return this.data.slice(0, this.length);
  }
}

class GrowU32 {
  data = new Uint32Array(1024);
  length = 0;
  push(...v: number[]) {
    if (this.length + v.length > this.data.length) {
      const next = new Uint32Array(Math.max(this.data.length * 2, this.length + v.length));
      next.set(this.data.subarray(0, this.length));
      this.data = next;
    }
    for (const x of v) this.data[this.length++] = x;
  }
  done() {
    return this.data.slice(0, this.length);
  }
}

export class Builder {
  private pos = new Grow();
  private nor = new Grow();
  private uvs = new Grow();
  private idx = new GrowU32();
  private extra: Record<string, { g: Grow; size: number }> = {};
  vertexCount = 0;

  constructor(private withUv = true, attrs: Record<string, number> = {}) {
    for (const [k, size] of Object.entries(attrs)) this.extra[k] = { g: new Grow(), size };
  }

  /** Add a vertex; returns its index. `attrs` must match the sizes given to the constructor. */
  vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, u = 0, v = 0,
    attrs?: Record<string, number[]>): number {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    if (this.withUv) this.uvs.push(u, v);
    for (const [k, e] of Object.entries(this.extra)) {
      const a = attrs?.[k];
      if (a) e.g.push(...a);
      else for (let q = 0; q < e.size; q++) e.g.push(0);
    }
    return this.vertexCount++;
  }

  tri(a: number, b: number, c: number) {
    this.idx.push(a, b, c);
  }

  quad(a: number, b: number, c: number, d: number) {
    this.idx.push(a, b, c, a, c, d);
  }

  get empty() {
    return this.vertexCount === 0;
  }

  build(): GeoBuf {
    const attrs: GeoBuf['attrs'] = {};
    for (const [k, e] of Object.entries(this.extra)) attrs[k] = [e.g.done(), e.size];
    return {
      position: this.pos.done(),
      normal: this.nor.done(),
      uv: this.withUv ? this.uvs.done() : undefined,
      index: this.idx.done(),
      attrs,
    };
  }
}

/** All transferable buffers of a GeoBuf (for postMessage). */
export function transferables(g: GeoBuf | null | undefined, out: ArrayBuffer[] = []): ArrayBuffer[] {
  if (!g) return out;
  out.push(g.position.buffer as ArrayBuffer, g.normal.buffer as ArrayBuffer, g.index.buffer as ArrayBuffer);
  if (g.uv) out.push(g.uv.buffer as ArrayBuffer);
  for (const [a] of Object.values(g.attrs)) out.push(a.buffer as ArrayBuffer);
  return out;
}
