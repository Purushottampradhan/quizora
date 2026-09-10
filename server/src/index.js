import './loadEnv.js';
import express from 'express';
import cors from 'cors';
import adminRoutes from './routes/admin.js';
import publicRoutes from './routes/public.js';
import { supabaseConfig } from './supabase.js';

const app = express();
const port = Number(process.env.PORT) || 5050;

function corsOrigins() {
  const listed = [
    process.env.CLIENT_URL,
    ...(process.env.CORS_ORIGINS || '').split(','),
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ]
    .map((value) => String(value || '').trim().replace(/\/$/, ''))
    .filter(Boolean);
  return [...new Set(listed)];
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      const allowed = corsOrigins();
      if (allowed.includes(origin) || origin.endsWith('.onrender.com')) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, name: 'quizora' });
});

function rejectSignup(_req, res) {
  res.status(403).json({ error: 'Signups are disabled' });
}

app.all('/api/signup', rejectSignup);
app.all('/api/auth/signup', rejectSignup);
app.all('/api/admin/signup', rejectSignup);
app.all('/api/public/signup', rejectSignup);

app.use('/api/admin', adminRoutes);
app.use('/api/public', publicRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error' });
});

app.listen(port, '0.0.0.0', () => {
  const { url } = supabaseConfig();
  console.log(`Quizora API on port ${port}`);
  console.log(url ? `Supabase: ${url}` : 'Supabase keys missing');
});
