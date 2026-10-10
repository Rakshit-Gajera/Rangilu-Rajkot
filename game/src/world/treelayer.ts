import * as THREE from 'three';

/**
 * All street and park trees around the camera in two instanced meshes per species (PROMPT §8.4):
 * full models near the player (these cast shadows) and low-poly ones out to the tree radius.
 * Rebuilt from the loaded tiles when the player has moved or tiles changed — a few thousand matrix
 * copies, far cheaper than drawing every tile's trees (and their shadows) at full detail.
 */
export interface TreeSource {
  swx: number;
  swn: number;
  /** Per species: column-major 4×4 matrices, tile-local. */
  trees: Float32Array[];
}

class Layer {
  mesh: THREE.InstancedMesh;
  data: Float32Array;
  count = 0;

  constructor(private geo: THREE.BufferGeometry, private mat: THREE.Material, private root: THREE.Object3D,
    private cast: boolean, private receive: boolean) {
    this.data = new Float32Array(16 * 256);
    this.mesh = this.make();
  }

  private make() {
    const m = new THREE.InstancedMesh(this.geo, this.mat, this.data.length / 16);
    m.instanceMatrix = new THREE.InstancedBufferAttribute(this.data, 16);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false; // instances surround the camera; bounds would change on every rebuild
    m.castShadow = this.cast;
    m.receiveShadow = this.receive;
    m.matrixAutoUpdate = false;
    m.count = 0;
    this.root.add(m);
    return m;
  }

  begin() { this.count = 0; }

  push(src: Float32Array, o: number, dx: number, dz: number) {
    if ((this.count + 1) * 16 > this.data.length) {
      const bigger = new Float32Array(this.data.length * 2);
      bigger.set(this.data);
      this.data = bigger;
      this.root.remove(this.mesh);
      this.mesh.dispose();
      this.mesh = this.make();
    }
    const d = this.data, b = this.count * 16;
    for (let k = 0; k < 16; k++) d[b + k] = src[o + k];
    d[b + 12] += dx;
    d[b + 14] += dz;
    this.count++;
  }

  end() {
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.root.remove(this.mesh);
    this.mesh.dispose();
  }
}

export class TreeLayer {
  private hi: Layer[];
  private lo: Layer[];
  private last = { x: Infinity, z: Infinity, dx: 0, dz: 0 };
  private dirty = true;
  hiCount = 0;
  loCount = 0;

  constructor(hiGeos: THREE.BufferGeometry[], loGeos: THREE.BufferGeometry[], mat: THREE.Material,
    root: THREE.Object3D, shadows: boolean) {
    this.hi = hiGeos.map((g) => new Layer(g, mat, root, shadows, shadows));
    this.lo = loGeos.map((g) => new Layer(g, mat, root, false, shadows));
  }

  /** Tiles were added or removed. */
  invalidate() { this.dirty = true; }

  /**
   * Refresh if needed. (x, z): camera focus in three.js coordinates; hiR: full-detail radius; loR: tree radius.
   * (dx, dz): horizontal view direction (unit); distant trees behind the camera are skipped.
   */
  update(sources: Iterable<TreeSource>, x: number, z: number, hiR: number, loR: number, dx = 0, dz = 0) {
    const turned = dx * this.last.dx + dz * this.last.dz < 0.96; // ~16°
    if (!this.dirty && !turned && Math.hypot(x - this.last.x, z - this.last.z) < 12) return;
    this.dirty = false;
    this.last = { x, z, dx, dz };
    const all = dx === 0 && dz === 0;
    const COS = 0.34; // 70° either side: covers a wide screen plus the turn allowed before a refresh
    for (const l of this.hi) l.begin();
    for (const l of this.lo) l.begin();
    const hi2 = hiR * hiR, lo2 = loR * loR;
    for (const s of sources) {
      const ox = s.swx, oz = -s.swn;
      s.trees.forEach((m, sp) => {
        for (let o = 0; o < m.length; o += 16) {
          const tx = m[o + 12] + ox - x, tz = m[o + 14] + oz - z;
          const d2 = tx * tx + tz * tz;
          if (d2 <= hi2) this.hi[sp].push(m, o, ox, oz);
          else if (d2 <= lo2 && (all || tx * dx + tz * dz >= COS * Math.sqrt(d2))) this.lo[sp].push(m, o, ox, oz);
        }
      });
    }
    this.hiCount = 0;
    this.loCount = 0;
    for (const l of this.hi) { l.end(); this.hiCount += l.count; }
    for (const l of this.lo) { l.end(); this.loCount += l.count; }
  }

  dispose() {
    for (const l of [...this.hi, ...this.lo]) l.dispose();
  }
}
