// socketManager.js — WebSocket event handling and broadcasting
// Manages the map of userId → WebSocket connection and emits
// structured events to individual users or pairs of players.

const clients = new Map(); // userId (string) → WebSocket

/**
 * Register a client WebSocket after authentication.
 * @param {string} userId
 * @param {import('ws').WebSocket} ws
 */
function registerClient(userId, ws) {
  clients.set(userId, ws);
}

function removeClient(userId, ws) {
  if (clients.get(userId) === ws) {
    clients.delete(userId);
  }
}

/**
 * Get the currently registered active socket for a user.
 * @param {string} userId
 */
function getActiveSocket(userId) {
  return clients.get(userId);
}

/**
 * Check if a user currently has an active connection.
 * @param {string} userId
 * @returns {boolean}
 */
function isConnected(userId) {
  const ws = clients.get(userId);
  return ws && ws.readyState === 1; // 1 = OPEN
}

/**
 * Send a JSON event to a single user.
 * @param {string} userId
 * @param {string} event
 * @param {any}    data
 */
function sendTo(userId, event, data) {
  const ws = clients.get(userId);
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ event, data }));
  }
}

/**
 * Broadcast lobby:update to ALL currently connected clients.
 * @param {any} lobbyData  The full list of online, not-in-game users.
 */
function broadcastLobbyUpdate(lobbyData) {
  const payload = JSON.stringify({ event: 'lobby:update', data: lobbyData });
  for (const [, ws] of clients) {
    if (ws.readyState === 1) {
      ws.send(payload);
    }
  }
}

/**
 * Notify a user that they have received a challenge.
 * @param {string} challengedId
 * @param {{ challengeId: string, challenger: { id: string, display_name: string } }} info
 */
function sendChallengeReceived(challengedId, info) {
  sendTo(challengedId, 'challenge:received', info);
}

/**
 * Notify the challenger that their challenge was accepted.
 * @param {string} challengerId
 * @param {{ gameId: string, opponent: { id: string, display_name: string } }} info
 */
function sendChallengeAccepted(challengerId, info) {
  sendTo(challengerId, 'challenge:accepted', info);
}

/**
 * Notify the challenger that their challenge was declined.
 * @param {string} challengerId
 * @param {{ challengeId: string }} info
 */
function sendChallengeDeclined(challengerId, info) {
  sendTo(challengerId, 'challenge:declined', info);
}

/**
 * Broadcast the round result to both players.
 * @param {string} player1Id
 * @param {string} player2Id
 * @param {object} result
 */
function broadcastRoundResult(player1Id, player2Id, result) {
  sendTo(player1Id, 'game:round_result', result);
  sendTo(player2Id, 'game:round_result', result);
}

/**
 * Broadcast game over to both players.
 * @param {string} player1Id
 * @param {string} player2Id
 * @param {object} result  { winnerId, winnerName, yourResult: 'win'|'loss'|'draw' }
 */
function broadcastGameOver(player1Id, player2Id, result) {
  sendTo(player1Id, 'game:over', { ...result, yourResult: result.winnerId === player1Id ? 'win' : result.winnerId === 'draw' ? 'draw' : 'loss' });
  sendTo(player2Id, 'game:over', { ...result, yourResult: result.winnerId === player2Id ? 'win' : result.winnerId === 'draw' ? 'draw' : 'loss' });
}

module.exports = {
  registerClient,
  removeClient,
  isConnected,
  getActiveSocket,
  sendTo,
  broadcastLobbyUpdate,
  sendChallengeReceived,
  sendChallengeAccepted,
  sendChallengeDeclined,
  broadcastRoundResult,
  broadcastGameOver,
};
