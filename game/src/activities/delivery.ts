import { fmtTime, Marker, roadPointNear, type Activity, type ActivityContext, type Update } from './activity';

const ITEMS = [
  { name: 'ganthiya', speed: 8, pay: 40 },
  { name: 'peda', speed: 8, pay: 50 },
  { name: 'ice cream', speed: 10, pay: 60 }, // melts: tighter time
  { name: 'fafda-jalebi', speed: 8.5, pay: 45 },
];
const TWO_WHEELERS = ['scooter', 'motorcycle', 'bicycle'];

/**
 * Farsan Delivery (PROMPT §3.6.2): collect an order from the farsan shop and deliver it before it's late
 * (or the ice cream melts). Pay by distance, bonus for time to spare; late orders pay half.
 */
export class FarsanDelivery implements Activity {
  readonly id = 'delivery';
  readonly title = 'Farsan Delivery';
  readonly blurb = 'On a two-wheeler: pick up ganthiya, peda or ice cream and deliver it before it\'s late — or melts.';
  private marker: Marker | null = null;
  private phase: 'shop' | 'deliver' = 'shop';
  private target = { x: 0, n: 0 };
  private item = ITEMS[0];
  private limit = 0;
  private left = 0;
  private km = 0;
  private earned = 0;
  private done = 0;

  canStart(ctx: ActivityContext) {
    const k = ctx.driving()?.kind;
    return k && TWO_WHEELERS.includes(k) ? null : 'Get on a scooter, motorcycle or bicycle first.';
  }

  start(ctx: ActivityContext) {
    this.marker = new Marker(ctx.scene, 0xf59e0b, 3);
    this.earned = this.done = 0;
    this.toShop(ctx);
  }

  private toShop(ctx: ActivityContext) {
    const p = ctx.here();
    [this.target.x, this.target.n] = roadPointNear(ctx.graph, p.x, -p.z, 120, 350);
    this.phase = 'shop';
    this.place(ctx);
    ctx.flash('New order! Collect it from the farsan shop (orange marker)');
  }

  private place(ctx: ActivityContext) {
    this.marker!.place(this.target.x, ctx.groundY(this.target.x, this.target.n), this.target.n);
    ctx.setWaypoint(this.target.x, this.target.n);
  }

  update(dt: number, ctx: ActivityContext): Update {
    const k = ctx.driving()?.kind;
    const p = ctx.here();
    const d = Math.hypot(p.x - this.target.x, -p.z - this.target.n);
    if (this.phase === 'deliver') {
      this.left -= dt;
      if (this.left < -120) return { done: true, summary: `The ${this.item.name} order was cancelled — far too late. ${this.done} delivered, ₹${this.earned}.` };
    }
    const v = ctx.driving();
    const stopped = !v || Math.abs(v.speed) < 3;
    if (d < 9 && stopped && (this.phase === 'deliver' || (k && TWO_WHEELERS.includes(k)))) {
      if (this.phase === 'shop') {
        this.item = ITEMS[Math.floor(Math.random() * ITEMS.length)];
        const [x, n] = roadPointNear(ctx.graph, this.target.x, this.target.n, 600, 1800);
        const r = ctx.graph.route(this.target.x, this.target.n, x, n);
        const m = r?.length ?? Math.hypot(x - this.target.x, n - this.target.n);
        this.km = m / 1000;
        this.limit = this.left = 25 + m / this.item.speed;
        this.target = { x, n };
        this.phase = 'deliver';
        this.place(ctx);
        ctx.sound('ding');
        ctx.flash(`Deliver ${this.item.name} — ${this.km.toFixed(1)} km in ${fmtTime(this.limit)}`);
      } else {
        const base = Math.round(this.item.pay + 22 * this.km);
        const pay = this.left >= 0 ? base + Math.round(base * 0.5 * (this.left / this.limit)) : Math.round(base / 2);
        this.earned += pay;
        this.done++;
        ctx.pay(pay, this.left >= 0 ? `Delivered on time: ₹${pay}` : `Late — half pay: ₹${pay}`);
        ctx.sound(this.left >= 0 ? 'good' : 'bad');
        ctx.record(this.id, this.earned);
        this.toShop(ctx);
      }
    }
    return { done: false };
  }

  status() {
    if (this.phase === 'shop') return `Collect the order at the farsan shop<br>Delivered ${this.done} · earned ₹${this.earned}`;
    const late = this.left < 0;
    const what = this.item.name === 'ice cream' ? (late ? 'melted!' : 'melting') : late ? 'late!' : 'left';
    return `Deliver ${this.item.name}: <b class="${late ? 'bad' : ''}">${fmtTime(Math.abs(this.left))} ${what}</b><br>Delivered ${this.done} · earned ₹${this.earned}`;
  }

  end(ctx: ActivityContext) {
    this.marker?.dispose();
    this.marker = null;
    ctx.clearWaypoint();
  }
}
