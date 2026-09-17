const BASE = String(import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export async function api(path, { token, method = 'GET', body, isForm } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!isForm) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: isForm ? body : body != null ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export function examLink(slug) {
  const origin =
    BASE && !/localhost|127\.0\.0\.1/i.test(BASE) ? BASE : window.location.origin;
  return `${origin.replace(/\/$/, '')}/e/${slug}`;
}

export function mediaUrl(path, cacheKey) {
  if (!path) return '';
  const url = /^https?:\/\//i.test(path) ? path : `${BASE}${path}`;
  if (!cacheKey) return url;
  return `${url}${url.includes('?') ? '&' : '?'}v=${encodeURIComponent(cacheKey)}`;
}
