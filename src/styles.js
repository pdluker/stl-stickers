// Sticker templates (17 styles). Each renderer returns { w, h, outline, defs, body }.
// compose() wraps it into a full SVG in one of two variants:
//   display - white sticker border with a soft drop shadow (used on the site)
//   print   - no shadow, plus a <g id="CutContour"> layer holding the die-cut
//             line as a thin magenta (#EC008C) path, the convention most sticker
//             printers' RIP software looks for.
//
// AI art is embedded as a base64 data URI so every SVG is a single,
// self-contained file (no external fetches -- required for canvas PNG export
// and for print shops). Fonts are system stacks only: an SVG rendered as an
// <img> cannot load web fonts.

import { esc, wrap, clip } from './text.js';
import qrcode from './vendor/qrcode.mjs';

const FONT_MONO = "'Courier New', Consolas, 'DejaVu Sans Mono', 'Liberation Mono', monospace";
const FONT_WIN = "Tahoma, 'Segoe UI', Verdana, 'DejaVu Sans', Arial, sans-serif";
const FONT_IMPACT = "Impact, 'Arial Black', 'Anton', 'Haettenschweiler', 'DejaVu Sans', sans-serif";
const FONT_SERIF = "Georgia, 'Times New Roman', 'DejaVu Serif', 'Liberation Serif', serif";

export const DIECUT_PALETTE = ['#ff3ea5', '#ffd23f', '#3ee6ff', '#b6ff3b', '#ff7a2f', '#a78bfa'];

// Target pixel size for the image model, per style (multiples of 16).
export const ART_SIZE = {
  terminal: [1024, 592],
  win95: [1024, 512],
  diecut: [1024, 1024],
  poster: [1024, 880],
  minimal: [1024, 1024],
  y2k: [1024, 560],
  holo: [1024, 1024],
  botanical: [1024, 992],
  kawaii: [1024, 800],
  qr: [1024, 1024],
  comic: [1024, 1024],
  popart: [896, 1024],
  masterpiece: [832, 1024],
  sign: [1024, 1024],
  objectchar: [1024, 1024],
  typo: [1024, 1024],     // never used: typo has no art
  badge: [1024, 1024],
};

function rr(x, y, w, h, r) {
  return `M${x + r},${y}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${y + r}V${y + h - r}` +
    `A${r},${r} 0 0 1 ${x + w - r},${y + h}H${x + r}A${r},${r} 0 0 1 ${x},${y + h - r}` +
    `V${y + r}A${r},${r} 0 0 1 ${x + r},${y}Z`;
}

// Union of a circle and a horizontal band that sticks out past both sides of
// it, as a single closed path (a printer wants one cut line, not two
// overlapping shapes). Assumes the band sits below the circle's center.
function circleBandUnion(cx, cy, R, bx0, by0, bx1, by1) {
  const half = (y) => Math.sqrt(Math.max(0, R * R - (y - cy) * (y - cy)));
  const t = half(by0), b = half(by1);
  const f = (n) => n.toFixed(1);
  return `M${f(cx - t)},${by0}` +
    `A${R},${R} 0 1 1 ${f(cx + t)},${by0}` +     // over the top (large arc)
    `H${bx1}V${by1}H${f(cx + b)}` +
    `A${R},${R} 0 0 1 ${f(cx - b)},${by1}` +     // bottom sliver of the circle
    `H${bx0}V${by0}Z`;
}

function artImage(art, x, y, w, h, extra = '') {
  if (!art) return '';
  const par = /preserveAspectRatio=/.test(extra) ? '' : 'preserveAspectRatio="xMidYMid slice" ';
  return `<image x="${x}" y="${y}" width="${w}" height="${h}" ${par}` +
    `xlink:href="data:${art.mime};base64,${art.b64}" ${extra}/>`;
}

function textLines(lines, { x, y, lh, size, family, fill, anchor = 'start', weight = 'normal', extra = '' }) {
  return lines.map((l, i) =>
    `<text x="${x}" y="${y + i * lh}" font-family="${family}" font-size="${size}" font-weight="${weight}" ` +
    `fill="${fill}" text-anchor="${anchor}" ${extra}>${esc(l)}</text>`).join('');
}

// ---------------------------------------------------------------- terminal
function terminal(copy, art, meta) {
  const w = 1000, h = 1000;
  const defs = `
    <filter id="phosphor" color-interpolation-filters="sRGB">
      <feColorMatrix type="matrix" values="0.05 0.10 0.02 0 0  0.30 0.62 0.12 0 0.03  0.05 0.10 0.02 0 0  0 0 0 1 0"/>
      <feComponentTransfer><feFuncG type="gamma" amplitude="1.25" exponent="0.85" offset="0"/></feComponentTransfer>
    </filter>
    <pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="2" fill="#000" opacity="0.35"/></pattern>
    <radialGradient id="vig" cx="50%" cy="50%" r="70%"><stop offset="60%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.65"/></radialGradient>
    <clipPath id="screen"><path d="${rr(90, 140, 820, 470, 18)}"/></clipPath>`;

  const user = (copy.user || 'root').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 10) || 'root';
  const cmdLines = wrap(copy.command, 40, 2);
  const outLines = [];
  for (const o of copy.output) outLines.push(...wrap(o, 44, 3));
  const out = outLines.slice(0, Math.max(1, 4 - (cmdLines.length - 1)));

  let y = 666;
  let text = `<text x="90" y="${y}" font-family="${FONT_MONO}" font-size="24" fill="#4f8f4a">${esc(user)}@stluker:~/${esc(meta.topicKey)}</text>`;
  y += 44;
  cmdLines.forEach((l, i) => {
    text += `<text x="90" y="${y}" font-family="${FONT_MONO}" font-size="30" font-weight="bold" fill="#e9ffe2">` +
      `${i === 0 ? '<tspan fill="#39ff14">$ </tspan>' : '  '}${esc(l)}</text>`;
    y += 42;
  });
  out.forEach((l) => {
    text += `<text x="90" y="${y}" font-family="${FONT_MONO}" font-size="30" fill="#8dff7a">${esc(l)}</text>`;
    y += 42;
  });
  text += `<text x="90" y="${y}" font-family="${FONT_MONO}" font-size="30" font-weight="bold" fill="#39ff14">$ </text>` +
    `<rect x="126" y="${y - 26}" width="18" height="30" fill="#39ff14"/>`;

  const screen = art
    ? `<g clip-path="url(#screen)"><rect x="90" y="140" width="820" height="470" fill="#031003"/>` +
      artImage(art, 90, 140, 820, 470, 'filter="url(#phosphor)"') +
      `<rect x="90" y="140" width="820" height="470" fill="url(#scan)"/>` +
      `<rect x="90" y="140" width="820" height="470" fill="url(#vig)"/></g>`
    : `<rect x="90" y="140" width="820" height="470" rx="18" fill="#031003"/>` +
      `<text x="500" y="390" text-anchor="middle" font-family="${FONT_MONO}" font-size="46" fill="#39ff14">[ NO SIGNAL ]</text>`;

  const body = `
    <path d="${rr(40, 40, 920, 920, 46)}" fill="#0a0e0a"/>
    <path d="M86,40H914A46,46 0 0 1 960,86V104H40V86A46,46 0 0 1 86,40Z" fill="#132313"/>
    <circle cx="86" cy="72" r="10" fill="#2e6b2a"/><circle cx="120" cy="72" r="10" fill="#2e6b2a"/><circle cx="154" cy="72" r="10" fill="#39ff14"/>
    <text x="500" y="81" text-anchor="middle" font-family="${FONT_MONO}" font-size="24" fill="#6dff5a">${esc(clip(copy.title || 'tty1', 34))}</text>
    ${screen}
    <path d="${rr(90, 140, 820, 470, 18)}" fill="none" stroke="#39ff14" stroke-opacity="0.55" stroke-width="3"/>
    ${text}
    <text x="910" y="938" text-anchor="end" font-family="${FONT_MONO}" font-size="16" fill="#3d6e39">stickers.stluker.com // ${esc(meta.date)}</text>`;
  return { w, h, outline: rr(20, 20, 960, 960, 64), defs, body };
}

// ---------------------------------------------------------------- win95
function bevel(x, y, w, h, raised = true) {
  const [a, b, c, d] = raised ? ['#ffffff', '#dfdfdf', '#808080', '#0a0a0a'] : ['#808080', '#0a0a0a', '#dfdfdf', '#ffffff'];
  return `<path d="M${x},${y + h}V${y}H${x + w}" fill="none" stroke="${a}" stroke-width="3"/>` +
    `<path d="M${x + 3},${y + h - 3}V${y + 3}H${x + w - 3}" fill="none" stroke="${b}" stroke-width="3"/>` +
    `<path d="M${x + 3},${y + h - 3}H${x + w - 3}V${y + 3}" fill="none" stroke="${c}" stroke-width="3"/>` +
    `<path d="M${x},${y + h}H${x + w}V${y}" fill="none" stroke="${d}" stroke-width="3"/>`;
}

function winIcon(kind, x, y) {
  if (kind === 'warning') {
    return `<path d="M${x + 36},${y}L${x + 74},${y + 68}H${x - 2}Z" fill="#ffd400" stroke="#000" stroke-width="3" stroke-linejoin="round"/>` +
      `<rect x="${x + 32}" y="${y + 20}" width="8" height="28" fill="#000"/><rect x="${x + 32}" y="${y + 54}" width="8" height="8" fill="#000"/>`;
  }
  if (kind === 'info') {
    return `<circle cx="${x + 36}" cy="${y + 36}" r="34" fill="#1c5cd6" stroke="#000" stroke-width="3"/>` +
      `<rect x="${x + 31}" y="${y + 30}" width="10" height="26" fill="#fff"/><rect x="${x + 31}" y="${y + 15}" width="10" height="10" fill="#fff"/>`;
  }
  return `<circle cx="${x + 36}" cy="${y + 36}" r="34" fill="#e0201b" stroke="#000" stroke-width="3"/>` +
    `<path d="M${x + 22},${y + 22}L${x + 50},${y + 50}M${x + 50},${y + 22}L${x + 22},${y + 50}" stroke="#fff" stroke-width="8" stroke-linecap="round"/>`;
}

