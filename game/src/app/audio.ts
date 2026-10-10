/** Minimal synthesised audio (CC0 by construction, PROMPT §9.7): scooter horn and engine hum. */
export class Audio {
  private ctx: AudioContext | null = null;
  private engine: { osc: OscillatorNode; osc2: OscillatorNode; gain: GainNode } | null = null;

  /** Must be called from a user gesture. */
  unlock() {
    if (this.ctx) return;
    try {
      this.ctx = new AudioContext();
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
      g.connect(ctx.destination);
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

  /** Scooter horn: a bright two-tone beep. */
  horn() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.18, t + 0.01);
    gain.gain.setValueAtTime(0.18, t + 0.32);
    gain.gain.linearRampToValueAtTime(0, t + 0.36);
    gain.connect(ctx.destination);
    for (const f of [440, 554]) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f;
      o.connect(gain);
      o.start(t);
      o.stop(t + 0.37);
    }
  }

  /** Engine hum; rpm01 in 0..1, null to stop. */
  setEngine(rpm01: number | null) {
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
      gain.connect(ctx.destination);
      osc.start();
      osc2.start();
      this.engine = { osc, osc2, gain };
    }
    const t = ctx.currentTime;
    this.engine.osc.frequency.setTargetAtTime(38 + rpm01 * 110, t, 0.08);
    this.engine.osc2.frequency.setTargetAtTime(19 + rpm01 * 55, t, 0.08);
    this.engine.gain.gain.setTargetAtTime(0.035 + rpm01 * 0.04, t, 0.1);
  }
}
