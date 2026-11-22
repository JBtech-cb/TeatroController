import { Signaling } from './signaling.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const TEST_SRC = params.get('testsrc'); // 'osc' | 'noise' | null

const state = {
  room: params.get('room') || '',
  pin: params.get('pin') || '',
  micId: params.get('mic') || '',
  name: params.get('name') || 'Microfone',
  stream: null,
  audioCtx: null,
  analyser: null,
  signaling: null,
  transmitting: true,
  deviceList: [],
  settings: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  currentDeviceId: null,
  testOsc: null,
  testGain: null,
};

function toast(msg, kind = 'ok') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function setConn(stateStr, msg) {
  const led = $('st-led');
  led.className = 'led ' + (stateStr === 'online' ? 'on' : stateStr === 'error' ? 'err' : '');
  $('st-text').textContent = msg;
}

async function enumerateDevices() {
  try {
    const devs = await navigator.mediaDevices.enumerateDevices();
    state.deviceList = devs.filter((d) => d.kind === 'audioinput');
    const sel = $('device-select');
    sel.innerHTML = '';
    for (const d of state.deviceList) {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || `Microfone ${d.deviceId.slice(0, 6)}`;
      sel.appendChild(opt);
    }
    if (state.currentDeviceId) sel.value = state.currentDeviceId;
  } catch {
    /* ignore */
  }
}

async function startCapture(deviceId) {
  const constraints = {
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      echoCancellation: state.settings.echoCancellation,
      noiseSuppression: state.settings.noiseSuppression,
      autoGainControl: state.settings.autoGainControl,
    },
    video: false,
  };
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  const track = stream.getAudioTracks()[0];
  let applied = {};
  try {
    applied = track.getSettings ? track.getSettings() : {};
  } catch {
    applied = {};
  }
  state.stream = stream;
  state.currentDeviceId = track.getSettings().deviceId || deviceId;

  if (state.audioCtx) {
    try {
      state.audioCtx.close();
    } catch {
      /* ignore */
    }
  }
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  state.audioCtx = ctx;
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  src.connect(analyser);
  state.analyser = analyser;

  if (TEST_SRC === 'osc') {
    // Fonte de teste: substitui a captura por um oscilador.
    // Usado apenas para verificar o transporte WebRTC sem microfone fisico.
    const osc = ctx.createOscillator();
    osc.frequency.value = 440;
    const g = ctx.createGain();
    g.gain.value = 0.25;
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start();
    state.testOsc = osc;
    state.testGain = g;
    $('test-banner').classList.remove('hidden');
    toast('Fonte de teste ativa (oscilador 440 Hz).', 'warn');
  }

  $('mic-info').textContent =
    `eco: ${applied.echoCancellation ? 'sim' : 'nao'} · ruído: ${applied.noiseSuppression ? 'sim' : 'nao'} · ` +
    `ganho auto: ${applied.autoGainControl ? 'sim' : 'nao'} · ` +
    `taxa: ${applied.sampleRate || '?'} Hz · canal: ${applied.channelCount || '?'}`;
  $('support-hint').textContent = 'O aparelho informa acima o que realmente aplicou.';
  await enumerateDevices();
  return stream;
}

function meterLoop() {
  const analyser = state.analyser;
  if (!analyser) return;
  const buf = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = (buf[i] - 128) / 128;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / buf.length);
  const db = 20 * Math.log10(Math.max(rms, 1e-6));
  const pct = Math.min(100, Math.max(0, ((db + 60) / 60) * 100));
  const bar = document.querySelector('#local-meter i');
  if (bar) bar.style.width = pct + '%';
  const dbEl = $('local-db');
  if (dbEl) dbEl.textContent = `sinal local: ${db.toFixed(1)} dB`;
  requestAnimationFrame(meterLoop);
}

function applyTxState() {
  const btn = $('tx-toggle');
  if (state.transmitting) {
    btn.textContent = 'TRANSMITINDO — TOQUE PARA PAUSAR';
    btn.classList.add('live');
  } else {
    btn.textContent = 'PAUSADO — TOQUE PARA RETOMAR';
    btn.classList.remove('live');
  }
  if (state.signaling) state.signaling.send({ t: 'mic-state', transmitting: state.transmitting });
}

