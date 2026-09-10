import { supabaseAnon, supabaseAsUser } from '../supabase.js';

export async function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    return res.status(401).json({ error: 'Sign in required' });
  }

  try {
    const { data, error } = await supabaseAnon().auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }
    req.user = data.user;
    req.sb = supabaseAsUser(token);
    next();
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Auth failed' });
  }
}
