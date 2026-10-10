import { buildFarTile, buildTile, farTransferables, tileTransferables } from '../gen/tile';

export type Lod = 'near' | 'far';

export interface BuildRequest {
  id: number;
  buf: ArrayBuffer;
  tileSize: number;
  lod: Lod;
}

const ctx = self as unknown as {
  onmessage: (e: MessageEvent<BuildRequest>) => void;
  postMessage: (msg: unknown, transfer?: Transferable[]) => void;
};

ctx.onmessage = (e: MessageEvent<BuildRequest>) => {
  const { id, buf, tileSize, lod } = e.data;
  try {
    if (lod === 'far') {
      const build = buildFarTile(buf, 0, buf.byteLength, tileSize);
      ctx.postMessage({ id, build }, farTransferables(build));
    } else {
      const build = buildTile(buf, 0, buf.byteLength, tileSize);
      ctx.postMessage({ id, build }, tileTransferables(build));
    }
  } catch (err) {
    ctx.postMessage({ id, error: String(err) });
  }
};
