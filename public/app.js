/* Community Scheduler dashboard. Plain JS, no build step. */

// ---------------------------------------------------------------- helpers
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const debounce = (fn, ms) => {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
};
const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

const ICONS = {
  phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  checks: '<path d="M17 6 6.5 16.5 2 12"/><path d="m22 8-8.5 8.5-1.5-1.5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  clip: '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  video: '<path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  megaphone: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  community: '<circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="18" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="M12 7.5v4M10.2 13 6.8 16M13.8 13l3.4 3"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  loader: '<path d="M21 12a9 9 0 1 1-6.22-8.56"/>',
  ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  power: '<path d="M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/>',
  arrow: '<path d="M5 12h14M12 5l7 7-7 7"/>',
};
const icon = (name, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;

const STATUS = {
  queued: { label: 'Queued', icon: 'clock' },
  sending: { label: 'Sending', icon: 'loader' },
  sent: { label: 'Sent', icon: 'check' },
  delivered: { label: 'Delivered', icon: 'checks' },
  read: { label: 'Read', icon: 'checks' },
  failed: { label: 'Failed', icon: 'alert' },
  missed: { label: 'Missed', icon: 'clock' },
  cancelled: { label: 'Cancelled', icon: 'ban' },
};
const statusBadge = (s) => `<span class="badge status status-${s}">${icon(STATUS[s]?.icon || 'clock')}${STATUS[s]?.label || s}</span>`;

// ---------------------------------------------------------------- state
const S = {
  session: null,
  demo: false,
  wa: { status: 'idle' },
  settings: {},
  stats: { counts: {}, sent24h: 0 },
  dataDir: '',
  chats: [],
  chatsLive: false,
  campaigns: [],
  route: '',
  params: new URLSearchParams(),
  connectMethod: 'qr',
  communities: { q: '', filter: 'all', selected: new Set() },
  inbox: { items: [], total: 0, filters: { status: '', campaignId: '', chatId: '', q: '' }, selected: new Set(), limit: 100, loading: false },
  editorOnChats: null,
};

// ---------------------------------------------------------------- api
async function api(method, url, body) {
  const opts = { method, headers: { 'X-App': '1' } };
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`/api${url}`, opts);
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (res.status === 401 && url !== '/login') {
    showLogin();
    throw new Error('Please log in again.');
  }
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

// ---------------------------------------------------------------- formatting
const tz = () => S.settings.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
function fmtDate(iso, opts = {}) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz(), weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', ...opts,
  }).format(new Date(iso));
}
const fmtTime = (iso) => fmtDate(iso, { weekday: undefined, day: undefined, month: undefined });
function rel(iso) {
  const diff = new Date(iso) - Date.now();
  const m = Math.round(Math.abs(diff) / 60000);
  let s;
  if (m < 1) return diff > 0 ? 'in under a minute' : 'just now';
  if (m < 60) s = `${m} min`;
  else if (m < 1440) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    s = `${h}h${mm ? ` ${mm}m` : ''}`;
  } else s = plural(Math.round(m / 1440), 'day');
  return diff > 0 ? `in ${s}` : `${s} ago`;
}
const fmtSize = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const fmtPhone = (p) => (p ? `+${p}` : '');
function todayInTz() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz(), year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return parts; // YYYY-MM-DD
}
function nextHourInTz() {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz(), hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
  return `${String((h + 1) % 24).padStart(2, '0')}:00`;
}

/** Render WhatsApp formatting: *bold* _italic_ ~strike~ `code` ```mono``` > quote */
function waFormat(text) {
  let s = esc(text);
  const keep = [];
  const stash = (html) => { keep.push(html); return `\u0000${keep.length - 1}\u0000`; };
  s = s.replace(/```([\s\S]+?)```/g, (_, c) => stash(`<span class="mono">${c}</span>`));
  s = s.replace(/`([^`\n]+)`/g, (_, c) => stash(`<code>${c}</code>`));
  s = s.replace(/(https?:\/\/[^\s<]+[^\s<.,!?;:)\]])/g, (u) => stash(`<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`));
  const wrap = (ch, tag) => {
    const e = `\\${ch}`;
    const re = new RegExp(`(^|[\\s(\\[{])${e}(?=\\S)([^\\n]*?\\S)${e}(?=$|[\\s.,!?:;)\\]}])`, 'gm');
    s = s.replace(re, `$1<${tag}>$2</${tag}>`);
  };
  wrap('*', 'b');
  wrap('_', 'i');
  wrap('~', 's');
  s = s.replace(/^&gt; (.*)$/gm, '<span class="quote">$1</span>');
  s = s.replace(/\n/g, '<br>').replace(/(<span class="quote">.*?<\/span>)<br>/g, '$1');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => keep[i]);
}

function bubbleHtml({ text, media, time = '09:00', ticks = true }) {
  let mediaHtml = '';
  if (media) {
    if (media.kind === 'image') mediaHtml = `<div class="media"><img src="/api/media/${esc(media.id)}" alt=""></div>`;
    else if (media.kind === 'video') mediaHtml = `<div class="media"><video src="/api/media/${esc(media.id)}" muted preload="metadata"></video></div>`;
    else mediaHtml = `<div class="media doc">${icon('file')}<span>${esc(media.fileName)}</span></div>`;
  }
  const body = text ? waFormat(text) : media ? '' : '<span class="faint">Your message will appear here</span>';
  const meta = time || ticks ? `<span class="bmeta">${esc(time)}${ticks ? icon('checks') : ''}</span>` : '';
  return `<div class="bubble">${mediaHtml}${body}${meta}</div>`;
}

// ---------------------------------------------------------------- ui primitives
function toast(message, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `${icon(type === 'error' ? 'alert' : 'check')}<span>${esc(message)}</span>`;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), type === 'error' ? 7000 : 3800);
}

function openModal(html, { size = '', onClose, backdropClose = true } = {}) {
  const root = $('#modal-root');
  const wrap = document.createElement('div');
  wrap.className = `modal-backdrop ${size ? 'full' : ''}`;
  wrap.innerHTML = `<div class="modal ${size}" role="dialog" aria-modal="true">${html}</div>`;
  root.append(wrap);
  document.body.style.overflow = 'hidden';
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    wrap.remove();
    document.removeEventListener('keydown', onKey);
    if (!root.children.length) document.body.style.overflow = '';
    onClose?.();
  };
  const api = { el: wrap.firstElementChild, close, requestClose: close };
  const onKey = (e) => { if (e.key === 'Escape' && root.lastElementChild === wrap) api.requestClose(); };
  document.addEventListener('keydown', onKey);
  let downOnBackdrop = false;
  wrap.addEventListener('mousedown', (e) => { downOnBackdrop = e.target === wrap; });
  wrap.addEventListener('click', (e) => { if (backdropClose && downOnBackdrop && e.target === wrap) api.requestClose(); });
  wrap.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) api.requestClose(); });
  return api;
}

function confirmDialog({ title, body, confirm = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const m = openModal(`
      <div class="modal-head"><h2>${esc(title)}</h2></div>
      <div class="modal-body"><p class="muted">${body}</p></div>
      <div class="modal-foot">
        <button class="btn" data-close>Cancel</button>
        <button class="btn ${danger ? 'btn-danger-solid' : 'btn-primary'}" data-ok>${esc(confirm)}</button>
      </div>`, { onClose: () => { if (!answered) resolve(false); } });
    const ok = $('[data-ok]', m.el);
    ok.addEventListener('click', () => { answered = true; m.close(); resolve(true); });
    ok.focus();
  });
}

async function withBusy(btn, fn) {
  if (!btn) return fn();
  const html = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span>${btn.dataset.busy ? esc(btn.dataset.busy) : ''}`;
  try {
    return await fn();
  } catch (err) {
    toast(err.message, 'error');
    return undefined;
  } finally {
    if (btn.isConnected) {
      btn.disabled = false;
      btn.innerHTML = html;
    }
  }
}

// ---------------------------------------------------------------- chrome (nav, status pill)
const NAV = [
  { id: 'connect', label: 'Connect', icon: 'phone' },
  { id: 'communities', label: 'Communities', icon: 'users' },
  { id: 'schedules', label: 'Schedules', icon: 'calendar' },
  { id: 'inbox', label: 'Inbox', icon: 'inbox' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];
const WA_LABEL = {
  idle: 'Not connected',
  connecting: 'Connecting…',
  qr: 'Waiting for scan',
  pairing: 'Waiting for code',
  connected: 'Connected',
  reconnecting: 'Reconnecting…',
  logged_out: 'Logged out',
  error: 'Connection problem',
};

function renderChrome() {
  const attention = (S.stats.counts.failed || 0) + (S.stats.counts.missed || 0);
  const navHtml = NAV.map((n) => {
    const count = n.id === 'inbox' && attention ? `<span class="count" title="Failed or missed">${attention}</span>` : '';
    return `<a href="#/${n.id}" ${S.route === n.id ? 'aria-current="page"' : ''}>${icon(n.icon)}<span>${n.label}</span>${count}</a>`;
  }).join('');
  $('#nav').innerHTML = navHtml;
  $('#tabbar').innerHTML = navHtml;
  const label = S.wa.status === 'connected' && S.wa.me?.phone ? `Connected · ${fmtPhone(S.wa.me.phone)}` : WA_LABEL[S.wa.status] || S.wa.status;
  for (const pill of [$('#conn-pill'), $('#conn-pill-m')]) {
    pill.dataset.status = S.wa.status;
    pill.innerHTML = `<span class="dot"></span><span>${esc(label)}</span>`;
  }
  $('#demo-banner').hidden = !S.demo;
  $('#whoami').textContent = S.session?.user ? `Signed in as ${S.session.user.username}` : '';
}

// ---------------------------------------------------------------- views
const views = {};
let current = null;

function route() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [name, query = ''] = hash.split('?');
  const target = views[name] ? name : 'schedules';
  S.params = new URLSearchParams(query);
  S.route = target;
  const view = $('#view');
  view.innerHTML = '';
  const el = document.createElement('div');
  view.append(el);
  current = { name: target, el };
  views[target].mount(el);
  renderChrome();
  window.scrollTo(0, 0);
}

function refresh(name) {
  if (current?.name === name && current.el.isConnected) views[name].update?.(current.el);
}

