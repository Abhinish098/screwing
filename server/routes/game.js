// routes/game.js — Move submission, state polling, round resolution
const express = require('express');
const { query } = require('../db');
const { requireAuth } = require('./auth');
const { resolveMoves, checkGameOver, isValidMove } = require('../gameLogic');
const sm = require('../socketManager');

const router = express.Router();

// ---------- Helper: get full game state for a player ----------
async function getGameState(gameId, userId) {
  // Game row
  const gameRow = await query(`SELECT * FROM games WHERE id = $1`, [gameId]);
  const game = gameRow.rows[0];
  if (!game) return null;

  const isPlayer1 = game.player1_id === userId;
  const opponentId = isPlayer1 ? game.player2_id : game.player1_id;

  // HP values
  const hpRows = await query(
    `SELECT user_id, hp FROM player_game_state WHERE game_id = $1`,
    [gameId]
  );
  const hpMap = {};
  hpRows.rows.forEach((r) => { hpMap[r.user_id] = r.hp; });

  // Opponent name
  const oppRow = await query(`SELECT display_name FROM users WHERE id = $1`, [opponentId]);
  const opponentName = oppRow.rows[0]?.display_name || 'Unknown';

  // Current round row
  const roundRow = await query(
    `SELECT * FROM game_rounds WHERE game_id = $1 AND round_number = $2`,
    [gameId, game.round]
  );
  const round = roundRow.rows[0];

  const myMove = isPlayer1 ? round?.player1_move : round?.player2_move;
  const hasSubmitted = !!myMove;

  return {
    gameId,
    round: game.round,
    status: game.status,
    winnerId: game.winner_id,
    myHp: hpMap[userId] ?? 10,
    opponentHp: hpMap[opponentId] ?? 10,
    opponentName,
    hasSubmitted,
    resolved: round?.resolved ?? false,
  };
}

/**
 * GET /game/:id/state
 * Returns game state visible to the requesting player.
 */
