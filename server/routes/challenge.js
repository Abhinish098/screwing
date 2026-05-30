// routes/challenge.js — Send, accept, decline challenges
const express = require('express');
const { query } = require('../db');
const { requireAuth } = require('./auth');
const sm = require('../socketManager');

const router = express.Router();

// ---------- Helper: fetch lobby and broadcast ----------
async function refreshLobby() {
  const result = await query(
    `SELECT u.id, u.display_name
     FROM users u
     JOIN presence p ON p.user_id = u.id
     WHERE p.is_online = true AND p.in_game = false
     ORDER BY p.last_seen DESC`
  );
  sm.broadcastLobbyUpdate({ players: result.rows });
}

/**
 * POST /challenge
 * Body: { challengedId: string }
 * Send a challenge to another user.
 */
router.post('/', requireAuth, async (req, res) => {
  const { challengedId } = req.body;
  const challengerId = req.user.userId;

  if (!challengedId) {
    return res.status(400).json({ error: 'challengedId is required' });
  }
  if (challengedId === challengerId) {
    return res.status(400).json({ error: 'Cannot challenge yourself' });
  }

  try {
    // Check the challenged user is in the lobby
    const targetRow = await query(
      `SELECT u.id, u.display_name, p.is_online, p.in_game
       FROM users u
       JOIN presence p ON p.user_id = u.id
       WHERE u.id = $1`,
      [challengedId]
    );
    if (!targetRow.rows.length || !targetRow.rows[0].is_online || targetRow.rows[0].in_game) {
      return res.status(409).json({ error: 'Target player is unavailable' });
    }

    // Insert challenge row
    const result = await query(
      `INSERT INTO challenges (challenger_id, challenged_id, status)
       VALUES ($1, $2, 'pending')
       RETURNING id`,
      [challengerId, challengedId]
    );
    const challengeId = result.rows[0].id;

    // Get challenger name
    const challengerRow = await query(
      `SELECT display_name FROM users WHERE id = $1`,
      [challengerId]
    );
    const challengerName = challengerRow.rows[0]?.display_name || 'Unknown';

    // Notify the challenged user via WebSocket
    sm.sendChallengeReceived(challengedId, {
      challengeId,
      challenger: { id: challengerId, display_name: challengerName },
    });

    return res.json({ challengeId });
  } catch (err) {
    console.error('Challenge send error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /challenge/:id/accept
 * Accept a pending challenge — creates a game row.
 */
router.post('/:id/accept', requireAuth, async (req, res) => {
  const challengeId = req.params.id;
  const userId = req.user.userId;

  try {
    // Load & validate the challenge
    const challengeRow = await query(
      `SELECT c.*, u.display_name AS challenger_name
       FROM challenges c
       JOIN users u ON u.id = c.challenger_id
       WHERE c.id = $1`,
      [challengeId]
    );
    const challenge = challengeRow.rows[0];

    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });
    if (challenge.challenged_id !== userId) return res.status(403).json({ error: 'Forbidden' });
    if (challenge.status !== 'pending') return res.status(409).json({ error: 'Challenge is no longer pending' });

    // Update challenge status
    await query(`UPDATE challenges SET status = 'accepted' WHERE id = $1`, [challengeId]);

    // Create the game row
    const gameResult = await query(
      `INSERT INTO games (player1_id, player2_id, status, round)
       VALUES ($1, $2, 'in_progress', 1)
       RETURNING id`,
      [challenge.challenger_id, challenge.challenged_id]
    );
    const gameId = gameResult.rows[0].id;

    // Seed player HP rows
    await query(
      `INSERT INTO player_game_state (game_id, user_id, hp) VALUES ($1, $2, 10), ($1, $3, 10)`,
      [gameId, challenge.challenger_id, challenge.challenged_id]
    );

    // Create first game_rounds row
    await query(
      `INSERT INTO game_rounds (game_id, round_number) VALUES ($1, 1)`,
      [gameId]
    );

    // Mark both players as in-game
    await query(
      `UPDATE presence SET in_game = true WHERE user_id IN ($1, $2)`,
      [challenge.challenger_id, challenge.challenged_id]
    );

    // Get accepted player's name for the notification
    const acceptorRow = await query(`SELECT display_name FROM users WHERE id = $1`, [userId]);
    const acceptorName = acceptorRow.rows[0]?.display_name || 'Unknown';

    // Notify challenger via WebSocket
    sm.sendChallengeAccepted(challenge.challenger_id, {
      gameId,
      opponent: { id: userId, display_name: acceptorName },
    });

    await refreshLobby();

    return res.json({ gameId });
  } catch (err) {
    console.error('Challenge accept error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /challenge/:id/decline
 * Decline a pending challenge.
 */
router.post('/:id/decline', requireAuth, async (req, res) => {
  const challengeId = req.params.id;
  const userId = req.user.userId;

  try {
    const challengeRow = await query(
      `SELECT * FROM challenges WHERE id = $1`,
      [challengeId]
    );
    const challenge = challengeRow.rows[0];

    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });
    if (challenge.challenged_id !== userId) return res.status(403).json({ error: 'Forbidden' });
    if (challenge.status !== 'pending') return res.status(409).json({ error: 'Challenge is no longer pending' });

    await query(`UPDATE challenges SET status = 'declined' WHERE id = $1`, [challengeId]);

    // Notify challenger via WebSocket
    sm.sendChallengeDeclined(challenge.challenger_id, { challengeId });

    return res.json({ ok: true });
  } catch (err) {
    console.error('Challenge decline error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
