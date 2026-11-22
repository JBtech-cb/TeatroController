export class Signaling {
  constructor({ room, pin, role, micId, name }) {
    this.room = room;
    this.pin = pin;
    this.role = role;
    this.micId = micId;
    this.name = name;
    this.ws = null;
    this.handlers = new Map();
    this.reconnectAttempt = 0;
    this.shouldReconnect = true;
  }
  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push(fn);
  }
  emit(type, payload) {
    const list = this.handlers.get(type);
    if (list) for (const fn of list) fn(payload);
  }
  send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }
  close() { this.shouldReconnect = false; this.ws?.close(); }
  connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${location.host}/ws`;
    this.ws = new WebSocket(url);
    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.emit('status', { state: 'online' });
      this.send({ t: 'hello', role: this.role, room: this.room, pin: this.pin, micId: this.micId, name: this.name });
    };
    this.ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.t === 'error') { this.emit('server-error', msg); if (msg.code === 'pin' || msg.code === 'room') this.close(); return; }
      this.emit(msg.t, msg);
      if (msg.t === 'welcome' && msg.constraints) this.emit('config', { constraints: msg.constraints });
    };
    this.ws.onclose = () => {
      if (!this.shouldReconnect) { this.emit('status', { state: 'offline' }); return; }
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempt), 8000);
      this.reconnectAttempt++;
      this.emit('status', { state: 'reconnecting', inMs: delay });
      setTimeout(() => this.connect(), delay);
    };
    this.ws.onerror = () => {};
  }
}