router.get('/:id/state', requireAuth, async (req, res) => {
  try {
    const state = await getGameState(req.params.id, req.user.userId);
    if (!state) return res.status(404).json({ error: 'Game not found' });
    return res.json(state);
  } catch (err) {
    console.error('Game state error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /game/:id/move
 * Body: { move: 'attack' | 'defend' | 'run' }
 * Secretly stores the move. If both moves are now present, resolves the round.
 */
router.post('/:id/move', requireAuth, async (req, res) => {
  const gameId = req.params.id;
  const userId = req.user.userId;
  const { move } = req.body;

  if (!isValidMove(move)) {
    return res.status(400).json({ error: 'move must be "attack", "defend", or "run"' });
  }

  try {
    // Load game
    const gameRow = await query(`SELECT * FROM games WHERE id = $1`, [gameId]);
    const game = gameRow.rows[0];
    if (!game) return res.status(404).json({ error: 'Game not found' });
    if (game.status !== 'in_progress') return res.status(409).json({ error: 'Game is already finished' });

    const isPlayer1 = game.player1_id === userId;
    const isPlayer2 = game.player2_id === userId;
    if (!isPlayer1 && !isPlayer2) return res.status(403).json({ error: 'You are not in this game' });

    // Load current round
    const roundRow = await query(
      `SELECT * FROM game_rounds WHERE game_id = $1 AND round_number = $2`,
      [gameId, game.round]
    );
    const round = roundRow.rows[0];
    if (!round) return res.status(500).json({ error: 'Round row missing' });
    if (round.resolved) return res.status(409).json({ error: 'Round already resolved' });

    // Check the player hasn't already submitted
    const alreadySubmitted = isPlayer1 ? !!round.player1_move : !!round.player2_move;
    if (alreadySubmitted) return res.status(409).json({ error: 'Move already submitted for this round' });

    // Store the move
    const moveColumn = isPlayer1 ? 'player1_move' : 'player2_move';
    await query(
      `UPDATE game_rounds SET ${moveColumn} = $1 WHERE id = $2`,
      [move.toLowerCase(), round.id]
    );

    console.log(`[GAME MOVE] User ${userId} (Player ${isPlayer1 ? '1' : '2'}) submitted move "${move}" for Game ${gameId} Round ${game.round}`);

    // Reload round to check if both moves are in
    const updatedRoundRow = await query(`SELECT * FROM game_rounds WHERE id = $1`, [round.id]);
    const updatedRound = updatedRoundRow.rows[0];

    if (!updatedRound.player1_move || !updatedRound.player2_move) {
      // Waiting for the other player
      console.log(`[GAME MOVE] Game ${gameId} Round ${game.round}: Waiting for opponent...`);
      return res.json({ status: 'waiting' });
    }

    // ─── Both moves are in — resolve the round ───
    console.log(`[GAME MOVE] Game ${gameId} Round ${game.round}: Both moves in (P1: "${updatedRound.player1_move}", P2: "${updatedRound.player2_move}"). Resolving...`);

    // Load current HPs
    const hpRows = await query(
      `SELECT user_id, hp FROM player_game_state WHERE game_id = $1`,
      [gameId]
    );
    const hpMap = {};
    hpRows.rows.forEach((r) => { hpMap[r.user_id] = r.hp; });

    const hp1Before = hpMap[game.player1_id] ?? 10;
    const hp2Before = hpMap[game.player2_id] ?? 10;

    const { damage1, damage2, summary } = resolveMoves(
      updatedRound.player1_move,
      updatedRound.player2_move
    );

    const hp1After = Math.min(10, Math.max(0, hp1Before - damage1));
    const hp2After = Math.min(10, Math.max(0, hp2Before - damage2));

    // Update HPs
    await query(
      `UPDATE player_game_state SET hp = $1 WHERE game_id = $2 AND user_id = $3`,
      [hp1After, gameId, game.player1_id]
    );
    await query(
      `UPDATE player_game_state SET hp = $1 WHERE game_id = $2 AND user_id = $3`,
      [hp2After, gameId, game.player2_id]
    );

    // Mark round as resolved with HP snapshots
    await query(
      `UPDATE game_rounds
       SET resolved = true, player1_hp_after = $1, player2_hp_after = $2
       WHERE id = $3`,
      [hp1After, hp2After, round.id]
    );

    console.log(`[GAME MOVE] Game ${gameId} Round ${game.round} Resolved:
  P1: ${updatedRound.player1_move} (took ${damage1} dmg, HP: ${hp1Before} -> ${hp1After})
  P2: ${updatedRound.player2_move} (took ${damage2} dmg, HP: ${hp2Before} -> ${hp2After})
  Summary: ${summary}`);

    // Fetch player names for broadcast
    const nameRows = await query(
      `SELECT id, display_name FROM users WHERE id IN ($1, $2)`,
      [game.player1_id, game.player2_id]
    );
    const nameMap = {};
    nameRows.rows.forEach((r) => { nameMap[r.id] = r.display_name; });

    const roundResult = {
      round: game.round,
      player1: {
        id: game.player1_id,
        name: nameMap[game.player1_id],
        move: updatedRound.player1_move,
        hpBefore: hp1Before,
        hpAfter: hp1After,
        damage: damage1,
      },
      player2: {
        id: game.player2_id,
        name: nameMap[game.player2_id],
        move: updatedRound.player2_move,
        hpBefore: hp2Before,
        hpAfter: hp2After,
        damage: damage2,
      },
      summary,
    };

    // Check game over
    const { isOver, winnerId: rawWinner } = checkGameOver(hp1After, hp2After);

    if (isOver) {
      const dbWinnerId =
        rawWinner === 'player1' ? game.player1_id
        : rawWinner === 'player2' ? game.player2_id
        : null; // draw — null

      await query(
        `UPDATE games SET status = 'finished', winner_id = $1 WHERE id = $2`,
        [dbWinnerId, gameId]
      );

      // Mark both players available again
      await query(
        `UPDATE presence SET in_game = false WHERE user_id IN ($1, $2)`,
        [game.player1_id, game.player2_id]
      );

      const winnerName = dbWinnerId ? nameMap[dbWinnerId] : null;
      console.log(`[GAME OVER] Game ${gameId} complete. Winner: ${winnerName || 'Draw'}`);

      sm.broadcastRoundResult(game.player1_id, game.player2_id, roundResult);
      sm.broadcastGameOver(game.player1_id, game.player2_id, {
        winnerId: dbWinnerId,
        winnerName,
        isDraw: rawWinner === 'draw',
      });

      // Refresh lobby (both players are free again)
      const lobbyRows = await query(
        `SELECT u.id, u.display_name
         FROM users u JOIN presence p ON p.user_id = u.id
         WHERE p.is_online = true AND p.in_game = false
         ORDER BY p.last_seen DESC`
      );
      sm.broadcastLobbyUpdate({ players: lobbyRows.rows });

      return res.json({ status: 'game_over', roundResult, winnerId: dbWinnerId });
    }

    // Advance to next round
    const nextRound = game.round + 1;
    await query(`UPDATE games SET round = $1 WHERE id = $2`, [nextRound, gameId]);
    await query(
      `INSERT INTO game_rounds (game_id, round_number) VALUES ($1, $2)`,
      [gameId, nextRound]
    );

    console.log(`[GAME MOVE] Game ${gameId} advanced. Next round is ${nextRound}`);

    sm.broadcastRoundResult(game.player1_id, game.player2_id, roundResult);

    return res.json({ status: 'round_resolved', roundResult });
  } catch (err) {
    console.error('Game move error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
