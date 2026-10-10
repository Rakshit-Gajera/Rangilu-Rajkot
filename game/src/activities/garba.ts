import * as THREE from 'three';
import { Character, OUTFITS } from '../actors/character';
import type { Activity, ActivityContext, Update } from './activity';

const LANES = ['ArrowLeft', 'ArrowDown', 'ArrowUp', 'ArrowRight'];
const GLYPH = ['←', '↓', '↑', '→'];
const BPM = 120;
const BEATS = 96; // ~48 s
const TRAVEL = 2.0; // seconds a note takes to fall
const PERFECT = 0.07, GOOD = 0.15; // timing windows, seconds

const DRESS = [
  { style: 'kurta' as const, top: 0xc0263f, bottom: 0xf4d35e, shoes: 0x8b5a2b },
  { style: 'kurta' as const, top: 0x1f8a70, bottom: 0xfbe9c6, shoes: 0x8b5a2b },
  { style: 'kurta' as const, top: 0xe76f51, bottom: 0x264653, shoes: 0x8b5a2b },
  { style: 'kurta' as const, top: 0x7b2cbf, bottom: 0xffd166, shoes: 0x8b5a2b },
];

/**
 * Navratri Garba (PROMPT §3.6.5): a rhythm mini-game — hit the arrow keys on the beat of a synthesised
 * dhol while a ring of dancers circles you. Score by timing; pay by score.
 */
export class Garba implements Activity {
  readonly id = 'garba';
  readonly title = 'Navratri Garba';
  readonly blurb = 'Dance garba in a circle of dancers: press the arrow keys on the dhol beat.';
  private notes: { t: number; lane: number; hit: boolean; el: HTMLDivElement }[] = [];
  private t = -2;
  private score = 0;
  private combo = 0;
  private best = 0;
  private hits = { perfect: 0, good: 0, miss: 0 };
  private ui: HTMLDivElement | null = null;
  private feedback: HTMLDivElement | null = null;
  private ring = new THREE.Group();
  private dancers: Character[] = [];
  private audio: AudioContext | null = null;
  private beatAt = 0;

  canStart(ctx: ActivityContext) {
    return ctx.driving() ? 'Get off your vehicle first — garba is danced on foot.' : null;
  }

  start(ctx: ActivityContext) {
    this.t = -2;
    this.score = this.combo = this.best = 0;
    this.hits = { perfect: 0, good: 0, miss: 0 };
    this.beatAt = 0;
    // Pattern: on every beat, with extra off-beat claps (the garba "taali") in the second half.
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const spb = 60 / BPM;
    this.ui = document.createElement('div');
    this.ui.id = 'garba';
    this.ui.innerHTML = `<div class="lanes">${GLYPH.map((g) => `<div class="lane"><span class="target">${g}</span></div>`).join('')}</div>`;
    this.feedback = document.createElement('div');
    this.feedback.className = 'feedback';
    this.ui.appendChild(this.feedback);
    document.body.appendChild(this.ui);
    const lanes = this.ui.querySelectorAll<HTMLDivElement>('.lane');
    this.notes = [];
    for (let b = 4; b < BEATS; b++) {
      const times = [b * spb];
      if (b > BEATS / 2 && b % 4 === 3) times.push(b * spb + spb / 2);
      for (const t of times) {
        if (b % 8 === 7 && rnd() < 0.5) continue; // breathing space
        const lane = Math.floor(rnd() * 4);
        const el = document.createElement('div');
        el.className = 'note';
        el.textContent = GLYPH[lane];
        lanes[lane].appendChild(el);
        this.notes.push({ t, lane, hit: false, el });
      }
    }
    // Dancers in a ring around the player, in festive kurtas and chaniya-choli colours.
    const p = ctx.here();
    this.ring.position.set(p.x, ctx.groundY(p.x, -p.z), p.z);
    for (let k = 0; k < 10; k++) {
      const c = new Character(k % 3 === 0 ? OUTFITS.festive : DRESS[k % DRESS.length]);
      this.dancers.push(c);
      this.ring.add(c.root);
    }
    ctx.scene.add(this.ring);
    try { this.audio = new AudioContext(); } catch { this.audio = null; }
    ctx.flash('Garba! Press ← ↓ ↑ → as the notes reach the line');
  }

