// api.js — Axios-style fetch wrapper with JWT Authorization header
// The JWT is stored in-memory only (never in localStorage).

// ⚠️  Replace this with your deployed server URL when hosting on Railway/Render/Fly.io
//     e.g. 'https://the-duel-server.railway.app'
//     In development this proxies to localhost:4000
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

let _token = null;

/** Store the JWT after login. */
export function setToken(token) {
  _token = token;
}

/** Clear the JWT on sign-out. */
export function clearToken() {
  _token = null;
}

/** Returns true if a JWT is currently stored. */
export function hasToken() {
  return !!_token;
}

/**
 * Core fetch wrapper. Attaches JWT if available and parses JSON.
 * Throws on non-2xx responses with the server's error message.
 */
async function apiFetch(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (_token) {
    headers['Authorization'] = `Bearer ${_token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  let body;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    throw new Error(body?.error || `HTTP ${res.status}`);
  }

  return body;
}

// ─── Auth ─────────────────────────────────────────────────────────────────

/** POST /auth/google — exchange Google ID token for a session JWT */
export function authGoogle(idToken) {
  return apiFetch('/auth/google', {
    method: 'POST',
    body: JSON.stringify({ idToken }),
  });
}

// ─── Lobby ────────────────────────────────────────────────────────────────

/** GET /lobby — list online, not-in-game players */
export function getLobby() {
  return apiFetch('/lobby');
}

/** POST /lobby/offline — mark self as offline (sign-out) */
export function goOffline() {
  return apiFetch('/lobby/offline', { method: 'POST' });
}

// ─── Challenges ──────────────────────────────────────────────────────────

/** POST /challenge — send a challenge */
export function sendChallenge(challengedId) {
  return apiFetch('/challenge', {
    method: 'POST',
    body: JSON.stringify({ challengedId }),
  });
}

/** POST /challenge/:id/accept */
export function acceptChallenge(challengeId) {
  return apiFetch(`/challenge/${challengeId}/accept`, { method: 'POST' });
}

/** POST /challenge/:id/decline */
export function declineChallenge(challengeId) {
  return apiFetch(`/challenge/${challengeId}/decline`, { method: 'POST' });
}

// ─── Game ────────────────────────────────────────────────────────────────

/** GET /game/:id/state */
export function getGameState(gameId) {
  return apiFetch(`/game/${gameId}/state`);
}

/** POST /game/:id/move — submit a move */
export function submitMove(gameId, move) {
  return apiFetch(`/game/${gameId}/move`, {
    method: 'POST',
    body: JSON.stringify({ move }),
  });
}

export default apiFetch;
