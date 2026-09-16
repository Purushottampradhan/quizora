export function nameKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function normalizeIp(raw) {
  let ip = String(raw || '').trim().toLowerCase();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (ip === '::1') return '127.0.0.1';
  return ip;
}

export function clientIp(req) {
  const candidates = [
    req.headers['cf-connecting-ip'],
    req.headers['true-client-ip'],
    req.headers['x-real-ip'],
    String(req.headers['x-forwarded-for'] || '').split(',')[0],
    req.ip,
    req.socket?.remoteAddress,
  ];
  for (const raw of candidates) {
    const ip = normalizeIp(raw);
    if (ip) return ip;
  }
  return '';
}
