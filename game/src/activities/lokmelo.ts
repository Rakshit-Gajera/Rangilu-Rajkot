import * as THREE from 'three';
import { landmarkModel } from '../gen/landmarks';
import { vertexColorMaterial } from '../render/materials';
import { Marker, type Activity, type ActivityContext, type Update } from './activity';

const STALLS = [
  { name: 'Chakdol (merry-go-round)', color: 0xe63946, price: 20 },
  { name: 'Balloon shooting', color: 0x219ebc, price: 30 },
  { name: 'Ice-gola stall', color: 0xffb703, price: 25 },
  { name: 'Bangles and toys', color: 0x8338ec, price: 40 },
  { name: 'Bhajiya and chai', color: 0x06d6a0, price: 35 },
  { name: 'The giant wheel', color: 0xfb5607, price: 50 },
];

/**
 * Lokmelo at Race Course (PROMPT §3.6.4): the Janmashtami fair appears on the Race Course ground — a giant
 * wheel, rows of stalls under coloured canopies, strings of lights and big crowds. Visit every stall.
 */
export class Lokmelo implements Activity {
  readonly id = 'lokmelo';
  readonly title = 'Lokmelo at Race Course';
  readonly blurb = 'The Janmashtami fair: stalls, the giant wheel, lights and crowds. Visit every stall before closing time.';
  private group = new THREE.Group();
  private markers: Marker[] = [];
  private spots: { x: number; n: number; done: boolean }[] = [];
  private visited = 0;
  private spent = 0;
  private t = 0;
  private mats: THREE.Material[] = [];

  canStart() { return null; }

  async start(ctx: ActivityContext) {
    const rc = ctx.places().find((p) => /race course/i.test(p.t)) ?? { t: 'Race Course', x: -1000, n: 600 };
    // The ground inside the ring: a little off the label towards its middle.
    const cx = rc.x, cn = rc.n;
    await ctx.putOnFoot(cx + 40, cn);
    this.group = new THREE.Group();
    ctx.scene.add(this.group);
    const gy = ctx.groundY(cx, cn);
    // Giant wheel at the centre.
    const wheel = landmarkModel('ferris', 30, 10, 'Lokmelo', 0);
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.BufferAttribute(wheel.geo.position, 3));
    wg.setAttribute('normal', new THREE.BufferAttribute(wheel.geo.normal, 3));
    wg.setAttribute('color', new THREE.BufferAttribute(wheel.geo.attrs.color[0], 3));
    wg.setIndex(new THREE.BufferAttribute(wheel.geo.index, 1));
    const wm = vertexColorMaterial({ roughness: 0.6 });
    this.mats.push(wm);
    const wmesh = new THREE.Mesh(wg, wm);
    wmesh.position.set(cx, gy, -cn);
    this.group.add(wmesh);
    // Stalls in a ring, with canopies and strings of bulbs between them.
    this.spots = [];
    const bulbs: THREE.Vector3[] = [];
    STALLS.forEach((s, k) => {
      const a = (k / STALLS.length) * Math.PI * 2;
      const x = cx + Math.cos(a) * 32, n = cn + Math.sin(a) * 32;
      const y = ctx.groundY(x, n);
      const canopyMat = new THREE.MeshStandardMaterial({ color: s.color, roughness: 0.7 });
      const tableMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b });
      this.mats.push(canopyMat, tableMat);
      const stall = new THREE.Group();
      const top = new THREE.Mesh(new THREE.ConeGeometry(3.4, 1.6, 4), canopyMat);
      top.position.y = 3.6;
      top.rotation.y = Math.PI / 4;
      const table = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.9, 1.4), tableMat);
      table.position.set(0, 0.45, 0.6);
      stall.add(top, table);
      for (const [px, pz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3, 6), tableMat);
        pole.position.set(px, 1.5, pz);
        stall.add(pole);
      }
      stall.position.set(x, y, -n);
      stall.lookAt(cx, y, -cn);
      this.group.add(stall);
      this.spots.push({ x: cx + Math.cos(a) * 27, n: cn + Math.sin(a) * 27, done: false });
      for (let q = 0; q < 8; q++) {
        const b = (k + q / 8) / STALLS.length * Math.PI * 2;
        bulbs.push(new THREE.Vector3(cx + Math.cos(b) * 32, y + 4.2 - Math.sin((q / 8) * Math.PI) * 0.8, -(cn + Math.sin(b) * 32)));
      }
    });
    // The wheel stall is the wheel itself.
    this.spots[STALLS.length - 1] = { x: cx, n: cn + 7, done: false };
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe08a, toneMapped: false });
    this.mats.push(bulbMat);
    const inst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 6, 4), bulbMat, bulbs.length);
    bulbs.forEach((p, k) => inst.setMatrixAt(k, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z)));
    this.group.add(inst);
    this.markers = this.spots.map((s) => {
      const m = new Marker(ctx.scene, 0xf472b6, 2);
      m.place(s.x, ctx.groundY(s.x, s.n), s.n);
      return m;
    });
    ctx.crowd(cx, cn, 260, 3);
    this.visited = this.spent = 0;
    this.t = 0;
    ctx.flash('Jai Shri Krishna! The lokmelo is open — visit every stall (pink markers).');
  }

  update(dt: number, ctx: ActivityContext): Update {
    this.t += dt;
    const p = ctx.here();
    this.spots.forEach((s, k) => {
      if (s.done || Math.hypot(p.x - s.x, -p.z - s.n) > 3.5) return;
      s.done = true;
      this.markers[k].hide();
      this.visited++;
      this.spent += STALLS[k].price;
      ctx.pay(-STALLS[k].price, `${STALLS[k].name} — ₹${STALLS[k].price}`);
      ctx.sound('ding');
    });
    if (this.visited === this.spots.length) {
      ctx.pay(150, 'You saw the whole lokmelo! Prize: ₹150');
      ctx.record(this.id, 1);
      return { done: true, summary: `What a mela! Every stall visited in ${Math.round(this.t)} s.` };
    }
    if (this.t > 360) return { done: true, summary: `The fair is closing. ${this.visited}/${this.spots.length} stalls visited.` };
    return { done: false };
  }

  status() {
    const next = STALLS.find((_, k) => !this.spots[k]?.done);
    return `Stalls ${this.visited}/${STALLS.length}${next ? ` · next: ${next.name}` : ''}<br><small>Spent ₹${this.spent}</small>`;
  }

  end(ctx: ActivityContext) {
    ctx.scene.remove(this.group);
    this.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
    for (const m of this.mats) m.dispose();
    this.mats = [];
    for (const m of this.markers) m.dispose();
    this.markers = [];
    ctx.crowd(0, 0, 0, 1);
  }
}
