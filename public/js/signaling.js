/**
 * Cliente de sinalizacao (WebSocket). Troca apenas mensagens de controle:
 * oferta/resposta SDP, candidatos ICE e estado dos microfones.
 * O audio NAO passa por aqui.
 */

export class Signaling {
  constructor({ room, pin, role, micId, name }) {
    this.room = room;
    this.pin = pin;
    this.role = role;
    this.micId = micId;
    this.name = name;
    this.ws = null;
    this.handlers = new Map();
    this.connected = false;
    this.wantConnection = false;
    this.attempt = 0;
    this.retryTimer = null;
    this.manualClose = false;
    this.lastError = null;
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.handlers.get(type)?.delete(fn);
  }

  emit(type, payload) {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(payload);
      } catch (err) {
        console.error('[signaling] erro no handler', type, err);
      }
    }
  }

  url() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/ws`;
  }

  connect() {
    this.wantConnection = true;
    this.manualClose = false;
    clearTimeout(this.retryTimer);

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    let ws;
    try {
      ws = new WebSocket(this.url());
    } catch (err) {
      this.lastError = err;
      this._scheduleRetry();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.attempt = 0;
      this.emit('socket-open');
      ws.send(
        JSON.stringify({
          t: 'hello',
          role: this.role,
          room: this.room,
          pin: this.pin,
          micId: this.micId,
          name: this.name,
        })
      );
    };

    ws.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.t === 'welcome') {
        this.connected = true;
        this.emit('welcome', msg);
        this.emit('status', { state: 'online' });
        return;
      }
      if (msg.t === 'error') {
        this.lastError = msg;
        this.emit('server-error', msg);
        if (msg.code === 'pin' || msg.code === 'room' || msg.code === 'role' || msg.code === 'micId') {
          this.wantConnection = false;
        }
        this.emit('status', { state: 'error', message: msg.message });
        return;
      }
      this.emit(msg.t, msg);
    };

    ws.onclose = (ev) => {
      this.connected = false;
      this.ws = null;
      this.emit('status', { state: 'offline', code: ev.code, reason: ev.reason });
      this.emit('socket-close', ev);
      if (this.wantConnection && ev.code !== 4000 && ev.code !== 4001 && ev.code !== 4002) {
        this._scheduleRetry();
      }
    };

    ws.onerror = () => {
      this.emit('status', { state: 'error', message: 'Falha na conexao com o servidor' });
    };
  }

  _scheduleRetry() {
    if (!this.wantConnection || this.manualClose) return;
    const delay = Math.min(12000, 700 * Math.pow(1.6, this.attempt++));
    this.emit('status', { state: 'reconnecting', inMs: delay, attempt: this.attempt });
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.connect(), delay);
  }

  send(msg) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(JSON.stringify(msg));
      return true;
    } catch {
      return false;
    }
  }

  close() {
    this.wantConnection = false;
    this.manualClose = true;
    clearTimeout(this.retryTimer);
    if (this.ws) {
      try {
        this.ws.close(1000, 'encerrado');
      } catch {
        /* ignore */
      }
    }
    this.ws = null;
    this.connected = false;
  }
}
