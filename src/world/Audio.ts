// Fully synthesised soundscape: engine, horns and a quiet neighbourhood bed. No audio files.
export class Soundscape {
  ctx: AudioContext;
  master: GainNode;
  private engineGain: GainNode;
  private engineFilter: BiquadFilterNode;
  private oscA: OscillatorNode;
  private oscB: OscillatorNode;
  private bedGain: GainNode;
  private insects: GainNode;
  private birdsTimer = 0;
  enabled = false;
  constructor() {
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    // Engine: two detuned saws through a resonant low-pass.
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = "lowpass";
    this.engineFilter.Q.value = 4;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.oscA = this.ctx.createOscillator();
    this.oscB = this.ctx.createOscillator();
    this.oscA.type = "sawtooth";
    this.oscB.type = "square";
    this.oscA.connect(this.engineFilter);
    const sub = this.ctx.createGain();
    sub.gain.value = 0.35;
    this.oscB.connect(sub).connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain).connect(this.master);
    this.oscA.start();
    this.oscB.start();
    // Distant-city bed: filtered brown noise.
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 3, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.2;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 420;
    this.bedGain = this.ctx.createGain();
    this.bedGain.gain.value = 0.16;
    noise.connect(lp).connect(this.bedGain).connect(this.master);
    noise.start();
    // Night insects: amplitude-modulated high band.
    const hiss = this.ctx.createBufferSource();
    hiss.buffer = buffer;
    hiss.loop = true;
    hiss.playbackRate.value = 1.7;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 4800;
    bp.Q.value = 9;
    this.insects = this.ctx.createGain();
    this.insects.gain.value = 0;
    const trem = this.ctx.createOscillator();
    trem.frequency.value = 23;
    const tremDepth = this.ctx.createGain();
    tremDepth.gain.value = 0.5;
    const tremBias = this.ctx.createGain();
    trem.connect(tremDepth).connect(tremBias.gain);
    hiss.connect(bp).connect(tremBias).connect(this.insects).connect(this.master);
    trem.start();
    hiss.start();
  }
  async setEnabled(on: boolean) {
    this.enabled = on;
    if (on) await this.ctx.resume();
    else await this.ctx.suspend();
  }
  update(dt: number, speed: number, throttle: number, driving: boolean, night: number) {
    if (!this.enabled) return;
    const t = this.ctx.currentTime;
    // Fake a 4-speed gearbox so revs rise and fall.
    const kmh = Math.abs(speed) * 3.6;
    const gear = Math.min(4, Math.floor(kmh / 28));
    const rpm = 0.25 + ((kmh - gear * 28) / 28) * 0.6 + gear * 0.05;
    const f = 38 + rpm * 70;
    this.oscA.frequency.setTargetAtTime(f, t, 0.05);
    this.oscB.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    this.engineFilter.frequency.setTargetAtTime(260 + rpm * 900 + throttle * 500, t, 0.08);
    this.engineGain.gain.setTargetAtTime(driving ? 0.05 + throttle * 0.07 + rpm * 0.03 : 0, t, 0.15);
    this.insects.gain.setTargetAtTime(night * 0.035, t, 0.5);
    this.bedGain.gain.setTargetAtTime(0.12 + (1 - night) * 0.08, t, 0.5);
    this.birdsTimer -= dt;
    if (this.birdsTimer < 0) {
      this.birdsTimer = 3 + Math.random() * 6;
      if (night < 0.5) this.chirp();
    }
  }
  private chirp() {
    const t = this.ctx.currentTime;
    const notes = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < notes; i++) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const start = t + i * 0.13;
      const base = 2600 + Math.random() * 1400;
      o.frequency.setValueAtTime(base, start);
      o.frequency.exponentialRampToValueAtTime(base * 1.45, start + 0.08);
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.012, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.11);
      o.connect(g).connect(this.master);
      o.start(start);
      o.stop(start + 0.12);
    }
  }
  horn(volume = 1, pitch = 1) {
    if (!this.enabled || volume < 0.02) return;
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06 * volume, t + 0.02);
    g.gain.setValueAtTime(0.06 * volume, t + 0.38);
    g.gain.linearRampToValueAtTime(0, t + 0.45);
    const lp = this.ctx.createBiquadFilter();
    lp.frequency.value = 2200;
    g.connect(lp).connect(this.master);
    for (const f of [392 * pitch, 494 * pitch]) {
      const o = this.ctx.createOscillator();
      o.type = "square";
      o.frequency.value = f;
      o.connect(g);
      o.start(t);
      o.stop(t + 0.46);
    }
  }
  blip(freq = 880) {
    if (!this.enabled) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.value = freq;
    o.type = "sine";
    g.gain.setValueAtTime(0.04, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.26);
  }
  dispose() {
    this.ctx.close();
  }
}