// ===== Connect =====
views.connect = {
  mount(el) {
    el.innerHTML = `
      <div class="page-head"><div><h1>Connect WhatsApp</h1>
        <p>Link the WhatsApp number that is an admin of your communities. You only do this once.</p></div></div>
      <div class="grid-2">
        <section class="card connect-card" id="connect-body"></section>
        <aside class="card tips-card">
          <h2>Good to know</h2>
          <ul>
            <li>${icon('link')}<span><b>Works like WhatsApp Web.</b> This app becomes a linked device on your number. Your phone keeps working as normal.</span></li>
            <li>${icon('power')}<span><b>Keep this app running.</b> Schedules only go out while it runs, so put it on an always-on computer or a small server.</span></li>
            <li>${icon('shield')}<span><b>Use an admin number.</b> Only community admins can post in a community's Announcements group.</span></li>
            <li>${icon('phone')}<span><b>Your phone can be offline.</b> Open WhatsApp on it at least once every 14 days so the link stays active.</span></li>
            <li>${icon('clock')}<span><b>Sent at a human pace.</b> Messages go out one at a time with a short random pause between them (see Settings).</span></li>
          </ul>
        </aside>
      </div>`;
    this.lastKey = null;
    el.addEventListener('click', (e) => this.onClick(e, el));
    el.addEventListener('submit', (e) => {
      e.preventDefault();
      this.connectCode(el, $('[data-act="connect-code"]', el));
    });
    this.update(el);
  },
  update(el) {
    const w = S.wa;
    const key = JSON.stringify([w.status, w.qr, w.pairingCode, w.error, w.me?.id, S.connectMethod, S.chats.length]);
    if (key === this.lastKey) return;
    this.lastKey = key;
    $('#connect-body', el).innerHTML = this.body();
  },
  body() {
    const w = S.wa;
    const err = w.error ? `<div class="alert ${w.status === 'reconnecting' ? 'alert-amber' : 'alert-red'}">${icon('alert')}<span>${esc(w.error)}</span></div>` : '';
    if (w.status === 'connected') {
      const postable = S.chats.filter((c) => c.canSend).length;
      const communities = S.chats.filter((c) => c.type === 'community').length;
      const initial = (w.me?.name || '?').trim().charAt(0).toUpperCase() || '?';
      return `
        <div class="connected-hero">
          <div class="avatar">${esc(initial)}</div>
          <div><span class="badge badge-green">${icon('check')}Connected</span>
            <h2 style="margin-top:6px">${esc(w.me?.name || 'WhatsApp account')}</h2>
            <p class="muted">${esc(fmtPhone(w.me?.phone))}${w.connectedAt ? ` · since ${esc(fmtDate(w.connectedAt))}` : ''}</p></div>
        </div>
        <dl class="kv">
          <div><dt>Communities</dt><dd>${communities}</dd></div>
          <div><dt>Chats you can post in</dt><dd>${postable}</dd></div>
          <div><dt>Active schedules</dt><dd>${S.campaigns.filter((c) => c.active && c.schedule.type !== 'manual').length}</dd></div>
        </dl>
        <div class="row-gap">
          <a class="btn btn-primary" href="#/communities">${icon('users')}View communities</a>
          <button class="btn" data-act="refresh-chats" data-busy="Refreshing">${icon('refresh')}Refresh list</button>
          <span style="flex:1"></span>
          <button class="btn btn-danger" data-act="logout">${icon('logout')}Unlink</button>
        </div>`;
    }
    if (w.status === 'connecting' || w.status === 'reconnecting') {
      return `<div class="center-state"><span class="spinner"></span><h2>${w.status === 'connecting' ? 'Connecting to WhatsApp…' : 'Reconnecting…'}</h2>${err}
        <button class="btn btn-ghost btn-sm" data-act="cancel">Cancel</button></div>`;
    }
    if (w.status === 'qr' && w.qr) {
      return `
        <h2>Scan this QR code with your phone</h2>
        <p class="muted" style="margin:4px 0 18px">The code refreshes automatically. Keep this page open while you scan.</p>
        <div class="qr-wrap">
          <div class="qr-img"><img src="${w.qr}" alt="WhatsApp link QR code"></div>
          <ol class="steps">
            <li><span>Open <b>WhatsApp</b> on the phone with your admin number.</span></li>
            <li><span>Tap <b>Settings</b> (iPhone) or <b>⋮ Menu</b> (Android), then <b>Linked devices</b>.</span></li>
            <li><span>Tap <b>Link a device</b> and point the camera at this code.</span></li>
          </ol>
        </div>
        <div class="row-gap" style="margin-top:22px">
          <button class="btn" data-act="method-code">${icon('phone')}Use phone number instead</button>
          <button class="btn btn-ghost" data-act="cancel">Cancel</button>
        </div>
        ${S.demo ? '<p class="hint" style="margin-top:14px">Demo mode: this links by itself in a few seconds.</p>' : ''}`;
    }
    if (w.status === 'pairing' && w.pairingCode) {
      const chars = w.pairingCode.split('').map((c) => (c === '-' ? '<span class="sep">–</span>' : `<span>${esc(c)}</span>`)).join('');
      return `
        <h2>Enter this code on your phone</h2>
        <p class="muted" style="margin:4px 0 14px">The code is valid for a few minutes.</p>
        <div class="pair-code" aria-label="Pairing code ${esc(w.pairingCode)}">${chars}</div>
        <ol class="steps">
          <li><span>Open <b>WhatsApp</b> → <b>Settings</b> / <b>⋮ Menu</b> → <b>Linked devices</b> → <b>Link a device</b>.</span></li>
          <li><span>Tap <b>Link with phone number instead</b> at the bottom of the camera screen.</span></li>
          <li><span>Type the 8 characters above. WhatsApp may also send a notification you can tap.</span></li>
        </ol>
        <div class="row-gap" style="margin-top:22px"><button class="btn btn-ghost" data-act="cancel">Cancel</button></div>
        ${S.demo ? '<p class="hint" style="margin-top:14px">Demo mode: this links by itself in a few seconds.</p>' : ''}`;
    }
    if (w.status === 'error') {
      return `<div class="stack">${err}
        <div class="row-gap"><button class="btn btn-primary" data-act="connect-qr" data-busy="Reconnecting">${icon('refresh')}Reconnect</button>
        <button class="btn btn-danger" data-act="logout">${icon('logout')}Unlink and start over</button></div></div>`;
    }
    const isCode = S.connectMethod === 'code';
    return `
      <div class="stack">
        ${err}
        <div><h2>Link your WhatsApp</h2>
          <p class="muted" style="margin-top:4px">Pick how you want to link. Both do the same thing.</p></div>
        <div class="seg" role="group" aria-label="Link method">
          <button type="button" data-act="method-qr" aria-pressed="${!isCode}">Scan QR code</button>
          <button type="button" data-act="method-code" aria-pressed="${isCode}">Use phone number</button>
        </div>
        ${isCode ? `
          <form class="stack" id="code-form">
            <label class="field"><span>WhatsApp phone number</span>
              <input type="tel" id="pair-phone" inputmode="numeric" autocomplete="tel" placeholder="e.g. 60123456789" value="${esc(this.phone || '')}">
              <span class="hint">Country code and number, digits only (no +, spaces or leading 0). You'll get an 8-character code to type into WhatsApp on that phone.</span></label>
            <div><button class="btn btn-primary" type="submit" data-act="connect-code" data-busy="Getting code">${icon('arrow')}Get pairing code</button></div>
          </form>` : `
          <p class="muted">We'll show a QR code. Scan it from <b>Linked devices</b> on your phone, like logging in to WhatsApp Web.</p>
          <div><button class="btn btn-primary" data-act="connect-qr" data-busy="Starting">${icon('link')}Show QR code</button></div>`}
      </div>`;
  },
  async onClick(e, el) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'method-qr' || act === 'method-code') {
      S.connectMethod = act === 'method-code' ? 'code' : 'qr';
      if (S.wa.status === 'qr' && act === 'method-code') {
        await api('POST', '/wa/cancel').catch(() => {});
      }
      this.update(el);
      $('#pair-phone', el)?.focus();
    } else if (act === 'connect-qr') {
      await withBusy(btn, async () => { S.wa = await api('POST', '/wa/connect', { method: 'qr' }); this.update(el); });
    } else if (act === 'connect-code' && e.type === 'click' && btn.type !== 'submit') {
      this.connectCode(el, btn);
    } else if (act === 'cancel') {
      S.wa = await api('POST', '/wa/cancel');
      this.update(el);
      renderChrome();
    } else if (act === 'refresh-chats') {
      await withBusy(btn, async () => {
        const r = await api('POST', '/chats/refresh');
        S.chats = r.chats;
        toast(`Found ${plural(r.chats.length, 'chat')}.`);
        this.lastKey = null;
        this.update(el);
      });
    } else if (act === 'logout') {
      const ok = await confirmDialog({
        title: 'Unlink this WhatsApp?',
        body: 'The app will stop sending until you link a number again. Your schedules and inbox history are kept.',
        confirm: 'Unlink',
        danger: true,
      });
      if (!ok) return;
      await withBusy(btn, async () => { S.wa = await api('POST', '/wa/logout'); this.update(el); renderChrome(); });
    }
  },
  async connectCode(el, btn) {
    const phone = $('#pair-phone', el)?.value || '';
    this.phone = phone;
    await withBusy(btn, async () => { S.wa = await api('POST', '/wa/connect', { method: 'code', phone }); this.update(el); });
  },
};

// ===== Communities =====
function chatTree(chats) {
  const communities = chats.filter((c) => c.type === 'community');
  const children = new Map();
  for (const c of chats) {
    if (!c.parentId) continue;
    if (!children.has(c.parentId)) children.set(c.parentId, []);
    children.get(c.parentId).push(c);
  }
  const order = (a, b) => (a.type === 'announcement' ? -1 : 0) - (b.type === 'announcement' ? -1 : 0) || a.name.localeCompare(b.name);
  const tree = communities.map((c) => ({ community: c, children: (children.get(c.id) || []).sort(order) }));
  const known = new Set(communities.map((c) => c.id));
  for (const [parentId, kids] of children) {
    if (known.has(parentId)) continue;
    const name = kids.find((k) => k.type === 'announcement')?.name || 'Community';
    tree.push({ community: { id: parentId, name, type: 'community', size: null }, children: kids.sort(order) });
  }
  tree.sort((a, b) => a.community.name.localeCompare(b.community.name));
  return { tree, groups: chats.filter((c) => c.type === 'group') };
}
const chatLabel = (c) => (c.type === 'announcement' ? 'Announcements' : c.name);
const chatFullName = (c, chats = S.chats) => {
  if (c.type !== 'announcement') return c.name;
  return `${chats.find((p) => p.id === c.parentId)?.name || c.name} · Announcements`;
};

