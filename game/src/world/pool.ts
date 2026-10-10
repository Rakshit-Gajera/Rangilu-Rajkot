import type { FarBuild } from '../gen/far';
import type { TileBuild } from '../gen/tile';
import type { Lod } from './worker';

type Result = TileBuild | FarBuild;
type Pending = { resolve: (b: Result) => void; reject: (e: Error) => void };

/** Fixed pool of tile-generation workers: clamp(cores − 1, 2, 4) (PROMPT §8.2). */
export class WorkerPool {
  private idle: Worker[] = [];
  private queue: { id: number; buf: ArrayBuffer; lod: Lod }[] = [];
  private pending = new Map<number, Pending>();
  private running = new Map<Worker, number>();
  private nextId = 1;
  readonly size: number;

  constructor(private tileSize: number, size = Math.min(Math.max((navigator.hardwareConcurrency || 4) - 1, 2), 4)) {
    this.size = size;
    for (let k = 0; k < size; k++) this.idle.push(this.spawn());
  }

  private spawn(): Worker {
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e) => this.done(w, e.data);
    // A crashed worker fails its job and is replaced, so no request hangs forever.
    w.onerror = (e) => {
      e.preventDefault();
      const id = this.running.get(w);
      this.running.delete(w);
      w.terminate();
      if (id !== undefined) this.done(null, { id, error: `worker crashed: ${e.message}` });
      this.idle.push(this.spawn());
      this.pump();
    };
    return w;
  }

  build(buf: ArrayBuffer, lod: 'near'): Promise<TileBuild>;
  build(buf: ArrayBuffer, lod: 'far'): Promise<FarBuild>;
  build(buf: ArrayBuffer, lod: Lod): Promise<Result> {
    const id = this.nextId++;
    const p = new Promise<Result>((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.queue.push({ id, buf, lod });
    this.pump();
    return p;
  }

  private pump() {
    while (this.idle.length && this.queue.length) {
      const w = this.idle.pop()!;
      const job = this.queue.shift()!;
      this.running.set(w, job.id);
      w.postMessage({ id: job.id, buf: job.buf, tileSize: this.tileSize, lod: job.lod }, [job.buf]);
    }
  }

  private done(w: Worker | null, msg: { id: number; build?: Result; error?: string }) {
    const p = this.pending.get(msg.id);
    this.pending.delete(msg.id);
    if (w) {
      this.running.delete(w);
      this.idle.push(w);
    }
    if (p) msg.error ? p.reject(new Error(msg.error)) : p.resolve(msg.build!);
    this.pump();
  }

  /** Jobs queued or running. */
  get busy() {
    return this.queue.length + this.running.size;
  }
}
