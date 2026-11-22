'use strict';
/**
 * PALCO CONTROL - servidor local de sinalizacao + arquivos estaticos.
 *
 * O audio NUNCA passa por este servidor: ele apenas troca mensagens de
 * sinalizacao (SDP/ICE) entre o painel (notebook) e cada celular. O audio
 * viaja por WebRTC, ponto a ponto, com uma conexao independente por celular.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const CERT_DIR = path.join(ROOT, 'certs');

const PORT = Number(process.env.PORT || 8787);
const ROOM = String(process.env.PALCO_ROOM || 'PALCO').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'PALCO';
const PIN = String(process.env.PALCO_PIN || crypto.randomInt(1000, 10000));
const FORCE_HTTP = process.argv.includes('--http');
const FORCE_HTTPS = process.argv.includes('--https');

const VERSION = require('./package.json').version;

// ---------------------------------------------------------------------------
// Configuracao de ICE (STUN/TURN) entregue ao navegador.
// ATENCAO: tudo o que vai para o navegador e publico. Credenciais TURN fixas
// ficam visiveis para quem abrir a pagina. Para uso real, gere credenciais
// temporarias no seu provedor. Veja docs/GUIA.md.
// ---------------------------------------------------------------------------
function iceServers() {
  const servers = [];
  const stun = process.env.PALCO_STUN || 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302';
  const stunList = stun.split(',').map((s) => s.trim()).filter(Boolean);
  if (stunList.length) servers.push({ urls: stunList });

  const turnUrl = process.env.PALCO_TURN_URL;
  if (turnUrl) {
    servers.push({
      urls: turnUrl.split(',').map((s) => s.trim()).filter(Boolean),
      username: process.env.PALCO_TURN_USER || '',
      credential: process.env.PALCO_TURN_PASS || '',
    });
  }
  return servers;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};

const ALLOWED_FILES = new Set(['/index.html', '/mic.html']);

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(body);
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '/panel' || rel === '/painel') rel = '/index.html';
  if (rel === '/mic' || rel === '/microfone') rel = '/mic.html';

  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Proibido');

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) return send(res, 404, 'Nao encontrado');
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Permissions-Policy': 'microphone=(self)',
      'Referrer-Policy': 'same-origin',
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

function lanAddresses() {
  const out = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) out.push({ name, address: net.address });
    }
  }
  return out;
}

const requestHandler = (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  if (pathname === '/health') {
    return send(res, 200, JSON.stringify({ ok: true, version: VERSION, room: ROOM }), {
      'Content-Type': 'application/json; charset=utf-8',
    });
  }

  if (pathname === '/config.json') {
    return send(
      res,
      200,
      JSON.stringify({
        version: VERSION,
        room: ROOM,
        pinRequired: true,
        iceServers: iceServers(),
      }),
      { 'Content-Type': 'application/json; charset=utf-8' }
    );
  }

  if (pathname === '/favicon.ico') return send(res, 204, '');

  serveStatic(req, res, pathname);
};

// ---------------------------------------------------------------------------
// Sala unica privada (room + PIN). Um painel (notebook) e N celulares.
// ---------------------------------------------------------------------------
/** @type {Map<string, {panel: any|null, mics: Map<string, any>}>} */
const rooms = new Map();

function getRoom(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, { panel: null, mics: new Map() });
  return rooms.get(roomId);
}

function safeSend(ws, msg) {
  if (!ws || ws.readyState !== ws.OPEN) return;
  try {
    ws.send(JSON.stringify(msg));
  } catch (err) {
    console.error('[ws] falha ao enviar:', err.message);
  }
}

function micList(room) {
  return [...room.mics.entries()].map(([id, mic]) => ({
    id,
    name: mic.name,
    transmitting: !!mic.transmitting,
  }));
}