views.communities = {
  mount(el) {
    const st = S.communities;
    el.innerHTML = `
      <div class="page-head">
        <div><h1>Communities</h1><p>Everything this WhatsApp number is part of. Tick the chats you want and create a schedule for them.</p></div>
        <div class="actions"><button class="btn" data-act="refresh" data-busy="Refreshing">${icon('refresh')}Refresh</button></div>
      </div>
      <div class="toolbar">
        <label class="input-icon grow">${icon('search')}<input type="search" id="chat-q" placeholder="Search communities and groups" value="${esc(st.q)}"></label>
        <div class="chips" id="chat-filter">
          ${[['all', 'All'], ['communities', 'Communities'], ['groups', 'Other groups'], ['postable', 'I can post']].map(([v, l]) => `<button class="chip" data-filter="${v}" aria-pressed="${st.filter === v}">${l}</button>`).join('')}
        </div>
      </div>
      <div id="chat-list"></div>
      <div id="select-bar"></div>`;
    $('#chat-q', el).addEventListener('input', debounce((e) => { st.q = e.target.value; this.update(el); }, 150));
    el.addEventListener('click', (e) => this.onClick(e, el));
    el.addEventListener('change', (e) => {
      const cb = e.target.closest('input[data-pick]');
      if (!cb) return;
      if (cb.checked) st.selected.add(cb.value);
      else st.selected.delete(cb.value);
      this.renderBar(el);
    });
    this.update(el);
  },
  update(el) {
    const st = S.communities;
    const list = $('#chat-list', el);
    if (!S.chats.length) {
      const connected = S.wa.status === 'connected';
      list.innerHTML = `<div class="card empty"><div class="icon-wrap">${icon('users', 'i-lg')}</div>
        <h3>${connected ? 'No groups found yet' : 'Connect WhatsApp first'}</h3>
        <p>${connected ? 'This number is not in any community or group, or the list is still loading. Try Refresh.' : 'Once your number is linked, all its communities and groups show up here.'}</p>
        ${connected ? '' : `<a class="btn btn-primary" href="#/connect">${icon('phone')}Connect WhatsApp</a>`}</div>`;
      this.renderBar(el);
      return;
    }
    const q = st.q.trim().toLowerCase();
    const match = (c) => !q || c.name.toLowerCase().includes(q);
    const okFilter = (c) => st.filter !== 'postable' || c.canSend;
    const { tree, groups } = chatTree(S.chats);
    let html = '';
    if (!S.chatsLive) {
      html += `<div class="alert alert-amber" style="margin-bottom:14px">${icon('alert')}<span>WhatsApp is not connected. This is the last list we saw.</span></div>`;
    }
    if (st.filter !== 'groups') {
      for (const { community, children } of tree) {
        const kids = children.filter((c) => okFilter(c) && (match(c) || match(community)));
        if (!kids.length) continue;
        html += `<section class="card group-card">
          <div class="group-head"><div class="group-icon">${icon('community')}</div>
            <div class="meta"><h3>${esc(community.name)}</h3><span class="small muted">Community${community.size ? ` · ${community.size} members` : ''}</span></div></div>
          ${kids.map((c) => this.row(c)).join('')}
        </section>`;
      }
    }
    if (st.filter !== 'communities') {
      const gs = groups.filter((c) => okFilter(c) && match(c));
      if (gs.length) {
        html += `<section class="card group-card">
          <div class="group-head"><div class="group-icon plain">${icon('chat')}</div>
            <div class="meta"><h3>Other groups</h3><span class="small muted">Groups that are not part of a community</span></div></div>
          ${gs.map((c) => this.row(c)).join('')}
        </section>`;
      }
    }
    list.innerHTML = html || '<div class="card empty"><h3>Nothing matches</h3><p>Try a different search or filter.</p></div>';
    this.renderBar(el);
  },
  row(c) {
    const checked = S.communities.selected.has(c.id);
    const badges = [];
    if (c.type === 'announcement') badges.push('<span class="badge badge-outline">Admins only</span>');
    if (c.isAdmin) badges.push(`<span class="badge badge-green">${icon('shield')}Admin</span>`);
    if (!c.canSend) badges.push(`<span class="badge badge-red" title="${esc(c.reason)}">Can't post</span>`);
    const sub = c.type === 'announcement' ? 'Reaches everyone in the community' : c.type === 'subgroup' ? 'Group in this community' : 'Group';
    return `<label class="chat-row ${c.canSend ? '' : 'disabled'}" title="${esc(c.canSend ? '' : c.reason)}">
      <input type="checkbox" data-pick value="${esc(c.id)}" ${checked ? 'checked' : ''} ${c.canSend ? '' : 'disabled'}>
      ${icon(c.type === 'announcement' ? 'megaphone' : 'chat')}
      <span class="name"><strong>${esc(chatLabel(c))}</strong><small>${sub}${c.size ? ` · ${c.size} members` : ''}</small></span>
      <span class="badges">${badges.join('')}</span>
    </label>`;
  },
  renderBar(el) {
    const n = S.communities.selected.size;
    $('#select-bar', el).innerHTML = n ? `<div class="select-bar"><strong>${plural(n, 'chat')} selected</strong>
      <div class="row-gap"><button class="btn btn-ghost btn-sm" data-act="clear">Clear</button>
      <button class="btn btn-primary" data-act="create">${icon('plus')}Create schedule</button></div></div>` : '';
  },
  async onClick(e, el) {
    const f = e.target.closest('[data-filter]');
    if (f) {
      S.communities.filter = f.dataset.filter;
      $$('#chat-filter .chip', el).forEach((c) => c.setAttribute('aria-pressed', String(c === f)));
      this.update(el);
      return;
    }
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    if (btn.dataset.act === 'refresh') {
      await withBusy(btn, async () => {
        const r = await api('POST', '/chats/refresh');
        S.chats = r.chats;
        S.chatsLive = true;
        this.update(el);
        toast(`Found ${plural(r.chats.length, 'chat')}.`);
      });
    } else if (btn.dataset.act === 'clear') {
      S.communities.selected.clear();
      this.update(el);
    } else if (btn.dataset.act === 'create') {
      openEditor(null, { preselect: [...S.communities.selected] });
    }
  },
};

// ===== Schedules =====
function campaignState(c) {
  if (c.schedule.type === 'manual') return { label: 'Manual', cls: 'badge-blue' };
  if (!c.active) return { label: 'Paused', cls: '' };
  if (!c.nextRunAt && c.lastRunAt) return { label: 'Completed', cls: '' };
  return { label: 'Active', cls: 'badge-green' };
}

function runSummary(c) {
  const r = c.lastRun;
  if (!r) return '<span class="faint">Not sent yet</span>';
  const ok = r.sent + r.delivered + r.read;
  const bad = r.failed + r.missed;
  const waiting = r.queued + r.sending;
  const parts = [`<a class="badge ${ok ? 'badge-green' : ''}" href="#/inbox?campaign=${esc(c.id)}">${icon('check')}${ok}/${r.total} sent</a>`];
  if (bad) parts.push(`<a class="badge badge-red" href="#/inbox?campaign=${esc(c.id)}&status=failed,missed">${icon('alert')}${bad} not sent</a>`);
  if (waiting) parts.push(`<a class="badge" href="#/inbox?campaign=${esc(c.id)}&status=queued,sending">${icon('clock')}${waiting} waiting</a>`);
  return `<span class="run-summary">${parts.join('')}<span class="faint small">${esc(fmtDate(c.lastRunAt))}</span></span>`;
}

