import type { World } from '../world/world';
import { drawArrow, drawPin, drawRoads, drawRoute, toScreen, type EdgeIndex, type View } from './mapdraw';

const RADIUS_M = 300; // minimap radius (PROMPT §9.8)

/** HUD: rotating vector minimap, clock, speed, area name, prompts (plain DOM + canvas). */
export class Hud {
  private mm = document.getElementById('minimap') as HTMLCanvasElement;
  private ctx = this.mm.getContext('2d')!;
  private el = {
    root: document.getElementById('hud')!,
    area: document.getElementById('area')!,
    clock: document.getElementById('clock')!,
    speed: document.getElementById('speed')!,
    prompt: document.getElementById('prompt')!,
    perf: document.getElementById('perf')!,
  };
  private lastArea = '';
  private areaTimer = 0;

  constructor(private world: World) {
    this.el.root.hidden = false;
  }

  /** x, n in world metres (n = north); heading = camera yaw (radians, 0 = looking north). */
  drawMinimap(x: number, n: number, yaw: number, roads: EdgeIndex | null, route: number[] | null,
    waypoint: { x: number; n: number } | null) {
    const c = this.ctx, W = this.mm.width;
    const v: View = { cx: x, cn: n, scale: W / 2 / RADIUS_M, rot: yaw, w: W, h: W };
    c.save();
    c.clearRect(0, 0, W, W);
    c.beginPath();
    c.arc(W / 2, W / 2, W / 2 - 2, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = 'rgba(28,26,24,0.82)';
    c.fillRect(0, 0, W, W);
    if (roads) drawRoads(c, roads, v, 2, 1);
    drawRoute(c, v, route, 4);
    if (waypoint) {
      // Clamp the pin to the rim when it is off the minimap.
      let [px, py] = toScreen(v, waypoint.x, waypoint.n);
      const dx = px - W / 2, dy = py - W / 2, d = Math.hypot(dx, dy), max = W / 2 - 14;
      if (d > max) { px = W / 2 + (dx / d) * max; py = W / 2 + (dy / d) * max; }
      drawPin(c, px, py);
    }
    c.restore();
    drawArrow(c, W / 2, W / 2, 0);
    // North marker on the rim.
    const nx = W / 2 + Math.sin(yaw) * (W / 2 - 12), ny = W / 2 - Math.cos(yaw) * (W / 2 - 12);
    c.fillStyle = '#fff';
    c.font = 'bold 12px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('N', nx, ny);
  }

  setClock(label: string) {
    this.el.clock.textContent = label;
  }

  setSpeed(kmh: number | null) {
    this.el.speed.textContent = kmh === null ? '' : `${Math.round(kmh)} km/h`;
  }

  /** Big centred message for a few seconds (re-uses the area-name banner). */
  flash(text: string) {
    this.lastArea = text;
    this.el.area.textContent = text;
    this.el.area.classList.remove('show');
    void this.el.area.offsetWidth;
    this.el.area.classList.add('show');
  }

  setPrompt(text: string) {
    this.el.prompt.textContent = text;
    this.el.prompt.style.opacity = text ? '1' : '0';
  }

  /** Show the name of the nearest named road or landmark when it changes. */
  updateArea(x: number, n: number, dt: number) {
    this.areaTimer -= dt;
    if (this.areaTimer > 0) return;
    this.areaTimer = 0.5;
    let best = '', bestD = 40;
    for (const t of this.world.tiles.values()) {
      for (const l of t.build.landmarks) {
        const d = Math.hypot(l.x - x, l.n - n) - 60;
        if (d < bestD) { bestD = d; best = this.world.strings[l.name] ?? ''; }
      }
    }
    if (!best) best = this.nearestRoadName(x, n);
    if (best && best !== this.lastArea) {
      this.lastArea = best;
      this.el.area.textContent = best;
      this.el.area.classList.remove('show');
      void this.el.area.offsetWidth;
      this.el.area.classList.add('show');
    }
  }

  private nearestRoadName(x: number, n: number): string {
    let best = '', bestD = 25;
    for (const t of this.world.tiles.values()) {
      const b = t.build;
      if (Math.abs(b.swx + 250 - x) > 300 || Math.abs(b.swn + 250 - n) > 300) continue;
      b.minimapRoadNames.forEach((name, k) => {
        if (name === 0xffffffff) return;
        const r = b.minimapRoads[k];
        for (let q = 1; q + 3 < r.length; q += 2) {
          const d = segDist(x, n, r[q], r[q + 1], r[q + 2], r[q + 3]);
          if (d < bestD) { bestD = d; best = this.world.strings[name] ?? ''; }
        }
      });
    }
    return best;
  }

  setPerf(text: string | null) {
    this.el.perf.hidden = text === null;
    if (text !== null) this.el.perf.textContent = text;
  }
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
