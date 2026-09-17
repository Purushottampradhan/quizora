import './loadEnv.js';
import express from 'express';
import cors from 'cors';
import { connectDb } from './db.js';
import { seedAdmin } from './seedAdmin.js';
import adminRoutes from './routes/admin.js';
import publicRoutes from './routes/public.js';
import { getShareMeta } from './services/quizService.js';
import { examShareHtml, requestOrigin } from './lib/sharePage.js';

const app = express();
app.set('trust proxy', 1);
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
  res.json({ ok: true, name: 'quiz97' });
});

function rejectSignup(_req, res) {
  res.status(403).json({ error: 'Signups are disabled' });
}

app.all('/api/signup', rejectSignup);
app.all('/api/auth/signup', rejectSignup);
app.all('/api/admin/signup', rejectSignup);
app.all('/api/public/signup', rejectSignup);

app.get('/e/:slug', async (req, res, next) => {
  try {
    const slug = req.params.slug;
    const meta = await getShareMeta(slug);
    const apiOrigin = requestOrigin(req);
    const client = String(process.env.CLIENT_URL || '').replace(/\/$/, '');
    const examUrl = client ? `${client}/e/${encodeURIComponent(slug)}` : '';
    const stamp = meta.updated_at ? new Date(meta.updated_at).toISOString() : '';
    const cache = stamp ? `?v=${encodeURIComponent(stamp)}` : '';
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(
      examShareHtml({
        title: meta.title,
        description: meta.description,
        pageUrl: `${apiOrigin}/e/${encodeURIComponent(slug)}`,
        imageUrl: `${apiOrigin}/api/public/exams/${encodeURIComponent(slug)}/og.png${cache}`,
        examUrl,
      })
    );
  } catch (err) {
    if (err.status === 404) {
      res.status(404).type('html').send('Exam not found');
      return;
    }
    next(err);
  }
});

app.use('/api/admin', adminRoutes);
app.use('/api/public', publicRoutes);

app.use((err, _req, res, _next) => {
  if (err?.name === 'CastError') {
    return res.status(404).json({ error: 'Not found' });
  }
  if (err?.status) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error' });
});

await connectDb();
await seedAdmin();
app.listen(port, '0.0.0.0', () => {
  console.log(`Quiz97 API on port ${port}`);
});