views.schedules = {
  mount(el) {
    el.innerHTML = `
      <div class="page-head">
        <div><h1>Schedules</h1><p>Saved messages that go out to your communities automatically. Set one up once and it keeps sending.</p></div>
        <div class="actions"><button class="btn btn-primary" data-act="new">${icon('plus')}New schedule</button></div>
      </div>
      <div id="campaign-list"></div>`;
    el.addEventListener('click', (e) => this.onClick(e));
    el.addEventListener('change', (e) => {
      const t = e.target.closest('[data-toggle]');
      if (t) this.toggle(t.dataset.toggle, t.checked, t);
    });
    this.update(el);
  },
  update(el) {
    const list = $('#campaign-list', el);
    if (!S.campaigns.length) {
      list.innerHTML = `<div class="card empty"><div class="icon-wrap">${icon('calendar', 'i-lg')}</div>
        <h3>No schedules yet</h3>
        <p>Write a message, pick the communities, choose when it goes out. From then on it sends by itself.</p>
        <button class="btn btn-primary" data-act="new">${icon('plus')}Create your first schedule</button></div>`;
      return;
    }
    list.innerHTML = `<div class="campaign-grid">${S.campaigns.map((c) => this.card(c)).join('')}</div>`;
  },
  card(c) {
    const st = campaignState(c);
    const names = c.targets.map((t) => {
      const chat = S.chats.find((x) => x.id === t.id);
      return chat ? chatFullName(chat) : t.name;
    });
    const shown = names.slice(0, 3).map(esc).join(', ') + (names.length > 3 ? ` +${names.length - 3} more` : '');
    let next;
    if (c.schedule.type === 'manual') next = '<span class="faint">When you click Send now</span>';
    else if (!c.active) next = '<span class="faint">Paused</span>';
    else if (c.nextRunAt) next = `${esc(fmtDate(c.nextRunAt))} <span class="faint">· ${esc(rel(c.nextRunAt))}</span>`;
    else next = '<span class="faint">No more sends</span>';
    const toggle = c.schedule.type === 'manual' ? '' : `<label class="switch" title="${c.active ? 'Pause' : 'Resume'} this schedule">
      <input type="checkbox" data-toggle="${esc(c.id)}" ${c.active ? 'checked' : ''}><span class="track"></span><span class="sr-only">Active</span></label>`;
    return `<article class="card campaign ${c.active || c.schedule.type === 'manual' ? '' : 'paused'}">
      <div class="c-head"><h3>${esc(c.name)}</h3><span class="badge ${st.cls}">${st.label}</span>${toggle}</div>
      <div class="c-msg">${bubbleHtml({ text: c.message.text, media: c.media, time: '', ticks: false })}</div>
      <dl class="c-meta">
        <dt>${icon('calendar', 'i-sm')}When</dt><dd>${esc(c.summary)}</dd>
        <dt>${icon('clock', 'i-sm')}Next</dt><dd>${next}</dd>
        <dt>${icon('users', 'i-sm')}To</dt><dd>${plural(c.targets.length, 'chat')}: ${shown}</dd>
        <dt>${icon('history', 'i-sm')}Last</dt><dd>${runSummary(c)}</dd>
      </dl>
      <div class="c-actions">
        <button class="btn btn-sm btn-primary" data-act="run" data-id="${esc(c.id)}" data-busy="Queuing">${icon('send', 'i-sm')}Send now</button>
        <button class="btn btn-sm" data-act="edit" data-id="${esc(c.id)}">${icon('edit', 'i-sm')}Edit</button>
        <span class="spacer"></span>
        <button class="btn btn-sm btn-ghost btn-icon" data-act="dup" data-id="${esc(c.id)}" title="Duplicate" aria-label="Duplicate">${icon('copy', 'i-sm')}</button>
        <button class="btn btn-sm btn-ghost btn-icon" data-act="del" data-id="${esc(c.id)}" title="Delete" aria-label="Delete">${icon('trash', 'i-sm')}</button>
      </div>
    </article>`;
  },
  async toggle(id, active, input) {
    try {
      const c = await api('POST', `/campaigns/${id}/toggle`, { active });
      upsertCampaign(c);
      toast(active ? `Resumed. Next send ${c.nextRunAt ? fmtDate(c.nextRunAt) : 'not scheduled'}.` : 'Paused. Nothing will be sent until you resume it.');
    } catch (err) {
      input.checked = !active;
      toast(err.message, 'error');
    }
  },
  async onClick(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const c = S.campaigns.find((x) => x.id === btn.dataset.id);
    const act = btn.dataset.act;
    if (act === 'new') openEditor(null);
    else if (act === 'edit') openEditor(c);
    else if (act === 'run') {
      const offline = S.wa.status !== 'connected';
      const ok = await confirmDialog({
        title: `Send "${c.name}" now?`,
        body: `It will go to ${plural(c.targets.length, 'chat')}, one at a time.${offline ? '<br><br><b>WhatsApp is not connected.</b> The messages will wait in the Inbox and go out as soon as you connect.' : ''}`,
        confirm: 'Send now',
      });
      if (!ok) return;
      await withBusy(btn, async () => {
        await api('POST', `/campaigns/${c.id}/run`);
        toast('Queued. Follow progress in the Inbox.');
      });
    } else if (act === 'dup') {
      await withBusy(btn, async () => {
        const copy = await api('POST', `/campaigns/${c.id}/duplicate`);
        upsertCampaign(copy);
        openEditor(copy);
      });
    } else if (act === 'del') {
      const ok = await confirmDialog({
        title: 'Delete this schedule?',
        body: `"${esc(c.name)}" will stop sending. Messages already sent stay in the Inbox.`,
        confirm: 'Delete',
        danger: true,
      });
      if (!ok) return;
      await withBusy(btn, async () => {
        await api('DELETE', `/campaigns/${c.id}`);
        S.campaigns = S.campaigns.filter((x) => x.id !== c.id);
        refresh('schedules');
        toast('Schedule deleted.');
      });
    }
  },
};

function upsertCampaign(c) {
  const i = S.campaigns.findIndex((x) => x.id === c.id);
  if (i === -1) S.campaigns.unshift(c);
  else S.campaigns[i] = c;
  refresh('schedules');
}

