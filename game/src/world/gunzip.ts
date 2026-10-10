/**
 * Read a fetched .gz file as plain bytes, whatever the server did: some hosts send .gz files with
 * `Content-Encoding: gzip` (the browser has already inflated them), others as raw gzip (we inflate).
 * Decided by the gzip magic number, not the file name.
 */
export async function readMaybeGzip(r: Response): Promise<ArrayBuffer> {
  const buf = await r.arrayBuffer();
  const b = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
  if (b.length < 2 || b[0] !== 0x1f || b[1] !== 0x8b) return buf;
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}
