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