  /** Dhol: a low thump on the beat, a high slap on the off-beat, a clap (taali) every 4th. */
  private drum(beat: number) {
    const a = this.audio;
    if (!a) return;
    const t = a.currentTime;
    const hit = (f0: number, f1: number, len: number, vol: number, type: OscillatorType = 'sine') => {
      const o = a.createOscillator(), g = a.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + len);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + len);
      o.connect(g).connect(a.destination);
      o.start(t);
      o.stop(t + len);
    };
    if (beat % 1 === 0) hit(110, 45, 0.35, 0.5); else hit(420, 220, 0.12, 0.18, 'triangle');
    if (beat % 4 === 3) hit(1800, 900, 0.06, 0.12, 'square');
  }

  update(dt: number, ctx: ActivityContext): Update {
    this.t += dt;
    const spb = 60 / BPM;
    while (this.beatAt * spb / 2 <= this.t && this.beatAt / 2 < BEATS) { this.drum(this.beatAt / 2); this.beatAt++; }
    // Input: nearest unhit note in that lane.
    for (let lane = 0; lane < 4; lane++) {
      if (!ctx.input.hit(LANES[lane])) continue;
      let best: (typeof this.notes)[number] | null = null, bd = Infinity;
      for (const n of this.notes) {
        if (n.hit || n.lane !== lane) continue;
        const d = Math.abs(n.t - this.t);
        if (d < bd) { bd = d; best = n; }
      }
      if (best && bd <= GOOD) {
        best.hit = true;
        best.el.remove();
        const perfect = bd <= PERFECT;
        this.combo++;
        this.best = Math.max(this.best, this.combo);
        this.score += (perfect ? 100 : 50) * (1 + Math.min(this.combo, 20) / 10);
        this.hits[perfect ? 'perfect' : 'good']++;
        this.say(perfect ? 'Perfect!' : 'Good');
      } else {
        this.combo = 0;
        this.say('Off beat');
      }
    }
    // Notes fall from the top to the line at 85% height.
    for (const n of this.notes) {
      if (n.hit) continue;
      const k = 1 - (n.t - this.t) / TRAVEL;
      if (this.t - n.t > GOOD) {
        n.hit = true;
        n.el.remove();
        this.combo = 0;
        this.hits.miss++;
        continue;
      }
      n.el.style.top = `${Math.max(-10, k * 85)}%`;
      n.el.style.visibility = k < 0 ? 'hidden' : 'visible';
    }
    // Dancers: circle, step and clap.
    const spin = this.t * 0.6;
    this.dancers.forEach((c, k) => {
      const a = spin + (k / this.dancers.length) * Math.PI * 2;
      c.root.position.set(Math.cos(a) * 4.5, 0, Math.sin(a) * 4.5);
      c.root.rotation.y = -a + Math.PI; // facing along the circle
      c.animate(dt, 1.2 + 0.4 * Math.sin(this.t * Math.PI * 2 * (BPM / 60) / 2), false);
    });
    if (this.t > BEATS * spb + 1.5) {
      const total = this.hits.perfect + this.hits.good + this.hits.miss;
      const acc = total ? (this.hits.perfect + this.hits.good * 0.5) / total : 0;
      const pay = Math.round(20 + this.score / 40);
      ctx.pay(pay, `Garba score ${Math.round(this.score)}`);
      const isBest = ctx.record(this.id, Math.round(this.score));
      return { done: true, summary: `Score ${Math.round(this.score)}${isBest ? ' (new best!)' : ''} · ${Math.round(acc * 100)}% on beat · best combo ${this.best}. ₹${pay}.` };
    }
    return { done: false };
  }

  private say(text: string) {
    if (!this.feedback) return;
    this.feedback.textContent = this.combo > 2 ? `${text} ×${this.combo}` : text;
    this.feedback.classList.remove('pop');
    void this.feedback.offsetWidth;
    this.feedback.classList.add('pop');
  }

  status() {
    return `Score <b>${Math.round(this.score)}</b> · combo ${this.combo}`;
  }

  end(ctx: ActivityContext) {
    this.ui?.remove();
    this.ui = null;
    ctx.scene.remove(this.ring);
    this.ring.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
    this.ring = new THREE.Group();
    this.dancers = [];
    void this.audio?.close();
    this.audio = null;
  }
}
