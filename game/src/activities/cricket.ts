import * as THREE from 'three';
import { Character, OUTFITS } from '../actors/character';
import type { Activity, ActivityContext, Update } from './activity';

const BALLS = 12; // two overs
const WICKETS = 3;
const PITCH = 16; // metres, bowler to batsman (a lane-sized pitch)

/**
 * Gully Cricket (PROMPT §3.6.6): a street match in a society lane. The bowler runs in; press Space as the
 * ball arrives. Timing decides the shot: perfect = six over the rooftops, good = four, early/late = a single
 * or a dot, a miss on target = bowled. Two overs, three wickets.
 */
export class GullyCricket implements Activity {
  readonly id = 'cricket';
  readonly title = 'Gully Cricket';
  readonly blurb = 'A street match: time Space as the ball arrives. Two overs, three wickets — and mind the windows.';
  private group = new THREE.Group();
  private bowler: Character | null = null;
  private keeper: Character | null = null;
  private ball: THREE.Mesh | null = null;
  private stumps: THREE.Group | null = null;
  private origin = new THREE.Vector3();
  private dir = new THREE.Vector3(0, 0, -1); // batsman -> bowler
  private phase: 'runup' | 'flight' | 'hit' | 'pause' = 'pause';
  private t = 0;
  private flight = 0.75;
  private balls = 0;
  private runs = 0;
  private wickets = 0;
  private swung = false;
  private hitVel = new THREE.Vector3();
  private last = '';

  canStart(ctx: ActivityContext) {
    return ctx.driving() ? 'Get off your vehicle — gully cricket is played on foot.' : null;
  }

