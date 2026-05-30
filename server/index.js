// server/index.js — Express + WebSocket entry point
require('dotenv').config();

const http = require('http');
const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const url = require('url');

const { router: authRouter, setOffline, JWT_SECRET } = require('./routes/auth');
const lobbyRouter = require('./routes/lobby');
const challengeRouter = require('./routes/challenge');
const gameRouter = require('./routes/game');
const sm = require('./socketManager');
const { query } = require('./db');

const app = express();

// ─── CORS ─────────────────────────────────────────────────────────────────
// In production, restrict origins to your GitHub Pages URL.
// ⚠️  Replace '*' with 'https://Abhinish098.github.io' for production.
const allowedOrigins = ['http://localhost:5173', 'http://localhost:5174'];
if (process.env.CLIENT_ORIGIN) {
  process.env.CLIENT_ORIGIN.split(',').forEach(o => {
    const trimmed = o.trim();
    if (trimmed && !allowedOrigins.includes(trimmed)) {
      allowedOrigins.push(trimmed);
    }
  });
}

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, or server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*')) {
      return callback(null, true);
    }
    return callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

// ─── REST Routes ─────────────────────────────────────────────────────────
app.use('/auth', authRouter);
app.use('/lobby', lobbyRouter);
app.use('/challenge', challengeRouter);
app.use('/game', gameRouter);

// Health check
app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// ─── HTTP + WebSocket Server ──────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  // Authenticate via ?token= query param
  const { query: qs } = url.parse(req.url, true);
  const token = qs.token;

  if (!token) {
    ws.close(4001, 'Missing token');
    return;
  }

  let userId;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    userId = payload.userId;
  } catch {
    ws.close(4002, 'Invalid token');
    return;
  }

  sm.registerClient(userId, ws);
  console.log(`[WS] User ${userId} connected`);

  // Broadcast updated lobby
  broadcastLobby();

  ws.on('close', async () => {
    console.log(`[WS] User ${userId} connection closed`);
    if (sm.getActiveSocket(userId) === ws) {
      sm.removeClient(userId, ws);
      await setOffline(userId);
      broadcastLobby();
    }
  });

  ws.on('error', (err) => {
    console.error(`[WS] Error for user ${userId}:`, err.message);
  });

  // Heartbeat / ping-pong
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
});

// Keep connections alive
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) { ws.terminate(); return; }
    ws.isAlive = false;
    ws.ping();
  });
}, 30_000);

wss.on('close', () => clearInterval(heartbeat));

// ─── Lobby broadcast helper ───────────────────────────────────────────────
async function broadcastLobby() {
  try {
    const result = await query(
      `SELECT u.id, u.display_name
       FROM users u
       JOIN presence p ON p.user_id = u.id
       WHERE p.is_online = true AND p.in_game = false
       ORDER BY p.last_seen DESC`
    );
    sm.broadcastLobbyUpdate({ players: result.rows });
  } catch (err) {
    console.error('broadcastLobby error:', err);
  }
}

// Clean up presence table on startup (mark everyone offline/out of game)
query('UPDATE presence SET is_online = false, in_game = false')
  .then(() => console.log('Cleaned up presence table.'))
  .catch((err) => console.error('Error cleaning up presence table on startup:', err));

server.listen(PORT, () => {
  console.log(`🗡️  The Duel server running on http://localhost:${PORT}`);
  console.log(`   WebSocket endpoint: ws://localhost:${PORT}`);
});
