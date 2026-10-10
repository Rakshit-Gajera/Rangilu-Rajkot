import type { RoadGraph } from '../world/roadgraph';
import { drawArrow, drawPin, drawRoads, drawRoute, EdgeIndex, toScreen, toWorld, type View } from './mapdraw';

export interface MapCallbacks {
  /** Player position (x east, n north) and heading (radians, 0 = north, clockwise). */
  player: () => { x: number; n: number; heading: number };
  onWaypoint: (x: number, n: number) => void;
  onClearWaypoint: () => void;
  onFastTravel: (x: number, n: number) => void;
}

/** Full-screen city map (M): pan, zoom, landmarks, waypoint, fast travel (PROMPT §3.5, §9.8). */
export class CityMap {
  readonly index: EdgeIndex;
  private root: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private view: View = { cx: 0, cn: 0, scale: 0.08, rot: 0, w: 1, h: 1 };
  private drag: { x: number; y: number; cx: number; cn: number; moved: boolean } | null = null;
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
      <canvas></canvas>
      <aside>
        <h2>Rajkot <span lang="gu">રાજકોટ</span></h2>
        <p class="hint">Drag to pan · wheel to zoom · click to set a waypoint<br>
          <b>F</b> fast travel to the waypoint · <b>Del</b> clear · <b>M</b>/<b>Esc</b> close</p>
        <p id="map-route"></p>
        <h3>Places</h3>
        <ul id="map-places"></ul>
      </aside>`;
    document.body.appendChild(this.root);
    this.canvas = this.root.querySelector('canvas')!;
    this.ctx = this.canvas.getContext('2d')!;
    const list = this.root.querySelector('#map-places')!;
    const places = graph.data.labels.filter((l) => l.kind === 'landmark').sort((a, b) => a.t.localeCompare(b.t));
    for (const l of places) {
      const li = document.createElement('li');
      li.textContent = l.t;
      li.onclick = () => {
        this.view.cx = l.x;
        this.view.cn = l.n;
        this.view.scale = Math.max(this.view.scale, 0.5);
        this.setWaypoint(l.x, l.n);
      };
      list.appendChild(li);
    }
    this.canvas.addEventListener('pointerdown', (e) => {
      this.drag = { x: e.clientX, y: e.clientY, cx: this.view.cx, cn: this.view.cn, moved: false };
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) this.drag.moved = true;
      this.view.cx = this.drag.cx - dx / this.view.scale;
      this.view.cn = this.drag.cn + dy / this.view.scale;
      this.draw();
    });
    this.canvas.addEventListener('pointerup', (e) => {
      if (this.drag && !this.drag.moved) {
        const r = this.canvas.getBoundingClientRect();
        const [x, n] = toWorld(this.view, e.clientX - r.left, e.clientY - r.top);
        this.setWaypoint(x, n);
      }
      this.drag = null;
    });
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = this.canvas.getBoundingClientRect();
      const [wx, wn] = toWorld(this.view, e.clientX - r.left, e.clientY - r.top);
      this.view.scale = Math.min(6, Math.max(0.02, this.view.scale * Math.exp(-e.deltaY * 0.0015)));
      const [ax, an] = toWorld(this.view, e.clientX - r.left, e.clientY - r.top);
      this.view.cx += wx - ax;
      this.view.cn += wn - an;
      this.draw();
    }, { passive: false });
    addEventListener('resize', () => this.open && this.draw());
  }

  setWaypoint(x: number, n: number) {
    this.waypoint = { x, n };
    this.cb.onWaypoint(x, n);
    this.draw();
  }

  clearWaypoint() {
    this.waypoint = null;
    this.route = null;
    this.cb.onClearWaypoint();
    this.draw();
  }

  setRoute(points: number[] | null, length: number) {
    this.route = points;
    this.routeLength = length;
    const el = this.root.querySelector('#map-route')!;
    el.textContent = points ? `Route: ${(length / 1000).toFixed(1)} km` : this.waypoint ? 'No route to the waypoint' : '';
    if (this.open) this.draw();
  }

  toggle(force?: boolean) {
    this.open = force ?? !this.open;
    this.root.hidden = !this.open;
    if (this.open) {
      const p = this.cb.player();
      this.view.cx = p.x;
      this.view.cn = p.n;
      if (document.pointerLockElement) document.exitPointerLock();
      this.draw();
    }
  }

  /** Keys while the map is open. Returns true if handled. */
  key(code: string): boolean {
    if (!this.open) return false;
    if (code === 'KeyM' || code === 'Escape') this.toggle(false);
    else if (code === 'KeyF' && this.waypoint) {
      this.cb.onFastTravel(this.waypoint.x, this.waypoint.n);
      this.toggle(false);
    } else if (code === 'Delete' || code === 'Backspace') this.clearWaypoint();
    else return false;
    return true;
  }

  draw() {
    if (!this.open) return;
    const dpr = Math.min(devicePixelRatio, 2);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (this.canvas.width !== Math.round(w * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    const c = this.ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.view.w = w;
    this.view.h = h;
    c.fillStyle = '#1c1917';
    c.fillRect(0, 0, w, h);
    // Playable area.
    c.fillStyle = '#292524';
    c.beginPath();
    for (const ring of this.graph.data.playable) {
      for (let q = 0; q < ring.length; q += 2) {
        const [sx, sy] = toScreen(this.view, ring[q], ring[q + 1]);
        if (q === 0) c.moveTo(sx, sy); else c.lineTo(sx, sy);
      }
      c.closePath();
    }
    c.fill();
    const minRank = this.view.scale < 0.06 ? 5 : this.view.scale < 0.15 ? 3 : 1;
    drawRoads(c, this.index, this.view, minRank, Math.min(1.4, Math.max(0.45, this.view.scale * 2.5)));
    drawRoute(c, this.view, this.route, 4);
    // Labels.
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const l of this.graph.data.labels) {
      const [sx, sy] = toScreen(this.view, l.x, l.n);
      if (sx < -100 || sy < -20 || sx > w + 100 || sy > h + 20) continue;
      if (l.kind === 'landmark') {
        if (this.view.scale < 0.06) continue;
        c.fillStyle = '#22c55e';
        c.beginPath();
        c.arc(sx, sy, 4, 0, Math.PI * 2);
        c.fill();
        c.font = '12px "Noto Sans", sans-serif';
        c.fillStyle = '#ecfccb';
        c.fillText(l.t, sx, sy - 12);
      } else {
        c.font = '600 13px "Noto Sans", sans-serif';
        c.fillStyle = 'rgba(255,240,220,0.75)';
        c.fillText(l.gu ? `${l.t} · ${l.gu}` : l.t, sx, sy);
      }
    }
    if (this.waypoint) drawPin(c, ...toScreen(this.view, this.waypoint.x, this.waypoint.n));
    const p = this.cb.player();
    drawArrow(c, ...toScreen(this.view, p.x, p.n), p.heading, 10);
  }
}
