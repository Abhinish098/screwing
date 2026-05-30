import { useEffect, useState, useCallback } from 'react';
import { getGameState, submitMove } from '../api';
import { connect, on } from '../socket';

const MOVES = [
  { id: 'attack', label: 'Attack',  icon: '🗡️', desc: 'Strike your opponent' },
  { id: 'defend', label: 'Defend',  icon: '🛡️', desc: 'Block and punish' },
  { id: 'run',    label: 'Run',     icon: '💨', desc: 'Flee the battle' },
];

export default function Game({ user, token, gameId, opponent, onGameOver }) {
  const [gameState, setGameState] = useState(null);
  const [selectedMove, setSelectedMove] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [roundResult, setRoundResult] = useState(null);  // last resolved round
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showResult, setShowResult] = useState(false);   // brief reveal before next round

  useEffect(() => {
    if (token) {
      connect(token);
    }
  }, [token]);

  const myId = user.id;

  // Fetch initial state
  const fetchState = useCallback(async () => {
    try {
      const s = await getGameState(gameId);
      setGameState(s);
      setSubmitted(s.hasSubmitted);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  // Listen for round resolution
  useEffect(() => {
    const unsub1 = on('game:round_result', (result) => {
      setRoundResult(result);
      setShowResult(true);
      setSubmitted(false);
      setSelectedMove(null);

      // Update local HP from result
      const myResult   = result.player1.id === myId ? result.player1 : result.player2;
      const oppResult  = result.player1.id === myId ? result.player2 : result.player1;

      setGameState((prev) => prev ? {
        ...prev,
        myHp:       myResult.hpAfter,
        opponentHp: oppResult.hpAfter,
        round:      result.round + 1,
      } : prev);

      // Hide round result after 4 s and allow next move
      setTimeout(() => {
        setShowResult(false);
        setRoundResult(null);
      }, 4000);
    });

    const unsub2 = on('game:over', (result) => {
      onGameOver(result);
    });

    return () => { unsub1(); unsub2(); };
  }, [myId, onGameOver]);

  async function handleSubmitMove() {
    if (!selectedMove || submitted) return;
    setError(null);
    setSubmitted(true); // Disable input immediately
    try {
      const res = await submitMove(gameId, selectedMove);
      if (res && res.status !== 'waiting') {
        setSubmitted(false); // Move resolved the round, allow choosing next move
      }
    } catch (err) {
      setSubmitted(false); // Re-enable on error
      setError(err.message);
    }
  }

  if (loading) {
    return (
      <div className="game-screen game-screen--loading">
        <div className="spinner" />
        <p>Loading battle…</p>
      </div>
    );
  }

  const myHp  = gameState?.myHp ?? 10;
  const oppHp = gameState?.opponentHp ?? 10;
  const round = gameState?.round ?? 1;

  return (
    <div className="game-screen">
      {/* Scoreboard */}
      <header className="game-header">
        <div className="duelist duelist--you">
          <span className="duelist__name">You ({user.display_name})</span>
          <HpBar current={myHp} max={10} side="left" />
          <span className="duelist__hp">{myHp} HP</span>
        </div>

        <div className="game-round-badge">Round {round}</div>

        <div className="duelist duelist--opp">
          <span className="duelist__name">{opponent.display_name}</span>
          <HpBar current={oppHp} max={10} side="right" />
          <span className="duelist__hp">{oppHp} HP</span>
        </div>
      </header>

      {/* Round result reveal */}
      {showResult && roundResult && (
        <RoundResultPanel result={roundResult} myId={myId} />
      )}

      {/* Move selection */}
      {!showResult && (
        <div className="game-arena">
          {submitted ? (
            <div className="waiting-panel">
              <div className="spinner spinner--lg" />
              <h2>Move submitted!</h2>
              <p>Waiting for <strong>{opponent.display_name}</strong> to choose…</p>
            </div>
          ) : (
            <>
              <h2 className="game-prompt">Choose your move, duelist</h2>
              <div className="move-grid">
                {MOVES.map((m) => (
                  <button
                    key={m.id}
                    className={`move-card ${selectedMove === m.id ? 'move-card--selected' : ''}`}
                    onClick={() => setSelectedMove(m.id)}
                  >
                    <span className="move-card__icon">{m.icon}</span>
                    <span className="move-card__label">{m.label}</span>
                    <span className="move-card__desc">{m.desc}</span>
                  </button>
                ))}
              </div>

              {error && <p className="game-error">{error}</p>}

              <button
                className="btn btn-primary btn-lg"
                disabled={!selectedMove}
                onClick={handleSubmitMove}
              >
                Commit Move ⚔️
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function HpBar({ current, max, side }) {
  const pct = Math.max(0, (current / max) * 100);
  const color = pct > 50 ? '#22c55e' : pct > 25 ? '#f59e0b' : '#ef4444';
  return (
    <div className={`hp-bar hp-bar--${side}`}>
      <div className="hp-bar__track">
        <div
          className="hp-bar__fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

function RoundResultPanel({ result, myId }) {
  const me  = result.player1.id === myId ? result.player1 : result.player2;
  const opp = result.player1.id === myId ? result.player2 : result.player1;

  const ICONS = { attack: '🗡️', defend: '🛡️', run: '💨' };

  return (
    <div className="round-result">
      <h3 className="round-result__title">Round {result.round} Result</h3>
      <div className="round-result__moves">
        <div className="round-move">
          <span className="round-move__icon">{ICONS[me.move]}</span>
          <span className="round-move__label">You: <strong>{me.move}</strong></span>
          {me.damage > 0 && <span className="round-move__dmg">−{me.damage} HP</span>}
        </div>
        <span className="round-result__vs">VS</span>
        <div className="round-move">
          <span className="round-move__icon">{ICONS[opp.move]}</span>
          <span className="round-move__label">{opp.name}: <strong>{opp.move}</strong></span>
          {opp.damage > 0 && <span className="round-move__dmg">−{opp.damage} HP</span>}
        </div>
      </div>
      <p className="round-result__summary">{result.summary}</p>
    </div>
  );
}
