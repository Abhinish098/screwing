// routes/lobby.js — GET /lobby
const express = require('express');
const { query } = require('../db');
const { requireAuth } = require('./auth');

const router = express.Router();

/**
 * GET /lobby
 * Returns all users who are currently online and NOT in a game.
 * Excludes the requesting user themselves.
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.display_name, u.email
       FROM users u
       JOIN presence p ON p.user_id = u.id
       WHERE p.is_online = true
         AND p.in_game = false
         AND u.id != $1
       ORDER BY p.last_seen DESC`,
      [req.user.userId]
    );
    return res.json({ players: result.rows });
  } catch (err) {
    console.error('Lobby error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /lobby/offline
 * Mark the authenticated user as offline (sign-out).
 */
router.post('/offline', requireAuth, async (req, res) => {
  try {
    await query(
      `UPDATE presence SET is_online = false, last_seen = now() WHERE user_id = $1`,
      [req.user.userId]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error('Lobby offline error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
