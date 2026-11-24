// Procedural, gentle soundscape built with WebAudio (no audio files needed)

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// D major, soft progression
const CHORDS = [
  [50, 57, 62, 66, 69, 76], // Dmaj9-ish
  [47, 54, 62, 66, 69, 74], // Bm7
  [43, 50, 59, 62, 66, 71], // Gmaj7
  [45, 52, 61, 64, 66, 71], // A6sus
  [42, 54, 61, 64, 69, 73], // F#m7
  [43, 55, 59, 62, 66, 74], // Gmaj9
];
const SCALE = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83, 86]; // D pentatonic

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.level = 0; // restoration level 0..1 (more musical layers)
    this.night = 0;
    this.chordIdx = 0;
    this.chordTimer = 0;
    this.noteTimer = 0;
    this.birdTimer = 2;
    this.cricketTimer = 0;
  }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.0;
    this.master.gain.linearRampToValueAtTime(0.85, ctx.currentTime + 3);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(3.2, 2.2);
    this.revGain = ctx.createGain(); this.revGain.gain.value = 0.55;
    this.reverb.connect(this.revGain).connect(this.master);

    this.musicBus = ctx.createGain(); this.musicBus.gain.value = 0.5;
    this.musicBus.connect(this.master);
    this.musicBus.connect(this.reverb);
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = 0.7;
    this.sfxBus.connect(this.master);
    this.sfxBus.connect(this.reverb);
    this.natureBus = ctx.createGain(); this.natureBus.gain.value = 0.6;
    this.natureBus.connect(this.master);

    this.noiseBuf = this.noiseBuffer(2);
    // wind bed
    this.wind = this.loopNoise(380, 0.6, 'bandpass');
    this.windGain = this.wind.gain;
    // water bed
    this.water = this.loopNoise(900, 0.3, 'lowpass');
    this.waterGain = this.water.gain;
    this.playChord(0);
  }

  impulse(sec, decay) {
    const ctx = this.ctx, len = ctx.sampleRate * sec;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }
  noiseBuffer(sec) {
    const ctx = this.ctx, len = ctx.sampleRate * sec;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    return buf;
  }
  loopNoise(freq, q, type) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f).connect(g).connect(this.natureBus);
    src.start();
    return { src, f, gain: g };
  }

  playChord(idx) {
    const ctx = this.ctx, t = ctx.currentTime;
    const notes = CHORDS[idx % CHORDS.length];
    const dur = 10;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900 + this.level * 900; lp.Q.value = 0.3;
    lp.connect(this.musicBus);
    notes.forEach((m, i) => {
      if (i > 3 + Math.round(this.level * 2)) return;
      for (const [type, det, vol] of [['triangle', -6, 0.05], ['sine', 7, 0.06]]) {
        const o = ctx.createOscillator(); o.type = type; o.frequency.value = mtof(m); o.detune.value = det;
        const g = ctx.createGain();
        const v = vol * (i === 0 ? 1.2 : 0.8);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(v, t + 3.5);
        g.gain.setValueAtTime(v, t + dur - 1);
        g.gain.linearRampToValueAtTime(0, t + dur + 3.5);
        o.connect(g).connect(lp);
        o.start(t); o.stop(t + dur + 4);
      }
    });
  }

  bell(midi, vol = 0.18, when = 0, bus) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + when;
    const f = mtof(midi);
    const out = ctx.createGain(); out.gain.value = vol;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) { pan.pan.value = Math.random() * 0.8 - 0.4; out.connect(pan).connect(bus || this.musicBus); } else out.connect(bus || this.musicBus);
    for (const [ratio, amp, dec] of [[1, 1, 2.2], [2, 0.35, 1.2], [3.01, 0.15, 0.6], [4.2, 0.06, 0.4]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * ratio;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(amp, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      o.connect(g).connect(out);
      o.start(t); o.stop(t + dec + 0.05);
    }
  }

  chirp() {
    const ctx = this.ctx, t0 = ctx.currentTime;
    const n = 2 + Math.floor(Math.random() * 4);
    const base = 2200 + Math.random() * 1800;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if (pan.pan) pan.pan.value = Math.random() * 1.6 - 0.8;
    pan.connect(this.natureBus);
    for (let i = 0; i < n; i++) {
      const t = t0 + i * (0.09 + Math.random() * 0.06);
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(base, t);
      o.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.5), t + 0.05);
      o.frequency.exponentialRampToValueAtTime(base * 0.9, t + 0.08);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.04, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      o.connect(g).connect(pan);
      o.start(t); o.stop(t + 0.1);
    }
  }

  cricket() {
    const ctx = this.ctx, t0 = ctx.currentTime;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if (pan.pan) pan.pan.value = Math.random() * 1.6 - 0.8;
    pan.connect(this.natureBus);
    const f = 4200 + Math.random() * 600;
    for (let i = 0; i < 3; i++) {
      const t = t0 + i * 0.05;
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.012, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
      o.connect(g).connect(pan); o.start(t); o.stop(t + 0.04);
    }
  }

  noiseHit(freq, vol, dur = 0.08, q = 1.2) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.02);
  }

  // ------------- public sfx
  step(surface = 'grass') {
    if (!this.ctx) return;
    if (surface === 'water') this.noiseHit(700 + Math.random() * 300, 0.18, 0.14, 0.8);
    else if (surface === 'stone') this.noiseHit(2400 + Math.random() * 500, 0.06, 0.05, 2);
    else this.noiseHit(1300 + Math.random() * 500, 0.07, 0.07, 0.9);
  }
  jump() { this.noiseHit(600, 0.08, 0.2, 0.6); }
  land() { this.noiseHit(400, 0.12, 0.12, 0.8); }
  pickup() { [74, 78, 81, 86].forEach((m, i) => this.bell(m, 0.16, i * 0.09, this.sfxBus)); }
  offer() { [62, 66, 69, 74, 78, 81, 86, 90].forEach((m, i) => this.bell(m, 0.13, i * 0.12, this.sfxBus)); }
  note(midi) { this.bell(midi, 0.28, 0, this.sfxBus); }
  wrong() { this.bell(57, 0.12, 0, this.sfxBus); this.bell(56, 0.1, 0.12, this.sfxBus); }
  blip() { this.bell(86 + Math.floor(Math.random() * 3) * 2, 0.025, 0, this.sfxBus); }
  chime() { [81, 85, 88, 93, 88, 85].forEach((m, i) => this.bell(m, 0.15, i * 0.16 + Math.random() * 0.05, this.sfxBus)); }
  success() { [66, 69, 74, 78, 74, 81].forEach((m, i) => this.bell(m, 0.16, i * 0.14, this.sfxBus)); }
  baa() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(420 + Math.random() * 80, t);
    o.frequency.linearRampToValueAtTime(380, t + 0.45);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 22;
    const lg = ctx.createGain(); lg.gain.value = 18; lfo.connect(lg).connect(o.frequency);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.07, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(f).connect(g).connect(this.sfxBus);
    o.start(t); lfo.start(t); o.stop(t + 0.55); lfo.stop(t + 0.55);
  }

  setEnabled(v) {
    this.enabled = v;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v ? 0.85 : 0, this.ctx.currentTime, 0.3);
  }

  update(dt, { night, nearWater, altitude, sitting }) {
    if (!this.ctx) return;
    this.night = night;
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(0.05 + Math.min(1, Math.max(0, altitude - 10) / 25) * 0.12 + Math.sin(t * 0.2) * 0.02, t, 1);
    this.waterGain.gain.setTargetAtTime(nearWater * 0.18, t, 0.5);

    this.chordTimer += dt;
    if (this.chordTimer > 10) { this.chordTimer = 0; this.chordIdx++; this.playChord(this.chordIdx); }

    this.noteTimer -= dt;
    if (this.noteTimer <= 0) {
      const tempo = 0.55;
      this.noteTimer = tempo * (1 + Math.floor(Math.random() * 3));
      const p = 0.25 + this.level * 0.5 + (sitting ? 0.2 : 0);
      if (Math.random() < p) {
        const chord = CHORDS[this.chordIdx % CHORDS.length];
        let m = SCALE[Math.floor(Math.random() * SCALE.length)];
        if (Math.random() < 0.4) m = chord[2 + Math.floor(Math.random() * 4)] + 12;
        this.bell(m, 0.05 + this.level * 0.04);
      }
    }
    this.birdTimer -= dt;
    if (this.birdTimer <= 0) {
      this.birdTimer = 1.5 + Math.random() * 5;
      if (night < 0.4) this.chirp();
    }
    if (night > 0.5) {
      this.cricketTimer -= dt;
      if (this.cricketTimer <= 0) { this.cricketTimer = 0.25 + Math.random() * 0.6; this.cricket(); }
    }
  }
}