function win95(copy, art, meta) {
  const w = 1000, h = 1000;
  const defs = `
    <linearGradient id="tb" x1="0" x2="1"><stop offset="0" stop-color="#000080"/><stop offset="1" stop-color="#1084d0"/></linearGradient>
    <filter id="posterize" color-interpolation-filters="sRGB"><feComponentTransfer>
      <feFuncR type="discrete" tableValues="0 0.2 0.4 0.6 0.8 1"/><feFuncG type="discrete" tableValues="0 0.2 0.4 0.6 0.8 1"/><feFuncB type="discrete" tableValues="0 0.2 0.4 0.6 0.8 1"/>
    </feComponentTransfer></filter>
    <pattern id="dither" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="2" height="2" fill="#006b6b"/><rect x="2" y="2" width="2" height="2" fill="#006b6b"/></pattern>`;

  const msg = wrap(copy.message, 40, 3);
  const b = (copy.buttons || ['OK', 'Cancel']).slice(0, 2).map((s) => clip(s, 16));
  const bSize = (label) => Math.round(Math.max(17, Math.min(26, 186 / (label.length * 0.56))));
  const btn = (label, x, focus) =>
    `<rect x="${x}" y="800" width="210" height="58" fill="#c0c0c0"/>${bevel(x, 800, 210, 58, true)}` +
    (focus ? `<rect x="${x + 10}" y="810" width="190" height="38" fill="none" stroke="#000" stroke-width="2" stroke-dasharray="3 3"/>` : '') +
    `<text x="${x + 105}" y="838" text-anchor="middle" font-family="${FONT_WIN}" font-size="${bSize(label)}" fill="#000">${esc(label)}</text>`;
  const buttons = b.length === 1 ? btn(b[0], 395, true) : btn(b[0], 280, true) + btn(b[1], 510, false);

  const panel = art
    ? `<rect x="112" y="182" width="776" height="396" fill="#000"/>` + artImage(art, 115, 185, 770, 390, 'filter="url(#posterize)"')
    : `<rect x="112" y="182" width="776" height="396" fill="#ffffff"/>` +
      `<text x="500" y="392" text-anchor="middle" font-family="${FONT_WIN}" font-size="30" fill="#808080">image.bmp could not be displayed</text>`;

  const body = `
    <path d="${rr(40, 40, 920, 920, 38)}" fill="#008080"/>
    <path d="${rr(40, 40, 920, 920, 38)}" fill="url(#dither)" opacity="0.5"/>
    <rect x="80" y="96" width="840" height="800" fill="#c0c0c0"/>${bevel(80, 96, 840, 800, true)}
    <rect x="88" y="104" width="824" height="50" fill="url(#tb)"/>
    <text x="102" y="138" font-family="${FONT_WIN}" font-size="26" font-weight="bold" fill="#fff">${esc(clip(copy.window_title, 34))}</text>
    ${[0, 1, 2].map((i) => {
      const x = 790 + i * 40;
      const glyph = i === 0 ? `<rect x="${x + 9}" y="136" width="14" height="4" fill="#000"/>`
        : i === 1 ? `<rect x="${x + 8}" y="117" width="18" height="16" fill="none" stroke="#000" stroke-width="3"/>`
          : `<path d="M${x + 9},${118}L${x + 25},${134}M${x + 25},${118}L${x + 9},${134}" stroke="#000" stroke-width="4"/>`;
      return `<rect x="${x}" y="111" width="34" height="34" fill="#c0c0c0"/>${bevel(x, 111, 34, 34, true)}${glyph}`;
    }).join('')}
    ${bevel(109, 179, 782, 402, false)}${panel}
    ${winIcon(copy.icon, 120, 616)}
    ${textLines(msg, { x: 222, y: 646, lh: 40, size: 29, family: FONT_WIN, fill: '#000' })}
    ${buttons}
    <text x="500" y="936" text-anchor="middle" font-family="${FONT_WIN}" font-size="16" fill="#e8ffff" opacity="0.8">stickers.stluker.com - ${esc(meta.date)}</text>`;
  return { w, h, outline: rr(20, 20, 960, 960, 56), defs, body };
}

// ---------------------------------------------------------------- diecut
function diecut(copy, art, meta) {
  const w = 1000, h = 1000;
  const color = (meta.warm ? WARM_PALETTE : DIECUT_PALETTE)[meta.palette % 6];
  const cx = 500, cy = 470, artR = 262, arcR = 318;
  const a = (15 * Math.PI) / 180;                 // arc spans 150 degrees over the top
  const x1 = (cx - arcR * Math.cos(a)).toFixed(1), y1 = (cy - arcR * Math.sin(a)).toFixed(1);
  const x2 = (cx + arcR * Math.cos(a)).toFixed(1);
  const arcLen = arcR * ((150 * Math.PI) / 180);
  const fitLen = Math.round(arcLen * 0.92);
  const slogan = clip(copy.slogan, 24).toUpperCase();
  const sSize = Math.round(Math.max(38, Math.min(76, fitLen / (slogan.length * 0.62))));
  // Impact is narrow, fallback fonts are not: if a wide fallback could overflow
  // the arc, pin the rendered length so the slogan is never cut off.
  const sFit = slogan.length * 0.7 * sSize > fitLen ? ` textLength="${fitLen}" lengthAdjust="spacingAndGlyphs"` : '';
  const tagline = clip(copy.tagline, 30).toUpperCase();
  const tSize = Math.round(Math.max(30, Math.min(54, 800 / (tagline.length * 0.56))));

  const defs = `
    <path id="arc" d="M${x1},${y1}A${arcR},${arcR} 0 0 1 ${x2},${y1}"/>
    <clipPath id="artclip"><circle cx="${cx}" cy="${cy}" r="${artR}"/></clipPath>
    <filter id="pop" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="1.2"/></filter>
    <pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="11" cy="11" r="3" fill="#000" opacity="0.12"/></pattern>`;

  const center = art
    ? `<g clip-path="url(#artclip)"><rect x="${cx - artR}" y="${cy - artR}" width="${artR * 2}" height="${artR * 2}" fill="#fff"/>` +
      artImage(art, cx - artR, cy - artR, artR * 2, artR * 2, 'filter="url(#pop)"') + `</g>`
    : `<circle cx="${cx}" cy="${cy}" r="${artR}" fill="#fff"/>` +
      `<text x="${cx}" y="${cy + 40}" text-anchor="middle" font-family="${FONT_IMPACT}" font-size="140" fill="#111">:(</text>`;

  const spark = (x, y, s) => `<path d="M${x},${y - s}V${y + s}M${x - s},${y}H${x + s}" stroke="#111" stroke-width="8" stroke-linecap="round"/>`;

  const body = `
    <circle cx="500" cy="490" r="452" fill="${color}" stroke="#111" stroke-width="12"/>
    <circle cx="500" cy="490" r="440" fill="url(#dots)"/>
    ${spark(150, 300, 18)}${spark(862, 318, 14)}${spark(118, 600, 11)}${spark(885, 610, 20)}
    <circle cx="${cx}" cy="${cy}" r="${artR + 14}" fill="#111"/>
    <circle cx="${cx}" cy="${cy}" r="${artR + 8}" fill="#fff"/>
    ${center}
    <text font-family="${FONT_IMPACT}" font-size="${sSize}" font-weight="900" fill="#111" letter-spacing="1">
      <textPath xlink:href="#arc" href="#arc" startOffset="50%" text-anchor="middle"${sFit}>${esc(slogan)}</textPath>
    </text>
    <path d="M40,718H112V818H40L70,768Z" fill="#333"/>
    <path d="M960,718H888V818H960L930,768Z" fill="#333"/>
    <rect x="78" y="700" width="844" height="100" rx="10" fill="#111"/>
    <text x="500" y="${750 + tSize * 0.36}" text-anchor="middle" font-family="${FONT_IMPACT}" font-size="${tSize}" font-weight="900" fill="#fff" letter-spacing="1">${esc(tagline)}</text>
    <text x="500" y="872" text-anchor="middle" font-family="${FONT_MONO}" font-size="19" font-weight="bold" fill="#111" opacity="0.75">stickers.stluker.com</text>`;
  return { w, h, outline: circleBandUnion(500, 490, 478, 20, 680, 980, 838), defs, body };
}

// ---------------------------------------------------------------- poster
function poster(copy, art, meta) {
  const w = 800, h = 1000;
  const title = clip(copy.title, 12).toUpperCase().replace(/[^A-Z0-9 -]/g, '');
  const tSize = Math.round(Math.max(40, Math.min(84, 600 / (Math.max(1, title.length) * 0.86))));
  const cap = wrap(copy.caption, 42, 3);
  const defs = `<radialGradient id="pvig" cx="50%" cy="45%" r="75%"><stop offset="65%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.45"/></radialGradient>`;
  const photo = art
    ? artImage(art, 110, 96, 580, 500) + `<rect x="110" y="96" width="580" height="500" fill="url(#pvig)"/>`
    : `<rect x="110" y="96" width="580" height="500" fill="#1b1b1b"/><path d="M110,596L300,380L400,470L520,320L690,540V596Z" fill="#2a2a2a"/>` +
      `<text x="400" y="250" text-anchor="middle" font-family="${FONT_SERIF}" font-size="22" font-style="italic" fill="#555">photograph unavailable, much like leadership</text>`;
  const body = `
    <path d="${rr(36, 36, 728, 928, 20)}" fill="#050505"/>
    ${photo}
    <rect x="102" y="88" width="596" height="516" fill="none" stroke="#f4f4f4" stroke-width="3"/>
    <text x="400" y="${690 + tSize * 0.35}" text-anchor="middle" font-family="${FONT_SERIF}" font-size="${tSize}" fill="#fff" letter-spacing="${Math.round(tSize * 0.12)}">${esc(title)}</text>
    ${textLines(cap, { x: 400, y: 795, lh: 36, size: 26, family: FONT_SERIF, fill: '#d9d9d9', anchor: 'middle', extra: 'font-style="italic"' })}
    <text x="400" y="928" text-anchor="middle" font-family="${FONT_SERIF}" font-size="14" fill="#6b6b6b" letter-spacing="4">STICKERS.STLUKER.COM</text>`;
  return { w, h, outline: rr(20, 20, 760, 960, 34), defs, body };
}


