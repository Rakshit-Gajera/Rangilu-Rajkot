/**
 * Rapier heightfield data for a tile height grid (n × n, row 0 = south, 10 m spacing).
 * Rapier's field is centred on the body, rows run along +z (= south), columns along +x, column-major.
 */
export function heightfieldData(heights: Float32Array, n: number): Float32Array {
  const out = new Float32Array(n * n);
  for (let col = 0; col < n; col++) {
    for (let row = 0; row < n; row++) out[col * n + row] = heights[(n - 1 - row) * n + col];
  }
  return out;
}
