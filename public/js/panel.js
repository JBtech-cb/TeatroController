import { AudioEngine } from './audio-engine.js';
import { Signaling } from './signaling.js';
import { Store } from './store.js';

const $ = (id) => document.getElementById(id);

const app = {
  engine: new AudioEngine(),
  signaling: null,
  store: new Store(),
  room: '',
  pin: '',
  mics: new Map(),
  tracks: [],
  fx: [],
  scenes: [],
  currentScene: null,
  currentCue: 0,
  shortcuts: {},
  txState: {},
  lastLevelTick: 0,
};

function toast(msg, kind = 'ok') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function showTab(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + name));
}

document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));

function formatTime(s) {
  if (!isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${ss}`;
}

function renderMics() {
  const grid = $('mic-grid');
  if (!grid) return;
  grid.innerHTML = '';
  for (const [id, mic] of app.mics) {
    const ch = document.createElement('div');
    ch.className = 'channel' + (mic.transmitting ? '' : ' muted') + (mic.online ? '' : ' offline');
    ch.innerHTML = `
      <div class="channel-head">
        <input class="channel-name" value="${mic.name || id}" data-id="${id}" />
        <span class="channel-tag ${mic.online ? 'live' : ''}">${mic.online ? 'LIVE' : 'OFFLINE'}</span>
        ${mic.transmitting ? '<span class="channel-tag tx">TX</span>' : ''}
      </div>
      <div class="meter"><i></i><span class="peak"></span></div>
      <div class="row"><span class="lbl">VOLUME</span><input type="range" class="mic-vol" data-id="${id}" min="0" max="1" step="0.01" value="${mic.volume ?? 0.7}" /><span class="val">${Math.round((mic.volume ?? 0.7) * 100)}%</span></div>
      <div class="row"><span class="lbl">GANHO</span><input type="range" class="mic-gain" data-id="${id}" min="-12" max="12" step="1" value="${mic.gainDb ?? 0}" /><span class="val">${mic.gainDb ?? 0} dB</span></div>
      <div class="proc-grid">
        <label><input type="checkbox" class="mic-echo" data-id="${id}" ${mic.settings?.echoCancellation ? 'checked' : ''} /> eco</label>
        <label><input type="checkbox" class="mic-noise" data-id="${id}" ${mic.settings?.noiseSuppression ? 'checked' : ''} /> ruído</label>
        <label><input type="checkbox" class="mic-agc" data-id="${id}" ${mic.settings?.autoGainControl ? 'checked' : ''} /> ganho auto</label>
        <label><input type="checkbox" class="mic-mute" data-id="${id}" ${mic.muted ? 'checked' : ''} /> MUTE</label>
      </div>
      <details><summary>detalhes</summary><div class="proc-detail">
        <div class="row small"><span>taxa</span><span>${mic.settings?.sampleRate || '?'} Hz</span></div>
        <div class="row small"><span>canal</span><span>${mic.settings?.channelCount || '?'}</span></div>
        <div class="row small"><span>gate</span><span>${mic.gateOn ? 'aberto' : 'fechado'}</span></div>
      </div></details>
      <div class="channel-foot"><button class="btn tiny" data-action="kick" data-id="${id}">DERRUBAR</button><button class="btn tiny" data-action="rename" data-id="${id}">RENOMEAR</button></div>
    `;
    grid.appendChild(ch);
  }
  // wire
  grid.querySelectorAll('.mic-vol').forEach((el) => el.addEventListener('input', (e) => {
    const id = e.target.dataset.id;
    const v = parseFloat(e.target.value);
    const mic = app.mics.get(id);
    if (mic) { mic.volume = v; app.engine.setMicVolume(id, v); }
    e.target.nextElementSibling.textContent = Math.round(v * 100) + '%';
  }));
  grid.querySelectorAll('.mic-gain').forEach((el) => el.addEventListener('input', (e) => {
    const id = e.target.dataset.id;
    const db = parseFloat(e.target.value);
    const mic = app.mics.get(id);
    if (mic) { mic.gainDb = db; app.engine.setMicGain(id, db); }
    e.target.nextElementSibling.textContent = db + ' dB';
  }));
  grid.querySelectorAll('.mic-mute').forEach((el) => el.addEventListener('change', (e) => {
    const id = e.target.dataset.id;
    const muted = e.target.checked;
    const mic = app.mics.get(id);
    if (mic) { mic.muted = muted; app.engine.setMicMute(id, muted); }
    renderMics();
  }));
  grid.querySelectorAll('.mic-echo').forEach((el) => el.addEventListener('change', (e) => {
    const id = e.target.dataset.id;
    const mic = app.mics.get(id);
    if (mic) { mic.settings = mic.settings || {}; mic.settings.echoCancellation = e.target.checked; app.signaling?.send({ t: 'mic-settings', to: id, settings: mic.settings }); }
  }));
  grid.querySelectorAll('.mic-noise').forEach((el) => el.addEventListener('change', (e) => {
    const id = e.target.dataset.id;
    const mic = app.mics.get(id);
    if (mic) { mic.settings = mic.settings || {}; mic.settings.noiseSuppression = e.target.checked; app.signaling?.send({ t: 'mic-settings', to: id, settings: mic.settings }); }
  }));
  grid.querySelectorAll('.mic-agc').forEach((el) => el.addEventListener('change', (e) => {
    const id = e.target.dataset.id;
    const mic = app.mics.get(id);
    if (mic) { mic.settings = mic.settings || {}; mic.settings.autoGainControl = e.target.checked; app.signaling?.send({ t: 'mic-settings', to: id, settings: mic.settings }); }
  }));
  grid.querySelectorAll('[data-action="kick"]').forEach((el) => el.addEventListener('click', (e) => {
    const id = e.currentTarget.dataset.id;
    app.signaling?.send({ t: 'disconnect-mic', id });
  }));
  grid.querySelectorAll('[data-action="rename"]').forEach((el) => el.addEventListener('click', (e) => {
    const id = e.currentTarget.dataset.id;
    const name = prompt('Novo nome do microfone:');
    if (name) app.signaling?.send({ t: 'rename-mic', id, name });
  }));
  grid.querySelectorAll('.channel-name').forEach((el) => el.addEventListener('change', (e) => {
    const id = e.target.dataset.id;
    const mic = app.mics.get(id);
    if (mic) mic.name = e.target.value;
  }));
}

function renderTracks() {
  const list = $('track-list');
  if (!list) return;
  list.innerHTML = '';
  for (const t of app.tracks) {
    const row = document.createElement('div');
    row.className = 'track' + (app.engine.nowPlaying === t ? ' playing' : '');
    row.innerHTML = `
      <div class="track-title"><b>${t.name}</b><span>${formatTime(t.duration || 0)}</span></div>
      <input type="range" class="track-vol" data-id="${t.id}" min="0" max="1" step="0.01" value="${t.volume ?? 1}" />
      <select class="scene-select" data-id="${t.id}">${app.scenes.map((s) => `<option value="${s.id}" ${t.scene === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}<option value="">— sem cena —</option></select>
      <div class="track-actions"><button class="btn tiny" data-action="play" data-id="${t.id}">TOCAR</button><button class="btn tiny" data-action="remove" data-id="${t.id}">✕</button></div>
    `;
    list.appendChild(row);
  }
  list.querySelectorAll('[data-action="play"]').forEach((el) => el.addEventListener('click', (e) => {
    const id = e.currentTarget.dataset.id;
    const t = app.tracks.find((x) => x.id === id);
    if (t) app.engine.playMusic(t, app.engine.crossfade);
    renderTracks();
  }));
  list.querySelectorAll('[data-action="remove"]').forEach((el) => el.addEventListener('click', (e) => {
    const id = e.currentTarget.dataset.id;
    app.tracks = app.tracks.filter((x) => x.id !== id);
    app.store.deleteTrack(id);
    renderTracks();
  }));
  list.querySelectorAll('.track-vol').forEach((el) => el.addEventListener('input', (e) => {
    const id = e.target.dataset.id;
    const t = app.tracks.find((x) => x.id === id);
    if (t) { t.volume = parseFloat(e.target.value); if (t.node) t.node.gain.value = t.volume; }
  }));
}

function renderFx() {
  const grid = $('fx-grid');
  if (!grid) return;
  grid.innerHTML = '';
  for (const fx of app.fx) {
    const card = document.createElement('div');
    card.className = 'fx-card' + (fx.playing ? ' playing' : '');
    card.innerHTML = `
      <div class="fx-title"><b>${fx.name}</b><span class="fx-key">${fx.key || '—'}</span></div>
      <button class="btn fx-play ${fx.playing ? 'playing' : ''}" data-id="${fx.id}">${fx.playing ? 'PARAR' : 'DISPARAR'}</button>
      <div class="fx-controls"><input type="range" class="fx-vol" data-id="${fx.id}" min="0" max="1" step="0.01" value="${fx.volume ?? 1}" /><button class="btn tiny" data-action="loop" data-id="${fx.id}">${fx.loop ? 'LOOP ON' : 'LOOP'}</button></div>
      <div class="fx-meta"><span>${formatTime(fx.duration || 0)}</span><span>${fx.playing ? 'tocando' : 'parado'}</span></div>
    `;
    grid.appendChild(card);
  }
  grid.querySelectorAll('.fx-play').forEach((el) => el.addEventListener('click', (e) => {
    const id = e.currentTarget.dataset.id;
    const fx = app.fx.find((x) => x.id === id);
    if (!fx) return;
    if (fx.playing) app.engine.stopFx(fx); else app.engine.playFx(fx);
    renderFx();
  }));
  grid.querySelectorAll('.fx-vol').forEach((el) => el.addEventListener('input', (e) => {
    const id = e.target.dataset.id;
    const fx = app.fx.find((x) => x.id === id);
    if (fx) { fx.volume = parseFloat(e.target.value); if (fx.node) fx.node.gain.value = fx.volume; }
  }));
  grid.querySelectorAll('[data-action="loop"]').forEach((el) => el.addEventListener('click', (e) => {
    const id = e.currentTarget.dataset.id;
    const fx = app.fx.find((x) => x.id === id);
    if (fx) { fx.loop = !fx.loop; renderFx(); }
  }));
}

function renderScenes() {
  const list = $('scene-list');
  if (!list) return;
  list.innerHTML = '';
  for (const s of app.scenes) {
    const btn = document.createElement('button');
    btn.className = 'scene-item' + (app.currentScene === s.id ? ' active' : '');
    btn.innerHTML = `<b>${s.name}</b><span>${(s.cues || []).length} deixas</span>`;
    btn.addEventListener('click', () => { app.currentScene = s.id; app.currentCue = 0; renderScenes(); renderSceneDetail(); });
    list.appendChild(btn);
  }
  renderSceneDetail();
}

function renderSceneDetail() {
  const el = $('scene-detail');
  if (!el) return;
  const s = app.scenes.find((x) => x.id === app.currentScene);
  if (!s) { el.innerHTML = '<p class="muted">Selecione ou crie uma cena.</p>'; return; }
  el.innerHTML = `
    <h3>${s.name}</h3>
    <p class="scene-desc">${s.description || ''}</p>
    <div class="cue-list" id="cue-list"></div>
    <div class="two-col">
      <input type="text" id="cue-text" placeholder="texto da deixas" />
      <select id="cue-action"><option value="play-track">tocar música</option><option value="play-fx">disparar efeito</option><option value="stop-music">parar música</option><option value="mute-mics">silenciar mics</option></select>
      <select id="cue-target"></select>
      <button class="btn" id="add-cue">+ DEIXA</button>
    </div>
    <div class="row" style="margin-top:12px"><button class="btn primary" id="next-cue">PRÓXIMA DEIXA (Enter)</button><button class="btn" id="reset-cues">REINICIAR</button></div>
  `;
  const cueList = $('cue-list');
  (s.cues || []).forEach((c, i) => {
    const row = document.createElement('div');
    row.className = 'cue' + (i === app.currentCue ? ' current' : '') + (i < app.currentCue ? ' done' : '');
    row.innerHTML = `<span class="cue-num">${i + 1}</span><span class="cue-text">${c.text}</span><span class="cue-action">${c.action}</span>`;
    cueList.appendChild(row);
  });
  $('add-cue')?.addEventListener('click', () => {
    const text = $('cue-text').value.trim();
    const action = $('cue-action').value;
    const target = $('cue-target').value;
    if (!text) return;
    s.cues = s.cues || [];
    s.cues.push({ text, action, target });
    app.store.saveScene(s);
    renderSceneDetail();
  });
  $('next-cue')?.addEventListener('click', () => {
    if (app.currentCue < (s.cues || []).length) {
      const c = s.cues[app.currentCue];
      executeCue(c);
      app.currentCue++;
      renderSceneDetail();
    }
  });
  $('reset-cues')?.addEventListener('click', () => { app.currentCue = 0; renderSceneDetail(); });
}

function executeCue(c) {
  if (c.action === 'play-track') { const t = app.tracks.find((x) => x.id === c.target); if (t) app.engine.playMusic(t, app.engine.crossfade); }
  if (c.action === 'play-fx') { const fx = app.fx.find((x) => x.id === c.target); if (fx) app.engine.playFx(fx); }
  if (c.action === 'stop-music') app.engine.stopMusic();
  if (c.action === 'mute-mics') for (const [id] of app.mics) app.engine.setMicMute(id, true);
  renderTracks(); renderFx(); renderMics();
}

function emergency(action) {
  if (action === 'mute-mics') for (const [id] of app.mics) app.engine.setMicMute(id, true);
  if (action === 'stop-music') app.engine.stopMusic(true);
  if (action === 'stop-fx') for (const fx of app.fx) app.engine.stopFx(fx);
  if (action === 'mute-all') { for (const [id] of app.mics) app.engine.setMicMute(id, true); app.engine.stopMusic(true); for (const fx of app.fx) app.engine.stopFx(fx); }
  if (action === 'resume') { for (const [id, m] of app.mics) app.engine.setMicMute(id, m.mutedBefore ?? false); }
  renderMics(); renderFx(); renderTracks();
  $('emg-state').textContent = action === 'resume' ? 'operação normal' : 'EMERGÊNCIA ATIVA';
  $('emg-state').classList.toggle('alert', action !== 'resume');
}

document.querySelectorAll('.emg').forEach((b) => b.addEventListener('click', () => emergency(b.dataset.action)));

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  const k = e.key.toLowerCase();
  if (k === 'm') emergency('mute-mics');
  if (k === ',') emergency('stop-music');
  if (k === '.') emergency('stop-fx');
  if (k === 'x') emergency('mute-all');
  if (k === 'r') emergency('resume');
});

