// Text helpers. Everything that lands in an SVG or D1 goes through toAscii()
// first -- same standing rule as the rest of stluker.com (no em dashes or curly
// quotes; they have corrupted content on the PowerShell 5.1 path before).

export function toAscii(s) {
  if (s == null) return '';
  return String(s)
    .replace(/[‘’‚′´]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[  -​]/g, ' ')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Clip to n chars on a word boundary where possible.
export function clip(s, n) {
  s = toAscii(s);
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 3);
  const atWord = cut.replace(/\s+\S*$/, '');
  return (atWord.length > n * 0.6 ? atWord : cut) + '...';
}

// Greedy word wrap. Hard-splits words longer than maxChars. If the text needs
// more than maxLines, the last line is clipped with "...".
export function wrap(text, maxChars, maxLines) {
  const words = toAscii(text).split(' ').filter(Boolean);
  const lines = [];
  let line = '';
  for (let w of words) {
    while (w.length > maxChars) {
      if (line) { lines.push(line); line = ''; }
      lines.push(w.slice(0, maxChars));
      w = w.slice(maxChars);
    }
    if (!line) line = w;
    else if ((line + ' ' + w).length <= maxChars) line += ' ' + w;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = clip(kept[maxLines - 1] + ' ' + lines.slice(maxLines).join(' '), maxChars);
    return kept;
  }
  return lines;
}

// Strip quoted phrases from an image prompt: quoted words invite the image
// model to try (and fail) to render lettering.
export function stripQuoted(s) {
  return toAscii(s).replace(/"[^"]*"/g, '').replace(/'[^']{3,}'/g, '').replace(/\s+/g, ' ').trim();
}
