import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

const TOKEN_KEY = 'quiz97_token';
const LEGACY_TOKEN_KEY = 'quizora_token';
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY) || localStorage.getItem(LEGACY_TOKEN_KEY);
    if (!token) {
      setReady(true);
      return;
    }
    if (!localStorage.getItem(TOKEN_KEY) && localStorage.getItem(LEGACY_TOKEN_KEY)) {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.removeItem(LEGACY_TOKEN_KEY);
    }
    api('/api/admin/me', { token })
      .then((data) => {
        setSession({ access_token: token, user: data.user });
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setSession(null);
      })
      .finally(() => setReady(true));
  }, []);

  const value = useMemo(
    () => ({
      ready,
      session,
      user: session?.user || null,
      token: session?.access_token || '',
      configured: true,
      error,
      async signIn(email, password) {
        setError('');
        const data = await api('/api/admin/login', {
          method: 'POST',
          body: { email, password },
        });
        localStorage.setItem(TOKEN_KEY, data.token);
        setSession({ access_token: data.token, user: data.user });
      },
      async signOut() {
        localStorage.removeItem(TOKEN_KEY);
        setSession(null);
      },
    }),
    [ready, session, error]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
