/** Minimal synthesised audio (CC0 by construction, PROMPT §9.7): horns and engine hum. */
import { Ambience, type AmbienceLevels } from './ambience';

export class Audio {
  private ctx: AudioContext | null = null;
  private amb: Ambience | null = null;
  private master: GainNode | null = null;
  private volume = 1;

  /** Master volume 0..1 (settings). */
  setVolume(v: number) {
    this.volume = v;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }
  private engine: { osc: OscillatorNode; osc2: OscillatorNode; gain: GainNode } | null = null;

  /** Must be called from a user gesture. */
  unlock() {
    if (this.ctx) return;
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
  }

  /** Someone else's horn, quieter with distance: autos go "pom-pom", buses blare, bikes beep. */
  hornAt(distance: number, kind: string) {
    const ctx = this.ctx;
    if (!ctx || distance > 120) return;
    const vol = 0.12 * Math.max(0, 1 - distance / 120);
    const t = ctx.currentTime;
    const freqs = kind === 'bus' ? [196, 247] : kind === 'auto' ? [330] : kind.startsWith('car') ? [370, 466] : [494, 622];
    const beeps = kind === 'auto' ? 2 : 1;
    for (let k = 0; k < beeps; k++) {
      const g = ctx.createGain();
      const t0 = t + k * 0.22;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
      g.gain.setValueAtTime(vol, t0 + 0.16);
      g.gain.linearRampToValueAtTime(0, t0 + 0.2);
      g.connect(this.master!);
      for (const f of freqs) {
        const o = ctx.createOscillator();
        o.type = 'square';
        o.frequency.value = f;
        o.connect(g);
        o.start(t0);
        o.stop(t0 + 0.21);
      }
    }
  }

