import { useEffect, useRef, useState } from 'react';
import { authGoogle, setToken } from '../api';

// ⚠️  Replace this with your actual Google OAuth Client ID
const GOOGLE_CLIENT_ID = '91051277728-ct1pijg06nil37fs4evg6j0amt7k4kav.apps.googleusercontent.com';

export default function Login({ onLogin }) {
  const containerRef = useRef(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Load Google Identity Services and render the button
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (!window.google) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      window.google.accounts.id.renderButton(containerRef.current, {
        theme: 'filled_black',
        size: 'large',
        shape: 'pill',
        text: 'signin_with',
        logo_alignment: 'left',
        width: 280,
      });
    };
    document.head.appendChild(script);
    return () => document.head.removeChild(script);
  }, []);

  async function handleCredentialResponse(response) {
    setError(null);
    setLoading(true);
    try {
      const data = await authGoogle(response.credential);
      setToken(data.token);
      onLogin(data.user, data.token);
    } catch (err) {
      setError(err.message || 'Sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-emblem">⚔️</div>
        <h1 className="login-title">The Duel</h1>
        <p className="login-subtitle">
          Challenge a friend. Choose your move. Only one survives.
        </p>

        <div className="login-divider" />

        <div className="login-rules">
          <div className="rule-item">
            <span className="rule-icon">🗡️</span>
            <span><strong>Attack</strong> — Strike your opponent</span>
          </div>
          <div className="rule-item">
            <span className="rule-icon">🛡️</span>
            <span><strong>Defend</strong> — Block and punish</span>
          </div>
          <div className="rule-item">
            <span className="rule-icon">💨</span>
            <span><strong>Run</strong> — Flee… or die trying</span>
          </div>
        </div>

        <div className="login-divider" />

        <div className="login-btn-wrapper">
          {loading ? (
            <div className="spinner-wrap">
              <div className="spinner" />
              <span>Signing in…</span>
            </div>
          ) : (
            <div ref={containerRef} className="google-btn-container" />
          )}
        </div>

        {error && <p className="login-error">{error}</p>}

        <p className="login-note">Sign in with Google to enter the arena</p>
      </div>
    </div>
  );
}
