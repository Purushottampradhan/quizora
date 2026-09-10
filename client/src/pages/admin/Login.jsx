import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import Logo from '../../components/Logo.jsx';
import { useAuth } from '../../lib/AuthContext.jsx';
import { SIGNUP_FIX_SQL } from '../../lib/signupFixSql.js';

function supabaseSqlEditorUrl() {
  try {
    const ref = new URL(import.meta.env.VITE_SUPABASE_URL).hostname.split('.')[0];
    return `https://supabase.com/dashboard/project/${ref}/sql/new`;
  } catch {
    return 'https://supabase.com/dashboard';
  }
}

export default function Login() {
  const { session, signIn, signUp, configured } = useAuth();
  const navigate = useNavigate();
  const isSignup = useLocation().pathname.endsWith('/signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [copied, setCopied] = useState(false);

  const dbSignupError = /database error saving new user/i.test(error);

  useEffect(() => {
    setError('');
    setInfo('');
    setConfirm('');
    setCopied(false);
  }, [isSignup]);

  if (session) return <Navigate to="/admin" replace />;

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setInfo('');
    try {
      if (isSignup) {
        if (password.length < 6) throw new Error('Password must be at least 6 characters');
        if (password !== confirm) throw new Error('Passwords do not match');
        const data = await signUp(email, password);
        if (data?.session) {
          navigate('/admin');
          return;
        }
        setInfo('Account created. If email confirmation is on, check your inbox, then sign in.');
      } else {
        await signIn(email, password);
        navigate('/admin');
      }
    } catch (err) {
      setError(err.message || (isSignup ? 'Could not sign up' : 'Could not sign in'));
    } finally {
      setBusy(false);
    }
  }

  async function copyFix() {
    await navigator.clipboard.writeText(SIGNUP_FIX_SQL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <Link to="/" className="mb-8 self-start">
        <Logo />
      </Link>
      <div className="glass rounded-3xl p-6">
        <h1 className="font-display text-2xl font-bold">{isSignup ? 'Create admin account' : 'Admin sign in'}</h1>
        <p className="mt-1 text-[var(--muted)]">
          {isSignup
            ? 'Sign up to create exams, upload questions, and share quiz links.'
            : 'Create exams, upload questions, and watch attempts.'}
        </p>

        {!configured && (
          <p className="mt-4 rounded-2xl bg-amber-400/15 px-3 py-2 text-sm text-amber-200">
            Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in quizora/.env
          </p>
        )}

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
              minLength={isSignup ? 6 : undefined}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
            />
          </label>
          {isSignup && (
            <label className="grid gap-1 text-sm font-bold">
              Confirm password
              <input
                className="field"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </label>
          )}
          {error && !dbSignupError && <p className="text-sm text-[var(--danger)]">{error}</p>}
          {dbSignupError && (
            <div className="rounded-2xl bg-rose-400/10 p-3 text-sm">
              <p className="font-bold text-[var(--danger)]">Signup is blocked by a database trigger on this Supabase project.</p>
              <p className="mt-1 text-[var(--muted)]">
                Paste the SQL fix in the Supabase SQL editor, run it, then try Sign up again.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="btn btn-violet px-3 py-2 text-xs" onClick={copyFix}>
                  {copied ? 'Copied' : 'Copy SQL fix'}
                </button>
                <a className="btn btn-ghost px-3 py-2 text-xs" href={supabaseSqlEditorUrl()} target="_blank" rel="noreferrer">
                  Open SQL editor
                </a>
              </div>
            </div>
          )}
          {info && <p className="text-sm text-[var(--mint)]">{info}</p>}
          <button className="btn btn-primary mt-2" disabled={busy}>
            {busy ? (isSignup ? 'Creating account…' : 'Signing in…') : isSignup ? 'Sign up' : 'Enter dashboard'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-[var(--muted)]">
          {isSignup ? (
            <>
              Already have an account?{' '}
              <Link className="font-extrabold text-[var(--coral-2)]" to="/admin/login">
                Sign in
              </Link>
            </>
          ) : (
            <>
              New here?{' '}
              <Link className="font-extrabold text-[var(--coral-2)]" to="/admin/signup">
                Create an account
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
