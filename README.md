# stickers.stluker.com

One AI-generated IT meme sticker per day, archived forever. Visitors browse, download, share, and +1. They can never trigger generation. A single daily cron does all of it.

## How it works

```
cron 50 11 * * * (6:50 AM CDT)
  -> planFor(date)        topic rotates daily over 10 buckets; style comes from a 17-day shuffled bag
                          (no repeats back-to-back, max 2 of any style in a week)
  -> Claude Haiku         writes the joke as style-specific JSON + an image "scene"
                          (it gets the last 40 headlines so it doesn't repeat itself)
  -> Workers AI FLUX.2    paints the picture only, no lettering (flux-2-dev, falls back to flux-1-schnell)
  -> SVG composer         sets all text in code + applies per-style filters for a consistent look
  -> R2 (stl-stickers)    svg/{date}.svg, svg/{date}-print.svg, art/{date}
  -> D1 (stickers-db)     stickers, votes, runs (heartbeat/audit)
```

**Seventeen styles** (a shuffled bag: each appears once per 17 days, in a new order every cycle, never twice in a row):
Retro Terminal, '95 Dialog, Laptop Die-Cut, Motivational Poster; 2026-trend styles Swiss Minimal, Y2K Chrome, Holographic,
Botanical Specimen, Kawaii Collectible, Scan-to-Reveal (QR -> `/s/<date>?reveal=1`, print 2 in+); and conference-sticker styles
Two-Panel Comic (setup / pun punchline), Pop Art (speech-bubble snowclone), Masterpiece Parody (public-domain paintings only); and
sticker-pack styles (2026-10-01) Hazard Sign (ANSI safety sign or road diamond with a black pictogram), Talking Object (an IT object
with a face says one line), Stacked Type (type only, no image-model call) and Vintage Badge (arc lettering, ribbon, screen-print art).
Dates before 2026-10-01 keep the 13-style bag (`STYLE_CUTOVER`), so regenerating an old day reproduces its published style.
About half of Laptop Die-Cut and Kawaii days use a warm retro palette (orange, cream, teal, mustard) in both frame and art.

**Humor engine:** weighted toward pun, snowclone and literalized jargon, with a quality bar of real conference stickers in the
system prompt ("3 to 8 words carry the whole joke") and tight per-style length limits. Since 2026-09-28 (from a review of a
commercial CS sticker pack) there are also format-fit devices that `deviceFor()` adds only to the styles they suit: code-syntax pun,
portmanteau job title, dialog parody (button is the punchline), hazard/road-sign parody, status-as-mood, object voice, and a
canon remix of classic IT sayings (about a quarter of open-format days). Ten topics, including Privacy & Compliance and Code & Debugging.
Well-known lines from both reference sets sit in `REFERENCE_JOKES`, so they are remixed, never copied.

### Why the image model never draws text
Image models still misspell words. The model draws only the scene, and every word on the sticker is set in SVG. The per-style art direction and SVG filters (green phosphor, 6-level posterize, saturation boost) make each day's art look like it belongs with the rest. If both image models fail, the sticker still publishes with a built-in fallback panel (for example `[ NO SIGNAL ]`), and `runs.detail` records why.

### Why Workers AI instead of Cloudinary
Workers AI runs in the same Worker through a binding: no extra account or API key, and no egress. At one image a day the cost is tiny. Cloudinary is still available as a CDN/transform layer later, but it isn't needed here.

## Deploy (Windows, from this folder)

```powershell
.\setup.ps1
```

The script is idempotent and does the following:
1. Refuses to run outside the project root, or if `public\.assetsignore` is missing (the stl-status/stl-intel lesson).
2. Creates or finds the `stickers-db` D1 database and writes its real id into `wrangler.jsonc`. It won't deploy while the placeholder is still there (the intel `REPLACE_WITH...` lesson).
3. Applies `schema.sql` and creates the `stl-stickers` R2 bucket.
4. Runs `wrangler deploy`, which attaches the `stickers.stluker.com` custom domain and the cron.
5. Prompts for `ANTHROPIC_API_KEY` and generates `STICKERS_SECRET` (saved to `.secret.local`, which is gitignored and never deployed).
6. Generates today's sticker so the site isn't empty.

Backfill a week so the archive has content on day one:
```powershell
'2026-09-19','2026-09-20','2026-09-21','2026-09-22','2026-09-23','2026-09-24' | % { .\generate.ps1 -Date $_ }
```

## Operations

| Task | How |
|---|---|
| Regenerate a day (keeps votes) | `.\generate.ps1 -Date 2026-09-25 -Force` |
| Hide a sticker (kill switch) | `POST /admin/hide/2026-09-25` with Bearer; `?unhide=1` restores |
| Health (public) | `GET /health` gives `{ok:true}` |
| Health (detail) | `GET /health` with Bearer gives last run, last success, `stale` flag (no sticker for today after 9 AM CT) |
| Logs | `npm run tail` |
| Local dev | copy `.dev.vars.example` to `.dev.vars`, then `npx wrangler dev` (MOCK_AI skips Haiku/FLUX) |

**Auth:** Bearer header only, constant-time compare, query-string secrets rejected. This is the same pattern as the other Workers.
**Votes:** one per visitor per sticker. The voter id is a truncated SHA-256 of IP + secret, and raw IPs are never stored. Cross-origin POSTs are rejected.
**Caching:** 404s are sent with `no-store`, so the edge never caches a "not found" (the music.stluker.com cached-404 lesson).

## Suggested stl-dispatcher follow-ups
- Add `stickers` to `trackedWorkers` and `50 11 * * *` to its declared crons, or `reconcile.js` will report it as `untracked_worker`.
- For monitoring, poll `GET /health` with Bearer and alert when `stale: true`. That covers the same gap as the six self-cronned podcast Workers, which have no heartbeat.
- If cron slots get tight, delete the `triggers` block here and have the dispatcher `POST /admin/generate` instead. The endpoint is idempotent.

## Cost (estimate, verify after week 1)
- Haiku: 1 call/day, about 2k tokens in and 400 out. That's cents per month.
- FLUX.2 [dev] on Workers AI: 1 image/day. Check the Workers AI usage page after the first week.
- D1 / R2 / Workers: well inside free-tier limits (about 0.5 MB of R2 per day).

## Files
```
wrangler.jsonc     Worker config (cron, D1, R2, AI, assets, custom domain)
schema.sql         D1 tables: stickers, votes, runs
src/worker.js      routes + scheduled()
src/generate.js    daily pipeline, prompts, topic/style rotation
src/styles.js      the seventeen SVG sticker templates + die-cut outlines
src/vendor/        qrcode-generator 2.0.4 (MIT), vendored so no extra npm install
src/text.js        ASCII sanitizing, wrapping, escaping
src/auth.js        Bearer auth
public/            gallery site (index.html, app.js, styles.css)
setup.ps1          one-time setup + deploy
generate.ps1       manual/backfill generation
```