async function connectSignaling() {
  const cfg = await fetch('/config.json').then((r) => r.json());
  app.room = cfg.room;
  $('room-name').textContent = cfg.room;
  app.signaling = new Signaling({ room: cfg.room, pin: app.pin, role: 'panel' });
  app.signaling.on('welcome', (msg) => {
    $('conn-led').classList.add('on'); $('conn-text').textContent = 'conectado';
    if (msg.mics) for (const m of msg.mics) upsertMic(m);
    renderMics();
  });
  app.signaling.on('mic-joined', (msg) => { upsertMic(msg.mic); renderMics(); toast(msg.mic.name + ' entrou', 'ok'); });
  app.signaling.on('mic-left', (msg) => { const m = app.mics.get(msg.id); if (m) m.online = false; renderMics(); toast((m?.name || msg.id) + ' saiu', 'warn'); });
  app.signaling.on('signal', (msg) => { /* WebRTC tratado em módulo separado no projeto real; aqui apenas log */ console.log('signal', msg.from, msg.data?.type); });
  app.signaling.on('mic-state', (msg) => { const m = app.mics.get(msg.id); if (m) { m.transmitting = msg.transmitting; renderMics(); } });
  app.signaling.on('mic-settings', (msg) => { const m = app.mics.get(msg.id); if (m) { m.settings = msg.settings; renderMics(); } });
  app.signaling.on('kicked-ack', () => toast('microfone derrubado', 'ok'));
  app.signaling.on('status', (s) => {
    if (s.state !== 'online') { $('conn-led').classList.remove('on'); $('conn-text').textContent = s.state; }
  });
  app.signaling.connect();
}