const server = (() => {
  const certFile = process.env.PALCO_CERT || path.join(CERT_DIR, 'cert.pem');
  const keyFile = process.env.PALCO_KEY || path.join(CERT_DIR, 'key.pem');
  const haveCert = fs.existsSync(certFile) && fs.existsSync(keyFile);

  if (FORCE_HTTPS && !haveCert) {
    console.error('\n[erro] --https foi pedido, mas nao encontrei certs/cert.pem e certs/key.pem.');
    console.error('Gere com: npm run cert\n');
    process.exit(1);
  }
  if (haveCert && !FORCE_HTTP) {
    const opts = { cert: fs.readFileSync(certFile), key: fs.readFileSync(keyFile) };
    console.log(`[info] HTTPS ativo (${path.relative(ROOT, certFile)})`);
    return https.createServer(opts, requestHandler);
  }
  return http.createServer(requestHandler);
})();

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 256 * 1024 });

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.role = null;
  ws.micId = null;
  ws.roomId = null;

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return safeSend(ws, { t: 'error', code: 'bad-json', message: 'Mensagem invalida' });
    }
    if (!msg || typeof msg.t !== 'string') return;
    try {
      handleMessage(ws, msg);
    } catch (err) {
      console.error('[ws] erro ao tratar mensagem:', err);
      safeSend(ws, { t: 'error', code: 'server-error', message: 'Erro interno' });
    }
  });

  ws.on('close', () => cleanup(ws));
  ws.on('error', (err) => {
    console.error('[ws] erro de socket:', err.message);
    cleanup(ws);
  });
});

function handleMessage(ws, msg) {
  if (msg.t === 'hello') return handleHello(ws, msg);

  if (!ws.role || !ws.roomId) {
    return safeSend(ws, { t: 'error', code: 'not-authenticated', message: 'Faca o hello primeiro' });
  }
  const room = getRoom(ws.roomId);
  if (!room) return;

  switch (msg.t) {
    case 'signal': {
      const data = msg.data;
      if (!data || typeof data !== 'object') return;
      if (ws.role === 'mic') {
        safeSend(room.panel, { t: 'signal', from: ws.micId, data });
      } else {
        const target = room.mics.get(String(msg.to || ''));
        if (target) safeSend(target.ws, { t: 'signal', from: 'panel', data });
      }
      return;
    }
    case 'mic-state': {
      if (ws.role !== 'mic') return;
      const mic = room.mics.get(ws.micId);
      if (!mic) return;
      mic.transmitting = !!msg.transmitting;
      safeSend(room.panel, { t: 'mic-state', id: ws.micId, transmitting: mic.transmitting });
      return;
    }
    case 'mic-settings': {
      if (ws.role !== 'mic') return;
      const mic = room.mics.get(ws.micId);
      if (!mic) return;
      mic.settings = msg.settings || null;
      safeSend(room.panel, { t: 'mic-settings', id: ws.micId, settings: mic.settings });
      return;
    }
    case 'rename': {
      const name = String(msg.name || '').slice(0, 40);
      if (ws.role === 'mic') {
        const mic = room.mics.get(ws.micId);
        if (mic) {
          mic.name = name;
          safeSend(room.panel, { t: 'mic-renamed', id: ws.micId, name });
        }
      } else {
        const target = room.mics.get(String(msg.to || ''));
        if (target) {
          target.name = name;
          safeSend(target.ws, { t: 'renamed', name });
          safeSend(room.panel, { t: 'mic-renamed', id: target.ws.micId, name });
        }
      }
      return;
    }
    case 'disconnect-mic': {
      if (ws.role !== 'panel') return;
      const target = room.mics.get(String(msg.id || ''));
      if (!target) return;
      safeSend(target.ws, { t: 'kicked', message: 'Desconectado pelo operador' });
      try {
        target.ws.close(4001, 'removido pelo operador');
      } catch {
        /* ignore */
      }
      return;
    }
    case 'mic-config': {
      if (ws.role !== 'panel') return;
      const target = room.mics.get(String(msg.id || ''));
      if (!target) return;
      safeSend(target.ws, { t: 'config', constraints: msg.constraints || null });
      return;
    }
    case 'ping':
      return safeSend(ws, { t: 'pong', now: Date.now() });
    default:
      return safeSend(ws, { t: 'error', code: 'unknown', message: 'Mensagem desconhecida: ' + msg.t });
  }
}

