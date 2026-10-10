/**
 * City ambience (PROMPT §9.7), all synthesised (CC0 by construction): traffic hum by nearby traffic,
 * market chatter by nearby crowds, birds by day, crickets at night, temple bells at aarti time.
 */
export interface AmbienceLevels {
  traffic: number; // 0..1
  crowd: number; // 0..1
  night: number; // 0..1
  hour: number;
  rain: number; // 0..1 (birds and crickets go quiet)
}

function noiseBuffer(ctx: AudioContext, brown: boolean): AudioBuffer {
  const len = ctx.sampleRate * 3;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let k = 0; k < len; k++) {
    const w = Math.random() * 2 - 1;
    if (brown) { last = (last + 0.02 * w) / 1.02; d[k] = last * 3.5; } else d[k] = w;
  }
  return buf;
}

export class Ambience {
  private hum: GainNode;
  private chatter: GainNode;
  private chatterBands: BiquadFilterNode[] = [];
  private crickets: GainNode;
  private birdTimer = 2;
  private bellTimer = 20;
  private murmurTimer = 0;

  constructor(private ctx: AudioContext) {
    const out = ctx.createGain();
    out.gain.value = 1;
    out.connect(ctx.destination);
    const loop = (buf: AudioBuffer) => {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.start(ctx.currentTime + Math.random());
      return s;
    };
    // Traffic: brown noise, low-passed — the city's background rumble.
    this.hum = ctx.createGain();
    this.hum.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    loop(noiseBuffer(ctx, true)).connect(lp).connect(this.hum).connect(out);
    // Chatter: white noise through moving voice-like formant bands.
    this.chatter = ctx.createGain();
    this.chatter.gain.value = 0;
    const white = loop(noiseBuffer(ctx, false));
    for (const f of [550, 950, 1600]) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = 6;
      white.connect(bp).connect(this.chatter);
      this.chatterBands.push(bp);
    }
    this.chatter.connect(out);
    // Crickets: a 4.6 kHz tone pulsed at ~28 Hz in bursts.
    this.crickets = ctx.createGain();
    this.crickets.gain.value = 0;
    const tone = ctx.createOscillator();
    tone.frequency.value = 4600;
    const am = ctx.createGain();
    am.gain.value = 0;
    const pulse = ctx.createOscillator();
    pulse.type = 'square';
    pulse.frequency.value = 28;
    const pulseDepth = ctx.createGain();
    pulseDepth.gain.value = 0.5;
    pulse.connect(pulseDepth).connect(am.gain);
    const burst = ctx.createOscillator();
    burst.type = 'square';
    burst.frequency.value = 1.6;
    const burstDepth = ctx.createGain();
    burstDepth.gain.value = 0.5;
    burst.connect(burstDepth).connect(am.gain);
    tone.connect(am).connect(this.crickets).connect(out);
    for (const o of [tone, pulse, burst]) o.start();
  }

  update(dt: number, l: AmbienceLevels) {
    const t = this.ctx.currentTime;
    const day = 1 - l.night;
    this.hum.gain.setTargetAtTime(0.012 + 0.07 * l.traffic, t, 0.8);
    this.chatter.gain.setTargetAtTime(0.09 * l.crowd, t, 0.6);
    this.crickets.gain.setTargetAtTime(0.008 * l.night * (1 - 0.7 * l.traffic) * (1 - l.rain), t, 1.5);
    // Voices rise and fall: re-tune the formants a few times a second.
    if ((this.murmurTimer -= dt) <= 0) {
      this.murmurTimer = 0.15 + Math.random() * 0.25;
      this.chatterBands.forEach((b, k) => b.frequency.setTargetAtTime([500, 900, 1500][k] * (0.8 + Math.random() * 0.5), t, 0.08));
    }
    // Birds: chirps by day, most in the morning, fewer in heavy traffic or rain.
    const morning = Math.exp(-(((l.hour - 7) / 2) ** 2));
    const birdRate = day * (0.15 + 0.6 * morning) * (1 - 0.6 * l.traffic) * (1 - l.rain);
    if ((this.birdTimer -= dt) <= 0) {
      this.birdTimer = 0.4 + Math.random() * 3 / Math.max(birdRate, 0.05);
      if (birdRate > 0.05) this.chirp();
    }
    // Temple bells around morning and evening aarti (6–8 am, 6:30–8 pm).
    const aarti = (l.hour > 6 && l.hour < 8) || (l.hour > 18.5 && l.hour < 20);
    if ((this.bellTimer -= dt) <= 0) {
      this.bellTimer = 8 + Math.random() * 25;
      if (aarti) this.bell();
    }
  }

  private chirp() {
    const c = this.ctx, t = c.currentTime;
    const f = 2400 + Math.random() * 1800;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let k = 0; k < n; k++) {
      const t0 = t + k * 0.11;
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.setValueAtTime(f, t0);
      o.frequency.exponentialRampToValueAtTime(f * (Math.random() < 0.5 ? 1.4 : 0.7), t0 + 0.08);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.02, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
      o.connect(g).connect(c.destination);
      o.start(t0);
      o.stop(t0 + 0.1);
    }
  }

  /** A distant temple bell: inharmonic partials with a long decay, struck a few times. */
  private bell() {
    const c = this.ctx;
    const strikes = 3 + Math.floor(Math.random() * 5);
    for (let s = 0; s < strikes; s++) {
      const t0 = c.currentTime + s * 0.7;
      for (const [f, a] of [[523, 0.03], [1312, 0.015], [2093, 0.008], [2780, 0.005]]) {
        const o = c.createOscillator(), g = c.createGain();
        o.frequency.value = f;
        g.gain.setValueAtTime(a, t0);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.5);
        o.connect(g).connect(c.destination);
        o.start(t0);
        o.stop(t0 + 2.6);
      }
    }
  }
}
