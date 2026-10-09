import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';

export const WORLD = resolve(import.meta.dirname, '../../world');
export const hasWorld = existsSync(resolve(WORLD, 'manifest.json'));

/** Manifest and a loader returning [buffer, offset, length] for a tile key (packs are gzipped). */
export function openWorld() {
  const manifest = JSON.parse(readFileSync(resolve(WORLD, 'manifest.json'), 'utf8'));
  const cache = new Map<string, ArrayBuffer>();
  const tile = (key: string): [ArrayBuffer, number, number] => {
    const [file, off, len] = manifest.tiles[key] as [string, number, number];
    if (!cache.has(file)) {
      let buf = readFileSync(resolve(WORLD, 'packs', file));
      if (file.endsWith('.gz')) buf = gunzipSync(buf);
      cache.set(file, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    }
    return [cache.get(file)!, off, len];
  };
  return { manifest, tile };
}