  start(ctx: ActivityContext) {
    this.balls = this.runs = this.wickets = 0;
    this.group = new THREE.Group();
    ctx.scene.add(this.group);
    const p = ctx.here();
    this.origin.set(p.x, ctx.groundY(p.x, -p.z), p.z);
    // Bowl along the street: the nearest road direction.
    const u = ctx.graph.nearestNode(p.x, -p.z, true);
    const out = ctx.graph.outgoing(u)[0];
    if (out) {
      const q = ctx.graph.pointAt(out[0], out[1], 0);
      this.dir.set(q.dx, 0, -q.dn).normalize();
    }
    this.bowler = new Character(OUTFITS.cricket);
    this.keeper = new Character({ style: 'tshirt', top: 0xffffff, bottom: 0x1d2433, shoes: 0xf2f2f2 });
    this.group.add(this.bowler.root, this.keeper.root);
    const toBowler = this.dir.clone().multiplyScalar(PITCH);
    this.keeper.root.position.copy(this.origin).addScaledVector(this.dir, -3);
    this.keeper.root.rotation.y = Math.atan2(this.dir.x, this.dir.z);
    this.bowler.root.position.copy(this.origin).add(toBowler);
    this.bowler.root.rotation.y = Math.atan2(-this.dir.x, -this.dir.z);
    // Stumps (a crate and three sticks, as in every gully) behind the batsman.
    this.stumps = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0xd9c08a });
    for (const s of [-0.11, 0, 0.11]) {
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.71, 6), wood);
      st.position.set(s, 0.355, 0);
      this.stumps.add(st);
    }
    this.stumps.position.copy(this.origin).addScaledVector(this.dir, -1);
    this.stumps.rotation.y = Math.atan2(this.dir.x, this.dir.z);
    this.group.add(this.stumps);
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.4 }));
    this.group.add(this.ball);
    this.phase = 'pause';
    this.t = -1.5;
    ctx.flash('Gully cricket! Stand at the crease and press Space as the ball reaches you.');
  }

  update(dt: number, ctx: ActivityContext): Update {
    this.t += dt;
    const ball = this.ball!, bowler = this.bowler!;
    const bowlerSpot = this.origin.clone().addScaledVector(this.dir, PITCH);
    bowler.animate(dt, this.phase === 'runup' ? 3 : 0, false);
    this.keeper!.animate(dt, 0, false);
    const space = ctx.input.hit('Space');
    if (this.phase === 'pause') {
      ball.visible = false;
      bowler.root.position.copy(bowlerSpot).addScaledVector(this.dir, 6);
      if (this.t > 0) { this.phase = 'runup'; this.t = 0; this.swung = false; this.flight = 0.6 + Math.random() * 0.35; }
    } else if (this.phase === 'runup') {
      bowler.root.position.copy(bowlerSpot).addScaledVector(this.dir, 6 * (1 - Math.min(this.t / 1.2, 1)));
      if (this.t >= 1.2) { this.phase = 'flight'; this.t = 0; ball.visible = true; }
    } else if (this.phase === 'flight') {
      const k = this.t / this.flight;
      // One bounce, about two-thirds of the way.
      const y = k < 0.65 ? 2.2 * (1 - k / 0.65) + 0.05 : 0.05 + 0.9 * Math.sin(((k - 0.65) / 0.35) * Math.PI * 0.5);
      ball.position.copy(bowlerSpot).addScaledVector(this.dir, -PITCH * k);
      ball.position.y = this.origin.y + y;
      if (space && !this.swung) {
        this.swung = true;
        const err = Math.abs(1 - k); // 0 = perfect timing (ball at the bat)
        const side = (Math.random() - 0.5) * 1.4;
        let runs = 0, speed = 8, lift = 4;
        if (err < 0.06) { runs = 6; speed = 30; lift = 12; this.last = 'SIX! Over the rooftops!'; }
        else if (err < 0.13) { runs = 4; speed = 24; lift = 3; this.last = 'FOUR!'; }
        else if (err < 0.22) { runs = 1; speed = 10; lift = 2; this.last = 'A quick single'; }
        else { runs = 0; speed = 6; lift = 1; this.last = 'Edged — no run'; }
        this.runs += runs;
        const fwd = this.dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), side);
        this.hitVel.copy(fwd).multiplyScalar(speed).setY(lift);
        this.phase = 'hit';
        this.t = 0;
        ctx.sound(runs >= 4 ? 'good' : 'ding');
        ctx.flash(this.last);
      } else if (k >= 1.12) {
        // Missed: on target? (most balls are)
        if (Math.random() < 0.6) { this.wickets++; this.last = 'Bowled! The crate goes flying'; ctx.sound('bad'); this.stumps!.rotation.x = 0.5; }
        else this.last = 'Beaten outside off — dot ball';
        ctx.flash(this.last);
        return this.nextBall(ctx);
      }
    } else if (this.phase === 'hit') {
      this.hitVel.y -= 9.81 * dt;
      ball.position.addScaledVector(this.hitVel, dt);
      if (ball.position.y < this.origin.y + 0.05) { ball.position.y = this.origin.y + 0.05; this.hitVel.multiplyScalar(0.5); this.hitVel.y = Math.abs(this.hitVel.y) * 0.4; }
      if (this.t > 2) return this.nextBall(ctx);
    }
    return { done: false };
  }

  private nextBall(ctx: ActivityContext): Update {
    this.balls++;
    this.stumps!.rotation.x = 0;
    if (this.wickets >= WICKETS || this.balls >= BALLS) {
      const pay = this.runs * 5;
      if (pay) ctx.pay(pay, `Gully cricket: ${this.runs} runs — ₹${pay}`);
      const best = ctx.record(this.id, this.runs);
      return { done: true, summary: `${this.runs}/${this.wickets} off ${this.balls} balls${best ? ' — your best!' : ''}.` };
    }
    this.phase = 'pause';
    this.t = -1.2;
    return { done: false };
  }

  status() {
    const overs = `${Math.floor(this.balls / 6)}.${this.balls % 6}`;
    return `<b>${this.runs}/${this.wickets}</b> · overs ${overs}/2<br><small>Space as the ball arrives</small>`;
  }

  end(ctx: ActivityContext) {
    ctx.scene.remove(this.group);
    this.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
    this.bowler = this.keeper = null;
  }
}
