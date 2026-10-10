import { fmtTime, Marker, type Activity, type ActivityContext, type Update } from './activity';

const STOP_EVERY = 650; // metres between stations
const STOP_R = 16;
const DWELL = 3; // seconds stopped at a station

/**
 * BRTS Driver (PROMPT §3.6.7): drive a city bus along the 150 Ft Ring Road corridor and stop at each
 * station long enough for passengers. Pay per station, bonus for keeping to the timetable.
 */
export class BrtsDriver implements Activity {
  readonly id = 'brts';
  readonly title = 'BRTS Driver';
  readonly blurb = 'Drive the city bus along the 150 Ft Ring Road and stop at every station for passengers.';
  private stops: [number, number][] = [];
  private marker: Marker | null = null;
  private next = 0;
  private dwell = 0;
  private t = 0;
  private earned = 0;
  private schedule = 0;

  canStart(ctx: ActivityContext) {
    return this.corridor(ctx) ? null : 'The 150 Ft Ring Road is not in the map data.';
  }

  /** The corridor: a GPS route from the southern to the northern end of the ring road, with stations along it. */
  private corridor(ctx: ActivityContext): number[] | null {
    const pts: [number, number][] = [];
    for (const l of ctx.roads(/^150 (Foot|feet|Feet) Ring Road$/i)) for (let k = 0; k < l.length; k += 2) pts.push([l[k], l[k + 1]]);
    if (pts.length < 4) return null;
    const south = pts.reduce((a, b) => (b[1] < a[1] ? b : a)), north = pts.reduce((a, b) => (b[1] > a[1] ? b : a));
    return ctx.graph.route(south[0], south[1], north[0], north[1])?.points ?? null;
  }

  async start(ctx: ActivityContext) {
    const line = this.corridor(ctx)!;
    this.stops = [];
    let acc = 0;
    for (let k = 2; k < line.length; k += 2) {
      acc += Math.hypot(line[k] - line[k - 2], line[k + 1] - line[k - 1]);
      if (acc >= STOP_EVERY) { this.stops.push([line[k], line[k + 1]]); acc = 0; }
    }
    this.stops = this.stops.slice(0, 8);
    const heading = Math.atan2(line[2] - line[0], -(line[3] - line[1])); // three.js heading along the first segment
    await ctx.putInVehicle('bus', line[0], line[1], heading);
    this.marker = new Marker(ctx.scene, 0x3b82f6, 5);
    this.next = 0;
    this.t = this.earned = 0;
    this.schedule = 0;
    this.show(ctx);
    ctx.flash(`BRTS shift: ${this.stops.length} stations on the 150 Ft Ring Road. Stop at each blue marker.`);
  }

  private show(ctx: ActivityContext) {
    const [x, n] = this.stops[this.next];
    this.marker!.place(x, ctx.groundY(x, n), n);
    ctx.setWaypoint(x, n);
    this.schedule += STOP_EVERY / 9 + DWELL + 10; // ~32 km/h average
  }

  update(dt: number, ctx: ActivityContext): Update {
    this.t += dt;
    const v = ctx.driving();
    if (v?.kind !== 'bus') return { done: true, summary: `You left the bus. ${this.next} stations served, ₹${this.earned}.` };
    const p = ctx.here();
    const [x, n] = this.stops[this.next];
    const near = Math.hypot(p.x - x, -p.z - n) < STOP_R;
    if (near && Math.abs(v.speed) < 1.5) {
      this.dwell += dt;
      if (this.dwell >= DWELL) {
        const onTime = this.t <= this.schedule;
        const pay = 30 + (onTime ? 20 : 0);
        this.earned += pay;
        ctx.pay(pay, onTime ? 'Station served on time' : 'Station served (running late)');
        ctx.sound(onTime ? 'good' : 'ding');
        this.dwell = 0;
        this.next++;
        if (this.next >= this.stops.length) {
          ctx.record(this.id, this.earned);
          return { done: true, summary: `End of the line! ${this.stops.length} stations in ${fmtTime(this.t)}, ₹${this.earned}.` };
        }
        this.show(ctx);
      }
    } else this.dwell = 0;
    return { done: false };
  }

  status() {
    const late = this.t > this.schedule;
    const board = this.dwell > 0 ? ` · boarding ${Math.ceil(DWELL - this.dwell)}…` : '';
    return `Station ${this.next + 1}/${this.stops.length}${board}<br><span class="${late ? 'bad' : ''}">${fmtTime(this.t)} / timetable ${fmtTime(this.schedule)}</span> · ₹${this.earned}`;
  }

  end(ctx: ActivityContext) {
    this.marker?.dispose();
    this.marker = null;
    ctx.clearWaypoint();
  }
}
