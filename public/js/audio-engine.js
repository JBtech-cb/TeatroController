export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicBus = null;
    this.fx = [];
    this.mics = new Map();
    this.musicTracks = [];
    this.nowPlaying = null;
    this.crossfade = 2;
  }
  async ensure() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    const limiter = this.ctx.createDynamicsCompressor();
    limiter.threshold.value = -1;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.1;
    this.master.connect(limiter);
    limiter.connect(this.ctx.destination);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.8;
    this.musicBus.connect(this.master);
  }
  async resume() {
    await this.ensure();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }
  setMasterMusic(v) { if (this.musicBus) this.musicBus.gain.value = v; }
  setMasterOut(v) { if (this.master) this.master.gain.value = v; }
  addMic(id, stream) {
    const ctx = this.ctx;
    const src = ctx.createMediaStreamSource(stream);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 80;
    const gate = ctx.createGain(); gate.gain.value = 1;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 4;
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -1; lim.ratio.value = 20;
    const fader = ctx.createGain(); fader.gain.value = 0.7;
    src.connect(hp); hp.connect(gate); gate.connect(comp); comp.connect(lim); lim.connect(fader); fader.connect(this.master);
    const analyser = ctx.createAnalyser(); analyser.fftSize = 1024;
    fader.connect(analyser);
    const mic = { id, stream, src, hp, gate, comp, lim, fader, analyser, muted: false, volume: 0.7, gainDb: 0 };
    this.mics.set(id, mic);
    return mic;
  }
  removeMic(id) {
    const m = this.mics.get(id);
    if (!m) return;
    try { m.src.disconnect(); } catch {}
    this.mics.delete(id);
  }
  setMicVolume(id, v) { const m = this.mics.get(id); if (m) m.fader.gain.value = m.muted ? 0 : v; }
  setMicMute(id, muted) { const m = this.mics.get(id); if (!m) return; m.muted = muted; m.fader.gain.value = muted ? 0 : m.volume; }
  setMicGain(id, db) { const m = this.mics.get(id); if (m) { m.gainDb = db; m.gate.gain.value = Math.pow(10, db / 20); } }
  setMicGate(id, on, thr) { const m = this.mics.get(id); if (!m) return; m.gate.gain.value = on ? (m.gate.gain.value < 0.0001 ? 0 : m.gate.gain.value) : 1; }
  micLevel(id) { const m = this.mics.get(id); if (!m) return -100; const b = new Uint8Array(m.analyser.fftSize); m.analyser.getByteTimeDomainData(b); let s=0; for(let i=0;i<b.length;i++){const v=(b[i]-128)/128;s+=v*v;} return 20*Math.log10(Math.max(Math.sqrt(s/b.length),1e-6)); }
  async playMusic(track, crossfade) {
    await this.ensure(); await this.resume();
    const cf = crossfade ?? this.crossfade;
    const prev = this.nowPlaying;
    const node = await track.createNode(this.ctx);
    node.gain.value = cf > 0 ? 0 : 1;
    node.connect(this.musicBus);
    track.node = node; track.startedAt = this.ctx.currentTime;
    this.nowPlaying = track;
    if (prev && prev !== track && cf > 0) {
      const g = prev.node.gain;
      const from = g.value;
      g.cancelScheduledValues(this.ctx.currentTime);
      g.setValueAtTime(from, this.ctx.currentTime);
      g.linearRampToValueAtTime(0, this.ctx.currentTime + cf);
      setTimeout(() => { try { prev.node.disconnect(); prev.node.stop?.(); } catch {} }, cf * 1000 + 50);
    }
    if (cf > 0) {
      node.gain.cancelScheduledValues(this.ctx.currentTime);
      node.gain.setValueAtTime(0, this.ctx.currentTime);
      node.gain.linearRampToValueAtTime(1, this.ctx.currentTime + cf);
    }
    track.playing = true;
  }
  stopMusic(fast = false) {
    const t = this.nowPlaying; if (!t || !t.node) return;
    const g = t.node.gain; const dur = fast ? 0.2 : 0.5;
    g.cancelScheduledValues(this.ctx.currentTime);
    g.setValueAtTime(g.value, this.ctx.currentTime);
    g.linearRampToValueAtTime(0, this.ctx.currentTime + dur);
    setTimeout(() => { try { t.node.disconnect(); t.node.stop?.(); } catch {} t.playing = false; }, dur * 1000 + 50);
    this.nowPlaying = null;
  }
  fadeOutMusic(dur) { this.stopMusic(false); }
  playFx(fx) {
    this.ensure().then(() => this.resume());
    const node = fx.createNode(this.ctx);
    node.connect(this.master); fx.node = node; fx.playing = true;
    node.onended = () => { fx.playing = false; fx.node = null; };
  }
  stopFx(fx) { if (fx.node) { try { fx.node.stop(); } catch {} fx.node = null; fx.playing = false; } }
  masterLevel() {
    if (!this.master) return -100;
    // placeholder
    return -20;
  }
}
