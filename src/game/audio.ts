/**
 * Procedural audio: no asset files. Rain noise, city hum, engine drone,
 * tyre squeal and impact thumps are all generated with WebAudio.
 */
export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineSub: OscillatorNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private squealGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  enabled = true;

  init() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    const ctx = this.ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(ctx.destination);

    // ---- rain: filtered white noise ----
    const noise = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const rainSrc = ctx.createBufferSource();
    rainSrc.buffer = noise;
    rainSrc.loop = true;

    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = "bandpass";
    rainFilter.frequency.value = 2200;
    rainFilter.Q.value = 0.55;

    const rainHP = ctx.createBiquadFilter();
    rainHP.type = "highpass";
    rainHP.frequency.value = 700;

    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0.0;

    rainSrc.connect(rainFilter).connect(rainHP).connect(this.rainGain).connect(this.master);
    rainSrc.start();

    // ---- city hum: low detuned saws ----
    this.ambientGain = ctx.createGain();
    this.ambientGain.gain.value = 0.018;
    const ambLP = ctx.createBiquadFilter();
    ambLP.type = "lowpass";
    ambLP.frequency.value = 220;
    this.ambientGain.connect(ambLP).connect(this.master);

    for (const f of [47, 58.5, 71]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.connect(this.ambientGain);
      o.start();
    }

    // ---- engine ----
    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 420;
    this.filter.Q.value = 6;

    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;

    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = "sawtooth";
    this.engineOsc.frequency.value = 55;

    this.engineSub = ctx.createOscillator();
    this.engineSub.type = "square";
    this.engineSub.frequency.value = 27.5;

    const subGain = ctx.createGain();
    subGain.gain.value = 0.35;

    this.engineOsc.connect(this.filter);
    this.engineSub.connect(subGain).connect(this.filter);
    this.filter.connect(this.engineGain).connect(this.master);

    this.engineOsc.start();
    this.engineSub.start();

    // ---- tyre squeal ----
    const squealSrc = ctx.createBufferSource();
    squealSrc.buffer = noise;
    squealSrc.loop = true;
    const squealFilter = ctx.createBiquadFilter();
    squealFilter.type = "bandpass";
    squealFilter.frequency.value = 1900;
    squealFilter.Q.value = 8;
    this.squealGain = ctx.createGain();
    this.squealGain.gain.value = 0;
    squealSrc.connect(squealFilter).connect(this.squealGain).connect(this.master);
    squealSrc.start();

    // fade rain in
    this.rainGain.gain.linearRampToValueAtTime(0.16, ctx.currentTime + 2.5);
  }

  setEnabled(v: boolean) {
    this.enabled = v;
    if (this.master && this.ctx) {
      this.master.gain.linearRampToValueAtTime(v ? 0.55 : 0, this.ctx.currentTime + 0.2);
    }
  }

  /** speed in m/s, throttle -1..1 */
  updateEngine(speed: number, throttle: number, inCar: boolean) {
    if (!this.ctx || !this.engineOsc || !this.engineGain || !this.filter || !this.engineSub) return;
    const t = this.ctx.currentTime;
    const norm = Math.min(1, Math.abs(speed) / 34);
    const rpm = 46 + norm * 150 + Math.abs(throttle) * 22;
    this.engineOsc.frequency.setTargetAtTime(inCar ? rpm : 40, t, 0.08);
    this.engineSub.frequency.setTargetAtTime(inCar ? rpm * 0.5 : 20, t, 0.08);
    this.filter.frequency.setTargetAtTime(320 + norm * 1500, t, 0.12);
    this.engineGain.gain.setTargetAtTime(inCar ? 0.055 + norm * 0.05 : 0, t, 0.15);
  }

  updateTyres(slip: number) {
    if (!this.ctx || !this.squealGain) return;
    this.squealGain.gain.setTargetAtTime(Math.min(0.05, Math.max(0, slip) * 0.05), this.ctx.currentTime, 0.06);
  }

  thump(strength = 1) {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(120, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(38, ctx.currentTime + 0.28);
    g.gain.setValueAtTime(Math.min(0.5, 0.16 * strength), ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.34);
    o.connect(g).connect(this.master);
    o.start();
    o.stop(ctx.currentTime + 0.36);
  }

  blip(freq = 720, dur = 0.12) {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.1, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g).connect(this.master);
    o.start();
    o.stop(ctx.currentTime + dur + 0.02);
  }
}