function upsertMic(m) {
  const existing = app.mics.get(m.id) || {};
  app.mics.set(m.id, { ...existing, ...m, online: true, transmitting: m.transmitting ?? true, volume: existing.volume ?? 0.7, settings: m.settings || existing.settings });
  if (!app.engine.mics.has(m.id)) {
    // stream virá via WebRTC; placeholder
  }
}

async function init() {
  // PIN
  const saved = localStorage.getItem('palco_pin');
  if (saved) { app.pin = saved; $('pin-mask').textContent = '••••'; }
  else {
    const p = prompt('PIN da sala:');
    if (p) { app.pin = p; localStorage.setItem('palco_pin', p); }
  }
  await app.engine.ensure();
  await app.engine.resume();
  // load store
  app.tracks = await app.store.loadTracks();
  app.fx = await app.store.loadFx();
  app.scenes = await app.store.loadScenes();
  renderTracks(); renderFx(); renderScenes();
  // import music
  $('import-music')?.addEventListener('change', async (e) => {
    for (const f of e.target.files) {
      const t = await app.store.importTrack(f);
      app.tracks.push(t);
    }
    renderTracks();
    app.store.saveAll(app);
  });
  $('import-fx')?.addEventListener('change', async (e) => {
    for (const f of e.target.files) {
      const fx = await app.store.importFx(f);
      app.fx.push(fx);
    }
    renderFx();
  });
  // master controls
  $('master-music')?.addEventListener('input', (e) => { const v = parseFloat(e.target.value); app.engine.setMasterMusic(v); $('master-music-val').textContent = Math.round(v * 100) + '%'; });
  $('master-out')?.addEventListener('input', (e) => { const v = parseFloat(e.target.value); app.engine.setMasterOut(v); $('master-out-val').textContent = Math.round(v * 100) + '%'; });
  $('crossfade-select')?.addEventListener('change', (e) => {
    const v = e.target.value;
    if (v === 'custom') { app.engine.crossfade = parseFloat($('crossfade-custom').value) || 2; }
    else app.engine.crossfade = parseFloat(v);
    $('crossfade-pill').textContent = 'crossfade: ' + app.engine.crossfade + ' s';
  });
  $('start-audio')?.addEventListener('click', async () => { await app.engine.resume(); toast('áudio iniciado', 'ok'); });
  $('playpause')?.addEventListener('click', () => {
    const t = app.engine.nowPlaying;
    if (t && t.playing) app.engine.stopMusic(); else if (app.tracks[0]) app.engine.playMusic(app.tracks[0], app.engine.crossfade);
    renderTracks();
  });
  $('stopmusic')?.addEventListener('click', () => { app.engine.stopMusic(); renderTracks(); });
  $('fadeout')?.addEventListener('click', () => { app.engine.fadeOutMusic(3); renderTracks(); });
  // emergency buttons already wired
  // new scene
  $('new-scene')?.addEventListener('click', () => {
    const name = prompt('Nome da cena:');
    if (!name) return;
    const s = { id: 'scene-' + Date.now(), name, description: '', cues: [] };
    app.scenes.push(s);
    app.store.saveScene(s);
    renderScenes();
  });
  // clock
  setInterval(() => { $('clock').textContent = new Date().toLocaleTimeString('pt-BR'); }, 1000);
  // diag
  $('run-diag')?.addEventListener('click', () => {
    const list = $('diag-list');
    if (!list) return;
    list.innerHTML = '';
    const add = (label, status) => { const r = document.createElement('div'); r.className = 'diag-row'; r.innerHTML = `<span class="${status}">${status === 'ok' ? '✓' : status === 'warn' ? '!' : '✗'}</span><span>${label}</span>`; list.appendChild(r); };
    add('AudioContext: ' + (app.engine.ctx?.state || 'n/a'), app.engine.ctx?.state === 'running' ? 'ok' : 'warn');
    add('microfones conectados: ' + app.mics.size, app.mics.size ? 'ok' : 'warn');
    add('músicas carregadas: ' + app.tracks.length, app.tracks.length ? 'ok' : 'warn');
    add('efeitos carregados: ' + app.fx.length, app.fx.length ? 'ok' : 'warn');
    add('cenas: ' + app.scenes.length, 'ok');
  });
  await connectSignaling();
  // level meters
  setInterval(() => {
    for (const [id, mic] of app.mics) {
      const lvl = app.engine.micLevel(id);
      const ch = document.querySelector(`.channel:has(input[data-id="${id}"])`);
      // best-effort: atualizar barra pelo data-id
    }
  }, 100);
}

init().catch((err) => toast('Erro ao iniciar: ' + (err.message || err), 'error'));