// ===== Schedule editor =====
const WEEKDAYS = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun']];
const TYPES = [['once', 'One time'], ['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['manual', 'Manual'], ['cron', 'Custom']];

function openEditor(campaign, { preselect = [] } = {}) {
  const defaults = { date: todayInTz(), times: [nextHourInTz()], days: [1], monthDays: [1], cron: '0 9 * * 1-5' };
  const d = {
    name: campaign?.name || '',
    text: campaign?.message.text || '',
    media: campaign?.media || null,
    targets: campaign ? campaign.targets.map((t) => t.id) : [...preselect],
    targetNames: new Map((campaign?.targets || []).map((t) => [t.id, t.name])),
    schedule: { type: 'weekly', ...defaults, ...(campaign ? structuredClone(campaign.schedule) : {}) },
    active: campaign ? campaign.active : true,
  };
  if (!d.schedule.times?.length) d.schedule.times = defaults.times;
  const snapshot = () => JSON.stringify([d.name, d.text, d.media?.id, [...d.targets].sort(), d.schedule, d.active]);
  const initial = snapshot();
  let pickQ = '';
  let uploading = false;

  const m = openModal(`
    <div class="modal-head"><h2>${campaign ? 'Edit schedule' : 'New schedule'}</h2>
      <button class="btn btn-ghost btn-icon" data-close aria-label="Close">${icon('x')}</button></div>
    <div class="modal-body">
      <div class="editor">
        <section>
          <label class="field"><span>Name</span>
            <input type="text" id="ed-name" maxlength="120" placeholder="e.g. Monday motivation, Weekly class reminder" value="${esc(d.name)}">
            <span class="hint">Only you see this.</span></label>

          <div class="field"><span>Message</span>
            <div class="composer">
              <div class="fmt-bar" role="toolbar" aria-label="Formatting">
                <button type="button" data-wrap="*" title="Bold"><b>B</b></button>
                <button type="button" data-wrap="_" title="Italic"><i>I</i></button>
                <button type="button" data-wrap="~" title="Strikethrough"><s>S</s></button>
                <button type="button" data-wrap="\`\`\`" title="Monospace" style="font-family:var(--mono);font-size:12px">{ }</button>
                <span class="sep"></span>
                <button type="button" data-prefix="> " title="Quote">❝</button>
                <button type="button" data-prefix="- " title="Bulleted list">•</button>
                <button type="button" data-prefix="1. " title="Numbered list" style="font-size:12px">1.</button>
              </div>
              <textarea id="ed-text" placeholder="Write the message for your communities…">${esc(d.text)}</textarea>
              <div class="composer-foot">
                <span class="hint" id="ed-count"></span>
                <button type="button" class="btn btn-sm btn-ghost" data-act="attach" id="ed-attach-btn">${icon('clip', 'i-sm')}Attach image, video or file</button>
                <input type="file" id="ed-file" hidden accept="image/jpeg,image/png,image/webp,video/mp4,video/3gpp,video/quicktime,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.zip">
              </div>
            </div>
            <div id="ed-attachment"></div>
          </div>

          <div class="field"><span>Send to</span>
            <div class="picker">
              <div class="picker-head">
                <label class="input-icon">${icon('search')}<input type="search" id="ed-pick-q" placeholder="Search"></label>
                <button type="button" class="btn btn-sm" data-act="pick-all">Select all I can post in</button>
                <button type="button" class="btn btn-sm btn-ghost" data-act="pick-none">Clear</button>
              </div>
              <div class="picker-list" id="ed-pick-list"></div>
              <div class="picker-foot" id="ed-pick-foot"></div>
            </div>
          </div>
        </section>

        <section>
          <div class="field"><span>When to send</span>
            <div class="when-box">
              <div class="seg" role="group" aria-label="Repeat" id="ed-type">
                ${TYPES.map(([v, l]) => `<button type="button" data-type="${v}" aria-pressed="${d.schedule.type === v}">${l}</button>`).join('')}
              </div>
              <div id="ed-when"></div>
              <p class="hint">${icon('globe', 'i-sm')} Times are in <b>${esc(tz())}</b>. Change it in Settings.</p>
              <div id="ed-runs"></div>
            </div>
          </div>
          <div class="field"><span>Preview</span>
            <div class="phone-preview"><div class="ph-head">How it looks in WhatsApp</div><div id="ed-preview"></div></div>
          </div>
          <label class="switch" id="ed-active-wrap"><input type="checkbox" id="ed-active" ${d.active ? 'checked' : ''}><span class="track"></span>Schedule is on</label>
        </section>
      </div>
    </div>
    <div class="modal-foot">
      <span class="left form-error" id="ed-error"></span>
      <button class="btn" data-close>Cancel</button>
      <button class="btn" data-act="save-send" data-busy="Saving">${icon('send', 'i-sm')}Save &amp; send now</button>
      <button class="btn btn-primary" data-act="save" data-busy="Saving">${icon('check', 'i-sm')}Save schedule</button>
    </div>`, { size: 'modal-lg', backdropClose: false, onClose: () => { S.editorOnChats = null; } });

  const el = m.el;
  const textEl = $('#ed-text', el);

  m.requestClose = async () => {
    if (snapshot() !== initial && !(await confirmDialog({ title: 'Discard changes?', body: 'Your edits to this schedule will be lost.', confirm: 'Discard', danger: true }))) return;
    m.close();
  };

  // ----- message
  const renderPreview = () => {
    const time = d.schedule.type === 'manual' || d.schedule.type === 'cron' ? fmtTime(new Date().toISOString()) : d.schedule.times[0];
    $('#ed-preview', el).innerHTML = bubbleHtml({ text: d.text, media: d.media, time });
    const n = d.text.length;
    $('#ed-count', el).textContent = `${n.toLocaleString()} character${n === 1 ? '' : 's'}${d.media && n > 1024 ? ' · long captions may be cut off' : ''}`;
  };
  textEl.addEventListener('input', () => { d.text = textEl.value; renderPreview(); });

  $('.fmt-bar', el).addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const { selectionStart: s, selectionEnd: t, value } = textEl;
    if (b.dataset.wrap) {
      const w = b.dataset.wrap;
      const sel = value.slice(s, t);
      textEl.setRangeText(`${w}${sel || ''}${w}`, s, t, 'end');
      if (!sel) textEl.selectionStart = textEl.selectionEnd = s + w.length;
    } else if (b.dataset.prefix) {
      const lineStart = value.lastIndexOf('\n', s - 1) + 1;
      const block = value.slice(lineStart, t);
      const lines = block.split('\n');
      const out = lines.map((l, i) => (b.dataset.prefix === '1. ' ? `${i + 1}. ` : b.dataset.prefix) + l).join('\n');
      textEl.setRangeText(out, lineStart, t, 'end');
    }
    textEl.focus();
    d.text = textEl.value;
    renderPreview();
  });

  const renderAttachment = () => {
    const box = $('#ed-attachment', el);
    $('#ed-attach-btn', el).hidden = !!d.media;
    if (uploading) {
      box.innerHTML = '<div class="attachment" style="margin-top:10px"><span class="spinner"></span><div class="info">Uploading…</div></div>';
      return;
    }
    if (!d.media) { box.innerHTML = ''; return; }
    const md = d.media;
    const thumb = md.kind === 'image' ? `<img src="/api/media/${esc(md.id)}" alt="">` : icon(md.kind === 'video' ? 'video' : 'file');
    const how = md.kind === 'image' ? 'Sent as a photo' : md.kind === 'video' ? 'Sent as a video' : 'Sent as a document';
    box.innerHTML = `<div class="attachment" style="margin-top:10px"><div class="thumb">${thumb}</div>
      <div class="info"><strong>${esc(md.fileName)}</strong><span class="muted">${how} · ${fmtSize(md.size)}${d.text ? ' · message becomes the caption' : ''}</span></div>
      <button type="button" class="btn btn-sm btn-ghost" data-act="remove-media">${icon('x', 'i-sm')}Remove</button></div>`;
  };

  $('#ed-file', el).addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    uploading = true;
    renderAttachment();
    try {
      const fd = new FormData();
      fd.append('file', file);
      d.media = await api('POST', '/media', fd);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      uploading = false;
      renderAttachment();
      renderPreview();
    }
  });

  // ----- targets
  const renderPicker = () => {
    const q = pickQ.trim().toLowerCase();
    const { tree, groups } = chatTree(S.chats);
    const rows = (list) => list.map((c) => {
      const checked = d.targets.includes(c.id);
      return `<label class="pick-row ${c.canSend ? '' : 'disabled'}" title="${esc(c.canSend ? '' : c.reason)}">
        <input type="checkbox" data-target="${esc(c.id)}" ${checked ? 'checked' : ''} ${c.canSend || checked ? '' : 'disabled'}>
        ${icon(c.type === 'announcement' ? 'megaphone' : 'chat', 'i-sm')}
        <span class="name">${esc(chatLabel(c))}</span>
        <small>${c.canSend ? (c.size ? `${c.size}` : '') : "can't post"}</small></label>`;
    }).join('');
    let html = '';
    for (const { community, children } of tree) {
      const kids = children.filter((c) => !q || c.name.toLowerCase().includes(q) || community.name.toLowerCase().includes(q));
      if (!kids.length) continue;
      html += `<div class="pick-group"><span>${esc(community.name)}</span><button type="button" data-pick-group="${esc(community.id)}">Select all</button></div>${rows(kids)}`;
    }
    const gs = groups.filter((c) => !q || c.name.toLowerCase().includes(q));
    if (gs.length) html += `<div class="pick-group"><span>Other groups</span></div>${rows(gs)}`;
    const known = new Set(S.chats.map((c) => c.id));
    const missing = d.targets.filter((id) => !known.has(id));
    if (missing.length) {
      html += `<div class="pick-group"><span>Not found on this number</span></div>${missing.map((id) => `<label class="pick-row"><input type="checkbox" data-target="${esc(id)}" checked>
        ${icon('alert', 'i-sm')}<span class="name">${esc(d.targetNames.get(id) || id)}</span><small>left or removed?</small></label>`).join('')}`;
    }
    if (!S.chats.length) {
      html = `<div class="empty" style="padding:28px 16px"><p>${S.wa.status === 'connected' ? 'No groups found for this number.' : 'Connect WhatsApp to see your communities here.'}</p>
        ${S.wa.status === 'connected' ? '' : '<a class="btn btn-sm" href="#/connect" data-close>Go to Connect</a>'}</div>${html}`;
    }
    $('#ed-pick-list', el).innerHTML = html || '<p class="muted" style="padding:16px">Nothing matches your search.</p>';
    renderPickFoot();
  };
  const renderPickFoot = () => {
    const n = d.targets.length;
    $('#ed-pick-foot', el).innerHTML = n ? `<b>${plural(n, 'chat')}</b> selected` : 'Nothing selected yet';
  };
  S.editorOnChats = renderPicker;

  $('#ed-pick-q', el).addEventListener('input', debounce((e) => { pickQ = e.target.value; renderPicker(); }, 120));
  $('#ed-pick-list', el).addEventListener('change', (e) => {
    const cb = e.target.closest('[data-target]');
    if (!cb) return;
    const id = cb.dataset.target;
    d.targets = cb.checked ? [...new Set([...d.targets, id])] : d.targets.filter((x) => x !== id);
    renderPickFoot();
  });
  $('#ed-pick-list', el).addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick-group]');
    if (!b) return;
    e.preventDefault();
    const ids = S.chats.filter((c) => c.parentId === b.dataset.pickGroup && c.canSend).map((c) => c.id);
    const all = ids.every((id) => d.targets.includes(id));
    d.targets = all ? d.targets.filter((id) => !ids.includes(id)) : [...new Set([...d.targets, ...ids])];
    renderPicker();
  });

  // ----- schedule
  const timesHtml = (multi) => `<div class="field"><span class="label">${multi ? 'Send times' : 'Time'}</span><div class="time-list">
    ${d.schedule.times.map((t, i) => `<span class="time-item"><input type="time" data-time="${i}" value="${esc(t)}" required>
      ${multi && d.schedule.times.length > 1 ? `<button type="button" class="btn btn-ghost btn-icon" data-del-time="${i}" aria-label="Remove time">${icon('x', 'i-sm')}</button>` : ''}</span>`).join('')}
    ${multi ? `<button type="button" class="btn btn-sm btn-ghost" data-act="add-time">${icon('plus', 'i-sm')}Add time</button>` : ''}</div></div>`;

  const renderWhen = () => {
    const sc = d.schedule;
    $$('#ed-type button', el).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.type === sc.type)));
    $('#ed-active-wrap', el).hidden = sc.type === 'manual';
    let html = '';
    if (sc.type === 'once') {
      sc.times = sc.times.slice(0, 1);
      html = `<div class="row-gap" style="align-items:flex-end">
        <label class="field"><span>Date</span><input type="date" id="ed-date" value="${esc(sc.date)}" min="${todayInTz()}"></label>
        ${timesHtml(false)}</div>`;
    } else if (sc.type === 'daily') {
      html = timesHtml(true);
    } else if (sc.type === 'weekly') {
      html = `<div class="field"><span class="label">On these days</span><div class="chips">
        ${WEEKDAYS.map(([v, l]) => `<button type="button" class="chip day-chip" data-day="${v}" aria-pressed="${sc.days.includes(v)}">${l}</button>`).join('')}</div></div>${timesHtml(true)}`;
    } else if (sc.type === 'monthly') {
      const days = Array.from({ length: 31 }, (_, i) => i + 1);
      html = `<div class="field"><span class="label">On these days of the month</span><div class="mday-grid">
        ${days.map((n) => `<button type="button" class="chip" data-mday="${n}" aria-pressed="${sc.monthDays.includes(n)}">${n}</button>`).join('')}
        <button type="button" class="chip wide" data-mday="L" aria-pressed="${sc.monthDays.includes('L')}">Last day</button></div>
        <span class="hint">Months without a 29th, 30th or 31st skip that day. Use "Last day" for month-end.</span></div>${timesHtml(true)}`;
    } else if (sc.type === 'manual') {
      html = '<p class="muted">Saved as a ready-to-go message. It only goes out when you click <b>Send now</b>.</p>';
    } else if (sc.type === 'cron') {
      html = `<label class="field"><span>Cron expression</span><input type="text" id="ed-cron" value="${esc(sc.cron)}" spellcheck="false" style="font-family:var(--mono)">
        <span class="hint">minute hour day-of-month month day-of-week. Example: <code>0 9 * * 1-5</code> is 09:00 on weekdays, <code>30 20 * * 0</code> is Sundays 20:30.</span></label>`;
    }
    $('#ed-when', el).innerHTML = html;
    renderPreview();
    loadRuns();
  };

  const loadRuns = debounce(async () => {
    const box = $('#ed-runs', el);
    if (!box) return;
    if (d.schedule.type === 'manual') { box.innerHTML = ''; return; }
    try {
      const r = await api('POST', '/schedule/preview', { schedule: d.schedule });
      if (r.error) { box.innerHTML = `<div class="alert alert-amber">${icon('alert')}<span>${esc(r.error)}</span></div>`; return; }
      if (!r.runs.length) { box.innerHTML = `<div class="alert alert-amber">${icon('alert')}<span>This time has already passed. Pick a later date or time.</span></div>`; return; }
      box.innerHTML = `<div class="field"><span class="label">Next ${r.runs.length === 1 ? 'send' : `${r.runs.length} sends`}</span><ul class="next-runs">
        ${r.runs.map((iso) => `<li><span>${esc(fmtDate(iso))}</span><span>${esc(rel(iso))}</span></li>`).join('')}</ul></div>`;
    } catch { /* ignore preview errors */ }
  }, 200);

  $('#ed-type', el).addEventListener('click', (e) => {
    const b = e.target.closest('[data-type]');
    if (!b) return;
    d.schedule.type = b.dataset.type;
    renderWhen();
  });
  $('#ed-when', el).addEventListener('click', (e) => {
    const day = e.target.closest('[data-day]');
    const mday = e.target.closest('[data-mday]');
    const del = e.target.closest('[data-del-time]');
    const sc = d.schedule;
    if (day) {
      const v = Number(day.dataset.day);
      sc.days = sc.days.includes(v) ? sc.days.filter((x) => x !== v) : [...sc.days, v];
    } else if (mday) {
      const v = mday.dataset.mday === 'L' ? 'L' : Number(mday.dataset.mday);
      sc.monthDays = sc.monthDays.includes(v) ? sc.monthDays.filter((x) => x !== v) : [...sc.monthDays, v];
    } else if (del) {
      sc.times.splice(Number(del.dataset.delTime), 1);
    } else if (e.target.closest('[data-act="add-time"]')) {
      const last = sc.times.at(-1) || '09:00';
      const h = (Number(last.slice(0, 2)) + 3) % 24;
      sc.times.push(`${String(h).padStart(2, '0')}:${last.slice(3)}`);
    } else return;
    renderWhen();
  });
  $('#ed-when', el).addEventListener('input', (e) => {
    const sc = d.schedule;
    if (e.target.dataset.time !== undefined) sc.times[Number(e.target.dataset.time)] = e.target.value;
    else if (e.target.id === 'ed-date') sc.date = e.target.value;
    else if (e.target.id === 'ed-cron') sc.cron = e.target.value;
    else return;
    renderPreview();
    loadRuns();
  });

  $('#ed-name', el).addEventListener('input', (e) => { d.name = e.target.value; });
  $('#ed-active', el).addEventListener('change', (e) => { d.active = e.target.checked; });

  // ----- actions
  el.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'attach') $('#ed-file', el).click();
    else if (act === 'remove-media') { d.media = null; renderAttachment(); renderPreview(); }
    else if (act === 'pick-all') {
      d.targets = [...new Set([...d.targets, ...S.chats.filter((c) => c.canSend).map((c) => c.id)])];
      renderPicker();
    } else if (act === 'pick-none') { d.targets = []; renderPicker(); }
    else if (act === 'save' || act === 'save-send') save(btn, act === 'save-send');
  });

  async function save(btn, sendNow) {
    $('#ed-error', el).textContent = '';
    const known = new Map(S.chats.map((c) => [c.id, c]));
    const payload = {
      name: d.name.trim(),
      message: { text: d.text, mediaId: d.media?.id || null },
      targets: d.targets.map((id) => ({ id, name: known.has(id) ? chatFullName(known.get(id)) : d.targetNames.get(id) || id })),
      schedule: d.schedule,
      active: d.active,
      sendNow,
    };
    if (sendNow && !(await confirmDialog({
      title: 'Save and send now?',
      body: `The message goes out right away to ${plural(payload.targets.length, 'chat')}${d.schedule.type === 'manual' ? '' : ', and then keeps following the schedule'}.`,
      confirm: 'Save & send',
    }))) return;
    await withBusy(btn, async () => {
      try {
        const saved = campaign ? await api('PUT', `/campaigns/${campaign.id}`, payload) : await api('POST', '/campaigns', payload);
        upsertCampaign(saved);
        m.close();
        S.communities.selected.clear();
        const next = saved.nextRunAt ? ` Next send: ${fmtDate(saved.nextRunAt)}.` : '';
        toast(sendNow ? `Saved and sending now.${next}` : `Schedule saved.${next}`);
        if (current?.name !== 'schedules') location.hash = '#/schedules';
      } catch (err) {
        $('#ed-error', el).textContent = err.message;
        throw err;
      }
    });
  }

  renderAttachment();
  renderPicker();
  renderWhen();
  if (!campaign) $('#ed-name', el).focus();
}

