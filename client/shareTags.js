export function applyShareTags(html, meta, { pageUrl, imageUrl }) {
  const esc = (value) =>
    String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  const title = esc(meta.title || 'Quiz');
  const description = esc(meta.description || '');
  const url = esc(pageUrl);
  const image = esc(imageUrl);
  const block = `
    <meta name="description" content="${description}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${title}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${image}" />`;
  return html
    .replace(/\n?\s*<!--exam-share-->[\s\S]*?<!--\/exam-share-->/g, '')
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(/\s*<meta\s+(?:name|property)="(?:og:[^"]+|twitter:[^"]+|description)"[^>]*>/gi, '')
    .replace('</head>', `<!--exam-share-->${block}\n    <!--/exam-share-->\n  </head>`);
}

export function requestOrigin(req) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || 'http';
  const host =
    String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost:5173')
      .split(',')[0]
      .trim();
  return `${proto}://${host}`;
}

export function shareImageUrl(origin, slug, apiBase = '', hasCover = false) {
  const api = String(apiBase || '').replace(/\/$/, '');
  const file = hasCover ? 'cover' : 'og.png';
  const path = `/api/public/exams/${encodeURIComponent(slug)}/${file}`;
  if (api && !/localhost|127\.0\.0\.1/i.test(api)) return `${api}${path}`;
  return `${origin}${path}`;
}
