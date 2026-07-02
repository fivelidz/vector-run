// audio.js — plays real WAV samples (from assets/audio/) with a WebAudio synth
// fallback for any missing file. Handles: looping engine (pitch/volume by
// speed), looping siren (proximity fade), streamed music, and one-shot SFX.

const SFX_FILES = {
  crash: 'assets/audio/crash.wav',
  bump: 'assets/audio/bump.wav',
  screech: 'assets/audio/screech.wav',
  nearmiss: 'assets/audio/nearmiss.wav',
  coin: 'assets/audio/coin.wav',
  powerup: 'assets/audio/powerup.wav',
  jump: 'assets/audio/jump.wav',
  land: 'assets/audio/land.wav',
  boost: 'assets/audio/boost.wav',
  bust: 'assets/audio/bust.wav',
  explode: 'assets/audio/explode.wav',
  throw: 'assets/audio/throw.wav',
  click: 'assets/audio/click.wav',
  combo: 'assets/audio/combo.wav',
  whoosh: 'assets/audio/whoosh_transition.wav',
};
const LOOP_FILES = {
  engine: 'assets/audio/engine_loop.wav',
  siren: 'assets/audio/siren.wav',
  music: 'assets/audio/music_loop.mp3',        // compressed (WAV was 16 MB)
  musicDesert: 'assets/audio/music_desert_loop.mp3',
};