// ===== Inbox =====
function inboxQuery() {
  const f = S.inbox.filters;
  const p = new URLSearchParams();
  if (f.status) p.set('status', f.status);
  if (f.campaignId) p.set('campaignId', f.campaignId);
  if (f.chatId) p.set('chatId', f.chatId);
  if (f.q) p.set('q', f.q);
  p.set('limit', String(S.inbox.limit));
  return p.toString();
}
function matchesInbox(d) {
  const f = S.inbox.filters;
  return (!f.status || f.status.split(',').includes(d.status))
    && (!f.campaignId || d.campaignId === f.campaignId)
    && (!f.chatId || d.chatId === f.chatId)
    && (!f.q || `${d.chatName} ${d.campaignName} ${d.text}`.toLowerCase().includes(f.q.toLowerCase()));
}

views.inbox = {
  async mount(el) {
    const f = S.inbox.filters;
    f.campaignId = S.params.get('campaign') || '';
    f.status = S.params.get('status') || '';
    f.chatId = S.params.get('chat') || '';
    S.inbox.selected.clear();
    const chatOptions = [...new Map([...S.chats.filter((c) => c.type !== 'community').map((c) => [c.id, chatFullName(c)])]).entries()]
      .sort((a, b) => a[1].localeCompare(b[1]));
    el.innerHTML = `
      <div class="page-head">
        <div><h1>Inbox</h1><p>Every message sent to your communities, with its status. Anything that didn't go out can be resent.</p></div>
        <div class="actions" id="inbox-actions"></div>
      </div>
      <div class="tiles" id="tiles"></div>
      <div class="filters">
        <label class="input-icon">${icon('search')}<input type="search" id="in-q" placeholder="Search messages, communities, schedules" value="${esc(f.q)}"></label>
        <select id="in-status" aria-label="Status">
          <option value="">All statuses</option>
          ${[['queued,sending', 'Waiting to send'], ['sent', 'Sent'], ['delivered', 'Delivered'], ['read', 'Read'], ['failed', 'Failed'], ['missed', 'Missed'], ['failed,missed', 'Failed or missed'], ['cancelled', 'Cancelled']]
    .map(([v, l]) => `<option value="${v}" ${f.status === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        <select id="in-campaign" aria-label="Schedule"><option value="">All schedules</option>
          ${S.campaigns.map((c) => `<option value="${esc(c.id)}" ${f.campaignId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
        <select id="in-chat" aria-label="Community or group"><option value="">All chats</option>
          ${chatOptions.map(([id, name]) => `<option value="${esc(id)}" ${f.chatId === id ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select>
      </div>
      <section class="card inbox-list" id="inbox-card"><div class="center-state" style="min-height:200px"><span class="spinner"></span></div></section>
      <p class="hint" style="margin-top:12px">In groups, <b>Delivered</b> and <b>Read</b> mean at least one member received or read it.</p>`;

    const reload = () => { S.inbox.selected.clear(); this.load(el); };
    $('#in-q', el).addEventListener('input', debounce((e) => { f.q = e.target.value.trim(); reload(); }, 250));
    $('#in-status', el).addEventListener('change', (e) => { f.status = e.target.value; reload(); });
    $('#in-campaign', el).addEventListener('change', (e) => { f.campaignId = e.target.value; reload(); });
    $('#in-chat', el).addEventListener('change', (e) => { f.chatId = e.target.value; reload(); });
    el.addEventListener('click', (e) => this.onClick(e, el));
    el.addEventListener('change', (e) => {
      const cb = e.target.closest('[data-sel]');
      if (!cb) return;
      if (cb.dataset.sel === 'all') {
        S.inbox.items.forEach((d) => (cb.checked ? S.inbox.selected.add(d.id) : S.inbox.selected.delete(d.id)));
      } else if (cb.checked) S.inbox.selected.add(cb.dataset.sel);
      else S.inbox.selected.delete(cb.dataset.sel);
      this.renderList(el);
    });
    this.renderTop(el);
    await this.load(el);
  },
  async load(el) {
    S.inbox.loading = true;
    try {
      const r = await api('GET', `/deliveries?${inboxQuery()}`);
      S.inbox.items = r.items;
      S.inbox.total = r.total;
      S.stats = r.stats;
    } catch (err) {
      toast(err.message, 'error');
    }
    S.inbox.loading = false;
    if (!el.isConnected) return;
    renderChrome();
    this.renderTop(el);
    this.renderList(el);
  },
  update(el) {
    this.renderTop(el);
    this.renderList(el);
  },
  renderTop(el) {
    const c = S.stats.counts || {};
    const waiting = (c.queued || 0) + (c.sending || 0);
    const tiles = [
      ['queued,sending', 'Waiting to send', waiting, 'clock', ''],
      ['sent,delivered,read', 'Sent (last 24h)', S.stats.sent24h || 0, 'check', 'green'],
      ['failed', 'Failed', c.failed || 0, 'alert', c.failed ? 'red' : ''],
      ['missed', 'Missed', c.missed || 0, 'clock', c.missed ? 'amber' : ''],
    ];
    $('#tiles', el).innerHTML = tiles.map(([st, k, v, ic, cls]) => `<button class="tile ${cls}" data-tile="${st}"><div class="k">${icon(ic, 'i-sm')}${k}</div><div class="v">${v}</div></button>`).join('');
    const redo = (c.failed || 0) + (c.missed || 0);
    $('#inbox-actions', el).innerHTML = redo
      ? `<button class="btn btn-primary" data-act="resend-all" data-busy="Queuing">${icon('refresh')}Resend all failed &amp; missed (${redo})</button>` : '';
  },
  renderList(el) {
    const card = $('#inbox-card', el);
    const { items, total, selected } = S.inbox;
    if (!items.length) {
      const filtered = Object.values(S.inbox.filters).some(Boolean);
      card.innerHTML = `<div class="empty"><div class="icon-wrap">${icon('inbox', 'i-lg')}</div>
        <h3>${filtered ? 'Nothing matches these filters' : 'No messages yet'}</h3>
        <p>${filtered ? 'Try clearing a filter.' : 'When a schedule runs, every message to every community shows up here with its status.'}</p></div>`;
      return;
    }
    const nSel = [...selected].filter((id) => items.some((d) => d.id === id)).length;
    const allChecked = nSel === items.length;
    const bulk = nSel ? `<div class="bulk-bar"><input type="checkbox" data-sel="all" ${allChecked ? 'checked' : ''} aria-label="Select all">
      <span>${nSel} selected</span><span class="spacer"></span>
      <button class="btn btn-sm" data-act="bulk-resend">${icon('refresh', 'i-sm')}Resend</button>
      <button class="btn btn-sm" data-act="bulk-cancel">${icon('ban', 'i-sm')}Cancel waiting</button>
      <button class="btn btn-sm btn-ghost" data-act="bulk-clear">Clear</button></div>` : '';
    card.innerHTML = `${bulk}<div>${items.map((d) => this.row(d)).join('')}</div>
      ${total > items.length ? `<div class="list-foot"><button class="btn btn-sm" data-act="more">Show more (${total - items.length} older)</button></div>` : ''}`;
  },
  row(d) {
    const snippet = d.text ? d.text.replace(/[*_~`]/g, '').replace(/\s+/g, ' ').slice(0, 140) : '(attachment only)';
    let time;
    if (d.sentAt) time = `<b>Sent</b> ${esc(fmtDate(d.sentAt))}`;
    else if (d.status === 'queued' && d.notBefore) time = `<b>Retrying</b> ${esc(fmtTime(d.notBefore))}`;
    else if (d.status === 'queued' || d.status === 'sending') time = `<b>Due</b> ${esc(fmtDate(d.scheduledFor))}`;
    else if (d.status === 'missed') time = `<b>Was due</b> ${esc(fmtDate(d.scheduledFor))}`;
    else time = `<b>${d.status === 'cancelled' ? 'Cancelled' : 'Tried'}</b> ${esc(fmtDate(d.updatedAt))}`;
    const extra = [d.trigger === 'manual' ? 'Sent manually' : d.trigger === 'resend' ? 'Resend' : '', d.attempts > 1 ? `${d.attempts} attempts` : ''].filter(Boolean).join(' · ');
    const canResend = !['queued', 'sending'].includes(d.status);
    const errCls = d.status === 'failed' ? '' : 'amber';
    const showErr = d.error && ['failed', 'missed', 'queued'].includes(d.status);
    return `<div class="inbox-row" data-id="${esc(d.id)}">
      <input type="checkbox" data-sel="${esc(d.id)}" ${S.inbox.selected.has(d.id) ? 'checked' : ''} aria-label="Select">
      ${statusBadge(d.status)}
      <div class="main-col">
        <div class="title"><span>${esc(d.chatName)}</span></div>
        <div class="sub">${esc(d.campaignName)} · ${esc(snippet)}${d.mediaId ? ' 📎' : ''}</div>
        ${showErr ? `<div class="err ${errCls}">${esc(d.error)}</div>` : ''}
      </div>
      <div class="time">${time}${extra ? `<br>${esc(extra)}` : ''}</div>
      <div class="acts">
        ${canResend ? `<button class="btn btn-sm" data-act="resend" data-id="${esc(d.id)}">${icon('refresh', 'i-sm')}Resend</button>` : ''}
        ${d.status === 'queued' ? `<button class="btn btn-sm btn-ghost" data-act="cancel" data-id="${esc(d.id)}">Cancel</button>` : ''}
        <button class="btn btn-sm btn-ghost btn-icon" data-act="view" data-id="${esc(d.id)}" title="Details" aria-label="Details">${icon('eye', 'i-sm')}</button>
      </div>
    </div>`;
  },
  async resend(ids, btn) {
    const items = S.inbox.items.filter((d) => ids.includes(d.id));
    const already = items.filter((d) => ['sent', 'delivered', 'read'].includes(d.status)).length;
    if (already && !(await confirmDialog({
      title: already === 1 && items.length === 1 ? 'Send this again?' : `Send ${plural(items.length, 'message')} again?`,
      body: `${already === items.length ? (items.length === 1 ? 'This message was already sent' : 'These were already sent') : `${already} of these were already sent`}. Members will get it a second time.`,
      confirm: 'Send again',
    }))) return;
    await withBusy(btn, async () => {
      const r = await api('POST', '/deliveries/resend', { ids });
      toast(r.connected ? `${plural(r.count, 'message')} queued to resend.` : `${plural(r.count, 'message')} queued. They'll go out once WhatsApp is connected.`);
      S.inbox.selected.clear();
    });
  },
  async onClick(e, el) {
    const tile = e.target.closest('[data-tile]');
    if (tile) {
      const st = tile.dataset.tile;
      S.inbox.filters.status = S.inbox.filters.status === st ? '' : st;
      const sel = $('#in-status', el);
      if (![...sel.options].some((o) => o.value === S.inbox.filters.status)) sel.append(new Option('Sent, delivered or read', st));
      sel.value = S.inbox.filters.status;
      this.load(el);
      return;
    }
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const id = btn.dataset.id;
    if (act === 'resend') await this.resend([id], btn);
    else if (act === 'cancel') {
      await withBusy(btn, () => api('POST', '/deliveries/cancel', { ids: [id] }));
    } else if (act === 'view') this.details(id);
    else if (act === 'more') {
      S.inbox.limit += 100;
      await withBusy(btn, () => this.load(el));
    } else if (act === 'resend-all') {
      const n = (S.stats.counts.failed || 0) + (S.stats.counts.missed || 0);
      if (!(await confirmDialog({ title: `Resend ${plural(n, 'message')}?`, body: 'Every failed and missed message will be queued again and sent one by one.', confirm: 'Resend all' }))) return;
      await withBusy(btn, async () => {
        const r = await api('POST', '/deliveries/resend', { allFailed: true });
        toast(`${plural(r.count, 'message')} queued to resend.`);
      });
    } else if (act === 'bulk-resend') await this.resend([...S.inbox.selected], btn);
    else if (act === 'bulk-cancel') {
      await withBusy(btn, async () => {
        const r = await api('POST', '/deliveries/cancel', { ids: [...S.inbox.selected] });
        toast(r.count ? `${plural(r.count, 'message')} cancelled.` : 'Only waiting messages can be cancelled.');
        S.inbox.selected.clear();
        this.renderList(el);
      });
    } else if (act === 'bulk-clear') {
      S.inbox.selected.clear();
      this.renderList(el);
    }
  },
  details(id) {
    const d = S.inbox.items.find((x) => x.id === id);
    if (!d) return;
    const campaign = S.campaigns.find((c) => c.id === d.campaignId);
    const media = d.mediaId ? (campaign?.media?.id === d.mediaId ? campaign.media : { id: d.mediaId, kind: 'document', fileName: 'Attachment' }) : null;
    const rows = [
      ['Status', statusBadge(d.status)],
      ['Community / group', esc(d.chatName)],
      ['Schedule', esc(d.campaignName)],
      ['Due', esc(fmtDate(d.scheduledFor))],
      d.sentAt && ['Sent', esc(fmtDate(d.sentAt))],
      d.deliveredAt && ['Delivered', esc(fmtDate(d.deliveredAt))],
      d.readAt && ['Read', esc(fmtDate(d.readAt))],
      ['Attempts', String(d.attempts)],
      ['Triggered by', d.trigger === 'manual' ? 'Send now' : d.trigger === 'resend' ? 'Resend' : 'Schedule'],
    ].filter(Boolean);
    const canResend = !['queued', 'sending'].includes(d.status);
    const m = openModal(`
      <div class="modal-head"><h2>Message details</h2><button class="btn btn-ghost btn-icon" data-close aria-label="Close">${icon('x')}</button></div>
      <div class="modal-body stack">
        <div class="phone-preview">${bubbleHtml({ text: d.text, media, time: d.sentAt ? fmtTime(d.sentAt) : '', ticks: ['delivered', 'read'].includes(d.status) })}</div>
        ${d.error ? `<div class="alert ${d.status === 'failed' ? 'alert-red' : 'alert-amber'}">${icon('alert')}<span>${esc(d.error)}</span></div>` : ''}
        <ul class="timeline">${rows.map(([k, v]) => `<li><span>${k}</span><span>${v}</span></li>`).join('')}</ul>
      </div>
      <div class="modal-foot"><button class="btn" data-close>Close</button>
        ${canResend ? `<button class="btn btn-primary" data-resend>${icon('refresh', 'i-sm')}Resend</button>` : ''}</div>`, { size: 'modal-md' });
    $('[data-resend]', m.el)?.addEventListener('click', async (e) => {
      await this.resend([d.id], e.currentTarget);
      m.close();
    });
  },
};

// ===== Settings =====
views.settings = {
  mount(el) {
    const s = S.settings;
    const zones = Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : [s.timezone];
    if (!zones.includes(s.timezone)) zones.unshift(s.timezone);
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    el.innerHTML = `
      <div class="page-head"><div><h1>Settings</h1><p>How and when messages go out.</p></div></div>
      <form class="settings" id="settings-form">
        <section class="card">
          <h2>${icon('globe')}Timezone</h2>
          <label class="field"><span>All schedule times use this timezone</span>
            <select name="timezone">${zones.map((z) => `<option ${z === s.timezone ? 'selected' : ''}>${esc(z)}</option>`).join('')}</select>
            ${browserTz !== s.timezone ? `<span class="hint">Your browser is on ${esc(browserTz)}. <button type="button" class="link-btn" data-tz="${esc(browserTz)}">Use ${esc(browserTz)}</button></span>` : ''}</label>
        </section>

        <section class="card">
          <h2>${icon('clock')}Sending pace</h2>
          <p class="muted">Messages go out one at a time. A random pause between each one makes the account look less like a bot, which lowers the risk of WhatsApp restricting the number.</p>
          <div class="two">
            <label class="field"><span>Shortest pause (seconds)</span><input type="number" name="minDelaySec" min="3" max="600" value="${s.minDelaySec}"></label>
            <label class="field"><span>Longest pause (seconds)</span><input type="number" name="maxDelaySec" min="3" max="1800" value="${s.maxDelaySec}"></label>
          </div>
          <label class="switch"><input type="checkbox" name="simulateTyping" ${s.simulateTyping ? 'checked' : ''}><span class="track"></span>Show "typing…" for a moment before each message</label>
        </section>

        <section class="card">
          <h2>${icon('refresh')}Reliability</h2>
          <div class="two">
            <label class="field"><span>Late-send window (minutes)</span><input type="number" name="graceMinutes" min="0" max="1440" value="${s.graceMinutes}">
              <span class="hint">If the app or WhatsApp was offline at send time, still send when it's back if no more than this late. Otherwise it's marked <b>Missed</b> so you can decide.</span></label>
            <label class="field"><span>Automatic retries</span><input type="number" name="maxRetries" min="0" max="5" value="${s.maxRetries}">
              <span class="hint">How many times to retry a failed send before marking it <b>Failed</b>.</span></label>
          </div>
          <label class="field"><span>Keep inbox history for (days)</span><input type="number" name="retentionDays" min="7" max="3650" value="${s.retentionDays}" style="max-width:200px"></label>
        </section>

        <div class="row-gap"><button class="btn btn-primary" type="submit" data-busy="Saving">${icon('check')}Save settings</button>
          <span class="hint">Data folder: <code>${esc(S.dataDir)}</code></span></div>
      </form>
      <div class="settings" style="margin-top:18px"><section class="card" id="accounts-card"><div class="center-state" style="min-height:120px"><span class="spinner"></span></div></section></div>`;
    this.mountAccounts(el);
    const form = $('#settings-form', el);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tz]');
      if (b) { form.timezone.value = b.dataset.tz; b.closest('.hint').remove(); }
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const body = {
        timezone: fd.get('timezone'),
        minDelaySec: Number(fd.get('minDelaySec')),
        maxDelaySec: Number(fd.get('maxDelaySec')),
        simulateTyping: fd.get('simulateTyping') === 'on',
        graceMinutes: Number(fd.get('graceMinutes')),
        maxRetries: Number(fd.get('maxRetries')),
        retentionDays: Number(fd.get('retentionDays')),
      };
      await withBusy(form.querySelector('[type="submit"]'), async () => {
        const tzChanged = body.timezone !== S.settings.timezone;
        S.settings = await api('PUT', '/settings', body);
        if (tzChanged) S.campaigns = (await api('GET', '/campaigns')).campaigns;
        toast(tzChanged ? 'Saved. Schedules now follow the new timezone.' : 'Settings saved.');
      });
    });
  },

  async mountAccounts(el) {
    const card = $('#accounts-card', el);
    card.addEventListener('submit', (e) => this.onAccountSubmit(e, el));
    card.addEventListener('click', (e) => this.onAccountClick(e, el));
    await this.renderAccounts(el);
  },

  async renderAccounts(el) {
    const card = $('#accounts-card', el);
    let users = [];
    try {
      users = (await api('GET', '/users')).users;
    } catch (err) {
      card.innerHTML = `<div class="alert alert-red">${icon('alert')}<span>${esc(err.message)}</span></div>`;
      return;
    }
    const me = users.find((u) => u.isYou);
    card.innerHTML = `
      <h2>${icon('shield')}Accounts</h2>
      <p class="muted">People who can log in to this dashboard. Every account has full access, including sending messages.</p>
      <ul class="account-list">${users.map((u) => `<li>
        <div class="avatar">${esc(u.username.charAt(0).toUpperCase())}</div>
        <div class="who"><strong>${esc(u.username)}</strong><small>Added ${esc(fmtDate(u.createdAt, { weekday: undefined, hour: undefined, minute: undefined, year: 'numeric' }))}</small></div>
        ${u.isYou ? '<span class="badge badge-green">You</span>' : ''}
        ${u.managedByEnv ? '<span class="badge badge-outline" title="Password comes from ADMIN_PASSWORD on the server">Set on server</span>' : ''}
        ${!u.isYou && !u.managedByEnv ? `<button class="btn btn-sm btn-ghost btn-icon" data-remove-user="${esc(u.id)}" data-name="${esc(u.username)}" title="Remove" aria-label="Remove ${esc(u.username)}">${icon('trash', 'i-sm')}</button>` : ''}
      </li>`).join('')}</ul>

      <form class="sub-form" id="add-user-form" autocomplete="off">
        <h3>Add an account</h3>
        <div class="two">
          <label class="field"><span>Username</span><input type="text" name="username" autocapitalize="none" spellcheck="false" minlength="3" maxlength="32" required autocomplete="off"></label>
          <label class="field"><span>Password</span><input type="password" name="password" minlength="8" required autocomplete="new-password"><span class="hint">At least 8 characters. Share it with them privately.</span></label>
        </div>
        <div><button class="btn" type="submit" data-busy="Adding">${icon('plus', 'i-sm')}Add account</button></div>
      </form>

      <form class="sub-form" id="password-form">
        <h3>Change my password</h3>
        ${me?.managedByEnv ? '<p class="muted">Your password comes from <code>ADMIN_PASSWORD</code> on the server. Change it there and restart the app.</p>' : `
        <div class="two">
          <label class="field"><span>Current password</span><input type="password" name="currentPassword" required autocomplete="current-password"></label>
          <label class="field"><span>New password</span><input type="password" name="newPassword" minlength="8" required autocomplete="new-password"></label>
        </div>
        <div><button class="btn" type="submit" data-busy="Saving">${icon('check', 'i-sm')}Change password</button></div>`}
      </form>

      <div class="sub-form"><div class="setting-line"><span class="muted">Signed in as <b>${esc(me?.username || '')}</b></span>
        <button class="btn btn-sm" data-act="logout">${icon('logout', 'i-sm')}Log out</button></div></div>`;
  },

  async onAccountSubmit(e, el) {
    e.preventDefault();
    const f = e.target;
    const btn = f.querySelector('[type="submit"]');
    if (f.id === 'add-user-form') {
      await withBusy(btn, async () => {
        const u = await api('POST', '/users', { username: f.username.value.trim(), password: f.password.value });
        toast(`Account "${u.username}" added.`);
        await this.renderAccounts(el);
      });
    } else if (f.id === 'password-form') {
      await withBusy(btn, async () => {
        await api('POST', '/account/password', { currentPassword: f.currentPassword.value, newPassword: f.newPassword.value });
        f.reset();
        toast('Password changed. Other devices using this account are now logged out.');
      });
    }
  },

  async onAccountClick(e, el) {
    const rm = e.target.closest('[data-remove-user]');
    if (rm) {
      const ok = await confirmDialog({ title: `Remove ${rm.dataset.name}?`, body: 'They will no longer be able to log in. Schedules they made are kept.', confirm: 'Remove', danger: true });
      if (!ok) return;
      await withBusy(rm, async () => {
        await api('DELETE', `/users/${rm.dataset.removeUser}`);
        toast('Account removed.');
        await this.renderAccounts(el);
      });
    } else if (e.target.closest('[data-act="logout"]')) {
      await api('POST', '/logout').catch(() => {});
      location.reload();
    }
  },
};

