import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { errorMessage } from '../lib/api';
import { useAuth } from '../state/auth';

export function LoginPage() {
  const { user, ready, login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (ready && user)
    return (
      <Navigate
        to={params.get('next') || (user.role === 'operator' ? '/scan' : '/admin')}
        replace
      />
    );

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !pin) {
      setError('Enter your username and PIN');
      return;
    }
    setBusy(true);
    try {
      const u = await login(username.trim(), pin);
      navigate(params.get('next') || (u.role === 'operator' ? '/scan' : '/admin'), {
        replace: true,
      });
    } catch (err) {
      setError(errorMessage(err));
      setPin('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <div className="login-brand">
          <div className="logo" aria-hidden="true">
            SD
          </div>
          <div>
            <h1 style={{ margin: 0 }}>ScanDock WMS</h1>
            <div className="muted small">Jacksonville Distribution Center</div>
          </div>
        </div>
        <form onSubmit={submit} className="stack" noValidate>
          <div className="field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="pin">PIN</label>
            <input
              id="pin"
              className="input"
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <div className="demo-accounts" style={{ marginTop: '1rem' }}>
          <strong>Demo accounts</strong> (PIN <code>1234</code>): <code>admin</code>,{' '}
          <code>super</code> (supervisor), <code>picker1</code> and <code>receiver1</code>{' '}
          (operators).
        </div>
      </div>
    </div>
  );
}