// ======================================================================
// 2026 trend styles (added 2026-09-26)
// minimal - Swiss minimalist typography
// y2k     - retro Y2K chrome + vibrant candy colors
// holo    - holographic maximalism
// botanical - hand-drawn vintage specimen plate
// kawaii  - character-based collectible card
// qr      - interactive: the punchline is behind a QR code
// ======================================================================
const FONT_SWISS = "'Helvetica Neue', Helvetica, Arial, 'Liberation Sans', 'DejaVu Sans', sans-serif";
const FONT_ROUND = "'Trebuchet MS', 'Segoe UI', Verdana, 'DejaVu Sans', sans-serif";

// Rough glyph-width factors (fraction of font-size per char) for sizing text
// in system fonts. Deliberately generous so fallback fonts don't overflow.
function fitSize(text, width, factor, min, max) {
  return Math.round(Math.max(min, Math.min(max, width / (Math.max(1, text.length) * factor))));
}

function star4(cx, cy, r, fill, extra = '') {
  const k = r * 0.28;
  return `<path d="M${cx},${cy - r}Q${cx + k},${cy - k} ${cx + r},${cy}Q${cx + k},${cy + k} ${cx},${cy + r}Q${cx - k},${cy + k} ${cx - r},${cy}Q${cx - k},${cy - k} ${cx},${cy - r}Z" fill="${fill}" ${extra}/>`;
}

function star5(cx, cy, r, fill, stroke = 'none') {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 ? r * 0.45 : r;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(1)},${(cy + rad * Math.sin(a)).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="3" stroke-linejoin="round"/>`;
}

function burst(cx, cy, rOut, rIn, n) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? rIn : rOut;
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}

const pad3 = (n) => String(Math.max(1, n)).padStart(3, '0');

// ---------------------------------------------------------------- minimal
function minimal(copy, art, meta) {
  const w = 1000, h = 1000;
  const accent = ['#e63b2e', '#1f4bff', '#0a8f5b', '#ff6a00', '#111111', '#c21e56'][meta.palette % 6];
  const head = clip(copy.headline, 26);
  // Break into 2-3 short lines so the type can be huge (Swiss poster feel).
  const lines = wrap(head, Math.max(5, Math.ceil(head.length / (head.length > 14 ? 3 : 2)) + 1), 3);
  const longest = Math.max(...lines.map((l) => l.length));
  let size = fitSize('x'.repeat(longest), 800, 0.56, 80, 230);
  // Keep the first line's cap height clear of the accent circle (bottom ~336).
  while (size > 80 && 690 - (lines.length - 1) * Math.round(size * 0.9) - size * 0.74 < 350) size -= 6;
  const lh = Math.round(size * 0.9);
  const top = 690 - (lines.length - 1) * lh;
  const cap = wrap(copy.caption, 46, 2);
  const defs = `<clipPath id="mcirc"><circle cx="800" cy="210" r="118"/></clipPath>
    <pattern id="mgrid" width="40" height="40" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.6" fill="#000" opacity="0.08"/></pattern>`;
  const spot = art
    ? `<circle cx="800" cy="210" r="126" fill="${accent}"/><g clip-path="url(#mcirc)"><rect x="682" y="92" width="236" height="236" fill="#fff"/>${artImage(art, 682, 92, 236, 236)}</g>`
    : `<circle cx="800" cy="210" r="126" fill="${accent}"/>`;
  const body = `
    <path d="${rr(40, 40, 920, 920, 36)}" fill="#f4f1ea"/>
    <path d="${rr(40, 40, 920, 920, 36)}" fill="url(#mgrid)"/>
    <text x="96" y="132" font-family="${FONT_MONO}" font-size="22" fill="#111" letter-spacing="2">NO. ${pad3(meta.dayIndex + 1)}</text>
    <text x="96" y="162" font-family="${FONT_MONO}" font-size="18" fill="#777" letter-spacing="2">${esc(meta.topicLabel.toUpperCase())}</text>
    ${spot}
    ${textLines(lines, { x: 90, y: top, lh, size, family: FONT_SWISS, fill: '#111', weight: '900', extra: `letter-spacing="${-Math.round(size * 0.045)}"` })}
    <rect x="96" y="728" width="120" height="10" fill="${accent}"/>
    ${textLines(cap, { x: 96, y: 800, lh: 38, size: 30, family: FONT_SWISS, fill: '#333' })}
    <line x1="96" y1="880" x2="904" y2="880" stroke="#111" stroke-width="2"/>
    <text x="96" y="914" font-family="${FONT_MONO}" font-size="17" fill="#555" letter-spacing="2">STICKERS.STLUKER.COM</text>
    <text x="904" y="914" text-anchor="end" font-family="${FONT_MONO}" font-size="17" fill="#555" letter-spacing="2">${esc(meta.date)}</text>`;
  return { w, h, outline: rr(20, 20, 960, 960, 56), defs, body };
}

// ---------------------------------------------------------------- y2k
function y2k(copy, art, meta) {
  const w = 1000, h = 1000;
  const head = clip(copy.headline, 20).toUpperCase();
  const lines = wrap(head, 11, 2);
  const size = fitSize('x'.repeat(Math.max(...lines.map((l) => l.length))), 780, 0.74, 60, 112);
  const badge = clip(copy.badge || 'NEW!', 8).toUpperCase();
  const sub = clip(copy.sub, 40);
  const defs = `
    <linearGradient id="ybg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff3ec8"/><stop offset="0.5" stop-color="#7a5cff"/><stop offset="1" stop-color="#00e5ff"/></linearGradient>
    <linearGradient id="ychrome" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.45" stop-color="#d9e1ff"/><stop offset="0.52" stop-color="#7d86b8"/><stop offset="0.7" stop-color="#e9ecff"/><stop offset="1" stop-color="#ffffff"/></linearGradient>
    <linearGradient id="ygloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <linearGradient id="ybar" x1="0" x2="1"><stop offset="0" stop-color="#b6ff3b"/><stop offset="1" stop-color="#3effb0"/></linearGradient>
    <pattern id="ygrid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M50,0H0V50" fill="none" stroke="#fff" stroke-opacity="0.18" stroke-width="2"/></pattern>
    <clipPath id="ywin"><path d="${rr(150, 360, 700, 380, 60)}"/></clipPath>
    <filter id="ypop" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="1.25"/></filter>`;
  const win = art
    ? `<g clip-path="url(#ywin)"><rect x="150" y="360" width="700" height="380" fill="#fff"/>${artImage(art, 150, 360, 700, 380, 'filter="url(#ypop)"')}</g>`
    : `<path d="${rr(150, 360, 700, 380, 60)}" fill="#ffffff" opacity="0.6"/>`;
  const headTop = lines.length === 1 ? 250 : 200 - Math.round((112 - size) / 3);
  const body = `
    <path d="${rr(40, 40, 920, 920, 110)}" fill="url(#ybg)"/>
    <path d="${rr(40, 40, 920, 920, 110)}" fill="url(#ygrid)"/>
    ${star4(96, 330, 30, '#fff')}${star4(904, 330, 26, '#fff')}${star4(110, 800, 22, '#b6ff3b')}${star4(890, 860, 30, '#fff')}${star4(820, 120, 16, '#b6ff3b')}
    ${textLines(lines, { x: 500, y: headTop, lh: Math.round(size * 0.95), size, family: FONT_IMPACT, fill: 'url(#ychrome)', anchor: 'middle', weight: '900', extra: `stroke="#1a0b3a" stroke-width="${Math.round(size * 0.11)}" paint-order="stroke" stroke-linejoin="round" font-style="italic"` })}
    <path d="${rr(142, 352, 716, 396, 66)}" fill="none" stroke="#1a0b3a" stroke-width="10"/>
    ${win}
    <path d="${rr(170, 372, 660, 110, 50)}" fill="url(#ygloss)"/>
    <path d="${rr(150, 360, 700, 380, 60)}" fill="none" stroke="#fff" stroke-width="6"/>
    <path d="${rr(150, 790, 700, 74, 37)}" fill="#1a0b3a"/>
    <path d="${rr(158, 798, Math.round(684 * 0.72), 58, 29)}" fill="url(#ybar)"/>
    <text x="500" y="838" text-anchor="middle" font-family="${FONT_ROUND}" font-size="${fitSize(sub, 640, 0.52, 20, 30)}" font-weight="bold" fill="#fff" stroke="#1a0b3a" stroke-width="5" paint-order="stroke">${esc(sub)}</text>
    <polygon points="${burst(820, 700, 92, 70, 14)}" fill="#ffe600" stroke="#1a0b3a" stroke-width="6" stroke-linejoin="round" transform="rotate(12 820 700)"/>
    <text x="820" y="${700 + fitSize(badge, 120, 0.62, 22, 40) * 0.35}" text-anchor="middle" font-family="${FONT_IMPACT}" font-size="${fitSize(badge, 120, 0.62, 22, 40)}" font-weight="900" fill="#ff1f8e" transform="rotate(12 820 700)">${esc(badge)}</text>
    <text x="500" y="928" text-anchor="middle" font-family="${FONT_ROUND}" font-size="18" font-weight="bold" fill="#fff" opacity="0.85">stickers.stluker.com  *  ${esc(meta.date)}</text>`;
  return { w, h, outline: rr(20, 20, 960, 960, 130), defs, body };
}

