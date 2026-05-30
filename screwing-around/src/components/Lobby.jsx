import { useEffect, useState, useCallback } from 'react';
import { getLobby, goOffline, sendChallenge, acceptChallenge, declineChallenge } from '../api';
import { connect, disconnect, on } from '../socket';

export default function Lobby({ user, token, onStartGame, onSignOut }) {
  const [players, setPlayers] = useState([]);
  const [incomingChallenge, setIncomingChallenge] = useState(null); // { challengeId, challenger }
  const [pendingChallenge, setPendingChallenge] = useState(null);   // { challengeId, challengedId }
  const [wsReady, setWsReady] = useState(false);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null); // playerId being challenged

  // Fetch lobby snapshot from REST on mount / reconnect
  const fetchLobby = useCallback(async () => {
    try {
      const data = await getLobby();
      const otherPlayers = (data.players || []).filter((p) => p.id !== user.id);
      setPlayers(otherPlayers);
    } catch (err) {
      console.error('Lobby fetch failed:', err);
    }
  }, [user.id]);

  // Connect WebSocket and set up event listeners
  useEffect(() => {
    connect(token);

    const unsubs = [
      on('__connected', () => { setWsReady(true); fetchLobby(); }),
      on('__disconnected', () => setWsReady(false)),

      on('lobby:update', (data) => {
        const otherPlayers = (data.players || []).filter((p) => p.id !== user.id);
        setPlayers(otherPlayers);
      }),

      on('challenge:received', (data) => {
        setIncomingChallenge(data);
      }),

      on('challenge:accepted', (data) => {
        setPendingChallenge(null);
        onStartGame(data.gameId, data.opponent);
      }),

      on('challenge:declined', () => {
        setPendingChallenge(null);
        setError('Your challenge was declined.');
        setTimeout(() => setError(null), 3000);
      }),
    ];

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [token, fetchLobby, onStartGame]);

  // ─── Handlers ─────────────────────────────────────────────────────────

  async function handleChallenge(playerId) {
    setActionLoading(playerId);
    setError(null);
    try {
      const data = await sendChallenge(playerId);
      setPendingChallenge({ challengeId: data.challengeId, challengedId: playerId });
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleAccept() {
    if (!incomingChallenge) return;
    try {
      const data = await acceptChallenge(incomingChallenge.challengeId);
      setIncomingChallenge(null);
      onStartGame(data.gameId, incomingChallenge.challenger);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDecline() {
    if (!incomingChallenge) return;
    try {
      await declineChallenge(incomingChallenge.challengeId);
      setIncomingChallenge(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSignOut() {
    try {
      await goOffline();
    } catch { /* best-effort */ }
    disconnect();
    onSignOut();
  }

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div className="lobby-screen">
      {/* Header */}
      <header className="lobby-header">
        <div className="lobby-brand">⚔️ The Duel</div>
        <div className="lobby-user-info">
          <span className={`ws-dot ${wsReady ? 'ws-dot--on' : 'ws-dot--off'}`} />
          <span className="lobby-username">{user.display_name}</span>
          <button className="btn btn-ghost" onClick={handleSignOut}>Sign out</button>
        </div>
      </header>

      <div className="lobby-body">
        {/* Incoming challenge banner */}
        {incomingChallenge && (
          <div className="challenge-banner">
            <span className="challenge-banner__icon">⚔️</span>
            <span className="challenge-banner__text">
              <strong>{incomingChallenge.challenger.display_name}</strong> challenged you to a duel!
            </span>
            <div className="challenge-banner__actions">
              <button className="btn btn-accept" onClick={handleAccept}>Accept</button>
              <button className="btn btn-decline" onClick={handleDecline}>Decline</button>
            </div>
          </div>
        )}

        {/* Pending outgoing challenge */}
        {pendingChallenge && (
          <div className="waiting-banner">
            <div className="spinner spinner--sm" />
            <span>Waiting for opponent to accept your challenge…</span>
          </div>
        )}

        {/* Error */}
        {error && <div className="error-toast">{error}</div>}

        {/* Player list */}
        <div className="lobby-section">
          <h2 className="lobby-section__title">
            Players in the Arena
            <span className="lobby-count">{players.length}</span>
          </h2>

          {players.length === 0 ? (
            <div className="lobby-empty">
              <span className="lobby-empty__icon">🏜️</span>
              <p>No other duelists online right now.</p>
              <p className="lobby-empty__sub">Share the link and wait for a challenger.</p>
            </div>
          ) : (
            <ul className="player-list">
              {players.map((p) => (
                <li key={p.id} className="player-card">
                  <div className="player-card__avatar">
                    {p.display_name.slice(0, 1).toUpperCase()}
                  </div>
                  <span className="player-card__name">{p.display_name}</span>
                  <button
                    className="btn btn-challenge"
                    disabled={!!pendingChallenge || actionLoading === p.id}
                    onClick={() => handleChallenge(p.id)}
                  >
                    {actionLoading === p.id ? '…' : 'Duel'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
