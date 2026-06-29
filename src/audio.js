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

      // engine drone
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineGain.connect(this.master);
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 60;
      const eFilter = this.ctx.createBiquadFilter();
      eFilter.type = 'lowpass'; eFilter.frequency.value = 600;
      this.engineOsc.connect(eFilter); eFilter.connect(this.engineGain);
      this.engineOsc.start();
      // sub layer
      this.engineOsc2 = this.ctx.createOscillator();
      this.engineOsc2.type = 'square'; this.engineOsc2.frequency.value = 90;
      const g2 = this.ctx.createGain(); g2.gain.value = 0.3;
      this.engineOsc2.connect(g2); g2.connect(this.engineGain);
      this.engineOsc2.start();

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
    const f = 55 + speed01 * 180;
    this.engineOsc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.05);
    this.engineOsc2.frequency.setTargetAtTime(f * 1.5, this.ctx.currentTime, 0.05);
    this.engineGain.gain.setTargetAtTime(0.08 + speed01 * 0.10, this.ctx.currentTime, 0.1);

    const sirenLvl = stars >= 1 ? Math.min(0.12, 0.04 + stars * 0.02) : 0;
    this.sirenGain.gain.setTargetAtTime(sirenLvl, this.ctx.currentTime, 0.2);
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
