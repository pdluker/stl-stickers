// stickers.stluker.com -- one AI-generated IT meme sticker per day, archived forever.
//
// Public routes (read-only, plus voting):
//   GET  /api/stickers            archive list: ?topic= &style= &q= &sort=new|top &limit= &offset=
//   GET  /api/stickers/today      most recent published sticker
//   GET  /api/stickers/:date      one sticker (+ prev/next ids)
//   POST /api/stickers/:date/vote one +1 per visitor per sticker (hashed IP, no accounts)
//   GET  /api/stats               counts per topic/style
//   GET  /img/:date.svg           display SVG     (?download=1 to save)
//   GET  /img/:date-print.svg     print SVG with CutContour layer
//   GET  /img/:date.jpg           raw AI art (used as the og:image)
//   GET  /img/:date-thumb.svg     archive thumbnail: display SVG with every filter stripped (cheap to render on phones)
//   GET  /s/:date                 share page (index.html + Open Graph tags)
//   GET  /feed.xml                RSS, last 30 stickers
//   GET  /health                  {ok}; full detail with Bearer
// Admin (Bearer STICKERS_SECRET):
//   POST /admin/generate          ?date=YYYY-MM-DD &force=1   (first run, backfill, redo)
//   POST /admin/hide/:date        ?unhide=1                   moderation kill switch
//   POST /admin/compare           ?date= &models=lucid,flux2  A/B art for one joke, saves nothing
// Cron: once daily -> runDaily()

import { checkAuth } from './auth.js';
import { runDaily, compareArt, chicagoDate, planFor, modelChainFor, TOPICS, STYLES, STYLE_LABELS } from './generate.js';
import { esc } from './text.js';

const DATE = '(\\d{4}-\\d{2}-\\d{2})';

function json(data, status = 200, cache = 'no-store') {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache },
  });
}

function toItem(row, origin = '') {
  return {
    id: row.id,
    topic: row.topic,
    topicLabel: TOPICS[row.topic]?.label || row.topic,
    style: row.style,
    styleLabel: STYLE_LABELS[row.style] || row.style,
    headline: row.headline,
    altText: row.alt_text,
    tags: row.tags ? row.tags.split(',') : [],
    votes: row.votes,
    hasArt: !!row.has_art,
    svg: `${origin}/img/${row.id}.svg`,
    printSvg: `${origin}/img/${row.id}-print.svg`,
    thumb: `${origin}/img/${row.id}-thumb.svg`,
    share: `${origin}/s/${row.id}`,
  };
}

const LIST_COLS = 'id, topic, style, headline, alt_text, tags, votes, has_art';