  /** The player's horn, by vehicle: scooter two-tone, auto "pom-pom", bus/tractor blare, bicycle bell. */
  horn(kind = 'scooter') {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    if (kind === 'bell') {
      for (const t0 of [t, t + 0.18]) {
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.12, t0);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.5);
        g.connect(this.master!);
        for (const f of [2100, 2650]) {
          const o = ctx.createOscillator();
          o.type = 'sine';
          o.frequency.value = f;
          o.connect(g);
          o.start(t0);
          o.stop(t0 + 0.5);
        }
      }
      return;
    }
    const tones: Record<string, [number[], number, number]> = { // freqs, beeps, length
      scooter: [[440, 554], 1, 0.36], motorcycle: [[415, 523], 1, 0.36], auto: [[330], 2, 0.2],
      car: [[370, 466], 1, 0.4], bus: [[196, 247], 1, 0.6],
    };
    const [freqs, beeps, len] = tones[kind] ?? tones.scooter;
    for (let k = 0; k < beeps; k++) {
      const t0 = t + k * (len + 0.05);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.18, t0 + 0.01);
      gain.gain.setValueAtTime(0.18, t0 + len - 0.04);
      gain.gain.linearRampToValueAtTime(0, t0 + len);
      gain.connect(this.master!);
      for (const f of freqs) {
        const o = ctx.createOscillator();
        o.type = 'square';
        o.frequency.value = f;
        o.connect(gain);
        o.start(t0);
        o.stop(t0 + len + 0.01);
      }
    }
  }

  /** City ambience levels for this frame (started lazily after the first user gesture). */
  ambience(dt: number, levels: AmbienceLevels) {
    if (!this.ctx) return;
    this.amb ??= new Ambience(this.ctx, this.master!);
    this.amb.update(dt, levels);
  }

  /** Volume for a sound d metres away (0 beyond `max`). */
  private near(d: number, max: number) { return Math.max(0, 1 - d / max) ** 1.5; }

  /** A cow's moo: a low, nasal "mmm-ooo" that rises and falls. */
  moo(distance: number) {
    const ctx = this.ctx;
    const v = this.near(distance, 60);
    if (!ctx || v <= 0) return;
    const t = ctx.currentTime, len = 1.1 + Math.random() * 0.6;
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth';
    const base = 95 + Math.random() * 25;
    o.frequency.setValueAtTime(base * 0.9, t);
    o.frequency.linearRampToValueAtTime(base * 1.12, t + len * 0.35);
    o.frequency.linearRampToValueAtTime(base * 0.82, t + len);
    f.type = 'bandpass';
    f.Q.value = 2.5;
    f.frequency.setValueAtTime(320, t);
    f.frequency.linearRampToValueAtTime(720, t + len * 0.4); // mmm -> ooo
    f.frequency.linearRampToValueAtTime(500, t + len);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35 * v, t + 0.15);
    g.gain.setValueAtTime(0.35 * v, t + len * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(f).connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + len + 0.05);
  }

  /** A street dog's bark: two or three sharp "wuf"s. */
  bark(distance: number) {
    const ctx = this.ctx;
    const v = this.near(distance, 70);
    if (!ctx || v <= 0) return;
    const n = 1 + Math.floor(Math.random() * 3);
    const pitch = 380 + Math.random() * 220;
    for (let k = 0; k < n; k++) {
      const t = ctx.currentTime + k * (0.22 + Math.random() * 0.08);
      const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(pitch, t);
      o.frequency.exponentialRampToValueAtTime(pitch * 0.55, t + 0.13);
      f.type = 'bandpass';
      f.frequency.value = 900;
      f.Q.value = 1.2;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22 * v, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      o.connect(f).connect(g).connect(this.master!);
      o.start(t);
      o.stop(t + 0.17);
    }
  }

  /**
   * Someone talking (no words — a voice-like babble): syllables shaped by vowel formants at the speaker's
   * pitch, so a conversation sounds like a conversation from a few metres away.
   */
  speak(distance: number, pitch: number, syllables: number) {
    const ctx = this.ctx;
    const v = this.near(distance, 22);
    if (!ctx || v <= 0) return;
    const VOWELS = [[800, 1200], [400, 2000], [300, 2300], [450, 800], [350, 700], [600, 1700]];
    let t = ctx.currentTime;
    for (let k = 0; k < syllables; k++) {
      const len = 0.09 + Math.random() * 0.1;
      const [f1, f2] = VOWELS[Math.floor(Math.random() * VOWELS.length)];
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      const p = pitch * (0.92 + Math.random() * 0.18) * (k === syllables - 1 ? 0.88 : 1); // falls at the end
      o.frequency.setValueAtTime(p, t);
      o.frequency.linearRampToValueAtTime(p * (0.95 + Math.random() * 0.1), t + len);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.08 * v, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      for (const [f, q] of [[f1, 6], [f2, 9]]) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = f;
        bp.Q.value = q;
        o.connect(bp).connect(g);
      }
      g.connect(this.master!);
      o.start(t);
      o.stop(t + len + 0.02);
      t += len + (Math.random() < 0.2 ? 0.12 : 0.03);
    }
  }

  /** Short UI cues for activities: ding (checkpoint), good (paid), bad (late). */
  chime(kind: 'ding' | 'good' | 'bad') {
    const ctx = this.ctx;
    if (!ctx) return;
    const notes = kind === 'ding' ? [988] : kind === 'good' ? [659, 784, 988] : [330, 262];
    notes.forEach((f, k) => {
      const t = ctx.currentTime + k * 0.09;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.15, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g).connect(this.master!);
      o.start(t);
      o.stop(t + 0.32);
    });
  }

  private rain: GainNode | null = null;

  /** Monsoon rain: looping filtered noise, level 0..1. */
  setRain(level: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    if (!this.rain) {
      if (level < 0.01) return;
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let k = 0; k < len; k++) d[k] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 1800;
      band.Q.value = 0.5;
      this.rain = ctx.createGain();
      this.rain.gain.value = 0;
      src.connect(band).connect(this.rain).connect(this.master!);
      src.start();
    }
    this.rain.gain.setTargetAtTime(level * 0.12, ctx.currentTime, 0.5);
  }

  /** Engine hum; rpm01 in 0..1 (null to stop); pitch scales the note (big engines are lower). */
  setEngine(rpm01: number | null, pitch = 1) {
    const ctx = this.ctx;
    if (!ctx) return;
    if (rpm01 === null) {
      if (this.engine) {
        this.engine.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        const e = this.engine;
        setTimeout(() => { e.osc.stop(); e.osc2.stop(); }, 500);
        this.engine = null;
      }
      return;
    }
    if (!this.engine) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const osc2 = ctx.createOscillator();
      osc2.type = 'square';
      osc.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(this.master!);
      osc.start();
      osc2.start();
      this.engine = { osc, osc2, gain };
    }
    const t = ctx.currentTime;
    this.engine.osc.frequency.setTargetAtTime((38 + rpm01 * 110) * pitch, t, 0.08);
    this.engine.osc2.frequency.setTargetAtTime((19 + rpm01 * 55) * pitch, t, 0.08);
    this.engine.gain.gain.setTargetAtTime(0.035 + rpm01 * 0.04, t, 0.1);
  }
}
