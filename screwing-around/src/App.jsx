import { useState } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { clearToken } from './api';
import { disconnect } from './socket';
import Login from './components/Login';
import Lobby from './components/Lobby';
import Game from './components/Game';
import Result from './components/Result';

// ─── Inner app that has access to useNavigate ─────────────────────────────

function DuelApp() {
  const navigate = useNavigate();

  // Auth state — stored in memory only (no localStorage)
  const [user,  setUser]  = useState(null); // { id, display_name, email }
  const [token, setToken] = useState(null);

  // Game state
  const [gameId,       setGameId]       = useState(null);
  const [opponent,     setOpponent]     = useState(null); // { id, display_name }
  const [gameOverData, setGameOverData] = useState(null);

  // ─── Auth handlers ──────────────────────────────────────────────────

  function handleLogin(userData, jwt) {
    setUser(userData);
    setToken(jwt);
    navigate('/lobby');
  }

  function handleSignOut() {
    clearToken();
    disconnect();
    setUser(null);
    setToken(null);
    setGameId(null);
    setOpponent(null);
    setGameOverData(null);
    navigate('/');
  }

  // ─── Game flow handlers ─────────────────────────────────────────────

  function handleStartGame(gId, opp) {
    setGameId(gId);
    setOpponent(opp);
    setGameOverData(null);
    navigate('/game');
  }

  function handleGameOver(data) {
    setGameOverData(data);
    navigate('/result');
  }

  function handleReturnToLobby() {
    setGameId(null);
    setOpponent(null);
    setGameOverData(null);
    navigate('/lobby');
  }

  // ─── Route guard ────────────────────────────────────────────────────

  const authed = !!user && !!token;

  return (
    <Routes>
      <Route
        path="/"
        element={authed ? <Navigate to="/lobby" replace /> : <Login onLogin={handleLogin} />}
      />
      <Route
        path="/lobby"
        element={
          authed
            ? <Lobby
                user={user}
                token={token}
                onStartGame={handleStartGame}
                onSignOut={handleSignOut}
              />
            : <Navigate to="/" replace />
        }
      />
      <Route
        path="/game"
        element={
          authed && gameId
            ? <Game
                user={user}
                token={token}
                gameId={gameId}
                opponent={opponent}
                onGameOver={handleGameOver}
              />
            : <Navigate to="/" replace />
        }
      />
      <Route
        path="/result"
        element={
          authed && gameOverData
            ? <Result
                user={user}
                gameOverData={gameOverData}
                onReturnToLobby={handleReturnToLobby}
              />
            : <Navigate to="/" replace />
        }
      />
      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// ─── Root with HashRouter (required for GitHub Pages) ────────────────────

export default function App() {
  return (
    <HashRouter>
      <DuelApp />
    </HashRouter>
  );
}