export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.musicOn = true;
    this.running = false;
    this.master = null;
    this.buffers = {};      // name -> AudioBuffer (or null if missing/failed)
    this._loops = {};       // name -> { src, gain, playbackRate }
    this._loaded = false;
    this._musicTrack = 'music';
  }

  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(this.ctx.destination);
      this._buildSynthEngine(); // synth fallback nodes (used if no engine sample)
      this._loadAll();
    } catch (e) { this.ctx = null; }
  }

  // ---------- sample loading ----------
  async _loadAll() {
    if (this._loaded) return; this._loaded = true;
    const all = { ...SFX_FILES, ...LOOP_FILES };
    await Promise.all(Object.entries(all).map(([name, url]) => this._load(name, url)));
    // once loaded, if we have an engine sample, prefer it over the synth
    if (this.buffers.engine) this._stopSynthEngine();
    if (this.running) this._ensureLoops();
  }
  async _load(name, url) {
    try {
      const res = await fetch(url);
      if (!res.ok) { this.buffers[name] = null; return; }
      const arr = await res.arrayBuffer();
      this.buffers[name] = await this.ctx.decodeAudioData(arr);
    } catch (e) { this.buffers[name] = null; }
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  setEnabled(v) {
    // mute/unmute must NOT clobber the run state (stopAll sets running=false,
    // which made un-muting mid-run leave the engine silent forever)
    this.enabled = v;
    if (!v) { this._stopLoop('engine'); this._stopLoop('siren'); this._stopLoop('music'); }
    else if (this.running) this._ensureLoops();
  }
  setMusic(v) { this.musicOn = v; if (!v) this._stopLoop('music'); else if (this.running) this._startMusic(); }

  // ---------- one-shot playback (sample, else synth fallback) ----------
  _play(name, { vol = 1, rate = 1 } = {}) {
    if (!this.ctx || !this.enabled) return false;
    const buf = this.buffers[name];
    if (!buf) return false; // caller falls back to synth
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(g); g.connect(this.master);
    src.start();
    return true;
  }

  // ---------- looping sources (engine/siren/music) ----------
  _startLoop(name, vol = 1) {
    if (this._loops[name] || !this.buffers[name] || !this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers[name]; src.loop = true;
    const g = this.ctx.createGain(); g.gain.value = 0;
    src.connect(g); g.connect(this.master);
    src.start();
    g.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.3);
    this._loops[name] = { src, gain: g };
  }
  _stopLoop(name) {
    const L = this._loops[name];
    if (!L) return;
    L.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
    const src = L.src; setTimeout(() => { try { src.stop(); } catch (e) {} }, 300);
    this._loops[name] = null; delete this._loops[name];
  }
  _ensureLoops() {
    if (!this.enabled) return;
    if (this.buffers.engine) this._startLoop('engine', 0.0001);
    if (this.musicOn && this.buffers.music) this._startMusic();
  }
  _startMusic() { if (this.musicOn && this.buffers[this._musicTrack || 'music'] && !this._loops.music) this._startMusicLoop(this._musicTrack || 'music'); }
  _startMusicLoop(track) {
    // start a music loop under the fixed key 'music' but using track's buffer
    if (this._loops.music || !this.buffers[track] || !this.ctx) return;
    const src = this.ctx.createBufferSource(); src.buffer = this.buffers[track]; src.loop = true;
    const g = this.ctx.createGain(); g.gain.value = 0; src.connect(g); g.connect(this.master); src.start();
    g.gain.setTargetAtTime(0.35, this.ctx.currentTime, 0.4);
    this._loops.music = { src, gain: g };
  }
  // switch between 'music' (highway) and 'musicDesert'
  setMusicTrack(track) {
    if (this._musicTrack === track) return;
    this._musicTrack = track;
    if (this.running && this.musicOn) { this._stopLoop('music'); setTimeout(() => this._startMusicLoop(track), 320); }
  }

  // ---------- engine + siren per-frame ----------
  startEngine() { this.running = true; this._ensureLoops(); }
  updateEngine(speed01, stars) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;

    // ENGINE
    if (this.buffers.engine) {
      const L = this._loops.engine;
      if (this.running && L) {
        L.src.playbackRate.setTargetAtTime(0.8 + speed01 * 0.9, t, 0.12); // pitch up with speed
        L.gain.gain.setTargetAtTime(0.28 + speed01 * 0.22, t, 0.15);
      } else if (L) L.gain.gain.setTargetAtTime(0, t, 0.12);
    } else {
      this._updateSynthEngine(speed01, t); // synth fallback
    }

    // (siren is a ONE-SHOT burst when a cruiser appears — sirenBurst() — the
    // continuous loop was annoying)
  }

  // single siren wail, played once when a police car shows up
  sirenBurst() {
    if (!this._play('siren', { vol: 0.45 })) {
      this._blip(700, 0.5, 'sine', 0.2, 950);
      setTimeout(() => this._blip(950, 0.5, 'sine', 0.18, 700), 450);
    }
  }

  stopAll() {
    this.running = false;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._stopLoop('engine'); this._stopLoop('siren'); this._stopLoop('music');
    if (this.engineGain) this.engineGain.gain.setTargetAtTime(0, t, 0.12);
    if (this.synthSirenGain) this.synthSirenGain.gain.setTargetAtTime(0, t, 0.15);
  }

  // ---------- SFX (sample first, synth fallback) ----------
  crash(heavy = true) { if (!this._play(heavy ? 'crash' : 'bump', { vol: heavy ? 1 : 0.9 })) { this._noise(heavy ? 0.4 : 0.18, heavy ? 0.6 : 0.3, heavy ? 900 : 1600); this._blip(heavy ? 120 : 220, 0.15, 'sawtooth', 0.3, 60); } }
  screech() { if (!this._play('screech', { vol: 0.6 })) this._noise(0.3, 0.2, 2600); }
  nearMiss() { if (!this._play('nearmiss', { vol: 0.7 })) this._blip(900, 0.12, 'sine', 0.18, 1500); }
  coin() { if (!this._play('coin', { vol: 0.7 })) { this._blip(1200, 0.08, 'square', 0.22, 1800); this._blip(1800, 0.08, 'square', 0.18); } }
  powerup() { if (!this._play('powerup', { vol: 0.9 })) { this._blip(600, 0.3, 'square', 0.3, 1600); } }
  bust() { if (!this._play('bust', { vol: 1 })) this._blip(300, 0.5, 'sawtooth', 0.4, 80); }
  explode() { if (!this._play('explode') && !this._play('crash')) { this._noise(0.5, 0.7, 700); this._blip(90, 0.3, 'sawtooth', 0.4, 40); } }
  click() { if (!this._play('click', { vol: 0.6 })) this._blip(600, 0.05, 'square', 0.2); }
  jump() { if (!this._play('jump', { vol: 0.8 })) this._blip(300, 0.22, 'sine', 0.25, 760); }
  land() { if (!this._play('land', { vol: 0.7 })) { this._noise(0.12, 0.22, 800); this._blip(220, 0.1, 'sine', 0.18, 120); } }
  boost() { if (!this._play('boost', { vol: 0.8 })) this._blip(300, 0.4, 'sawtooth', 0.3, 900); }
  throwSfx() { if (!this._play('throw', { vol: 0.6 })) this._blip(500, 0.15, 'sine', 0.2, 900); }
  combo() { if (!this._play('combo', { vol: 0.6 })) this._blip(800, 0.12, 'square', 0.18, 1200); }
  whoosh() { if (!this._play('whoosh', { vol: 0.7 })) this._blip(200, 0.6, 'sine', 0.25, 1200); }
  // invincibility about to end — descending warning beeps
  powerdown() {
    if (!this.ctx || !this.enabled) return;
    this._blip(900, 0.12, 'square', 0.22, 500);
    setTimeout(() => this._blip(700, 0.14, 'square', 0.2, 380), 160);
  }

  // ---------- synth fallback engine + siren ----------
  _buildSynthEngine() {
    this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass'; this.engineFilter.frequency.value = 500; this.engineFilter.Q.value = 0.7;
    this.engineFilter.connect(this.engineGain); this.engineGain.connect(this.master);
    this.engineOsc = this.ctx.createOscillator(); this.engineOsc.type = 'triangle'; this.engineOsc.frequency.value = 70;
    const eg1 = this.ctx.createGain(); eg1.gain.value = 0.6; this.engineOsc.connect(eg1); eg1.connect(this.engineFilter); this.engineOsc.start();
    this.engineSub = this.ctx.createOscillator(); this.engineSub.type = 'sine'; this.engineSub.frequency.value = 35;
    const eg2 = this.ctx.createGain(); eg2.gain.value = 0.5; this.engineSub.connect(eg2); eg2.connect(this.engineFilter); this.engineSub.start();
    this.engineLfo = this.ctx.createOscillator(); this.engineLfo.type = 'sine'; this.engineLfo.frequency.value = 7;
    this.engineLfoGain = this.ctx.createGain(); this.engineLfoGain.gain.value = 2.5;
    this.engineLfo.connect(this.engineLfoGain); this.engineLfoGain.connect(this.engineOsc.frequency); this.engineLfo.start();
    // synth siren
    this.synthSirenGain = this.ctx.createGain(); this.synthSirenGain.gain.value = 0; this.synthSirenGain.connect(this.master);
    this.synthSiren = this.ctx.createOscillator(); this.synthSiren.type = 'sine'; this.synthSiren.frequency.value = 700;
    const slfo = this.ctx.createOscillator(); slfo.type = 'sine'; slfo.frequency.value = 0.7;
    const slfoG = this.ctx.createGain(); slfoG.gain.value = 220; slfo.connect(slfoG); slfoG.connect(this.synthSiren.frequency);
    this.synthSiren.connect(this.synthSirenGain); this.synthSiren.start(); slfo.start();
  }
  _updateSynthEngine(speed01, t) {
    if (!this.running) { this.engineGain.gain.setTargetAtTime(0, t, 0.12); return; }
    const f = 60 + speed01 * 95;
    this.engineOsc.frequency.setTargetAtTime(f, t, 0.08);
    this.engineSub.frequency.setTargetAtTime(f * 0.5, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(420 + speed01 * 900, t, 0.1);
    this.engineGain.gain.setTargetAtTime(0.05 + speed01 * 0.06, t, 0.15);
  }
  _stopSynthEngine() { if (this.engineGain) this.engineGain.gain.value = 0; }

  _blip(freq, dur, type = 'square', vol = 0.3, slideTo = null) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain(); g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
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
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t);
  }
}
