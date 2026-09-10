import { createClient } from '@supabase/supabase-js';

export function supabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  return { url, anon };
}

function baseOptions() {
  return { auth: { persistSession: false, autoRefreshToken: false } };
}

export function supabaseAnon() {
  const { url, anon } = supabaseConfig();
  if (!url || !anon) {
    throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in quizora/.env');
  }
  return createClient(url, anon, baseOptions());
}

export function supabaseAsUser(accessToken) {
  const { url, anon } = supabaseConfig();
  return createClient(url, anon, {
    ...baseOptions(),
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
