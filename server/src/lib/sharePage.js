function esc(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function examShareHtml({ title, description, pageUrl, imageUrl, examUrl }) {
  const t = esc(title || 'Quiz');
  const d = esc(description || '');
  const url = esc(pageUrl);
  const image = esc(imageUrl);
  const open = esc(examUrl || pageUrl);
  const redirect = examUrl && examUrl !== pageUrl;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${t}</title>
  <meta name="description" content="${d}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${t}" />
  <meta property="og:description" content="${d}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${image}" />
  <meta property="og:image:secure_url" content="${image}" />
  <meta property="og:image:type" content="image/jpeg" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="${t}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${t}" />
  <meta name="twitter:description" content="${d}" />
  <meta name="twitter:image" content="${image}" />
  ${redirect ? `<meta http-equiv="refresh" content="0;url=${open}" />` : ''}
</head>
<body style="font-family:sans-serif;background:#120c2a;color:#fff;padding:32px">
  <p>Opening your quiz: <a href="${open}" style="color:#ffd36a">${t}</a>…</p>
  ${redirect ? `<script>location.replace(${JSON.stringify(examUrl)});</script>` : ''}
</body>
</html>`;
}

export function requestOrigin(req) {
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http')
    .split(',')[0]
    .trim();
  const host = String(req.headers['x-forwarded-host'] || req.get?.('host') || req.headers.host || 'localhost')
    .split(',')[0]
    .trim();
  return `${proto}://${host}`;
}
