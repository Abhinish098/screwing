// gameLogic.js — Pure move-resolution functions for The Duel
// All functions are stateless and side-effect-free.

/**
 * Resolve a round given two moves.
 *
 * Move table:
 *   Attack  vs Attack  → both take 1 damage
 *   Attack  vs Defend  → attacker takes 1 damage (blocked)
 *   Attack  vs Run     → runner takes 2 damage
 *   Defend  vs Defend  → nothing
 *   Defend  vs Run     → runner heals 3 HP (gets +3 HP, capped at 10)
 *   Run     vs Run     → both heal 3 HP (get +3 HP, capped at 10)
 *   Run     vs Attack  → runner takes 2 damage  (symmetric of Attack vs Run)
 *
 * @param {string} move1  'attack' | 'defend' | 'run'  (player 1)
 * @param {string} move2  'attack' | 'defend' | 'run'  (player 2)
 * @returns {{ damage1: number, damage2: number, summary: string }}
 */
function resolveMoves(move1, move2) {
  const m1 = move1.toLowerCase();
  const m2 = move2.toLowerCase();

  // Both attack
  if (m1 === 'attack' && m2 === 'attack') {
    return { damage1: 1, damage2: 1, summary: 'Both players attacked — both take 1 damage!' };
  }

  // P1 attacks, P2 defends → P1 is blocked
  if (m1 === 'attack' && m2 === 'defend') {
    return { damage1: 1, damage2: 0, summary: 'Player 2 defended — Player 1\'s attack is blocked, Player 1 takes 1 recoil!' };
  }

  // P1 defends, P2 attacks → P2 is blocked
  if (m1 === 'defend' && m2 === 'attack') {
    return { damage1: 0, damage2: 1, summary: 'Player 1 defended — Player 2\'s attack is blocked, Player 2 takes 1 recoil!' };
  }

  // P1 attacks, P2 runs → runner takes 2
  if (m1 === 'attack' && m2 === 'run') {
    return { damage1: 0, damage2: 2, summary: 'Player 2 tried to run but Player 1 attacks from behind — Player 2 takes 2 damage!' };
  }

  // P1 runs, P2 attacks → runner takes 2
  if (m1 === 'run' && m2 === 'attack') {
    return { damage1: 2, damage2: 0, summary: 'Player 1 tried to run but Player 2 attacks from behind — Player 1 takes 2 damage!' };
  }

  // P1 runs, P2 defends → P1 gets +3 HP (successful run), P2 nothing
  if (m1 === 'run' && m2 === 'defend') {
    return { damage1: -3, damage2: 0, summary: 'Player 1 successfully ran away and recovered 3 HP! Player 2 defended empty space.' };
  }

  // P1 defends, P2 runs → P2 gets +3 HP (successful run), P1 nothing
  if (m1 === 'defend' && m2 === 'run') {
    return { damage1: 0, damage2: -3, summary: 'Player 2 successfully ran away and recovered 3 HP! Player 1 defended empty space.' };
  }

  // Both run → both get +3 HP (successful run)
  if (m1 === 'run' && m2 === 'run') {
    return { damage1: -3, damage2: -3, summary: 'Both players successfully ran away from each other and recovered 3 HP!' };
  }

  // Both defend
  if (m1 === 'defend' && m2 === 'defend') {
    return { damage1: 0, damage2: 0, summary: 'Both players defended empty space — nothing happens.' };
  }

  // Fallback
  return { damage1: 0, damage2: 0, summary: 'Nothing happens this round.' };
}

/**
 * Determine if a game is over given current HP values.
 * @param {number} hp1
 * @param {number} hp2
 * @returns {{ isOver: boolean, winnerId: 'player1' | 'player2' | 'draw' | null }}
 */
function checkGameOver(hp1, hp2) {
  if (hp1 <= 0 && hp2 <= 0) {
    return { isOver: true, winnerId: 'draw' };
  }
  if (hp1 <= 0) {
    return { isOver: true, winnerId: 'player2' };
  }
  if (hp2 <= 0) {
    return { isOver: true, winnerId: 'player1' };
  }
  return { isOver: false, winnerId: null };
}

/**
 * Validate that a move string is legal.
 * @param {string} move
 * @returns {boolean}
 */
function isValidMove(move) {
  return ['attack', 'defend', 'run'].includes(move?.toLowerCase());
}

module.exports = { resolveMoves, checkGameOver, isValidMove };