function handleHello(ws, msg) {
  const role = msg.role === 'panel' ? 'panel' : msg.role === 'mic' ? 'mic' : null;
  if (!role) return reject(ws, 'role', 'Papel invalido');

  const roomId = String(msg.room || '').toUpperCase();
  if (roomId !== ROOM) return reject(ws, 'room', 'Sala inexistente. Confira o codigo da sala.');

  if (String(msg.pin || '') !== PIN) return reject(ws, 'pin', 'PIN incorreto. Confira com o operador.');

  const room = getRoom(roomId);

  if (role === 'panel') {
    if (room.panel && room.panel !== ws) {
      // Um novo painel assume o lugar do antigo (ex.: notebook recarregado).
      safeSend(room.panel, { t: 'error', code: 'replaced', message: 'Outro painel assumiu a sala' });
      try {
        room.panel.close(4002, 'substituido');
      } catch {
        /* ignore */
      }
    }
    room.panel = ws;
    ws.role = 'panel';
    ws.roomId = roomId;
    safeSend(ws, { t: 'welcome', role, room: roomId, mics: micList(room) });
    for (const [, mic] of room.mics) safeSend(mic.ws, { t: 'panel-online' });
    console.log(`[sala ${ROOM}] painel conectado`);
    return;
  }

  const micId = String(msg.micId || '').slice(0, 64);
  if (!/^[a-zA-Z0-9_-]{4,64}$/.test(micId)) return reject(ws, 'micId', 'Identificador de microfone invalido');

  const existing = room.mics.get(micId);
  if (existing) {
    // Reconexao do mesmo celular: derruba o socket antigo.
    try {
      existing.ws.close(4003, 'reconectado em outro socket');
    } catch {
      /* ignore */
    }
  }
  const name = String(msg.name || '').slice(0, 40) || 'Microfone';
  room.mics.set(micId, { ws, name, transmitting: false, settings: null });
  ws.role = 'mic';
  ws.roomId = roomId;
  ws.micId = micId;

  safeSend(ws, {
    t: 'welcome',
    role,
    room: roomId,
    micId,
    panelOnline: !!room.panel,
    mics: micList(room).length,
  });
  safeSend(room.panel, { t: 'mic-joined', mic: { id: micId, name } });
  console.log(`[sala ${ROOM}] microfone conectado: ${name} (${micId})`);
}

function reject(ws, code, message) {
  safeSend(ws, { t: 'error', code, message });
  setTimeout(() => {
    try {
      ws.close(4000, code);
    } catch {
      /* ignore */
    }
  }, 60);
}

function cleanup(ws) {
  const roomId = ws.roomId;
  if (!roomId) return;
  const room = rooms.get(roomId);
  if (!room) return;

  if (ws.role === 'panel' && room.panel === ws) {
    room.panel = null;
    console.log(`[sala ${ROOM}] painel desconectado`);
    for (const [, mic] of room.mics) safeSend(mic.ws, { t: 'panel-offline' });
  }
  if (ws.role === 'mic' && ws.micId) {
    const mic = room.mics.get(ws.micId);
    if (mic && mic.ws === ws) {
      room.mics.delete(ws.micId);
      safeSend(room.panel, { t: 'mic-left', id: ws.micId });
      console.log(`[sala ${ROOM}] microfone saiu: ${mic.name} (${ws.micId})`);
    }
  }
}

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch {
      /* ignore */
    }
  }
}, 10000);
heartbeat.unref();

server.listen(PORT, '0.0.0.0', () => {
  const useHttps = server instanceof https.Server;
  const proto = useHttps ? 'https' : 'http';
  console.log('');
  console.log('  PALCO CONTROL ' + VERSION);
  console.log('  ---------------------------------------------');
  console.log(`  Sala: ${ROOM}     PIN: ${PIN}`);
  console.log(`  Painel:  ${proto}://localhost:${PORT}/`);
  console.log(`  Celular: ${proto}://localhost:${PORT}/mic?room=${ROOM}&pin=${PIN}`);
  const lan = lanAddresses();
  if (lan.length) {
    console.log('  Na rede local:');
    for (const { name, address } of lan) {
      console.log(`    ${name}: ${proto}://${address}:${PORT}/`);
    }
  }
  if (!useHttps) {
    console.log('');
    console.log('  Atencao: sem HTTPS o navegador do celular BLOQUEIA o microfone');
    console.log('  em enderecos IP. Rode "npm run cert" e depois "npm start" para HTTPS.');
  }
  console.log('');
});

process.on('SIGINT', () => {
  console.log('\n[info] encerrando...');
  for (const ws of wss.clients) {
    try {
      ws.close(1001, 'servidor encerrado');
    } catch {
      /* ignore */
    }
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
});

module.exports = { server, wss };