// ---------------------------------------------------------------- holo
function holo(copy, art, meta) {
  const w = 1000, h = 1000;
  const head = clip(copy.headline, 16).toUpperCase();
  const size = fitSize(head, 800, 0.7, 52, 104);
  const foot = clip(copy.footnote, 52);
  const tag = clip(copy.tag || 'LTD ED', 10).toUpperCase();
  const defs = `
    <linearGradient id="hfoil" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffb3e6"/><stop offset="0.18" stop-color="#b8c6ff"/><stop offset="0.36" stop-color="#9ff5ff"/>
      <stop offset="0.54" stop-color="#c8ffb8"/><stop offset="0.72" stop-color="#fff3a6"/><stop offset="0.9" stop-color="#ffc0a8"/><stop offset="1" stop-color="#e0b3ff"/>
    </linearGradient>
    <radialGradient id="hglow" cx="0.3" cy="0.25" r="0.8"><stop offset="0" stop-color="#fff" stop-opacity="0.7"/><stop offset="0.6" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <linearGradient id="hring" x1="0" x2="1"><stop offset="0" stop-color="#ff5ec4"/><stop offset="0.25" stop-color="#ffd84d"/><stop offset="0.5" stop-color="#4dffb8"/><stop offset="0.75" stop-color="#4dc3ff"/><stop offset="1" stop-color="#b44dff"/></linearGradient>
    <pattern id="hdots" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="7" cy="7" r="2.2" fill="#fff" opacity="0.35"/></pattern>
    <clipPath id="hclip"><circle cx="500" cy="520" r="230"/></clipPath>
    <clipPath id="hbody"><path d="${rr(40, 40, 920, 920, 90)}"/></clipPath>
    <filter id="hshift" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="1.3"/><feComponentTransfer><feFuncA type="linear" slope="1"/></feComponentTransfer></filter>`;
  const center = art
    ? `<g clip-path="url(#hclip)"><rect x="270" y="290" width="460" height="460" fill="#fff"/>${artImage(art, 270, 290, 460, 460, 'filter="url(#hshift)"')}<rect x="270" y="290" width="460" height="460" fill="url(#hfoil)" opacity="0.18"/></g>`
    : `<circle cx="500" cy="520" r="230" fill="url(#hfoil)"/>`;
  const ty = 200;
  const echoes = [3, 2, 1].map((i) =>
    `<text x="${500 + i * 7}" y="${ty + i * 7}" text-anchor="middle" font-family="${FONT_IMPACT}" font-size="${size}" font-weight="900" fill="none" stroke="#2a1b5c" stroke-width="2.5" opacity="${(0.55 - i * 0.12).toFixed(2)}" letter-spacing="2">${esc(head)}</text>`).join('');
  const body = `
    <path d="${rr(40, 40, 920, 920, 90)}" fill="url(#hfoil)"/>
    <g clip-path="url(#hbody)">
      <rect x="40" y="40" width="920" height="920" fill="url(#hdots)"/>
      <polygon points="40,340 460,40 560,40 40,420" fill="#fff" opacity="0.35"/>
      <polygon points="340,960 960,380 960,470 460,960" fill="#fff" opacity="0.28"/>
      <rect x="40" y="40" width="920" height="920" fill="url(#hglow)"/>
    </g>
    ${echoes}
    <text x="500" y="${ty}" text-anchor="middle" font-family="${FONT_IMPACT}" font-size="${size}" font-weight="900" fill="#2a1b5c" letter-spacing="2" stroke="#fff" stroke-width="${Math.round(size * 0.08)}" paint-order="stroke">${esc(head)}</text>
    <circle cx="500" cy="520" r="252" fill="none" stroke="url(#hring)" stroke-width="18"/>
    <circle cx="500" cy="520" r="240" fill="#fff"/>
    ${center}
    ${star4(200, 390, 40, '#fff')}${star4(820, 420, 30, '#fff')}${star4(170, 700, 24, '#fff')}${star4(840, 720, 46, '#fff')}${star4(180, 300, 18, '#2a1b5c', 'opacity="0.7"')}${star4(240, 820, 16, '#2a1b5c', 'opacity="0.7"')}
    <g transform="rotate(14 830 300)"><path d="${rr(745, 272, 170, 56, 28)}" fill="#2a1b5c"/><text x="830" y="309" text-anchor="middle" font-family="${FONT_MONO}" font-size="24" font-weight="bold" fill="#fff">${esc(tag)}</text></g>
    <path d="${rr(150, 806, 700, 64, 32)}" fill="#fff" opacity="0.85"/>
    <text x="500" y="847" text-anchor="middle" font-family="${FONT_MONO}" font-size="${fitSize(foot, 640, 0.6, 18, 28)}" font-weight="bold" fill="#2a1b5c">${esc(foot)}</text>
    <text x="500" y="922" text-anchor="middle" font-family="${FONT_MONO}" font-size="16" fill="#2a1b5c" opacity="0.7">stickers.stluker.com // ${esc(meta.date)} // print on holo vinyl</text>`;
  return { w, h, outline: rr(20, 20, 960, 960, 110), defs, body };
}

// ---------------------------------------------------------------- botanical
const ROMAN = [['M', 1000], ['CM', 900], ['D', 500], ['CD', 400], ['C', 100], ['XC', 90], ['L', 50], ['XL', 40], ['X', 10], ['IX', 9], ['V', 5], ['IV', 4], ['I', 1]];
function roman(n) { let s = ''; for (const [r, v] of ROMAN) while (n >= v) { s += r; n -= v; } return s || 'I'; }

function sprig(x, y, flip) {
  const s = flip ? -1 : 1;
  const leaf = (dx, dy, rot) => `<ellipse cx="${x + s * dx}" cy="${y + dy}" rx="16" ry="6" fill="none" stroke="#6b4f2a" stroke-width="1.6" transform="rotate(${s * rot} ${x + s * dx} ${y + dy})"/>`;
  return `<path d="M${x},${y + 60}C${x + s * 10},${y + 30} ${x + s * 26},${y + 10} ${x + s * 56},${y}" fill="none" stroke="#6b4f2a" stroke-width="1.8"/>` +
    leaf(18, 34, -50) + leaf(34, 16, -30) + leaf(10, 50, -70) + leaf(46, 4, -15);
}

function botanical(copy, art, meta) {
  const w = 800, h = 1000;
  const latin = clip(copy.latin, 34);
  const common = clip(copy.common, 30).toUpperCase();
  const note = wrap(copy.note, 46, 3);
  const plate = roman((meta.dayIndex % 300) + 1);
  const defs = `
    <filter id="paper" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 0.42  0 0 0 0 0.31  0 0 0 0 0.16  0 0 0 0.08 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
    <filter id="sepia" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0.39 0.77 0.19 0 0  0.35 0.69 0.17 0 0  0.27 0.53 0.13 0 0  0 0 0 1 0"/><feComponentTransfer><feFuncR type="linear" slope="1.05" intercept="0.04"/><feFuncG type="linear" slope="1.02" intercept="0.03"/></feComponentTransfer></filter>
    <radialGradient id="pvig2" cx="0.5" cy="0.5" r="0.7"><stop offset="0.7" stop-color="#6b4f2a" stop-opacity="0"/><stop offset="1" stop-color="#6b4f2a" stop-opacity="0.22"/></radialGradient>`;
  const specimen = art
    ? `<rect x="130" y="170" width="540" height="520" fill="#f3ead3"/>${artImage(art, 130, 170, 540, 520, 'filter="url(#sepia)" style="mix-blend-mode:multiply"')}`
    : `<text x="400" y="440" text-anchor="middle" font-family="${FONT_SERIF}" font-style="italic" font-size="26" fill="#8a6b3f">specimen missing (probably reassigned)</text>`;
  const body = `
    <path d="${rr(36, 36, 728, 928, 18)}" fill="#f3ead3"/>
    <path d="${rr(36, 36, 728, 928, 18)}" fill="#f3ead3" filter="url(#paper)"/>
    <path d="${rr(36, 36, 728, 928, 18)}" fill="url(#pvig2)"/>
    <rect x="70" y="70" width="660" height="860" fill="none" stroke="#6b4f2a" stroke-width="3"/>
    <rect x="80" y="80" width="640" height="840" fill="none" stroke="#6b4f2a" stroke-width="1"/>
    <text x="400" y="128" text-anchor="middle" font-family="${FONT_SERIF}" font-size="22" letter-spacing="6" fill="#6b4f2a">PLATE ${plate}</text>
    <line x1="300" y1="142" x2="500" y2="142" stroke="#6b4f2a" stroke-width="1"/>
    ${specimen}
    ${sprig(100, 830, false)}${sprig(700, 830, true)}
    <text x="400" y="742" text-anchor="middle" font-family="${FONT_SERIF}" font-style="italic" font-size="${fitSize(latin, 580, 0.46, 26, 44)}" fill="#3b2a14">${esc(latin)}</text>
    <text x="400" y="782" text-anchor="middle" font-family="${FONT_SERIF}" font-size="${fitSize(common, 560, 0.62, 16, 22)}" letter-spacing="4" fill="#6b4f2a">${esc(common)}</text>
    ${textLines(note, { x: 400, y: 826, lh: 28, size: 21, family: FONT_SERIF, fill: '#4a3620', anchor: 'middle', extra: 'font-style="italic"' })}
    <text x="400" y="912" text-anchor="middle" font-family="${FONT_SERIF}" font-size="13" letter-spacing="3" fill="#8a6b3f">HERBARIUM OF INFORMATION TECHNOLOGY  -  STICKERS.STLUKER.COM</text>`;
  return { w, h, outline: rr(18, 18, 764, 964, 30), defs, body };
}

