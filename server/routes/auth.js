// routes/auth.js — Google token verification + user upsert
const express = require('express');
const fetch = require('node-fetch');
const jwt = require('jsonwebtoken');
const { query } = require('../db');

const router = express.Router();

// ⚠️  Set JWT_SECRET as an environment variable in production.
//     Generate a strong random string, e.g.: openssl rand -hex 64
const JWT_SECRET = process.env.JWT_SECRET || 'REPLACE_THIS_WITH_A_STRONG_SECRET';

/**
 * POST /auth/google
 * Body: { idToken: string }
 * Returns: { token: string, user: { id, display_name, email } }
 */
router.post('/google', async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) {
    return res.status(400).json({ error: 'idToken is required' });
  }

  try {
    // Verify the Google ID token via Google's tokeninfo endpoint.
    const googleRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
    );
    if (!googleRes.ok) {
      return res.status(401).json({ error: 'Invalid Google ID token' });
    }

    const payload = await googleRes.json();

    // Basic sanity checks
    if (payload.error) {
      return res.status(401).json({ error: payload.error });
    }

    const googleUid = payload.sub;
    const displayName = payload.name || payload.email || 'Anonymous';
    const email = payload.email || null;

    // Upsert the user into the database
    const result = await query(
      `INSERT INTO users (google_uid, display_name, email)
       VALUES ($1, $2, $3)
       ON CONFLICT (google_uid)
       DO UPDATE SET display_name = EXCLUDED.display_name, email = EXCLUDED.email
       RETURNING id, google_uid, display_name, email`,
      [googleUid, displayName, email]
    );

    const user = result.rows[0];

    // Upsert the user's presence row
    await query(
      `INSERT INTO presence (user_id, is_online, last_seen, in_game)
       VALUES ($1, true, now(), false)
       ON CONFLICT (user_id)
       DO UPDATE SET is_online = true, last_seen = now(), in_game = false`,
      [user.id]
    );

    // Issue a signed JWT with the internal user ID
    const token = jwt.sign(
      { userId: user.id, displayName: user.display_name },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    return res.json({
      token,
      user: { id: user.id, display_name: user.display_name, email: user.email },
    });
  } catch (err) {
    console.error('Auth error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------- Middleware ----------

/**
 * Verify the JWT on protected routes.
 * Attaches req.user = { userId, displayName } on success.
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }
  const token = authHeader.slice(7);
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Mark a user as offline (called on WebSocket close / sign-out).
 */
async function setOffline(userId) {
  try {
    await query(
      `UPDATE presence SET is_online = false, last_seen = now() WHERE user_id = $1`,
      [userId]
    );
  } catch (err) {
    console.error('setOffline error:', err);
  }
}

module.exports = { router, requireAuth, setOffline, JWT_SECRET };