async function listStickers(url, env) {
  const p = url.searchParams;
  const where = ["status = 'published'"];
  const args = [];
  const topic = p.get('topic');
  if (topic && TOPICS[topic]) { where.push('topic = ?'); args.push(topic); }
  const style = p.get('style');
  if (style && STYLES.includes(style)) { where.push('style = ?'); args.push(style); }
  const q = (p.get('q') || '').trim().slice(0, 60);
  if (q) {
    where.push("(headline LIKE ? ESCAPE '\\' OR tags LIKE ? ESCAPE '\\' OR copy_json LIKE ? ESCAPE '\\')");
    const like = `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
    args.push(like, like, like);
  }
  const order = p.get('sort') === 'top' ? 'votes DESC, id DESC' : 'id DESC';
  const limit = Math.min(48, Math.max(1, parseInt(p.get('limit') || '24', 10) || 24));
  const offset = Math.max(0, parseInt(p.get('offset') || '0', 10) || 0);
  const sql = `SELECT ${LIST_COLS} FROM stickers WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`;
  const { results } = await env.DB.prepare(sql).bind(...args, limit + 1, offset).all();
  const items = results.slice(0, limit).map((r) => toItem(r));
  return json({ items, nextOffset: results.length > limit ? offset + limit : null }, 200, 'public, max-age=60');
}

async function getOne(id, env) {
  const row = await env.DB.prepare(`SELECT ${LIST_COLS}, copy_json FROM stickers WHERE id = ? AND status = 'published'`).bind(id).first();
  if (!row) return null;
  const [prev, next] = await Promise.all([
    env.DB.prepare("SELECT id FROM stickers WHERE id < ? AND status = 'published' ORDER BY id DESC LIMIT 1").bind(id).first(),
    env.DB.prepare("SELECT id FROM stickers WHERE id > ? AND status = 'published' ORDER BY id ASC LIMIT 1").bind(id).first(),
  ]);
  return { ...toItem(row), copy: JSON.parse(row.copy_json || '{}'), prev: prev?.id || null, next: next?.id || null };
}

async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function vote(request, id, env) {
  const origin = request.headers.get('Origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) return json({ ok: false, error: 'bad origin' }, 403);
  const row = await env.DB.prepare("SELECT votes FROM stickers WHERE id = ? AND status = 'published'").bind(id).first();
  if (!row) return json({ ok: false, error: 'not found' }, 404);
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const voter = (await sha256Hex(`${ip}|${env.STICKERS_SECRET || 'stickers'}`)).slice(0, 32);
  const ins = await env.DB.prepare('INSERT OR IGNORE INTO votes (sticker_id, voter, created_at) VALUES (?,?,?)')
    .bind(id, voter, new Date().toISOString()).run();
  const counted = ins.meta.changes === 1;
  if (counted) await env.DB.prepare('UPDATE stickers SET votes = votes + 1 WHERE id = ?').bind(id).run();
  return json({ ok: true, counted, votes: row.votes + (counted ? 1 : 0) });
}

async function stats(env) {
  const [byTopic, byStyle, total] = await Promise.all([
    env.DB.prepare("SELECT topic AS k, COUNT(*) AS n FROM stickers WHERE status='published' GROUP BY topic").all(),
    env.DB.prepare("SELECT style AS k, COUNT(*) AS n FROM stickers WHERE status='published' GROUP BY style").all(),
    env.DB.prepare("SELECT COUNT(*) AS n, MIN(id) AS first, MAX(id) AS last FROM stickers WHERE status='published'").first(),
  ]);
  const toMap = (r) => Object.fromEntries(r.results.map((x) => [x.k, x.n]));
  return json({
    total: total?.n || 0, first: total?.first || null, last: total?.last || null,
    topics: Object.fromEntries(Object.entries(TOPICS).map(([k, v]) => [k, { label: v.label, count: toMap(byTopic)[k] || 0 }])),
    styles: Object.fromEntries(STYLES.map((k) => [k, { label: STYLE_LABELS[k], count: toMap(byStyle)[k] || 0 }])),
  }, 200, 'public, max-age=300');
}

// Archive grids show 20+ stickers at ~150px wide. Rendering each full SVG with
// its filters (phosphor tint, posterize, paper grain, drop shadow) at 2-3x
// device pixel ratio stalled mobile browsers (reported on Brave, Sep 26).
// The thumbnail is the same SVG with filter references removed (except cheap
// ones whose id starts with keep-, like the sign pictogram), cached
// at the edge. Detail views and downloads still use the full version.
const THUMB_VERSION = '2';
const THUMB_PX = 360;
async function serveThumb(id, url, env) {
  const cacheKey = new Request(`${url.origin}/img/${id}-thumb.svg?v=${THUMB_VERSION}`);
  const cache = caches.default;
  const hit = await cache.match(cacheKey);
  if (hit) return hit;
  const obj = await env.ART.get(`svg/${id}.svg`);
  if (!obj) return new Response('not found', { status: 404, headers: { 'cache-control': 'no-store' } });
  const svg = (await obj.text())
    .replace(/\s(?:filter|clip-path-filter)="url\(#(?!keep-)[^)]+\)"/g, '')
    .replace(/\sstyle="mix-blend-mode:[^"]*"/g, '')
    .replace(/<filter id="shadow"[\s\S]*?<\/filter>/, '')
    // Shrink the intrinsic size (viewBox unchanged, so it scales cleanly).
    // WebKit - which every iPhone browser, Brave included, must use -
    // rasterizes SVG <img>s at their intrinsic size x devicePixelRatio;
    // 1000px x3 = 36 MB per tile, which is what blanked the archive.
    .replace(/<svg([^>]*?)\swidth="(\d+)" height="(\d+)"/, (m, pre, w, h) => {
      const k = THUMB_PX / Math.max(+w, +h);
      return `<svg${pre} width="${Math.round(w * k)}" height="${Math.round(h * k)}"`;
    });
  const res = new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=86400',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'",
    },
  });
  await cache.put(cacheKey, res.clone());
  return res;
}

async function serveImg(id, kind, url, env) {
  const row = await env.DB.prepare("SELECT status FROM stickers WHERE id = ?").bind(id).first();
  if (!row || row.status !== 'published') return new Response('not found', { status: 404, headers: { 'cache-control': 'no-store' } });
  if (kind === 'thumb') return serveThumb(id, url, env);
  const key = kind === 'jpg' ? `art/${id}` : kind === 'print' ? `svg/${id}-print.svg` : `svg/${id}.svg`;
  const obj = await env.ART.get(key);
  if (!obj) return new Response('not found', { status: 404, headers: { 'cache-control': 'no-store' } });
  const headers = new Headers({
    'content-type': obj.httpMetadata?.contentType || 'application/octet-stream',
    'cache-control': 'public, max-age=3600, s-maxage=86400',
    etag: obj.httpEtag,
    'x-content-type-options': 'nosniff',
  });
  if (kind !== 'jpg') headers.set('content-security-policy', "default-src 'none'; img-src data:; style-src 'unsafe-inline'");
  if (url.searchParams.get('download') === '1') {
    const name = kind === 'print' ? `stluker-sticker-${id}-print.svg` : kind === 'jpg' ? `stluker-sticker-${id}-art.jpg` : `stluker-sticker-${id}.svg`;
    headers.set('content-disposition', `attachment; filename="${name}"`);
  }
  return new Response(obj.body, { headers });
}

async function sharePage(request, id, env) {
  const url = new URL(request.url);
  const s = await getOne(id, env);
  const shell = await env.ASSETS.fetch(new Request(new URL('/', url), { headers: request.headers }));
  if (!s) {
    return new Response(shell.body, { status: 404, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  }
  const title = `${s.headline} | stickers.stluker.com`;
  const desc = `IT sticker of the day for ${id} - ${s.topicLabel}. Download it free.`;
  const img = s.hasArt ? `${url.origin}/img/${id}.jpg` : `${url.origin}/og-default.png`;
  const meta = [
    ['name', 'description', desc], ['property', 'og:type', 'article'], ['property', 'og:title', s.headline],
    ['property', 'og:description', desc], ['property', 'og:image', img], ['property', 'og:url', `${url.origin}/s/${id}`],
    ['name', 'twitter:card', 'summary_large_image'], ['name', 'twitter:title', s.headline], ['name', 'twitter:image', img],
  ].map(([a, k, v]) => `<meta ${a}="${k}" content="${esc(v)}">`).join('');
  const out = new HTMLRewriter()
    .on('title', { element(e) { e.setInnerContent(title); } })
    .on('meta[name="description"]', { element(e) { e.remove(); } })
    .on('head', { element(e) { e.append(meta, { html: true }); } })
    .on('body', { element(e) { e.setAttribute('data-sticker', id); } })
    .transform(shell);
  const headers = new Headers(out.headers);
  headers.set('content-type', 'text/html; charset=utf-8');
  headers.set('cache-control', 'public, max-age=300');
  return new Response(out.body, { status: 200, headers });
}

async function feed(url, env) {
  const { results } = await env.DB.prepare(`SELECT ${LIST_COLS}, created_at FROM stickers WHERE status='published' ORDER BY id DESC LIMIT 30`).all();
  const o = url.origin;
  const items = results.map((r) => `<item><title>${esc(r.headline)}</title><link>${o}/s/${r.id}</link><guid isPermaLink="true">${o}/s/${r.id}</guid>` +
    `<pubDate>${new Date(r.created_at).toUTCString()}</pubDate><category>${esc(TOPICS[r.topic]?.label || r.topic)}</category>` +
    `<description>${esc(`<p>${r.headline}</p><img src="${o}/img/${r.id}.svg" alt="${r.alt_text || ''}" width="500">`)}</description></item>`).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>stickers.stluker.com</title><link>${o}/</link>` +
    `<description>One IT meme sticker a day.</description><language>en-us</language>${items}</channel></rss>`;
  return new Response(xml, { headers: { 'content-type': 'application/rss+xml; charset=utf-8', 'cache-control': 'public, max-age=900' } });
}

async function health(request, env) {
  const hasAuth = request.headers.has('Authorization');
  if (!hasAuth) return json({ ok: true });
  const a = checkAuth(request, env.STICKERS_SECRET);
  if (!a.ok) return json({ ok: false, error: a.error }, a.status);
  const [lastRun, lastOk, latest] = await Promise.all([
    env.DB.prepare('SELECT * FROM runs ORDER BY id DESC LIMIT 1').first(),
    env.DB.prepare('SELECT * FROM runs WHERE ok = 1 ORDER BY id DESC LIMIT 1').first(),
    env.DB.prepare('SELECT id, image_model FROM stickers ORDER BY id DESC LIMIT 1').first(),
  ]);
  const today = chicagoDate();
  const hourCT = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hour12: false }).format(new Date()));
  const stale = (!latest || latest.id < today) && hourCT >= 9;
  return json({ ok: !stale, today, latestSticker: latest, stale, lastRun, lastSuccess: lastOk });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;
    const method = request.method;
    let m;
    try {
      if (p === '/health') return health(request, env);

      if (p === '/api/stickers' && method === 'GET') return listStickers(url, env);
      if (p === '/api/stickers/today' && method === 'GET') {
        const row = await env.DB.prepare("SELECT id FROM stickers WHERE status='published' ORDER BY id DESC LIMIT 1").first();
        if (!row) return json({ ok: false, error: 'no stickers yet' }, 404);
        return json(await getOne(row.id, env), 200, 'public, max-age=120');
      }
      if ((m = p.match(new RegExp(`^/api/stickers/${DATE}$`))) && method === 'GET') {
        const s = await getOne(m[1], env);
        return s ? json(s, 200, 'public, max-age=120') : json({ ok: false, error: 'not found' }, 404);
      }
      if ((m = p.match(new RegExp(`^/api/stickers/${DATE}/vote$`))) && method === 'POST') return vote(request, m[1], env);
      if (p === '/api/stats') return stats(env);

      if ((m = p.match(new RegExp(`^/img/${DATE}(-print|-thumb)?\\.(svg|jpg)$`)))) {
        if (m[3] === 'jpg' && m[2]) return json({ ok: false, error: 'not found' }, 404);
        return serveImg(m[1], m[3] === 'jpg' ? 'jpg' : m[2] === '-print' ? 'print' : m[2] === '-thumb' ? 'thumb' : 'svg', url, env);
      }
      if ((m = p.match(new RegExp(`^/s/${DATE}/?$`)))) return sharePage(request, m[1], env);
      if (p === '/feed.xml') return feed(url, env);

      if (p === '/admin/generate' && method === 'POST') {
        const a = checkAuth(request, env.STICKERS_SECRET);
        if (!a.ok) return json({ ok: false, error: a.error }, a.status);
        const date = url.searchParams.get('date') || undefined;
        if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ ok: false, error: 'date must be YYYY-MM-DD' }, 400);
        const r = await runDaily(env, 'manual', { date, force: url.searchParams.get('force') === '1' });
        return json(r, r.ok ? 200 : 500);
      }
      if (p === '/admin/compare' && method === 'POST') {
        const a = checkAuth(request, env.STICKERS_SECRET);
        if (!a.ok) return json({ ok: false, error: a.error }, a.status);
        const date = url.searchParams.get('date') || chicagoDate();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ ok: false, error: 'date must be YYYY-MM-DD' }, 400);
        const models = (url.searchParams.get('models') || 'lucid,flux2').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 3);
        try {
          return json({ ok: true, defaultChain: modelChainFor(env, planFor(date).style), ...(await compareArt(env, date, models)) });
        } catch (e) {
          return json({ ok: false, error: String(e.message || e) }, 500);
        }
      }
      if ((m = p.match(new RegExp(`^/admin/hide/${DATE}$`))) && method === 'POST') {
        const a = checkAuth(request, env.STICKERS_SECRET);
        if (!a.ok) return json({ ok: false, error: a.error }, a.status);
        const status = url.searchParams.get('unhide') === '1' ? 'published' : 'hidden';
        const r = await env.DB.prepare('UPDATE stickers SET status = ? WHERE id = ?').bind(status, m[1]).run();
        return json({ ok: r.meta.changes === 1, id: m[1], status });
      }

      if (p.startsWith('/api/') || p.startsWith('/admin/') || p.startsWith('/img/')) return json({ ok: false, error: 'not found' }, 404);
      return env.ASSETS.fetch(request);
    } catch (e) {
      console.error('request failed', p, e && e.stack ? e.stack : e);
      return json({ ok: false, error: 'internal error' }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDaily(env, 'cron').then((r) => console.log('daily sticker', JSON.stringify(r))));
  },
};