// ---------------------------------------------------------------- kawaii
function kawaii(copy, art, meta) {
  const w = 760, h = 1000;
  const pal = [
    ['#ffd6e8', '#ff7eb6', '#7a2e55'], ['#d6f0ff', '#5cc2ff', '#1e4d73'], ['#e6ffd6', '#7bd45a', '#2f5a1e'],
    ['#fff1c9', '#ffbf3c', '#6b4a0a'], ['#eadcff', '#a47bff', '#43287a'], ['#ffe0d1', '#ff8a5c', '#6e2f16'],
  ][meta.palette % 6];
  // Warm retro variant (phase 2, 2026-09-28): cream card, orange/teal/mustard frame.
  const warm = [
    ['#fdf0d5', '#f28c28', '#5a2e0e'], ['#fdf0d5', '#2a9d8f', '#123f3a'], ['#fff3d6', '#d9a93a', '#5c4611'],
    ['#fde8df', '#e76f51', '#5e2517'], ['#fdf0d5', '#f4a261', '#5a3514'], ['#eef5e6', '#8ab17d', '#2f4424'],
  ][meta.palette % 6];
  const [bg, mid, ink] = meta.warm ? warm : pal;
  const name = clip(copy.name, 18);
  const type = clip(copy.type, 12).toUpperCase();
  const rarity = Math.max(1, Math.min(5, Number(copy.rarity) || 3));
  const abil = clip(copy.ability_name, 22);
  const text = wrap(copy.ability, 38, 3);
  const defs = `
    <linearGradient id="kbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="#ffffff"/></linearGradient>
    <radialGradient id="kwin" cx="0.5" cy="0.45" r="0.7"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="${bg}"/></radialGradient>
    <clipPath id="kclip"><path d="${rr(80, 170, 600, 470, 40)}"/></clipPath>
    <pattern id="kdots" width="26" height="26" patternUnits="userSpaceOnUse"><circle cx="13" cy="13" r="3" fill="${mid}" opacity="0.25"/></pattern>`;
  const win = art
    ? `<g clip-path="url(#kclip)"><rect x="80" y="170" width="600" height="470" fill="url(#kwin)"/>${artImage(art, 80, 170, 600, 470)}</g>`
    : `<path d="${rr(80, 170, 600, 470, 40)}" fill="url(#kwin)"/><text x="380" y="430" text-anchor="middle" font-family="${FONT_ROUND}" font-size="90" fill="${ink}">(^_^)</text>`;
  const stars = Array.from({ length: 5 }, (_, i) => star5(460 + i * 44, 118, 17, i < rarity ? '#ffcf33' : '#ffffff', ink)).join('');
  const body = `
    <path d="${rr(36, 36, 688, 928, 44)}" fill="url(#kbg)"/>
    <path d="${rr(36, 36, 688, 928, 44)}" fill="url(#kdots)"/>
    <path d="${rr(56, 56, 648, 888, 32)}" fill="none" stroke="${mid}" stroke-width="8"/>
    <text x="84" y="120" font-family="${FONT_ROUND}" font-size="${fitSize(name, 340, 0.58, 30, 50)}" font-weight="bold" fill="${ink}">${esc(name)}</text>
    ${stars}
    <path d="${rr(76, 166, 608, 478, 44)}" fill="${mid}"/>
    ${win}
    <path d="${rr(80, 170, 600, 470, 40)}" fill="none" stroke="#fff" stroke-width="6"/>
    ${star4(130, 220, 22, '#fff')}${star4(640, 590, 18, '#fff')}${star4(620, 230, 12, '#fff')}
    <path d="${rr(84, 668, 170, 46, 23)}" fill="${ink}"/>
    <text x="169" y="699" text-anchor="middle" font-family="${FONT_ROUND}" font-size="${fitSize(type, 150, 0.62, 16, 22)}" font-weight="bold" fill="#fff" letter-spacing="1">${esc(type)}</text>
    <text x="676" y="700" text-anchor="end" font-family="${FONT_MONO}" font-size="20" font-weight="bold" fill="${ink}">SERIES 1 - No.${pad3(meta.dayIndex + 1)}</text>
    <path d="${rr(84, 732, 592, 170, 26)}" fill="#ffffff" stroke="${mid}" stroke-width="4"/>
    <text x="108" y="774" font-family="${FONT_ROUND}" font-size="26" font-weight="bold" fill="${ink}">${esc(abil)}</text>
    ${textLines(text, { x: 108, y: 812, lh: 30, size: 23, family: FONT_ROUND, fill: '#333' })}
    <text x="380" y="934" text-anchor="middle" font-family="${FONT_ROUND}" font-size="16" fill="${ink}" opacity="0.7">collect them all at stickers.stluker.com</text>`;
  return { w, h, outline: rr(18, 18, 724, 964, 58), defs, body };
}

// ---------------------------------------------------------------- qr
function qrPath(text, x, y, size) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  const n = q.getModuleCount();
  const quiet = 4;
  const cell = size / (n + quiet * 2);
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (q.isDark(r, c)) {
        const px = x + (c + quiet) * cell, py = y + (r + quiet) * cell;
        d += `M${px.toFixed(2)},${py.toFixed(2)}h${cell.toFixed(2)}v${cell.toFixed(2)}h-${cell.toFixed(2)}z`;
      }
    }
  }
  return `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000" shape-rendering="crispEdges"/>`;
}

function qr(copy, art, meta) {
  const w = 1000, h = 1000;
  const teaser = wrap(copy.teaser, 22, 3);
  const tSize = fitSize('x'.repeat(Math.max(...teaser.map((l) => l.length))), 840, 0.58, 44, 76);
  const url = `${meta.siteUrl || 'https://stickers.stluker.com'}/s/${meta.date}?reveal=1`;
  const defs = `<clipPath id="qbody"><path d="${rr(40, 40, 920, 920, 48)}"/></clipPath><clipPath id="qart"><path d="${rr(90, 430, 410, 410, 36)}"/></clipPath>
    <pattern id="qstripe" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="20" height="40" fill="#111"/></pattern>`;
  const pic = art
    ? `<g clip-path="url(#qart)"><rect x="90" y="430" width="410" height="410" fill="#fff"/>${artImage(art, 90, 430, 410, 410)}</g>`
    : `<path d="${rr(90, 430, 410, 410, 36)}" fill="#ffd400"/><text x="295" y="680" text-anchor="middle" font-family="${FONT_IMPACT}" font-size="200" fill="#1d3bff">?</text>`;
  const body = `
    <path d="${rr(40, 40, 920, 920, 48)}" fill="#1d3bff"/>
    <g clip-path="url(#qbody)"><rect x="40" y="40" width="920" height="46" fill="#ffd400"/><rect x="40" y="40" width="920" height="46" fill="url(#qstripe)"/></g>
    ${textLines(teaser, { x: 90, y: 160 + tSize * 0.7, lh: Math.round(tSize * 1.08), size: tSize, family: FONT_IMPACT, fill: '#fff', weight: '900' })}
    ${pic}
    <path d="${rr(90, 430, 410, 410, 36)}" fill="none" stroke="#fff" stroke-width="6"/>
    <path d="${rr(526, 426, 388, 388, 28)}" fill="#fff"/>
    ${qrPath(url, 540, 440, 360)}
    <path d="${rr(526, 832, 388, 72, 36)}" fill="#ffd400"/>
    <text x="720" y="879" text-anchor="middle" font-family="${FONT_IMPACT}" font-size="28" font-weight="900" fill="#111" textLength="340" lengthAdjust="spacingAndGlyphs">SCAN FOR THE PUNCHLINE</text>
    <text x="90" y="892" font-family="${FONT_MONO}" font-size="17" fill="#c9d3ff">stickers.stluker.com // ${esc(meta.date)}</text>`;
  return { w, h, outline: rr(20, 20, 960, 960, 64), defs, body };
}


// ======================================================================
// Conference-sticker styles (added 2026-09-26, from a review of real
// privacy/security conference stickers): two-panel pun comic, pop-art
// speech bubble, public-domain masterpiece parody. Shared motif: a torn
// paper strip near the bottom and a small wordmark in the corner.
// ======================================================================
const FONT_HAND = "'Comic Neue', 'Comic Sans MS', 'Chalkboard SE', 'Marker Felt', 'Trebuchet MS', 'DejaVu Sans', sans-serif";
const FONT_FUTURA = "Futura, 'Century Gothic', 'Avenir Next', 'Trebuchet MS', 'DejaVu Sans', sans-serif";
const FONT_HUMANIST = "'Gill Sans', 'Segoe UI', 'Lato', 'Helvetica Neue', Arial, 'DejaVu Sans', sans-serif";

// Irregular torn-paper band, deterministic per seed.
function tornStrip(x0, x1, y, h, fill, seed = 1, opacity = 0.9) {
  const rnd = (i) => { const v = Math.sin(seed * 999 + i * 12.9898) * 43758.5453; return v - Math.floor(v); };
  const n = 26, step = (x1 - x0) / n;
  let top = `M${x0},${y + (rnd(0) - 0.5) * 10}`;
  for (let i = 1; i <= n; i++) top += `L${(x0 + i * step).toFixed(1)},${(y + (rnd(i) - 0.5) * 12).toFixed(1)}`;
  let bot = '';
  for (let i = n; i >= 0; i--) bot += `L${(x0 + i * step).toFixed(1)},${(y + h + (rnd(i + 50) - 0.5) * 12).toFixed(1)}`;
  return `<path d="${top}${bot}Z" fill="${fill}" opacity="${opacity}"/>`;
}