// ---------------------------------------------------------------- live updates
const refreshStats = debounce(async () => {
  try {
    const st = await api('GET', '/state');
    S.stats = st.stats;
    renderChrome();
    if (current?.name === 'inbox') views.inbox.renderTop(current.el);
  } catch { /* ignore */ }
}, 800);
const refreshCampaigns = debounce(async () => {
  try {
    S.campaigns = (await api('GET', '/campaigns')).campaigns;
    refresh('schedules');
  } catch { /* ignore */ }
}, 1500);

function onDelivery(d) {
  const items = S.inbox.items;
  const i = items.findIndex((x) => x.id === d.id);
  if (i !== -1) items[i] = d;
  else if (matchesInbox(d)) {
    items.unshift(d);
    S.inbox.total += 1;
  }
  if (current?.name === 'inbox') {
    const row = current.el.querySelector(`.inbox-row[data-id="${CSS.escape(d.id)}"]`);
    if (row && i !== -1) row.outerHTML = views.inbox.row(d);
    else if (i === -1 && matchesInbox(d)) views.inbox.renderList(current.el);
  }
  refreshStats();
  refreshCampaigns();
}

let events = null;
function connectEvents() {
  events?.close();
  events = new EventSource('/api/events');
  let opened = false;
  events.addEventListener('open', () => {
    if (opened) reloadAll();
    opened = true;
  });
  events.addEventListener('wa', (e) => {
    const prev = S.wa.status;
    S.wa = JSON.parse(e.data);
    renderChrome();
    refresh('connect');
    if (prev !== S.wa.status) {
      if (S.wa.status === 'connected' && prev !== 'connected' && prev !== 'reconnecting') toast('WhatsApp connected.');
      refresh('communities');
    }
  });
  events.addEventListener('chats', (e) => {
    S.chats = JSON.parse(e.data);
    S.chatsLive = S.wa.status === 'connected';
    refresh('communities');
    refresh('connect');
    S.editorOnChats?.();
  });
  events.addEventListener('delivery', (e) => onDelivery(JSON.parse(e.data)));
  events.addEventListener('campaign', (e) => upsertCampaign(JSON.parse(e.data)));
  events.addEventListener('campaignDeleted', (e) => {
    const { id } = JSON.parse(e.data);
    S.campaigns = S.campaigns.filter((c) => c.id !== id);
    refresh('schedules');
  });
}

