import type { RoadGraph } from '../world/roadgraph';
import { drawArrow, drawPin, drawRoads, drawRoute, EdgeIndex, toScreen, toWorld, type View } from './mapdraw';

export interface MapCallbacks {
  /** Player position (x east, n north) and heading (radians, 0 = north, clockwise). */
  player: () => { x: number; n: number; heading: number };
  onWaypoint: (x: number, n: number) => void;
  onClearWaypoint: () => void;
  onFastTravel: (x: number, n: number) => void;
  /** Private home (this machine only), if known. */
  home?: { x: number; n: number } | null;
  /** Road names (world/strings.json), for street labels when zoomed in. */
  strings?: string[];
}

const MIN_SCALE = 0.012, MAX_SCALE = 8; // pixels per metre
const MARGIN = 0.35; // the cached road layer extends this fraction beyond the screen on each side

interface Box { x0: number; y0: number; x1: number; y1: number }
const overlaps = (a: Box, list: Box[]) => list.some((b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0);

/**
 * Full-screen city map (M): pan, smooth zoom (wheel, pinch, + / −), labels, waypoint, teleport (PROMPT §3.5, §9.8).
 * Roads are drawn once into an off-screen layer a bit larger than the screen; panning just slides that image,
 * and it is redrawn only after zooming settles or when you pan past its edge — so the map stays smooth.
 */
export class CityMap {
  readonly index: EdgeIndex;
  private root: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private view: View = { cx: 0, cn: 0, scale: 0.12, rot: 0, w: 1, h: 1 };
  private targetScale = 0.12;
  private zoomAt: [number, number] | null = null;
  private layer = document.createElement('canvas');
  private layerView: View | null = null;
  private layerTimer = 0;
  private frame = 0;
  private pointers = new Map<number, { x: number; y: number }>();
  private drag: { x: number; y: number; cx: number; cn: number; moved: boolean } | null = null;
  private pinch: { d: number; scale: number } | null = null;
  private lastTap = 0;
  private roadNames: { k: number; name: string }[] = [];
  waypoint: { x: number; n: number } | null = null;
  route: number[] | null = null;
  routeLength = 0;
  open = false;

  constructor(readonly graph: RoadGraph, private cb: MapCallbacks) {
    this.index = new EdgeIndex(graph);
    this.root = document.createElement('div');
    this.root.id = 'citymap';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="map-stage"><canvas></canvas>
        <div class="map-zoom"><button data-z="in" aria-label="Zoom in">+</button><button data-z="out" aria-label="Zoom out">−</button>
          <button data-z="me" aria-label="Centre on me">◎</button></div>
        <button class="map-close" aria-label="Close map">✕</button>
        <button class="map-panel-toggle">Places ▾</button>
      </div>
      <aside>
        <h2>Rajkot <span lang="gu">રાજકોટ</span></h2>
        <p class="hint">Drag to move · scroll or pinch to zoom · tap to set a waypoint<br>
          <b>Double-click / double-tap</b> or <b>F</b> to teleport there · <b>Del</b> clear · <b>M</b>/<b>Esc</b> close</p>
        <div class="map-buttons"><button id="map-go" disabled>Teleport to waypoint</button>
          ${cb.home ? '<button id="map-home">Go home</button>' : ''}</div>
        <p id="map-route"></p>
        <h3>Places</h3>
        <ul id="map-places"></ul>
      </aside>`;
    document.body.appendChild(this.root);
    this.canvas = this.root.querySelector('canvas')!;
    this.ctx = this.canvas.getContext('2d')!;
    // Street names: one label per named main road, on its longest pieces.
    if (cb.strings) {
      const e = graph.data.edges;
      for (let k = 0; k < e.a.length; k++) {
        if (e.name[k] >= 0 && e.rank[k] >= 4 && e.len[k] > 900) this.roadNames.push({ k, name: cb.strings[e.name[k]] ?? '' });
      }
      this.roadNames.sort((a, b) => e.rank[b.k] - e.rank[a.k] || e.len[b.k] - e.len[a.k]);
    }
    const list = this.root.querySelector('#map-places')!;
    const places = graph.data.labels.filter((l) => l.kind === 'landmark').sort((a, b) => a.t.localeCompare(b.t));
    for (const l of places) {
      const li = document.createElement('li');
      li.textContent = l.t;
      li.onclick = () => {
        this.view.cx = l.x;
        this.view.cn = l.n;
        this.targetScale = this.view.scale = Math.max(this.view.scale, 0.6);
        this.setWaypoint(l.x, l.n);
        this.root.classList.remove('panel-open');
      };
      list.appendChild(li);
    }
    this.bindPointer();
    this.root.querySelectorAll<HTMLButtonElement>('.map-zoom button').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.z === 'me') {
        const p = this.cb.player();
        this.view.cx = p.x;
        this.view.cn = p.n;
        this.targetScale = Math.max(this.targetScale, 0.6);
      } else this.zoomBy(b.dataset.z === 'in' ? 2 : 0.5, null);
      this.requestDraw();
    }));
    this.root.querySelector('.map-close')!.addEventListener('click', () => this.toggle(false));
    this.root.querySelector('.map-panel-toggle')!.addEventListener('click', () => this.root.classList.toggle('panel-open'));
    this.root.querySelector('#map-go')!.addEventListener('click', () => this.travel());
    this.root.querySelector('#map-home')?.addEventListener('click', () => {
      if (!cb.home) return;
      this.setWaypoint(cb.home.x, cb.home.n);
      this.travel();
    });
    addEventListener('resize', () => { this.layerView = null; this.requestDraw(); });
  }

  private local(e: { clientX: number; clientY: number }): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  private bindPointer() {
    const cv = this.canvas;
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), scale: this.view.scale };
        this.drag = null;
      } else this.drag = { x: e.clientX, y: e.clientY, cx: this.view.cx, cn: this.view.cn, moved: false };
    });
    cv.addEventListener('pointermove', (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pinch && this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const mid = this.local({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
        this.setScaleAround(this.pinch.scale * (d / this.pinch.d), mid);
        this.targetScale = this.view.scale;
        this.requestDraw();
        return;
      }
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 5) this.drag.moved = true;
      this.view.cx = this.drag.cx - dx / this.view.scale;
      this.view.cn = this.drag.cn + dy / this.view.scale;
      this.requestDraw();
    });
    const up = (e: PointerEvent) => {
      const wasPinch = !!this.pinch;
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      if (this.drag && !this.drag.moved && !wasPinch) {
        const [x, n] = toWorld(this.view, ...this.local(e));
        const now = performance.now();
        this.setWaypoint(x, n);
        // Double tap / double click: teleport there.
        if (now - this.lastTap < 350) this.travel();
        this.lastTap = now;
      }
      this.drag = null;
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomBy(Math.exp(-e.deltaY * 0.0018), this.local(e));
    }, { passive: false });
  }

  /** Smooth zoom towards a factor, anchored at a screen point (or the centre). */
  private zoomBy(f: number, at: [number, number] | null) {
    this.targetScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this.targetScale * f));
    this.zoomAt = at;
    this.requestDraw();
  }

  private setScaleAround(scale: number, at: [number, number] | null) {
    scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
    const p = at ?? [this.view.w / 2, this.view.h / 2];
    const [wx, wn] = toWorld(this.view, p[0], p[1]);
    this.view.scale = scale;
    const [ax, an] = toWorld(this.view, p[0], p[1]);
    this.view.cx += wx - ax;
    this.view.cn += wn - an;
  }

  private travel() {
    if (!this.waypoint) return;
    this.cb.onFastTravel(this.waypoint.x, this.waypoint.n);
    this.toggle(false);
  }

  setWaypoint(x: number, n: number) {
    this.waypoint = { x, n };
    (this.root.querySelector('#map-go') as HTMLButtonElement).disabled = false;
    this.cb.onWaypoint(x, n);
    this.requestDraw();
  }

  clearWaypoint() {
    this.waypoint = null;
    this.route = null;
    (this.root.querySelector('#map-go') as HTMLButtonElement).disabled = true;
    this.cb.onClearWaypoint();
    this.requestDraw();
  }

  setRoute(points: number[] | null, length: number) {
    this.route = points;
    this.routeLength = length;
    const el = this.root.querySelector('#map-route')!;
    el.textContent = points ? `Route: ${(length / 1000).toFixed(1)} km` : this.waypoint ? 'No route to the waypoint' : '';
    this.requestDraw();
  }

  toggle(force?: boolean) {
    this.open = force ?? !this.open;
    this.root.hidden = !this.open;
    if (this.open) {
      const p = this.cb.player();
      this.view.cx = p.x;
      this.view.cn = p.n;
      this.layerView = null;
      if (document.pointerLockElement) document.exitPointerLock();
      this.requestDraw();
    }
  }

  /** Keys while the map is open. Returns true if handled. */
  key(code: string): boolean {
    if (!this.open) return false;
    if (code === 'KeyM' || code === 'Escape') this.toggle(false);
    else if (code === 'KeyF' && this.waypoint) this.travel();
    else if (code === 'Delete' || code === 'Backspace') this.clearWaypoint();
    else return false;
    return true;
  }

  /** Draw on the next animation frame (many input events become one draw). */
  requestDraw() {
    if (!this.open || this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.draw(); });
  }

  /** Back-compat for callers that want an immediate redraw. */
  draw() {
    if (!this.open) return;
    // Smooth zoom: ease towards the target scale.
    if (Math.abs(this.view.scale - this.targetScale) > this.targetScale * 0.002) {
      this.setScaleAround(this.view.scale + (this.targetScale - this.view.scale) * 0.3, this.zoomAt);
      this.requestDraw();
    }
    const dpr = Math.min(devicePixelRatio, 2);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.layerView = null;
    }
    this.view.w = w;
    this.view.h = h;
    const c = this.ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = '#141210';
    c.fillRect(0, 0, w, h);
    // The road layer: reuse it while it still covers the view at this zoom; rebuild once zooming settles.
    const L = this.layerView;
    const zooming = Math.abs(this.view.scale - this.targetScale) > this.targetScale * 0.002;
    const covered = L && Math.abs(L.cx - this.view.cx) * L.scale < w * MARGIN * 0.95 && Math.abs(L.cn - this.view.cn) * L.scale < h * MARGIN * 0.95;
    if (!L || (!zooming && (L.scale !== this.view.scale || !covered))) {
      clearTimeout(this.layerTimer);
      if (!L || !covered || !zooming) this.buildLayer(w, h, dpr);
    }
    const LV = this.layerView!;
    const k = this.view.scale / LV.scale;
    const lw = LV.w * k, lh = LV.h * k;
    const [ox, oy] = toScreen(this.view, LV.cx, LV.cn);
    c.drawImage(this.layer, ox - lw / 2, oy - lh / 2, lw, lh);
    if (zooming) {
      clearTimeout(this.layerTimer);
      this.layerTimer = window.setTimeout(() => this.requestDraw(), 140);
    }
    drawRoute(c, this.view, this.route, 5);
    this.drawLabels(c, w, h);
    if (this.cb.home) {
      const [hx, hy] = toScreen(this.view, this.cb.home.x, this.cb.home.n);
      c.fillStyle = '#f59e0b';
      c.beginPath();
      c.moveTo(hx, hy - 11); c.lineTo(hx + 9, hy - 3); c.lineTo(hx + 6, hy - 3); c.lineTo(hx + 6, hy + 6);
      c.lineTo(hx - 6, hy + 6); c.lineTo(hx - 6, hy - 3); c.lineTo(hx - 9, hy - 3);
      c.closePath();
      c.fill();
      this.text(c, 'Home', hx, hy - 20, '700 13px "Noto Sans", sans-serif', '#ffd28a');
    }
    if (this.waypoint) drawPin(c, ...toScreen(this.view, this.waypoint.x, this.waypoint.n));
    const p = this.cb.player();
    drawArrow(c, ...toScreen(this.view, p.x, p.n), p.heading, 11);
    // Scale bar.
    const metres = [50, 100, 200, 500, 1000, 2000, 5000, 10000].find((m) => m * this.view.scale > 70) ?? 10000;
    const px = metres * this.view.scale;
    c.fillStyle = 'rgba(20,18,16,0.7)';
    c.fillRect(12, h - 34, px + 16, 24);
    c.fillStyle = '#e7e5e4';
    c.fillRect(20, h - 18, px, 3);
    c.font = '600 11px "Noto Sans", sans-serif';
    c.textAlign = 'left';
    c.fillText(metres >= 1000 ? `${metres / 1000} km` : `${metres} m`, 20, h - 25);
  }

  /** Render roads (and the playable area) into the off-screen layer around the current view. */
  private buildLayer(w: number, h: number, dpr: number) {
    const lw = Math.round(w * (1 + 2 * MARGIN)), lh = Math.round(h * (1 + 2 * MARGIN));
    // Keep the layer modest on phones.
    const ldpr = Math.min(dpr, lw * lh * dpr * dpr > 9e6 ? 1 : dpr);
    this.layer.width = Math.round(lw * ldpr);
    this.layer.height = Math.round(lh * ldpr);
    const v: View = { ...this.view, w: lw, h: lh };
    const c = this.layer.getContext('2d')!;
    c.setTransform(ldpr, 0, 0, ldpr, 0, 0);
    c.clearRect(0, 0, lw, lh);
    c.fillStyle = '#26221f';
    c.beginPath();
    for (const ring of this.graph.data.playable) {
      for (let q = 0; q < ring.length; q += 2) {
        const [sx, sy] = toScreen(v, ring[q], ring[q + 1]);
        if (q === 0) c.moveTo(sx, sy); else c.lineTo(sx, sy);
      }
      c.closePath();
    }
    c.fill();
    // Fewer minor roads when zoomed out: the main network reads better and draws much faster.
    const s = v.scale;
    const minRank = s < 0.035 ? 6 : s < 0.08 ? 5 : s < 0.2 ? 3 : 1;
    drawRoads(c, this.index, v, minRank, Math.min(2.2, Math.max(0.5, s * 2.2)));
    if (s >= 0.35) this.drawRoadNames(c, v);
    this.layerView = v;
  }

  private drawRoadNames(c: CanvasRenderingContext2D, v: View) {
    const e = this.graph.data.edges, p = this.graph.data.pts;
    const used: Box[] = [];
    const seen = new Set<string>();
    c.font = '600 12px "Noto Sans", sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const { k, name } of this.roadNames) {
      if (!name || seen.has(name)) continue;
      // The longest segment of the edge, if it is on screen.
      let best = -1, bl = 0;
      for (let q = e.start[k]; q < e.start[k + 1] - 1; q++) {
        const l = Math.hypot(p[2 * q + 2] - p[2 * q], p[2 * q + 3] - p[2 * q + 1]);
        if (l > bl) { bl = l; best = q; }
      }
      if (best < 0) continue;
      const [ax, ay] = toScreen(v, p[2 * best], p[2 * best + 1]), [bx, by] = toScreen(v, p[2 * best + 2], p[2 * best + 3]);
      const tw = c.measureText(name).width;
      if (Math.hypot(bx - ax, by - ay) < tw + 20) continue;
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      if (mx < 0 || my < 0 || mx > v.w || my > v.h) continue;
      const box = { x0: mx - tw / 2 - 6, y0: my - tw / 2 - 6, x1: mx + tw / 2 + 6, y1: my + tw / 2 + 6 };
      if (overlaps(box, used)) continue;
      used.push(box);
      seen.add(name);
      let ang = Math.atan2(by - ay, bx - ax);
      if (ang > Math.PI / 2) ang -= Math.PI; else if (ang < -Math.PI / 2) ang += Math.PI;
      c.save();
      c.translate(mx, my);
      c.rotate(ang);
      c.lineWidth = 3.5;
      c.strokeStyle = 'rgba(20,18,16,0.9)';
      c.strokeText(name, 0, 0);
      c.fillStyle = '#f5f5f4';
      c.fillText(name, 0, 0);
      c.restore();
    }
  }

  private text(c: CanvasRenderingContext2D, t: string, x: number, y: number, font: string, fill: string) {
    c.font = font;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineWidth = 4;
    c.lineJoin = 'round';
    c.strokeStyle = 'rgba(15,13,11,0.92)';
    c.strokeText(t, x, y);
    c.fillStyle = fill;
    c.fillText(t, x, y);
  }

  /** Places, chowks and landmarks with outlined text; overlapping labels are skipped (most important first). */
  private drawLabels(c: CanvasRenderingContext2D, w: number, h: number) {
    const s = this.view.scale;
    const used: Box[] = [];
    const order = { landmark: 0, city: 1, suburb: 2, locality: 3, neighbourhood: 3, village: 4, chowk: 5 } as Record<string, number>;
    const labels = this.graph.data.labels.slice().sort((a, b) => (order[a.kind] ?? 4) - (order[b.kind] ?? 4));
    for (const l of labels) {
      if (l.kind === 'chowk' && s < 0.25) continue;
      if (l.kind === 'landmark' && s < 0.05) continue;
      const [sx, sy] = toScreen(this.view, l.x, l.n);
      if (sx < -80 || sy < -20 || sx > w + 80 || sy > h + 20) continue;
      const landmark = l.kind === 'landmark', chowk = l.kind === 'chowk';
      const font = landmark ? '600 13px "Noto Sans", sans-serif' : chowk ? '500 12px "Noto Sans", sans-serif'
        : `700 ${s < 0.05 ? 13 : 15}px "Noto Sans", "Noto Sans Gujarati", sans-serif`;
      const text = !landmark && !chowk && l.gu ? `${l.t} · ${l.gu}` : l.t;
      c.font = font;
      const tw = c.measureText(text).width;
      const ty = landmark || chowk ? sy - 13 : sy;
      const box = { x0: sx - tw / 2 - 4, y0: ty - 9, x1: sx + tw / 2 + 4, y1: ty + 9 };
      if (overlaps(box, used)) continue;
      used.push(box);
      if (landmark || chowk) {
        c.fillStyle = landmark ? '#22c55e' : '#38bdf8';
        c.strokeStyle = '#0c0a09';
        c.lineWidth = 2;
        c.beginPath();
        c.arc(sx, sy, landmark ? 5 : 4, 0, Math.PI * 2);
        c.fill();
        c.stroke();
      }
      this.text(c, text, sx, ty, font, landmark ? '#dcfce7' : chowk ? '#e0f2fe' : '#fff1dc');
    }
  }
}
