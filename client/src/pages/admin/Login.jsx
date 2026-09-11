import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import Logo from '../../components/Logo.jsx';
import { useAuth } from '../../lib/AuthContext.jsx';

export default function Login() {
  const { session, signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (session) return <Navigate to="/admin" replace />;

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signIn(email, password);
      navigate('/admin');
    } catch (err) {
      setError(err.message || 'Could not sign in');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <Link to="/" className="mb-8 self-start">
        <Logo />
      </Link>
      <div className="glass rounded-3xl p-6">
        <h1 className="font-display text-2xl font-bold">Admin sign in</h1>
        <p className="mt-1 text-[var(--muted)]">Create exams, upload questions, and watch attempts.</p>
        <p className="mt-3 text-sm text-[var(--muted)]">New accounts are disabled. Use your existing admin login.</p>

        <form className="mt-5 grid gap-3" onSubmit={onSubmit}>
          <label className="grid gap-1 text-sm font-bold">
            Email
            <input
              className="field"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <label className="grid gap-1 text-sm font-bold">
            Password
            <input
              className="field"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </label>
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          <button className="btn btn-primary mt-2" disabled={busy}>
            {busy ? 'Signing in…' : 'Enter dashboard'}
          </button>
        </form>
      </div>
    </div>
  );
}