async function reloadAll() {
  const [state, chats, campaigns] = await Promise.all([api('GET', '/state'), api('GET', '/chats'), api('GET', '/campaigns')]);
  Object.assign(S, { wa: state.wa, settings: state.settings, stats: state.stats, demo: state.demo, dataDir: state.dataDir });
  S.chats = chats.chats;
  S.chatsLive = chats.live;
  S.campaigns = campaigns.campaigns;
  renderChrome();
  if (current && current.name !== 'settings') {
    if (current.name === 'inbox') views.inbox.load(current.el);
    else views[current.name].update?.(current.el);
  }
}

// Keep "in 2h" style labels fresh.
setInterval(() => { if (current?.name === 'schedules' && !document.hidden) refresh('schedules'); }, 60000);

// ---------------------------------------------------------------- boot
function showScreen(id) {
  for (const screen of ['boot', 'login', 'setup', 'app']) $(`#${screen}`).hidden = screen !== id;
}

function showLogin() {
  events?.close();
  showScreen('login');
  const form = $('#login-form');
  (form.username.value ? form.password : form.username).focus();
}

function showSetup() {
  showScreen('setup');
  $('#setup-form [name="password"]').focus();
}

async function submitAuthForm(e, url, body, errorEl) {
  e.preventDefault();
  errorEl.hidden = true;
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    const r = await api('POST', url, body);
    S.session = { ...S.session, authenticated: true, needsSetup: false, user: r.user };
    e.target.password.value = '';
    await startApp();
  } catch (ex) {
    errorEl.textContent = ex.message;
    errorEl.hidden = false;
  } finally {
    btn.disabled = false;
  }
}

$('#login-form').addEventListener('submit', (e) => {
  const f = e.target;
  submitAuthForm(e, '/login', { username: f.username.value.trim(), password: f.password.value }, $('#login-error'));
});

$('#setup-form').addEventListener('submit', (e) => {
  const f = e.target;
  const err = $('#setup-error');
  if (f.password.value !== f.password2.value) {
    e.preventDefault();
    err.textContent = 'The two passwords are not the same.';
    err.hidden = false;
    return;
  }
  submitAuthForm(e, '/setup', { username: f.username.value.trim(), password: f.password.value }, err).then(() => { f.password2.value = ''; });
});

$('#logout-btn').addEventListener('click', async () => {
  await api('POST', '/logout').catch(() => {});
  location.reload();
});

let started = false;
async function startApp() {
  await reloadAll();
  showScreen('app');
  connectEvents();
  if (!started) {
    started = true;
    window.addEventListener('hashchange', route);
  }
  if (!location.hash) {
    location.replace(S.wa.status === 'connected' || S.campaigns.length ? '#/schedules' : '#/connect');
  }
  route();
}

(async function boot() {
  try {
    S.session = await (await fetch('/api/session')).json();
    S.demo = S.session.demo;
    if (S.session.needsSetup) showSetup();
    else if (!S.session.authenticated) showLogin();
    else await startApp();
  } catch (err) {
    $('#boot').innerHTML = `<div class="card card-pad" style="max-width:420px;text-align:center"><h2>Can't reach the app</h2><p class="muted" style="margin-top:6px">${esc(err.message)}. Is the server running?</p></div>`;
  }
}());
