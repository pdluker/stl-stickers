(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const ICONS = {
    png: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v3h16v-3"/></svg>',
    print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 11v9H4v-9zM7 11l4-8a2 2 0 0 1 3 2l-1 5h5a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 16.8 20H7"/></svg>',
  };

  const TOPICS = [
    ['', 'All'], ['helpdesk', 'Help Desk'], ['network', 'Networking & DNS'], ['security', 'Security'],
    ['cloud', 'Cloud & FinOps'], ['devops', 'DevOps & On-Call'], ['ai', 'AI Hype'], ['legacy', 'Legacy'], ['meetings', 'Meetings'], ['privacy', 'Privacy'], ['code', 'Code & Debugging'],
  ];

  const state = { topic: '', style: '', sort: 'new', q: '', offset: 0, loading: false, nextOffset: null };

  // ---------- small helpers ----------
  function el(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'html') n.innerHTML = v; // only ever used with the static ICONS above
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null) n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return n;
  }
  const api = async (path, opts) => {
    const r = await fetch(path, opts);
    if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status });
    return r.json();
  };
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
  }
  const fmtDate = (id) => new Date(`${id}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } },
  };

  // ---------- PNG export (client-side, from the print SVG minus its cut line) ----------
  async function stickerPng(id, size) {
    const res = await fetch(`/img/${id}-print.svg`);
    if (!res.ok) throw new Error('svg fetch failed');
    const text = (await res.text()).replace(/<g id="CutContour">[\s\S]*?<\/g>/, '');
    const w = +(text.match(/width="(\d+)"/) || [])[1] || 1000;
    const h = +(text.match(/height="(\d+)"/) || [])[1] || 1000;
    const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
    try {
      const img = new Image();
      img.decoding = 'async';
      await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad; img.src = url; });
      const scale = size / Math.max(w, h);
      const c = document.createElement('canvas');
      c.width = Math.round(w * scale); c.height = Math.round(h * scale);
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, c.width, c.height);
      return await new Promise((ok, bad) => c.toBlob((b) => (b ? ok(b) : bad(new Error('toBlob failed'))), 'image/png'));
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  function saveBlob(blob, name) {
    const a = el('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  // ---------- actions ----------
  function actionBar(item, { primary = true } = {}) {
    const voted = !!(store.get('voted') || {})[item.id];
    const voteBtn = el('button', { class: 'btn vote', 'aria-pressed': String(voted), title: 'Give this sticker a +1', html: `${ICONS.up}<span>+1 &middot; <b>${item.votes}</b></span>` });
    voteBtn.addEventListener('click', async () => {
      if (voteBtn.getAttribute('aria-pressed') === 'true') return toast('Already counted. One +1 per sticker.');
      voteBtn.disabled = true;
      try {
        const r = await api(`/api/stickers/${item.id}/vote`, { method: 'POST' });
        item.votes = r.votes;
        voteBtn.querySelector('b').textContent = r.votes;
        voteBtn.setAttribute('aria-pressed', 'true');
        const v = store.get('voted') || {}; v[item.id] = 1; store.set('voted', v);
        toast(r.counted ? 'Counted. Thanks!' : 'Already counted from this network.');
      } catch { toast('Vote did not go through. Try again later.'); }
      voteBtn.disabled = false;
    });

    const pngBtn = el('button', { class: `btn ${primary ? 'btn-primary' : ''}`, html: `${ICONS.png}<span>Download PNG</span>` });
    pngBtn.addEventListener('click', async () => {
      pngBtn.disabled = true;
      try { saveBlob(await stickerPng(item.id, 2400), `stluker-sticker-${item.id}.png`); }
      catch { toast('PNG export failed. The SVG download still works.'); }
      pngBtn.disabled = false;
    });

    const printBtn = el('a', { class: 'btn', href: `/img/${item.id}-print.svg?download=1`, title: 'SVG with a CutContour die-cut layer for sticker printers', html: `${ICONS.print}<span>Print SVG</span>` });

    const copyBtn = el('button', { class: 'btn', title: 'Copy the image to paste into Slack or Teams', html: `${ICONS.copy}<span>Copy image</span>` });
    copyBtn.addEventListener('click', async () => {
      try {
        if (!window.ClipboardItem || !navigator.clipboard?.write) throw new Error('unsupported');
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': stickerPng(item.id, 800) })]);
        toast('Copied. Paste it into Slack or Teams.');
      } catch {
        toast('This browser cannot copy images. Use Download PNG instead.');
      }
    });

    const linkBtn = el('button', { class: 'btn', title: 'Copy a share link', html: `${ICONS.link}<span>Share link</span>` });
    linkBtn.addEventListener('click', async () => {
      const url = `${location.origin}/s/${item.id}`;
      try {
        if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ title: item.headline, url });
        else { await navigator.clipboard.writeText(url); toast('Link copied.'); }
      } catch { /* user cancelled share sheet */ }
    });

    return [pngBtn, printBtn, copyBtn, linkBtn, voteBtn];
  }

  function stickerImg(item, eager, thumb) {
    const src = thumb && item.thumb ? item.thumb : item.svg;
    return el('img', { src, alt: item.altText || item.headline, loading: eager ? 'eager' : 'lazy', decoding: 'async', width: '1000', height: '1000' });
  }
  function chipsFor(item) {
    return [el('span', { class: 'chip topic' }, item.topicLabel), el('span', { class: 'chip' }, item.styleLabel), ...(item.tags || []).slice(0, 3).map((t) => el('span', { class: 'chip' }, `#${t}`))];
  }

  // Scan-to-Reveal stickers hold the punchline back until someone scans the QR
  // (which lands on /s/<date>?reveal=1) or clicks Reveal here.
  function revealBlock(item, autoOpen) {
    const punch = item.copy && item.copy.punchline;
    if (item.style !== 'qr' || !punch) return el('span');
    const box = el('div', { class: 'reveal' });
    const answer = el('p', { class: 'reveal-answer', hidden: !autoOpen }, punch);
    const btn = el('button', { class: 'btn btn-ghost reveal-btn', type: 'button', hidden: autoOpen }, 'Reveal the punchline');
    btn.addEventListener('click', () => { answer.hidden = false; btn.hidden = true; });
    box.append(el('p', { class: 'reveal-label mono' }, autoOpen ? 'You scanned it. The punchline:' : 'The punchline is behind the QR code.'), btn, answer);
    return box;
  }
  const wantsReveal = () => new URLSearchParams(location.search).get('reveal') === '1';

  // ---------- today ----------
  async function loadToday() {
    const frame = $('#today-frame');
    try {
      const item = await api('/api/stickers/today');
      frame.classList.remove('is-loading');
      frame.replaceChildren(el('a', { href: `/s/${item.id}`, onclick: (e) => { e.preventDefault(); openDetail(item.id); } }, stickerImg(item, true)));
      $('#today-date').textContent = `- ${fmtDate(item.id)}`;
      $('#today-headline').textContent = item.headline;
      $('#today-chips').replaceChildren(...chipsFor(item));
      $('#today-reveal').replaceChildren(revealBlock(item, false));
      $('#today-actions').replaceChildren(...actionBar(item));
      $('#date-jump').max = item.id;
    } catch (e) {
      frame.classList.remove('is-loading');
      frame.replaceChildren(el('p', { class: 'none' }, e.status === 404 ? 'The first sticker is still in the printer. Check back tomorrow morning.' : 'Could not load today\'s sticker.'));
    }
  }

  // ---------- hall of fame ----------
  async function loadHall() {
    try {
      const { items } = await api('/api/stickers?sort=top&limit=8');
      const ranked = items.filter((i) => i.votes > 0);
      if (ranked.length < 3) return;
      $('#hall-strip').replaceChildren(...ranked.map(card));
      $('#hall').hidden = false;
    } catch { /* optional section */ }
  }

  // ---------- archive ----------
  function card(item) {
    return el('button', { class: 'card', type: 'button', onclick: () => openDetail(item.id), 'aria-label': `${fmtDate(item.id)}: ${item.headline}` },
      el('div', { class: 'thumb' }, stickerImg(item, false, true)),
      el('div', { class: 'meta' }, el('span', {}, item.id), el('span', {}, `+${item.votes}`)),
      el('div', { class: 'title' }, item.headline));
  }

  async function loadArchive(reset) {
    if (state.loading) return;
    state.loading = true;
    if (reset) { state.offset = 0; $('#grid').replaceChildren(); }
    const qs = new URLSearchParams({ limit: '24', offset: String(state.offset), sort: state.sort });
    if (state.topic) qs.set('topic', state.topic);
    if (state.style) qs.set('style', state.style);
    if (state.q) qs.set('q', state.q);
    try {
      const { items, nextOffset } = await api(`/api/stickers?${qs}`);
      $('#grid').append(...items.map(card));
      state.nextOffset = nextOffset;
      state.offset = nextOffset ?? state.offset;
      $('#more').hidden = nextOffset == null;
      $('#empty').hidden = $('#grid').children.length > 0;
    } catch {
      toast('Could not load the archive.');
    }
    state.loading = false;
  }

  async function loadStats() {
    try {
      const s = await api('/api/stats');
      $('#archive-count').textContent = s.total ? `${s.total} sticker${s.total === 1 ? '' : 's'} since ${fmtDate(s.first)}` : '';
      if (s.first) $('#date-jump').min = s.first;
      const sel = $('#style-select');
      if (sel.options.length <= 1 && s.styles) {
        for (const [k, v] of Object.entries(s.styles)) sel.append(el('option', { value: k }, v.count ? `${v.label} (${v.count})` : v.label));
      }
      document.querySelectorAll('#topic-chips .chip-btn').forEach((b) => {
        const k = b.dataset.topic;
        const n = k ? s.topics[k]?.count : s.total;
        b.querySelector('.n').textContent = n ?? '';
      });
    } catch { /* counts are decoration */ }
  }

  function buildFilters() {
    const row = $('#topic-chips');
    for (const [key, label] of TOPICS) {
      const b = el('button', { class: 'chip-btn', type: 'button', 'data-topic': key, 'aria-pressed': String(key === state.topic) }, label, el('span', { class: 'n' }));
      b.addEventListener('click', () => {
        state.topic = key;
        row.querySelectorAll('.chip-btn').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        loadArchive(true);
      });
      row.append(b);
    }
    $('#style-select').addEventListener('change', (e) => { state.style = e.target.value; loadArchive(true); });
    $('#sort-select').addEventListener('change', (e) => { state.sort = e.target.value; loadArchive(true); });
    let t;
    $('#search').addEventListener('input', (e) => {
      clearTimeout(t);
      t = setTimeout(() => { state.q = e.target.value.trim(); loadArchive(true); }, 300);
    });
    $('#more').addEventListener('click', () => loadArchive(false));
    $('#date-jump').addEventListener('change', (e) => { if (e.target.value) openDetail(e.target.value); });
  }

  // ---------- detail dialog ----------
  const dlg = $('#detail');
  let current = null;

  async function openDetail(id, { push = true } = {}) {
    let item;
    try { item = await api(`/api/stickers/${id}`); }
    catch (e) { toast(e.status === 404 ? `No sticker for ${id}.` : 'Could not load that sticker.'); return; }
    current = item;
    $('#detail-frame').replaceChildren(stickerImg(item, true));
    $('#detail-date').textContent = fmtDate(item.id);
    $('#detail-title').textContent = item.headline;
    $('#detail-chips').replaceChildren(...chipsFor(item));
    $('#detail-reveal').replaceChildren(revealBlock(item, wantsReveal() && location.pathname === `/s/${item.id}`));
    $('#detail-actions').replaceChildren(...actionBar(item, { primary: true }));
    $('#detail-alt').textContent = item.altText || '';
    $('#detail-prev').disabled = !item.prev;
    $('#detail-next').disabled = !item.next;
    document.title = `${item.headline} | stickers.stluker.com`;
    if (push && location.pathname !== `/s/${id}`) history.pushState({ id }, '', `/s/${id}`);
    if (!dlg.open) dlg.showModal();
  }
  function closeDetail({ push = true } = {}) {
    if (dlg.open) dlg.close();
  }
  dlg.addEventListener('close', () => {
    document.title = 'IT Sticker of the Day | stickers.stluker.com';
    if (location.pathname.startsWith('/s/')) history.pushState({}, '', '/');
  });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) closeDetail(); });
  $('#detail-close').addEventListener('click', () => closeDetail());
  $('#detail-prev').addEventListener('click', () => current?.prev && openDetail(current.prev, { push: false }).then(() => history.replaceState({}, '', `/s/${current.id}`)));
  $('#detail-next').addEventListener('click', () => current?.next && openDetail(current.next, { push: false }).then(() => history.replaceState({}, '', `/s/${current.id}`)));
  document.addEventListener('keydown', (e) => {
    if (!dlg.open) return;
    if (e.key === 'ArrowLeft' && current?.prev) $('#detail-prev').click();
    if (e.key === 'ArrowRight' && current?.next) $('#detail-next').click();
  });
  window.addEventListener('popstate', () => {
    const m = location.pathname.match(/^\/s\/(\d{4}-\d{2}-\d{2})/);
    if (m) openDetail(m[1], { push: false });
    else if (dlg.open) dlg.close();
  });

  // ---------- boot ----------
  buildFilters();
  loadToday();
  loadHall();
  loadStats();
  loadArchive(true);
  const deep = document.body.dataset.sticker || (location.pathname.match(/^\/s\/(\d{4}-\d{2}-\d{2})/) || [])[1];
  if (deep) openDetail(deep, { push: false });
})();
