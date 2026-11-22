/**
 * Teste real do servidor de sinalizacao: sobe o servidor, conecta um painel e
 * um microfone por WebSocket e verifica autenticacao, avisos de entrada/saida e
 * o repasse das mensagens de sinalizacao (SDP/ICE) em ambos os sentidos.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import WebSocket from 'ws';

const PORT = 8899;
const PIN = '4321';
const ROOM = 'PALCO';
let child;

async function waitServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/health`);
      if (res.ok) return await res.json();
    } catch {
      /* ainda subindo */
    }
    await sleep(150);
  }
  throw new Error('O servidor nao subiu a tempo');
}

function client() {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  const queue = [];
  const waiters = [];
  const open = new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });
  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const idx = waiters.findIndex((w) => w.pred(msg));
    if (idx >= 0) waiters.splice(idx, 1)[0].resolve(msg);
    else queue.push(msg);
  });
  const next = (pred, timeout = 4000) =>
    new Promise((resolve, reject) => {
      const found = queue.findIndex(pred);
      if (found >= 0) return resolve(queue.splice(found, 1)[0]);
      const timer = setTimeout(() => reject(new Error('tempo esgotado esperando mensagem')), timeout);
      waiters.push({
        pred,
        resolve: (msg) => {
          clearTimeout(timer);
          resolve(msg);
        },
      });
    });
  return { ws, open, next, send: (m) => ws.send(JSON.stringify(m)) };
}

before(async () => {
  child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, PORT: String(PORT), PALCO_PIN: PIN, PALCO_ROOM: ROOM },
    stdio: 'ignore',
  });
  await waitServer();
});

after(() => {
  child?.kill('SIGTERM');
});

test('config.json entrega sala e servidores de conexao, sem segredos', async () => {
  const res = await fetch(`http://127.0.0.1:${PORT}/config.json`);
  const cfg = await res.json();
  assert.equal(cfg.room, ROOM);
  assert.ok(Array.isArray(cfg.iceServers) && cfg.iceServers.length >= 1);
  assert.equal(cfg.pin, undefined);
  assert.equal(JSON.stringify(cfg).includes(PIN), false);
});

test('pagina do celular e servida em /mic', async () => {
  const res = await fetch(`http://127.0.0.1:${PORT}/mic`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /MICROFONE PALCO/);
});

test('PIN errado e recusado', async () => {
  const c = client();
  await c.open;
  c.send({ t: 'hello', role: 'panel', room: ROOM, pin: '0000' });
  const err = await c.next((m) => m.t === 'error');
  assert.equal(err.code, 'pin');
  c.ws.close();
});

test('sala inexistente e recusada', async () => {
  const c = client();
  await c.open;
  c.send({ t: 'hello', role: 'panel', room: 'OUTRA', pin: PIN });
  const err = await c.next((m) => m.t === 'error');
  assert.equal(err.code, 'room');
  c.ws.close();
});

test('painel e dois microfones trocam sinalizacao independente', async () => {
  const panel = client();
  await panel.open;
  panel.send({ t: 'hello', role: 'panel', room: ROOM, pin: PIN });
  const welcome = await panel.next((m) => m.t === 'welcome');
  assert.equal(welcome.role, 'panel');
  assert.deepEqual(welcome.mics, []);

  const micA = client();
  await micA.open;
  micA.send({ t: 'hello', role: 'mic', room: ROOM, pin: PIN, micId: 'micA1234', name: 'Ator 1' });
  const welcomeA = await micA.next((m) => m.t === 'welcome');
  assert.equal(welcomeA.panelOnline, true);
  const joinedA = await panel.next((m) => m.t === 'mic-joined');
  assert.equal(joinedA.mic.id, 'micA1234');

  const micB = client();
  await micB.open;
  micB.send({ t: 'hello', role: 'mic', room: ROOM, pin: PIN, micId: 'micB5678', name: 'Ator 2' });
  await micB.next((m) => m.t === 'welcome');
  const joinedB = await panel.next((m) => m.t === 'mic-joined' && m.mic.id === 'micB5678');
  assert.equal(joinedB.mic.name, 'Ator 2');

  // microfone -> painel (oferta SDP)
  micA.send({ t: 'signal', data: { description: { type: 'offer', sdp: 'v=0-oferta-A' } } });
  const toPanel = await panel.next((m) => m.t === 'signal' && m.from === 'micA1234');
  assert.equal(toPanel.data.description.sdp, 'v=0-oferta-A');

  // painel -> microfone B (resposta SDP)
  panel.send({ t: 'signal', to: 'micB5678', data: { description: { type: 'answer', sdp: 'v=0-resposta-B' } } });
  const toMicB = await micB.next((m) => m.t === 'signal');
  assert.equal(toMicB.data.description.sdp, 'v=0-resposta-B');

  // microfone B nao recebe a mensagem destinada a A
  micA.send({ t: 'signal', data: { candidate: { candidate: 'ice-A' } } });
  const cand = await panel.next((m) => m.t === 'signal' && m.from === 'micA1234');
  assert.equal(cand.data.candidate.candidate, 'ice-A');

  // estado de transmissao chega ao painel
  micA.send({ t: 'mic-state', transmitting: false });
  const st = await panel.next((m) => m.t === 'mic-state' && m.id === 'micA1234');
  assert.equal(st.transmitting, false);

  // desconectar A nao afeta B
  micA.ws.close();
  const left = await panel.next((m) => m.t === 'mic-left');
  assert.equal(left.id, 'micA1234');
  assert.equal(micB.ws.readyState, WebSocket.OPEN);

  micB.send({ t: 'signal', data: { candidate: { candidate: 'ice-B' } } });
  const candB = await panel.next((m) => m.t === 'signal' && m.from === 'micB5678');
  assert.equal(candB.data.candidate.candidate, 'ice-B');

  panel.ws.close();
  micB.ws.close();
});

test('operador consegue derrubar um microfone especifico', async () => {
  const panel = client();
  await panel.open;
  panel.send({ t: 'hello', role: 'panel', room: ROOM, pin: PIN });
  await panel.next((m) => m.t === 'welcome');

  const mic = client();
  await mic.open;
  mic.send({ t: 'hello', role: 'mic', room: ROOM, pin: PIN, micId: 'micKick01', name: 'Ator 3' });
  await mic.next((m) => m.t === 'welcome');
  await panel.next((m) => m.t === 'mic-joined');

  panel.send({ t: 'disconnect-mic', id: 'micKick01' });
  const kicked = await mic.next((m) => m.t === 'kicked');
  assert.match(kicked.message, /operador/i);

  panel.ws.close();
  mic.ws.close();
});