async function connectSignaling() {
  state.signaling = new Signaling({
    room: state.room,
    pin: state.pin,
    role: 'mic',
    micId: state.micId,
    name: state.name,
  });
  state.signaling.on('welcome', (msg) => {
    setConn('online', 'conectado à central');
    $('st-room').textContent = msg.room;
    if (state.stream) state.signaling.send({ t: 'mic-settings', settings: state.settings });
  });
  state.signaling.on('server-error', (msg) => {
    setConn('error', msg.message || 'erro');
    toast(msg.message || 'Erro do servidor', 'error');
  });
  state.signaling.on('status', (s) => {
    if (s.state === 'offline') setConn('offline', 'desconectado');
    if (s.state === 'reconnecting') setConn('offline', `reconectando em ${Math.round(s.inMs / 1000)}s…`);
    if (s.state === 'error') setConn('error', s.message || 'erro');
  });
  state.signaling.on('kicked', (msg) => {
    toast(msg.message || 'Desconectado pelo operador', 'error');
    state.signaling.close();
  });
  state.signaling.on('config', (msg) => {
    if (msg.constraints) {
      state.settings = { ...state.settings, ...msg.constraints };
      $('opt-echo').checked = !!state.settings.echoCancellation;
      $('opt-noise').checked = !!state.settings.noiseSuppression;
      $('opt-agc').checked = !!state.settings.autoGainControl;
    }
  });
  state.signaling.on('renamed', (msg) => {
    state.name = msg.name;
    $('mic-name-pill').textContent = msg.name;
  });
  state.signaling.connect();
}

async function init() {
  // preenche campos a partir da URL
  $('setup-room').value = state.room;
  $('setup-pin').value = state.pin;
  $('setup-name').value = state.name;
  $('mic-name-pill').textContent = state.name;

  if (state.room && state.pin && state.micId) {
    // auto-start
    $('setup-form').classList.add('hidden');
    $('mic-console').classList.remove('hidden');
    $('mic-console').style.display = '';
    try {
      await startCapture(null);
      meterLoop();
      await connectSignaling();
    } catch (err) {
      toast('Falha ao iniciar: ' + (err.message || err), 'error');
      $('setup-form').classList.remove('hidden');
      $('mic-console').classList.add('hidden');
    }
    return;
  }

  $('setup-start').addEventListener('click', async () => {
    state.room = $('setup-room').value.trim().toUpperCase();
    state.pin = $('setup-pin').value.trim();
    state.name = $('setup-name').value.trim() || 'Microfone';
    state.micId = 'mic' + Math.random().toString(36).slice(2, 10);
    $('setup-form').classList.add('hidden');
    $('mic-console').classList.remove('hidden');
    $('mic-console').style.display = '';
    $('mic-name-pill').textContent = state.name;
    try {
      await startCapture(null);
      meterLoop();
      await connectSignaling();
    } catch (err) {
      toast('Falha ao iniciar: ' + (err.message || err), 'error');
    }
  });

  $('tx-toggle').addEventListener('click', () => {
    state.transmitting = !state.transmitting;
    applyTxState();
  });
  $('opt-echo').addEventListener('change', (e) => {
    state.settings.echoCancellation = e.target.checked;
    if (state.signaling) state.signaling.send({ t: 'mic-settings', settings: state.settings });
  });
  $('opt-noise').addEventListener('change', (e) => {
    state.settings.noiseSuppression = e.target.checked;
    if (state.signaling) state.signaling.send({ t: 'mic-settings', settings: state.settings });
  });
  $('opt-agc').addEventListener('change', (e) => {
    state.settings.autoGainControl = e.target.checked;
    if (state.signaling) state.signaling.send({ t: 'mic-settings', settings: state.settings });
  });
  $('opt-mute-local').addEventListener('change', (e) => {
    if (!state.stream) return;
    for (const t of state.stream.getAudioTracks()) t.enabled = !e.target.checked;
  });
  $('device-select').addEventListener('change', async (e) => {
    try {
      await startCapture(e.target.value);
      meterLoop();
    } catch (err) {
      toast('Falha ao iniciar: ' + (err.message || err), 'error');
    }
  });
  $('leave').addEventListener('click', () => {
    if (state.signaling) state.signaling.close();
    if (state.stream) for (const t of state.stream.getAudioTracks()) t.stop();
    location.reload();
  });
}

init().catch((err) => toast('Erro ao iniciar: ' + (err.message || err), 'error'));
