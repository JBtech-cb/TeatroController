/* eslint-disable no-console */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT || 8787);
const ROOM = process.env.PALCO_ROOM || 'PALCO';
const PIN = process.env.PALCO_PIN || String(Math.floor(1000 + Math.random() * 9000));
const STUN = (process.env.PALCO_STUN || 'stun:stun.l.google.com:19302').split(',').map((s) => s.trim()).filter(Boolean);
const CERT = process.env.PALCO_CERT;
const KEY = process.env.PALCO_KEY;

const TURN_URL = process.env.PALCO_TURN_URL;
const TURN_USER = process.env.PALCO_TURN_USER;
const TURN_PASS = process.env.PALCO_TURN_PASS;

const iceServers = STUN.map((u) => ({ urls: u }));
if (TURN_URL) {
  iceServers.push({ urls: TURN_URL.split(','), username: TURN_USER, credential: TURN_PASS });
}

const clients = new Map(); // ws -> { role, room, micId, name, transmitting }
const rooms = new Map(); // room -> { panel: ws|null, mics: Map }

function ensureRoom(name) {
  if (!rooms.has(name)) rooms.set(name, { panel: null, mics: new Map() });
  return rooms.get(name);
}

function send(ws, obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function broadcastMics(room) {
  const r = rooms.get(room);
  if (!r || !r.panel) return;
  const list = [...r.mics.values()].map((m) => ({
    id: m.micId,
    name: m.name,
    transmitting: m.transmitting,
    settings: m.settings,
  }));
  send(r.panel, { t: 'mics', mics: list });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, room: ROOM }));
    return;
  }
  if (url.pathname === '/config.json') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ room: ROOM, iceServers }));
    return;
  }
  // arquivos estaticos
  let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
  if (url.pathname === '/mic') filePath = '/mic.html';
  const full = path.join(__dirname, 'public', filePath.replace(/^\//, ''));
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    const ext = path.extname(full).toLowerCase();
    const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
    res.writeHead(200, { 'content-type': types[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  clients.set(ws, { role: null, room: null, micId: null, name: null, transmitting: true, settings: null });
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    const c = clients.get(ws);
    if (!c) return;
    if (msg.t === 'hello') {
      if (msg.room !== ROOM) { send(ws, { t: 'error', code: 'room', message: 'sala inexistente' }); ws.close(4000, 'room'); return; }
      if (msg.pin !== PIN) { send(ws, { t: 'error', code: 'pin', message: 'PIN incorreto' }); ws.close(4000, 'pin'); return; }
      c.role = msg.role;
      c.room = msg.room;
      c.micId = msg.micId || null;
      c.name = msg.name || (msg.role === 'mic' ? 'Microfone' : 'Painel');
      const r = ensureRoom(msg.room);
      if (msg.role === 'panel') {
        r.panel = ws;
        send(ws, { t: 'welcome', role: 'panel', room: msg.room, mics: [...r.mics.values()].map((m) => ({ id: m.micId, name: m.name, transmitting: m.transmitting, settings: m.settings })) });
      } else {
        r.mics.set(msg.micId, c);
        send(ws, { t: 'welcome', role: 'mic', room: msg.room, panelOnline: !!r.panel });
        if (r.panel) send(r.panel, { t: 'mic-joined', mic: { id: c.micId, name: c.name, transmitting: c.transmitting, settings: c.settings } });
      }
      return;
    }
    if (!c.role) return;
    const r = rooms.get(c.room);
    if (!r) return;
    if (msg.t === 'signal') {
      if (c.role === 'mic') {
        // mic -> panel, com origem
        if (r.panel) send(r.panel, { t: 'signal', from: c.micId, data: msg.data });
      } else if (c.role === 'panel' && msg.to) {
        // panel -> mic especifico
        const target = [...r.mics.values()].find((m) => m.micId === msg.to);
        if (target) send(target, { t: 'signal', data: msg.data });
      }
      return;
    }
    if (msg.t === 'mic-state' && c.role === 'mic') {
      c.transmitting = !!msg.transmitting;
      if (r.panel) send(r.panel, { t: 'mic-state', id: c.micId, transmitting: c.transmitting });
      return;
    }
    if (msg.t === 'mic-settings' && c.role === 'mic') {
      c.settings = msg.settings;
      if (r.panel) send(r.panel, { t: 'mic-settings', id: c.micId, settings: c.settings });
      return;
    }
    if (msg.t === 'disconnect-mic' && c.role === 'panel') {
      const target = [...r.mics.values()].find((m) => m.micId === msg.id);
      if (target) { send(target, { t: 'kicked', message: 'desconectado pelo operador' }); target.close?.(); r.mics.delete(msg.id); send(c, { t: 'kicked-ack' }); if (r.panel) send(r.panel, { t: 'mic-left', id: msg.id }); }
      return;
    }
    if (msg.t === 'rename-mic' && c.role === 'panel') {
      const target = [...r.mics.values()].find((m) => m.micId === msg.id);
      if (target) { target.name = msg.name; if (r.panel) send(r.panel, { t: 'mic-renamed', id: msg.id, name: msg.name }); }
      return;
    }
  });
  ws.on('close', () => {
    const c = clients.get(ws);
    if (!c) return;
    if (c.role === 'panel') {
      const r = rooms.get(c.room); if (r) r.panel = null;
    } else if (c.role === 'mic' && c.room) {
      const r = rooms.get(c.room);
      if (r) { r.mics.delete(c.micId); if (r.panel) send(r.panel, { t: 'mic-left', id: c.micId }); }
    }
    clients.delete(ws);
  });
});

server.listen(PORT, () => {
  console.log(`\n  Sala: ${ROOM}     PIN: ${PIN}`);
  console.log(`  Painel:  http://localhost:${PORT}/`);
  console.log(`  Celular: http://localhost:${PORT}/mic?room=${ROOM}&pin=${PIN}`);
  console.log('  Na rede local: (veja o IP da sua interface Wi-Fi)\n');
});
