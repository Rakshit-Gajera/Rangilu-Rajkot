import type { World } from '../world/world';

const RADIUS_M = 300; // minimap radius (PROMPT §9.8)
const ROAD_STYLE: Record<number, [string, number]> = {
  9: ['#f59e0b', 4], 8: ['#f59e0b', 4], 7: ['#fbbf24', 3.5], 6: ['#fde68a', 3], 5: ['#e5e7eb', 2.4],
};

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
  drawMinimap(x: number, n: number, yaw: number) {
    const c = this.ctx, W = this.mm.width, s = W / 2 / RADIUS_M;
    c.save();
    c.clearRect(0, 0, W, W);
    c.beginPath();
    c.arc(W / 2, W / 2, W / 2 - 2, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = 'rgba(28,26,24,0.82)';
    c.fillRect(0, 0, W, W);
    c.translate(W / 2, W / 2);
    c.rotate(yaw); // map rotates so the view direction points up
    c.lineCap = 'round';
    c.lineJoin = 'round';
    for (const pass of [0, 1]) {
      for (const t of this.world.tiles.values()) {
        const b = t.build;
        if (Math.abs(b.swx + 250 - x) > 800 || Math.abs(b.swn + 250 - n) > 800) continue;
        for (const r of b.minimapRoads) {
          const rank = r[0];
          const major = rank >= 5;
          if ((pass === 0) === major) continue;
          const [col, w] = ROAD_STYLE[rank] ?? ['#9ca3af', 1.6];
          c.strokeStyle = col;
          c.lineWidth = w;
          c.beginPath();
          for (let k = 1; k < r.length; k += 2) {
            const px = (r[k] - x) * s, py = -(r[k + 1] - n) * s;
            k === 1 ? c.moveTo(px, py) : c.lineTo(px, py);
          }
          c.stroke();
        }
      }
    }
    c.restore();
    // Player arrow (always pointing up).
    c.fillStyle = '#ef4444';
    c.strokeStyle = '#fff';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(W / 2, W / 2 - 9);
    c.lineTo(W / 2 + 6, W / 2 + 7);
    c.lineTo(W / 2, W / 2 + 3);
    c.lineTo(W / 2 - 6, W / 2 + 7);
    c.closePath();
    c.fill();
    c.stroke();
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
