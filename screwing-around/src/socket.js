// socket.js — WebSocket client singleton for The Duel
// Connects to the server with the JWT as a query param.
// Exposes subscribe/unsubscribe for typed events.

// ⚠️  Replace with your deployed server WS URL in production
//     e.g. 'wss://the-duel-server.railway.app'
const WS_BASE = (import.meta.env.VITE_WS_URL || 'ws://localhost:4000');

let _ws = null;
let _token = null;

/** Map of event name → Set of listener callbacks */
const _listeners = new Map();

function _emit(event, data) {
  const set = _listeners.get(event);
  if (set) set.forEach((fn) => fn(data));
}

/**
 * Connect to the WebSocket server using the current JWT.
 * Safe to call multiple times — will reuse an open connection.
 * @param {string} token  JWT from /auth/google
 */
export function connect(token) {
  if (_ws && (_ws.readyState === WebSocket.OPEN || _ws.readyState === WebSocket.CONNECTING)) return;

  _token = token;
  _ws = new WebSocket(`${WS_BASE}?token=${encodeURIComponent(token)}`);

  _ws.addEventListener('open', () => {
    console.log('[WS] Connected');
    _emit('__connected', null);
  });

  _ws.addEventListener('message', (ev) => {
    try {
      const { event, data } = JSON.parse(ev.data);
      _emit(event, data);
    } catch {
      // ignore malformed messages
    }
  });

  _ws.addEventListener('close', (ev) => {
    console.log('[WS] Closed', ev.code, ev.reason);
    _emit('__disconnected', { code: ev.code, reason: ev.reason });
    _ws = null;
  });

  _ws.addEventListener('error', (err) => {
    console.error('[WS] Error', err);
    _emit('__error', err);
  });
}

/**
 * Disconnect and clean up all listeners.
 */
export function disconnect() {
  if (_ws) {
    _ws.close();
    _ws = null;
  }
  _listeners.clear();
  _token = null;
}

/**
 * Subscribe to a named server event.
 * @param {string}   event
 * @param {Function} callback
 * @returns {Function} unsubscribe function
 */
export function on(event, callback) {
  if (!_listeners.has(event)) _listeners.set(event, new Set());
  _listeners.get(event).add(callback);
  return () => off(event, callback);
}

/**
 * Unsubscribe a previously registered callback.
 * @param {string}   event
 * @param {Function} callback
 */
export function off(event, callback) {
  _listeners.get(event)?.delete(callback);
}

/** Returns true if the socket is currently open. */
export function isConnected() {
  return _ws && _ws.readyState === WebSocket.OPEN;
}

export default { connect, disconnect, on, off, isConnected };
