import { fmtTime, Marker, type Activity, type ActivityContext, type Update } from './activity';

const GATES = 10;
const GATE_R = 14;

/**
 * Time Trials (PROMPT §3.6.8): a lap of the Race Course ring road through gates, in any vehicle.
 * Gates come from the real ring road, ordered around its centre. Best lap is kept.
 */
export class TimeTrial implements Activity {
  readonly id = 'timetrial';
  readonly title = 'Race Course Time Trial';
  readonly blurb = 'One flying lap of the Race Course ring road through the gates. Any vehicle; beat your best time.';
  private gates: [number, number][] = [];
  private marker: Marker | null = null;
  private next = 0;
  private t = 0;
  private running = false;

  canStart(ctx: ActivityContext) {
    if (!ctx.driving()) return 'Get on a vehicle first.';
    return this.ring(ctx).length ? null : 'The Race Course ring road is not in the map data.';
  }

  /** Gates evenly spaced by angle around the ring's centre. */
  private ring(ctx: ActivityContext): [number, number][] {
    const pts: [number, number][] = [];
    for (const l of ctx.roads(/^Race Course (Ring Road|Circle)$/)) for (let k = 0; k < l.length; k += 2) pts.push([l[k], l[k + 1]]);
    if (pts.length < 8) return [];
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cn = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const out: [number, number][] = [];
    for (let g = 0; g < GATES; g++) {
      // Clockwise around the ring, starting from the south.
      const want = -Math.PI / 2 - (g / GATES) * Math.PI * 2;
      let best = pts[0], bd = Infinity;
      for (const p of pts) {
        let d = Math.atan2(p[1] - cn, p[0] - cx) - want;
        d = Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));
        if (d < bd) { bd = d; best = p; }
      }
      out.push(best);
    }
    return out;
  }

  start(ctx: ActivityContext) {
    this.gates = this.ring(ctx);
    this.marker = new Marker(ctx.scene, 0x38bdf8, GATE_R * 0.6);
    this.next = 0;
    this.t = 0;
    this.running = false;
    this.show(ctx);
    ctx.flash('Head to the first gate (blue) — the clock starts there');
  }

  private show(ctx: ActivityContext) {
    const [x, n] = this.gates[this.next % GATES];
    this.marker!.place(x, ctx.groundY(x, n), n);
    ctx.setWaypoint(x, n);
  }

  update(dt: number, ctx: ActivityContext): Update {
    if (this.running) this.t += dt;
    const p = ctx.here();
    const [x, n] = this.gates[this.next % GATES];
    if (Math.hypot(p.x - x, -p.z - n) < GATE_R) {
      ctx.sound('ding');
      if (!this.running) { this.running = true; this.t = 0; this.next = 1; }
      else if (this.next === GATES) {
        const best = ctx.best(this.id);
        const isBest = ctx.record(this.id, -this.t);
        const pay = Math.max(20, Math.round(400 - this.t * 2));
        ctx.pay(pay, `Lap ${fmtTime(this.t)}${isBest ? ' — new best!' : ''}`);
        ctx.sound('good');
        return { done: true, summary: `Lap time ${fmtTime(this.t)}${isBest ? ' — a new best!' : best !== undefined ? ` (best ${fmtTime(-best)})` : ''}. ₹${pay}.` };
      } else this.next++;
      this.show(ctx);
    }
    return { done: false };
  }

  status() {
    return this.running ? `Gate ${this.next}/${GATES} · <b>${fmtTime(this.t)}</b>` : 'Drive to the start gate';
  }

  end(ctx: ActivityContext) {
    this.marker?.dispose();
    this.marker = null;
    ctx.clearWaypoint();
  }
}
