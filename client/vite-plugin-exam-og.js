import fs from 'node:fs';
import path from 'node:path';
import { applyShareTags, requestOrigin, shareImageUrl } from './shareTags.js';

function apiBase(config) {
  const fromEnv = config?.env?.VITE_API_URL || process.env.VITE_API_URL || '';
  return String(fromEnv || 'http://127.0.0.1:5050').replace(/\/$/, '');
}

function examSlug(url) {
  const pathOnly = String(url || '').split('?')[0];
  const match = pathOnly.match(/^\/e\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : '';
}

async function inject(html, slug, req, api) {
  const origin = requestOrigin(req);
  const res = await fetch(`${api}/api/public/exams/${encodeURIComponent(slug)}/share`);
  if (!res.ok) return html;
  const meta = await res.json();
  return applyShareTags(html, meta, {
    pageUrl: `${origin}/e/${encodeURIComponent(slug)}`,
    imageUrl: shareImageUrl(origin, slug, api, meta.updated_at),
  });
}

export default function examOgPlugin() {
  return {
    name: 'exam-og-meta',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const slug = examSlug(req.originalUrl || req.url);
        if (!slug) return next();
        try {
          const index = path.join(server.config.root, 'index.html');
          const raw = fs.readFileSync(index, 'utf8');
          const html = await server.transformIndexHtml(req.originalUrl || req.url, raw);
          res.setHeader('Content-Type', 'text/html');
          res.end(await inject(html, slug, req, apiBase(server.config)));
        } catch {
          next();
        }
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const slug = examSlug(req.originalUrl || req.url);
        if (!slug) return next();
        try {
          const index = path.join(server.config.root, 'dist/index.html');
          const html = fs.readFileSync(index, 'utf8');
          res.setHeader('Content-Type', 'text/html');
          res.end(await inject(html, slug, req, apiBase(server.config)));
        } catch {
          next();
        }
      });
    },
  };
}
