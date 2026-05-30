export default function Result({ user, gameOverData, onReturnToLobby }) {
  const { yourResult, winnerName, isDraw } = gameOverData;

  const isWin  = yourResult === 'win';
  const isLoss = yourResult === 'loss';

  const emoji   = isWin ? '🏆' : isLoss ? '💀' : '🤝';
  const headline = isWin ? 'Victory!' : isLoss ? 'Defeated.' : 'Draw!';
  const subline  = isDraw
    ? 'Both duelists fell at the same moment.'
    : isWin
    ? `You bested ${winnerName ? 'your opponent' : 'your opponent'} in honourable combat.`
    : `${winnerName ?? 'Your opponent'} has won this duel.`;

  return (
    <div className="result-screen">
      <div className={`result-card result-card--${yourResult}`}>
        <div className="result-emblem">{emoji}</div>
        <h1 className="result-headline">{headline}</h1>
        <p className="result-subline">{subline}</p>

        <div className="result-divider" />

        <div className="result-stats">
          <div className="result-stat">
            <span className="result-stat__label">Duelist</span>
            <span className="result-stat__value">{user.display_name}</span>
          </div>
          <div className="result-stat">
            <span className="result-stat__label">Outcome</span>
            <span className={`result-stat__value result-stat__value--${yourResult}`}>
              {isWin ? 'WIN' : isLoss ? 'LOSS' : 'DRAW'}
            </span>
          </div>
        </div>

        <button
          className="btn btn-primary btn-lg result-lobby-btn"
          onClick={onReturnToLobby}
        >
          Return to Lobby
        </button>
      </div>
    </div>
  );
}
