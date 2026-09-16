import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyShareTags, shareImageUrl } from './shareTags.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
const indexPath = path.join(dist, 'index.html');
const PORT = Number(process.env.PORT) || 4173;
const API = String(process.env.API_URL || process.env.VITE_API_URL || '').replace(/\/$/, '');
const SITE = String(process.env.VITE_SITE_URL || '').replace(/\/$/, '');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type });
  res.end(body);
}

async function examHtml(slug, host) {
  const html = fs.readFileSync(indexPath, 'utf8');
  const origin = SITE || `https://${host}`;
  if (!API) return html;
  const res = await fetch(`${API}/api/public/exams/${encodeURIComponent(slug)}/share`);
  if (!res.ok) return html;
  const meta = await res.json();
  return applyShareTags(html, meta, {
    pageUrl: `${origin}/e/${encodeURIComponent(slug)}`,
    imageUrl: shareImageUrl(origin, slug, API, meta.has_cover),
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const exam = url.pathname.match(/^\/e\/([^/]+)\/?$/);
  if (exam) {
    try {
      send(res, 200, await examHtml(decodeURIComponent(exam[1]), req.headers.host), 'text/html; charset=utf-8');
    } catch {
      send(res, 200, fs.readFileSync(indexPath), 'text/html; charset=utf-8');
    }
    return;
  }

  const file = path.normalize(path.join(dist, url.pathname === '/' ? '/index.html' : url.pathname));
  if (!file.startsWith(dist)) return send(res, 403, 'Forbidden');
  if (fs.existsSync(file) && fs.statSync(file).isFile()) {
    return send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || 'application/octet-stream');
  }
  send(res, 200, fs.readFileSync(indexPath), 'text/html; charset=utf-8');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Quiz97 web on port ${PORT}`);
});
