// audio.js — WebAudio synthesized engine, sfx, siren, music. No asset files needed.
export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.musicOn = true;
    this._started = false;
    this.master = null;
  }

  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.7;
      this.master.connect(this.ctx.destination);

      // ---- smooth engine: warm filtered triangle + soft sub, gentle vibrato ----
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      // master lowpass that opens with speed (keeps it from sounding buzzy)
      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 500;
      this.engineFilter.Q.value = 0.7;
      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.master);

      // main tone (triangle = mellow, not buzzy)
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'triangle';
      this.engineOsc.frequency.value = 70;
      const eg1 = this.ctx.createGain(); eg1.gain.value = 0.6;
      this.engineOsc.connect(eg1); eg1.connect(this.engineFilter);
      this.engineOsc.start();

      // soft sub one octave down (sine = body, no harshness)
      this.engineSub = this.ctx.createOscillator();
      this.engineSub.type = 'sine';
      this.engineSub.frequency.value = 35;
      const eg2 = this.ctx.createGain(); eg2.gain.value = 0.5;
      this.engineSub.connect(eg2); eg2.connect(this.engineFilter);
      this.engineSub.start();

      // subtle vibrato so it "idles" rather than sitting dead flat
      this.engineLfo = this.ctx.createOscillator();
      this.engineLfo.type = 'sine'; this.engineLfo.frequency.value = 7;
      this.engineLfoGain = this.ctx.createGain(); this.engineLfoGain.gain.value = 2.5;
      this.engineLfo.connect(this.engineLfoGain);
      this.engineLfoGain.connect(this.engineOsc.frequency);
      this.engineLfo.start();

      // siren nodes
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenGain.connect(this.master);
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'sine'; this.sirenOsc.frequency.value = 700;
      this.sirenLfo = this.ctx.createOscillator();
      this.sirenLfo.type = 'sine'; this.sirenLfo.frequency.value = 0.7;
      this.sirenLfoGain = this.ctx.createGain(); this.sirenLfoGain.gain.value = 220;
      this.sirenLfo.connect(this.sirenLfoGain); this.sirenLfoGain.connect(this.sirenOsc.frequency);
      this.sirenOsc.connect(this.sirenGain);
      this.sirenOsc.start(); this.sirenLfo.start();
    } catch (e) { this.ctx = null; }
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  setEnabled(v) { this.enabled = v; if (!v) { this._stopEngine(); this._stopSiren(); } }
  setMusic(v) { this.musicOn = v; }

  _stopEngine() { if (this.engineGain) this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1); }
  _stopSiren() { if (this.sirenGain) this.sirenGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2); }

  // call each frame with speed01 (0..1) and stars
  updateEngine(speed01, stars) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    if (!this.running) { // engine off (dead/menu): fade out
      this.engineGain.gain.setTargetAtTime(0, t, 0.12);
      this.sirenGain.gain.setTargetAtTime(0, t, 0.2);
      return;
    }
    // pitch rises gently with speed (kept low & warm)
    const f = 60 + speed01 * 95;
    this.engineOsc.frequency.setTargetAtTime(f, t, 0.08);
    this.engineSub.frequency.setTargetAtTime(f * 0.5, t, 0.08);
    // filter opens with speed -> "revving" without buzz
    this.engineFilter.frequency.setTargetAtTime(420 + speed01 * 900, t, 0.1);
    // quiet, smooth level
    this.engineGain.gain.setTargetAtTime(0.05 + speed01 * 0.06, t, 0.15);

    const sirenLvl = stars >= 1 ? Math.min(0.09, 0.03 + stars * 0.015) : 0;
    this.sirenGain.gain.setTargetAtTime(sirenLvl, t, 0.25);
  }

  // start/stop the engine loop (call on run start / death)
  startEngine() { this.running = true; }
  stopAll() {
    this.running = false;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.engineGain) this.engineGain.gain.setTargetAtTime(0, t, 0.12);
    if (this.sirenGain) this.sirenGain.gain.setTargetAtTime(0, t, 0.15);
  }

  _blip(freq, dur, type = 'square', vol = 0.3, slideTo = null) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain(); g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  _noise(dur, vol = 0.4, filterFreq = 1200) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }

  crash(heavy = true) { this._noise(heavy ? 0.4 : 0.18, heavy ? 0.6 : 0.3, heavy ? 900 : 1600); this._blip(heavy ? 120 : 220, 0.15, 'sawtooth', 0.3, 60); }
  screech() { this._noise(0.3, 0.2, 2600); }
  nearMiss() { this._blip(900, 0.12, 'sine', 0.18, 1500); }
  coin() { this._blip(1200, 0.08, 'square', 0.22, 1800); this._blip(1800, 0.08, 'square', 0.18); }
  bust() { this._blip(300, 0.5, 'sawtooth', 0.4, 80); }
  click() { this._blip(600, 0.05, 'square', 0.2); }
  jump() { this._blip(300, 0.22, 'sine', 0.25, 760); }   // rising whoosh
  land() { this._noise(0.12, 0.22, 800); this._blip(220, 0.1, 'sine', 0.18, 120); }
}
