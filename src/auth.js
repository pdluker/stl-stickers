// Same pattern as the rest of stluker.com: Bearer header only, constant-time
// compare, query-string secrets explicitly rejected (they get edge-cached and
// show up in logs).

export function checkAuth(request, secret) {
  const url = new URL(request.url);
  if (url.searchParams.has('secret') || url.searchParams.has('key') || url.searchParams.has('token')) {
    return { ok: false, status: 400, error: 'secrets in the query string are not accepted; use Authorization: Bearer' };
  }
  if (!secret) return { ok: false, status: 503, error: 'STICKERS_SECRET not configured' };
  const header = request.headers.get('Authorization') || '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m || !timingSafeEqual(m[1].trim(), secret)) return { ok: false, status: 401, error: 'unauthorized' };
  return { ok: true };
}

function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i % (x.length || 1)] || 0) ^ (y[i % (y.length || 1)] || 0);
  return diff === 0;
}