// ---------------------------------------------------------------- comic
function comic(copy, art, meta) {
  const w = 1000, h = 1000;
  const frame = ['#6cd93b', '#ffcf33', '#ff6b9e', '#4dc3ff', '#ff8a3d', '#b28bff'][meta.palette % 6];
  const setup = wrap(copy.setup.toUpperCase(), 13, 4);
  const punch = wrap(copy.punchline.toUpperCase(), 13, 3);
  // Left panel narrows to ~390px of usable width; size so the longest line fits.
  const sSize = fitSize('x'.repeat(Math.max(...setup.map((l) => l.length))), 350, 0.68, 30, 46);
  const pSize = fitSize('x'.repeat(Math.max(...punch.map((l) => l.length))), 310, 0.68, 30, 48);
  const L = 'M70,70 L500,70 L560,930 L70,930 Z';
  const R = 'M520,70 L930,70 L930,930 L580,930 Z';
  const defs = `
    <clipPath id="cL"><path d="${L}"/></clipPath>
    <clipPath id="cR"><path d="${R}"/></clipPath>
    <filter id="ink" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer><feFuncR type="linear" slope="1.8" intercept="-0.45"/><feFuncG type="linear" slope="1.8" intercept="-0.45"/><feFuncB type="linear" slope="1.8" intercept="-0.45"/></feComponentTransfer></filter>`;
  const hero = art
    ? `<g clip-path="url(#cL)">${artImage(art, 50, 300, 540, 540, 'filter="url(#ink)"')}</g>`
    : `<g clip-path="url(#cL)"><circle cx="300" cy="620" r="120" fill="#111"/><circle cx="300" cy="560" r="70" fill="#fff" stroke="#111" stroke-width="10"/></g>`;
  // Panel 2: a close-up of the same character reacting (the classic comic
  // "zoom" beat). Works whatever pose the image model chose.
  const exit = art
    ? `<g clip-path="url(#cR)">${artImage(art, 290, 170, 900, 900, 'filter="url(#ink)"')}</g>`
    : '';
  const speed = '';
  const body = `
    <path d="${rr(40, 40, 920, 920, 26)}" fill="${frame}"/>
    <path d="${L}" fill="#fff" stroke="#111" stroke-width="6" stroke-linejoin="round"/>
    <path d="${R}" fill="#fff" stroke="#111" stroke-width="6" stroke-linejoin="round"/>
    ${hero}
    ${textLines(setup, { x: 110, y: 150, lh: Math.round(sSize * 1.15), size: sSize, family: FONT_HAND, fill: '#111', weight: 'bold' })}
    ${exit}${speed}
    ${textLines(punch, { x: 600, y: 190, lh: Math.round(pSize * 1.15), size: pSize, family: FONT_HAND, fill: '#111', weight: 'bold' })}
    <text x="900" y="905" text-anchor="end" font-family="${FONT_HUMANIST}" font-size="22" font-weight="bold" fill="${frame}" stroke="#111" stroke-width="0.6">stickers.stluker.com</text>`;
  return { w, h, outline: rr(20, 20, 960, 960, 44), defs, body };
}

// ---------------------------------------------------------------- popart
function cloudBubble(cx, cy, rx, ry) {
  const circles = [];
  const n = 11;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    circles.push([cx + Math.cos(a) * rx * 0.78, cy + Math.sin(a) * ry * 0.72, (i % 2 ? 0.34 : 0.4) * Math.min(rx, ry) * 1.05]);
  }
  circles.push([cx, cy, Math.min(rx, ry) * 0.8], [cx - rx * 0.35, cy, ry * 0.7], [cx + rx * 0.35, cy, ry * 0.7]);
  return circles;
}

