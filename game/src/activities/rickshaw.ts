import { fmtTime, Marker, roadPointNear, type Activity, type ActivityContext, type Update } from './activity';

/**
 * Rickshaw Rides (PROMPT §3.6.1): in an auto, pick up passengers waiting at the roadside and drive them to
 * real places. Fare by distance plus a tip for a quick ride. Shifts go on until you quit (X).
 */
export class RickshawRides implements Activity {
  readonly id = 'rickshaw';
  readonly title = 'Rickshaw Rides';
  readonly blurb = 'Drive an auto-rickshaw: pick up passengers and take them across Rajkot. Fare plus a tip for a quick ride.';
  private marker: Marker | null = null;
  private phase: 'pickup' | 'ride' = 'pickup';
  private target = { x: 0, n: 0, name: '' };
  private timer = 0;
  private est = 60;
  private fare = 0;
  private earned = 0;
  private rides = 0;
  private outside = 0;

  canStart(ctx: ActivityContext) {
    return ctx.driving()?.kind === 'auto' ? null : 'Get into an auto-rickshaw first: walk up to one in traffic and press E, or spawn one from the sandbox (Tab).';
  }

  start(ctx: ActivityContext) {
    this.marker = new Marker(ctx.scene, 0x22c55e, 3.5);
    this.earned = this.rides = 0;
    this.newPickup(ctx);
  }

  private newPickup(ctx: ActivityContext) {
    const p = ctx.here();
    const [x, n] = roadPointNear(ctx.graph, p.x, -p.z, 150, 450);
    this.target = { x, n, name: 'a passenger' };
    this.phase = 'pickup';
    this.place(ctx);
    ctx.flash('A passenger is waving — pick them up (green marker)');
  }

  private place(ctx: ActivityContext) {
    this.marker!.place(this.target.x, ctx.groundY(this.target.x, this.target.n), this.target.n);
    ctx.setWaypoint(this.target.x, this.target.n);
  }

  update(dt: number, ctx: ActivityContext): Update {
    const v = ctx.driving();
    this.outside = v?.kind === 'auto' ? 0 : this.outside + dt;
    if (this.outside > 20) return { done: true, summary: this.summary('You left the auto, so the shift ended.') };
    this.timer += dt;
    const p = ctx.here();
    const d = Math.hypot(p.x - this.target.x, -p.z - this.target.n);
    const slow = !!v && Math.abs(v.speed) < 2.5;
    if (d < 10 && slow) {
      if (this.phase === 'pickup') {
        const far = ctx.places().filter((q) => { const dd = Math.hypot(q.x - this.target.x, q.n - this.target.n); return dd > 700 && dd < 3000; });
        const dest = far.length ? far[Math.floor(Math.random() * far.length)] : { t: 'Race Course', x: -1067, n: 473 };
        const r = ctx.graph.route(this.target.x, this.target.n, dest.x, dest.n);
        const km = (r?.length ?? Math.hypot(dest.x - this.target.x, dest.n - this.target.n)) / 1000;
        this.fare = Math.round(25 + 16 * km);
        this.est = 30 + (km * 1000) / 8; // ~30 km/h through traffic
        this.target = { x: dest.x, n: dest.n, name: dest.t };
        this.phase = 'ride';
        this.timer = 0;
        this.place(ctx);
        ctx.sound('ding');
        ctx.flash(`"${dest.t}, bhai — jaldi!" (${km.toFixed(1)} km, ₹${this.fare})`);
      } else {
        const tip = this.timer < this.est ? Math.round(5 + this.fare * 0.35 * (1 - this.timer / this.est)) : 0;
        this.earned += this.fare + tip;
        this.rides++;
        ctx.pay(this.fare + tip, tip ? `Fare ₹${this.fare} + tip ₹${tip}` : `Fare ₹${this.fare} (no tip: a bit slow)`);
        ctx.sound('good');
        ctx.record(this.id, this.earned);
        this.newPickup(ctx);
      }
    }
    return { done: false };
  }

  status() {
    const goal = this.phase === 'pickup' ? 'Pick up the passenger' : `Drop at ${this.target.name}`;
    const clock = this.phase === 'ride' ? ` · ${fmtTime(this.timer)} / tip until ${fmtTime(this.est)}` : '';
    return `${goal}${clock}<br>Rides ${this.rides} · earned ₹${this.earned}`;
  }

  private summary(why: string) {
    return `${why} ${this.rides} ride${this.rides === 1 ? '' : 's'}, ₹${this.earned} earned.`;
  }

  end(ctx: ActivityContext) {
    this.marker?.dispose();
    this.marker = null;
    ctx.clearWaypoint();
  }
}
