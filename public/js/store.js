export class Store {
  constructor() {
    this.db = null;
    this.ready = this.open();
  }
  async open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('palco-control', 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('tracks')) db.createObjectStore('tracks', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('fx')) db.createObjectStore('fx', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('scenes')) db.createObjectStore('scenes', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('config')) db.createObjectStore('config', { keyPath: 'key' });
      };
      req.onsuccess = (e) => { this.db = e.target.result; resolve(this.db); };
      req.onerror = () => reject(req.error);
    });
  }
  async loadTracks() { await this.ready; return new Promise((res) => { const r = this.db.transaction('tracks').objectStore('tracks').getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => res([]); }); }
  async loadFx() { await this.ready; return new Promise((res) => { const r = this.db.transaction('fx').objectStore('fx').getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => res([]); }); }
  async loadScenes() { await this.ready; return new Promise((res) => { const r = this.db.transaction('scenes').objectStore('scenes').getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => res([]); }); }
  async importTrack(file) {
    await this.ready;
    const buf = await file.arrayBuffer();
    const id = 'track-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    const t = { id, name: file.name.replace(/\.[^.]+$/, ''), duration: 0, volume: 1, scene: '', blob: buf };
    await new Promise((res, rej) => { const r = this.db.transaction('tracks', 'readwrite').objectStore('tracks').put(t); r.onsuccess = () => res(); r.onerror = () => rej(r.error); });
    t.createNode = (ctx) => { const src = ctx.createBufferSource(); const gain = ctx.createGain(); src.buffer = null; try { ctx.decodeAudioData(buf.slice(0), (b) => { src.buffer = b; src.start(); }); } catch (e) {} src.connect(gain); return gain; };
    return t;
  }
  async importFx(file) {
    await this.ready;
    const buf = await file.arrayBuffer();
    const id = 'fx-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    const fx = { id, name: file.name.replace(/\.[^.]+$/, ''), duration: 0, volume: 1, loop: false, key: '', blob: buf };
    await new Promise((res, rej) => { const r = this.db.transaction('fx', 'readwrite').objectStore('fx').put(fx); r.onsuccess = () => res(); r.onerror = () => rej(r.error); });
    fx.createNode = (ctx) => { const src = ctx.createBufferSource(); const gain = ctx.createGain(); gain.gain.value = fx.volume ?? 1; try { ctx.decodeAudioData(buf.slice(0), (b) => { src.buffer = b; src.loop = fx.loop; src.start(); }); } catch (e) {} src.connect(gain); return gain; };
    return fx;
  }
  async saveScene(s) { await this.ready; return new Promise((res, rej) => { const r = this.db.transaction('scenes', 'readwrite').objectStore('scenes').put(s); r.onsuccess = () => res(); r.onerror = () => rej(r.error); }); }
  async deleteTrack(id) { await this.ready; return new Promise((res) => { const r = this.db.transaction('tracks', 'readwrite').objectStore('tracks').delete(id); r.onsuccess = () => res(); r.onerror = () => res(); }); }
  async saveAll(app) { /* persistencia de config opcional */ }
}