function popart(copy, art, meta) {
  const w = 1000, h = 1000;
  const bg = '#1fa0e8';
  const dot = ['#c2187a', '#e0301e', '#7a1fae'][meta.palette % 3];
  const lines = wrap(copy.bubble.toUpperCase(), 14, 3);
  const size = fitSize('x'.repeat(Math.max(...lines.map((l) => l.length))), 390, 0.66, 30, 50);
  const bx = 700, by = 290, rx = 250, ry = 170;
  const cs = cloudBubble(bx, by, rx, ry);
  const tail = `M${bx - 150},${by + 120} L${bx - 260},${by + 250} L${bx - 60},${by + 150} Z`;
  const defs = `
    <pattern id="bday" width="46" height="46" patternUnits="userSpaceOnUse"><circle cx="23" cy="23" r="12" fill="${dot}"/></pattern>
    <pattern id="half" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="5" cy="5" r="1.6" fill="#000" opacity="0.18"/></pattern>
    <linearGradient id="dfade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="0.55" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <mask id="dmask"><rect x="0" y="0" width="1000" height="1000" fill="url(#dfade)"/></mask>
    <clipPath id="pclip"><path d="${rr(40, 40, 920, 920, 30)}"/></clipPath>
    <clipPath id="pface"><rect x="40" y="170" width="920" height="790"/></clipPath>`;
  const face = art
    ? `<g clip-path="url(#pface)">${artImage(art, 40, 170, 920, 790, 'preserveAspectRatio="xMinYMid slice"')}<rect x="40" y="170" width="920" height="790" fill="url(#half)"/></g>`
    : `<circle cx="330" cy="620" r="220" fill="#ffd9b8" stroke="#111" stroke-width="10"/>`;
  const body = `
    <g clip-path="url(#pclip)">
      <rect x="40" y="40" width="920" height="920" fill="${bg}"/>
      <rect x="40" y="40" width="920" height="920" fill="url(#bday)" mask="url(#dmask)"/>
      ${face}
    </g>
    <path d="${tail}" fill="#111" stroke="#111" stroke-width="16" stroke-linejoin="round"/>
    ${cs.map(([x, y, r]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r + 7).toFixed(1)}" fill="#111"/>`).join('')}
    <path d="${tail}" fill="#fff"/>
    ${cs.map(([x, y, r]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="#fff"/>`).join('')}
    ${textLines(lines, { x: bx, y: by - ((lines.length - 1) * size * 1.08) / 2 + size * 0.35, lh: Math.round(size * 1.08), size, family: FONT_FUTURA, fill: '#111', anchor: 'middle', weight: '900', extra: 'letter-spacing="1"' })}
    ${tornStrip(40, 960, 846, 30, '#ffffff', meta.dayIndex, 0.55)}
    <text x="918" y="930" text-anchor="end" font-family="${FONT_FUTURA}" font-size="22" font-weight="bold" fill="#111">stickers.stluker.com</text>`;
  return { w, h, outline: rr(20, 20, 960, 960, 44), defs, body };
}

// ---------------------------------------------------------------- masterpiece
function masterpiece(copy, art, meta) {
  const w = 800, h = 1000;
  const title = clip(copy.title, 20).toUpperCase();
  const size = fitSize(title, 620, 0.66, 40, 76);
  const plac = clip(copy.placard, 50);
  const defs = `<clipPath id="mclip"><path d="${rr(36, 36, 728, 928, 20)}"/></clipPath>
    <linearGradient id="msky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe0ea"/><stop offset="1" stop-color="#8fc3d4"/></linearGradient>`;
  const painting = art
    ? artImage(art, 36, 150, 728, 814)
    : `<rect x="36" y="150" width="728" height="814" fill="#6f8b5a"/><path d="M36,700 Q400,560 764,700 V964 H36Z" fill="#3e5a36"/>`;
  const body = `
    <g clip-path="url(#mclip)">
      <rect x="36" y="36" width="728" height="928" fill="url(#msky)"/>
      ${painting}
      <rect x="36" y="36" width="728" height="126" fill="url(#msky)"/>
      ${tornStrip(36, 764, 144, 22, '#8fc3d4', meta.dayIndex + 3, 1)}
      ${tornStrip(36, 764, 850, 34, '#ffffff', meta.dayIndex, 0.62)}
    </g>
    <text x="400" y="${86 + size * 0.34}" text-anchor="middle" font-family="${FONT_HUMANIST}" font-size="${size}" font-weight="bold" fill="#262626" letter-spacing="1">${esc(title)}</text>
    <text x="70" y="876" font-family="${FONT_SERIF}" font-style="italic" font-size="${fitSize(plac, 460, 0.45, 15, 21)}" fill="#1d2a33">${esc(plac)}</text>
    <text x="730" y="936" text-anchor="end" font-family="${FONT_HUMANIST}" font-size="20" font-weight="bold" fill="#ffffff" stroke="#1d2a33" stroke-width="0.8" paint-order="stroke">stickers.stluker.com</text>`;
  return { w, h, outline: rr(18, 18, 764, 964, 30), defs, body };
}


// ======================================================================
// Sticker-pack styles (added 2026-09-28, from the BulbaCraft "Computer
// Science" sheet review and the IT-sticker market review):
// sign       - hazard / road-sign parody (ANSI safety sign or road diamond)
// objectchar - an IT object with a face says one line
// typo       - type-only stacked slogan, no art
// badge      - vintage club / merit badge with arc lettering
// Shared look: warm retro palette, bold ink outlines, cream highlights.
// ======================================================================
export const WARM_PALETTE = ['#f28c28', '#e9c46a', '#2a9d8f', '#e76f51', '#f4a261', '#8ab17d'];
const INK = '#1d1d1b';
const CREAM = '#fdf0d5';
const FONT_SLAB = "Rockwell, 'Roboto Slab', 'Courier New', Georgia, 'DejaVu Serif', serif";

// Flat black-on-white art -> solid-ink pictogram on a transparent background.
// The "keep-" prefix tells the thumbnail route not to strip this filter:
// without it, a thumbnail would show a white square on the sign.
const PICTO_FILTER = `<filter id="keep-picto" color-interpolation-filters="sRGB">
      <feColorMatrix type="matrix" values="0 0 0 0 0.11  0 0 0 0 0.11  0 0 0 0 0.1  -0.4 -0.4 -0.4 0 1.1"/>
      <feComponentTransfer><feFuncA type="discrete" tableValues="0 0 1 1 1"/></feComponentTransfer>
      <feComposite in2="SourceAlpha" operator="in"/></filter>`;

const maxLen = (lines) => Math.max(1, ...lines.map((l) => l.length));

// ---------------------------------------------------------------- sign
export const SAFETY_HEADERS = {
  DANGER: { band: INK, oval: '#d52b1e', text: '#ffffff' },
  WARNING: { band: '#ff7900', text: INK },
  CAUTION: { band: '#ffd100', text: INK },
  NOTICE: { band: '#0055a5', text: '#ffffff', italic: true },
};

function alertTriangle(cx, cy, r, fill, mark) {
  return `<path d="M${cx},${cy - r}L${(cx + r * 1.12).toFixed(1)},${(cy + r * 0.82).toFixed(1)}H${(cx - r * 1.12).toFixed(1)}Z" fill="${fill}" stroke="${fill}" stroke-width="8" stroke-linejoin="round"/>` +
    `<rect x="${cx - 6}" y="${(cy - r * 0.42).toFixed(1)}" width="12" height="${(r * 0.72).toFixed(1)}" rx="4" fill="${mark}"/>` +
    `<circle cx="${cx}" cy="${(cy + r * 0.54).toFixed(1)}" r="7" fill="${mark}"/>`;
}

function safetySign(copy, art, meta) {
  const w = 1000, h = 800;
  const head = SAFETY_HEADERS[copy.header] ? copy.header : 'CAUTION';
  const s = SAFETY_HEADERS[head];
  const msg = wrap(copy.message.toUpperCase(), 15, 4);
  const size = fitSize('x'.repeat(maxLen(msg)), 440, 0.7, 32, 64);
  const lh = Math.round(size * 1.1);
  const top = 424 - ((msg.length - 1) * lh) / 2 + size * 0.36;
  const hSize = 104;
  const wordW = head.length * hSize * 0.5;
  const defs = `${PICTO_FILTER}<clipPath id="spic"><rect x="99" y="265" width="314" height="314"/></clipPath>`;
  const band = s.oval
    ? `<path d="${rr(64, 64, 872, 158, 12)}" fill="${s.band}"/><ellipse cx="500" cy="143" rx="${Math.round(wordW / 2 + 130)}" ry="62" fill="${s.oval}"/>`
    : `<path d="${rr(64, 64, 872, 158, 12)}" fill="${s.band}"/>`;
  const triX = Math.round(500 - wordW / 2 - 62);
  const picto = art
    ? `<g clip-path="url(#spic)">${artImage(art, 99, 265, 314, 314, 'filter="url(#keep-picto)"')}</g>`
    : `<text x="256" y="480" text-anchor="middle" font-family="${FONT_IMPACT}" font-size="230" fill="${INK}">!</text>`;
  const body = `
    <path d="${rr(40, 40, 920, 720, 28)}" fill="#ffffff" stroke="${INK}" stroke-width="10"/>
    ${band}
    ${alertTriangle(triX, 146, 40, s.text, s.oval || s.band)}
    <text x="${Math.round(500 + 34)}" y="${143 + hSize * 0.36}" text-anchor="middle" font-family="${FONT_IMPACT}" font-size="${hSize}" fill="${s.text}" textLength="${Math.round(wordW)}" lengthAdjust="spacingAndGlyphs"${s.italic ? ' font-style="italic"' : ''}>${esc(head)}</text>
    <rect x="96" y="262" width="320" height="320" fill="#ffffff" stroke="${INK}" stroke-width="6"/>
    ${picto}
    ${textLines(msg, { x: 686, y: top, lh, size, family: FONT_SWISS, fill: INK, anchor: 'middle', weight: '900' })}
    <line x1="96" y1="640" x2="904" y2="640" stroke="${INK}" stroke-width="3"/>
    <text x="96" y="690" font-family="${FONT_MONO}" font-size="18" font-weight="bold" fill="${INK}" letter-spacing="2">STICKERS.STLUKER.COM</text>
    <text x="904" y="690" text-anchor="end" font-family="${FONT_MONO}" font-size="18" fill="${INK}" letter-spacing="2">${esc(meta.topicLabel.toUpperCase())} DEPT.</text>`;
  return { w, h, outline: rr(20, 20, 960, 760, 44), defs, body };
}

function roadSign(copy, art, meta) {
  const w = 1000, h = 1000;
  const color = ['#ffcc00', '#c6e21b', '#f7801e'][meta.palette % 3];
  const msg = wrap(copy.message.toUpperCase(), 17, 2);
  const size = fitSize('x'.repeat(maxLen(msg)), 660, 0.72, 38, 84);
  const lh = Math.round(size * 1.02);
  const top = 826 - ((msg.length - 1) * lh) / 2 + size * 0.36;
  const dia = (a) => `M500,${390 - a}L${500 + a},390L500,${390 + a}L${500 - a},390Z`;
  const defs = `${PICTO_FILTER}<clipPath id="rdia"><path d="${dia(316)}"/></clipPath>`;
  const picto = art
    ? `<g clip-path="url(#rdia)">${artImage(art, 270, 160, 460, 460, 'filter="url(#keep-picto)"')}</g>`
    : `<text x="500" y="470" text-anchor="middle" font-family="${FONT_IMPACT}" font-size="260" fill="${INK}">!</text>`;
  const body = `
    <path d="${dia(350)}" fill="${color}" stroke="${color}" stroke-width="24" stroke-linejoin="round"/>
    <path d="${dia(328)}" fill="none" stroke="${INK}" stroke-width="12" stroke-linejoin="round"/>
    ${picto}
    <path d="${rr(120, 700, 760, 250, 22)}" fill="${color}"/>
    <path d="${rr(134, 714, 732, 222, 14)}" fill="none" stroke="${INK}" stroke-width="10"/>
    ${textLines(msg, { x: 500, y: top, lh, size, family: FONT_SWISS, fill: INK, anchor: 'middle', weight: '900' })}
    <text x="500" y="925" text-anchor="middle" font-family="${FONT_MONO}" font-size="15" font-weight="bold" fill="${INK}" opacity="0.7" letter-spacing="2">STICKERS.STLUKER.COM</text>`;
  return { w, h, outline: 'M500,6L884,390L598,676H904V974H96V676H402L116,390Z', defs, body };
}

function sign(copy, art, meta) {
  return copy.kind === 'road' ? roadSign(copy, art, meta) : safetySign(copy, art, meta);
}

// ---------------------------------------------------------------- objectchar
function objectchar(copy, art, meta) {
  const w = 1000, h = 1000;
  const bg = WARM_PALETTE[meta.palette % 6];
  const says = wrap(`"${copy.says}"`, 22, 3);
  const size = fitSize('x'.repeat(maxLen(says)), 720, 0.55, 36, 62);
  const lh = Math.round(size * 1.15);
  const bh = says.length * lh + 64;
  const by = 72;
  const name = clip(copy.object, 22).toUpperCase();
  const defs = `<clipPath id="oclip"><circle cx="500" cy="610" r="282"/></clipPath>
    <pattern id="odots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="3.2" fill="${INK}" opacity="0.12"/></pattern>
    <clipPath id="obody"><path d="${rr(40, 40, 920, 920, 200)}"/></clipPath>`;
  const hero = art
    ? `<g clip-path="url(#oclip)"><rect x="218" y="328" width="564" height="564" fill="#ffffff"/>${artImage(art, 218, 328, 564, 564)}</g>`
    : `<circle cx="500" cy="610" r="282" fill="${CREAM}"/><circle cx="440" cy="590" r="18" fill="${INK}"/><circle cx="560" cy="590" r="18" fill="${INK}"/><path d="M455,660Q500,700 545,660" fill="none" stroke="${INK}" stroke-width="12" stroke-linecap="round"/>`;
  const spark = (x, y, s) => `<path d="M${x},${y - s}V${y + s}M${x - s},${y}H${x + s}" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>`;
  const body = `
    <path d="${rr(40, 40, 920, 920, 200)}" fill="${bg}"/>
    <g clip-path="url(#obody)"><rect x="40" y="40" width="920" height="920" fill="url(#odots)"/></g>
    <path d="${rr(40, 40, 920, 920, 200)}" fill="none" stroke="${INK}" stroke-width="10"/>
    ${spark(140, 520, 20)}${spark(862, 470, 16)}${spark(160, 800, 12)}${spark(860, 780, 22)}
    <circle cx="500" cy="610" r="296" fill="${INK}"/>
    ${hero}
    <path d="M${420},${by + bh - 6} L${440},${by + bh + 70} L${520},${by + bh - 6}Z" fill="#ffffff" stroke="${INK}" stroke-width="10" stroke-linejoin="round"/>
    <path d="${rr(96, by, 808, bh, 44)}" fill="#ffffff" stroke="${INK}" stroke-width="10"/>
    <path d="M${426},${by + bh - 10} L${514},${by + bh - 10}" stroke="#ffffff" stroke-width="12"/>
    ${textLines(says, { x: 500, y: by + 32 + size * 0.8, lh, size, family: FONT_ROUND, fill: INK, anchor: 'middle', weight: 'bold' })}
    <path d="${rr(250, 846, 500, 76, 38)}" fill="${INK}"/>
    <text x="500" y="${884 + fitSize(name, 440, 0.62, 20, 34) * 0.36}" text-anchor="middle" font-family="${FONT_ROUND}" font-size="${fitSize(name, 440, 0.62, 20, 34)}" font-weight="bold" fill="${CREAM}" letter-spacing="2">${esc(name)}</text>
    <text x="500" y="948" text-anchor="middle" font-family="${FONT_MONO}" font-size="15" font-weight="bold" fill="${INK}" opacity="0.7">stickers.stluker.com</text>`;
  return { w, h, outline: rr(20, 20, 960, 960, 220), defs, body };
}

// ---------------------------------------------------------------- typo
// Type only. Each line is sized to fill the width; lines that would need
// heavy stretching are centered at their natural width instead.
function typo(copy, art, meta) {
  const w = 1000;
  const words = clip(copy.words, 30).toUpperCase();
  const lines = wrap(words, words.length > 16 ? 11 : 9, 4);
  const target = 800;
  let sizes = lines.map((l) => Math.min(250, target / (Math.max(1, l.length) * 0.5)));
  const kick = clip(copy.kicker, 36);
  const avail = 620;
  const used = sizes.reduce((a, s) => a + s * 0.9 + 14, 0);
  if (used > avail) sizes = sizes.map((s) => s * (avail / used));
  const bg = WARM_PALETTE[meta.palette % 6];
  const alt = WARM_PALETTE[(meta.palette + 3) % 6];
  let y = 110, text = '';
  lines.forEach((l, i) => {
    const s = Math.round(sizes[i]);
    const natural = l.length * 0.5 * s;
    const fit = natural > target * 0.8 ? ` textLength="${target}" lengthAdjust="spacingAndGlyphs"` : '';
    const base = y + s * 0.8;
    const fill = i % 2 ? alt : CREAM;
    const attrs = `x="500" text-anchor="middle" font-family="${FONT_IMPACT}" font-size="${s}"${fit}`;
    text += `<text ${attrs} y="${Math.round(base + 9)}" dx="9" fill="${INK}">${esc(l)}</text>` +
      `<text ${attrs} y="${Math.round(base)}" fill="${fill}" stroke="${INK}" stroke-width="${Math.max(4, Math.round(s * 0.05))}" paint-order="stroke" stroke-linejoin="round">${esc(l)}</text>`;
    y += s * 0.9 + 14;
  });
  if (kick) {
    y += 16;
    text += `<path d="${rr(500 - Math.min(400, kick.length * 9 + 40), y, Math.min(800, kick.length * 18 + 80), 56, 28)}" fill="${INK}"/>` +
      `<text x="500" y="${y + 37}" text-anchor="middle" font-family="${FONT_MONO}" font-size="${fitSize(kick, 720, 0.6, 18, 28)}" font-weight="bold" fill="${CREAM}">${esc(kick)}</text>`;
    y += 56;
  }
  const h = Math.round(y + 110);
  const body = `
    <path d="${rr(40, 40, 920, h - 80, 48)}" fill="${bg}" stroke="${INK}" stroke-width="10"/>
    ${star4(96, 96, 22, CREAM, `stroke="${INK}" stroke-width="4"`)}${star4(904, h - 96, 22, CREAM, `stroke="${INK}" stroke-width="4"`)}
    ${text}
    <text x="500" y="${h - 62}" text-anchor="middle" font-family="${FONT_MONO}" font-size="16" font-weight="bold" fill="${INK}" opacity="0.75">stickers.stluker.com</text>`;
  return { w, h, outline: rr(20, 20, 960, h - 40, 64), defs: '', body };
}

// ---------------------------------------------------------------- badge
function badge(copy, art, meta) {
  const w = 1000, h = 1000, cx = 500, cy = 500;
  const ring = ['#2b3a42', '#7a2e1f', '#1f4d3a', '#3b2f5c', '#5a3a1a', '#1d3557'][meta.palette % 6];
  const accent = WARM_PALETTE[meta.palette % 6];
  const top = clip(copy.top, 26).toUpperCase();
  const bottom = clip(copy.bottom, 26).toUpperCase();
  const ribbon = clip(copy.ribbon, 18).toUpperCase();
  const est = clip(copy.est || 'EST. 1999', 12).toUpperCase();
  const rT = 388, rB = 428;
  const fitT = Math.round(Math.PI * rT * 0.66), fitB = Math.round(Math.PI * rB * 0.6);
  const tSize = Math.round(Math.max(34, Math.min(62, fitT / (Math.max(1, top.length) * 0.66))));
  const bSize = Math.round(Math.max(30, Math.min(52, fitB / (Math.max(1, bottom.length) * 0.66))));
  const guard = (s, size, fit) => (s.length * 0.72 * size > fit ? ` textLength="${fit}" lengthAdjust="spacingAndGlyphs"` : '');
  const rSize = fitSize(ribbon, 560, 0.66, 30, 58);
  const defs = `
    <path id="btop" d="M${cx - rT},${cy}A${rT},${rT} 0 0 1 ${cx + rT},${cy}"/>
    <path id="bbot" d="M${cx - rB},${cy}A${rB},${rB} 0 0 0 ${cx + rB},${cy}"/>
    <clipPath id="bclip"><circle cx="${cx}" cy="${cy}" r="318"/></clipPath>
    <filter id="bprint" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="0.75"/><feComponentTransfer>
      <feFuncR type="discrete" tableValues="0.1 0.35 0.6 0.85 1"/><feFuncG type="discrete" tableValues="0.1 0.33 0.58 0.82 0.96"/><feFuncB type="discrete" tableValues="0.09 0.28 0.5 0.72 0.86"/></feComponentTransfer></filter>`;
  const center = art
    ? `<g clip-path="url(#bclip)"><rect x="${cx - 318}" y="${cy - 318}" width="636" height="636" fill="${CREAM}"/>${artImage(art, cx - 318, cy - 318, 636, 636, 'filter="url(#bprint)"')}</g>`
    : `<circle cx="${cx}" cy="${cy}" r="318" fill="${CREAM}"/>${star5(cx, cy - 40, 120, accent, INK)}`;
  const tail = (x, dir) => `<path d="M${x},628 H${x + dir * 110} L${x + dir * 80},668 L${x + dir * 110},708 H${x}Z" fill="${accent}" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>` +
    `<path d="M${x},628 L${x + dir * 40},606 V628Z" fill="${INK}"/>`;
  const body = `
    <circle cx="${cx}" cy="${cy}" r="470" fill="${ring}" stroke="${INK}" stroke-width="8"/>
    <circle cx="${cx}" cy="${cy}" r="452" fill="none" stroke="${CREAM}" stroke-width="4" stroke-dasharray="3 11" stroke-linecap="round" opacity="0.8"/>
    <text font-family="${FONT_SLAB}" font-size="${tSize}" font-weight="bold" fill="${CREAM}" letter-spacing="3">
      <textPath xlink:href="#btop" href="#btop" startOffset="50%" text-anchor="middle"${guard(top, tSize, fitT)}>${esc(top)}</textPath></text>
    <text font-family="${FONT_SLAB}" font-size="${bSize}" font-weight="bold" fill="${CREAM}" letter-spacing="3">
      <textPath xlink:href="#bbot" href="#bbot" startOffset="50%" text-anchor="middle" dominant-baseline="hanging"${guard(bottom, bSize, fitB)}>${esc(bottom)}</textPath></text>
    ${star5(cx - 408, cy, 24, CREAM)}${star5(cx + 408, cy, 24, CREAM)}
    <circle cx="${cx}" cy="${cy}" r="330" fill="${INK}"/>
    ${center}
    <circle cx="${cx}" cy="${cy}" r="318" fill="none" stroke="${CREAM}" stroke-width="6"/>
    ${tail(210, -1)}${tail(790, 1)}
    <path d="M170,590 H830 V670 H170Z" fill="${accent}" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>
    <text x="${cx}" y="${630 + rSize * 0.36}" text-anchor="middle" font-family="${FONT_SLAB}" font-size="${rSize}" font-weight="bold" fill="${INK}" letter-spacing="2">${esc(ribbon)}</text>
    <path d="${rr(cx - 150, 694, 300, 74, 18)}" fill="${INK}"/>
    <text x="${cx}" y="728" text-anchor="middle" font-family="${FONT_SLAB}" font-size="26" font-weight="bold" fill="${CREAM}" letter-spacing="3">${esc(est)}</text>
    <text x="${cx}" y="755" text-anchor="middle" font-family="${FONT_MONO}" font-size="13" fill="${CREAM}" opacity="0.8">stickers.stluker.com</text>`;
  return { w, h, outline: `M${cx - 490},${cy}a490,490 0 1,0 980,0a490,490 0 1,0 -980,0Z`, defs, body };
}

const RENDERERS = { terminal, win95, diecut, poster, minimal, y2k, holo, botanical, kawaii, qr, comic, popart, masterpiece, sign, objectchar, typo, badge };

export function compose(style, copy, art, meta, { print = false } = {}) {
  const r = RENDERERS[style];
  if (!r) throw new Error(`unknown style ${style}`);
  const s = r(copy, art, meta);
  const shadow = print ? '' :
    `<filter id="shadow" x="-10%" y="-10%" width="120%" height="125%"><feDropShadow dx="0" dy="6" stdDeviation="7" flood-color="#000" flood-opacity="0.35"/></filter>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${s.w}" height="${s.h}" viewBox="0 0 ${s.w} ${s.h}">
<title>${esc(meta.title)}</title>
<defs>${s.defs}${shadow}</defs>
<g id="Sticker">
<path d="${s.outline}" fill="#ffffff"${print ? '' : ' filter="url(#shadow)"'}/>
${s.body}
</g>${print ? `
<g id="CutContour"><path d="${s.outline}" fill="none" stroke="#EC008C" stroke-width="1"/></g>` : ''}
</svg>`;
}
