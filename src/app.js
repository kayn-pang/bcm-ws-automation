import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import express from 'express';
import multer from 'multer';
import { ROOT_DIR } from './config.js';
import { Store, newId } from './store.js';
import { Sender } from './sender.js';
import { Scheduler } from './scheduler.js';
import { computeNextRun, computeNextRuns, describeSchedule, normalizeSchedule, validateSchedule } from './schedule.js';
import { BaileysDriver } from './whatsapp/baileys.js';
import { MockDriver } from './whatsapp/mock.js';

const SESSION_COOKIE = 'cs_session';
const SESSION_DAYS = 30;
const MAX_UPLOAD_MB = 64;
const STATUSES = ['queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'missed', 'cancelled'];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const bad = (message) => new HttpError(400, message);

function loadSecret(file) {
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((p) => p.trim().split('=')).filter(([k, v]) => k && v).map(([k, v]) => [k, decodeURIComponent(v)]));
}

function isValidTimezone(tz) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function mediaKind(mimetype = '') {
  if (/^image\/(jpeg|png|webp)$/.test(mimetype)) return 'image';
  if (/^video\/(mp4|3gpp|quicktime)$/.test(mimetype)) return 'video';
  return 'document';
}

export async function createApp({ config, paths, logger }) {
  const bus = new EventEmitter();
  bus.setMaxListeners(100);
  const store = new Store(paths.db);
  if (!store.settings.timezone) {
    store.settings.timezone = process.env.TZ && isValidTimezone(process.env.TZ)
      ? process.env.TZ
      : Intl.DateTimeFormat().resolvedOptions().timeZone;
    store.touch();
  }

  const wa = config.driver === 'mock'
    ? new MockDriver({ dataDir: config.dataDir, logger, failRate: config.mockFailRate })
    : new BaileysDriver({ authDir: paths.auth, logger });
  const sender = new Sender({ store, wa, bus, logger, uploadsDir: paths.uploads, retryBaseMs: config.retryBaseMs });
  const scheduler = new Scheduler({ store, sender, bus, logger, tickMs: config.tickMs, uploadsDir: paths.uploads });

  // Remember the last known list of groups so schedules can be edited while offline.
  wa.on('state', (state) => bus.emit('wa', state));
  wa.on('chats', (chats) => {
    if (chats.length) {
      store.data.chatsCache = chats;
      // keep stored target names in sync with renamed groups
      const byId = new Map(chats.map((c) => [c.id, c.name]));
      for (const c of store.campaigns) for (const t of c.targets) if (byId.has(t.id)) t.name = byId.get(t.id);
      store.touch();
    }
    bus.emit('chats', chats.length ? chats : store.data.chatsCache || []);
  });

  const listChats = () => {
    const live = wa.isConnected() ? wa.listChats() : [];
    return live.length ? live : store.data.chatsCache || [];
  };

  // ---------- auth ----------
  const secret = loadSecret(paths.secret);
  const authRequired = !!config.adminPassword;
  const pwTag = crypto.createHash('sha256').update(config.adminPassword).digest('hex').slice(0, 16);
  const sign = (ts) => crypto.createHmac('sha256', secret).update(`${ts}.${pwTag}`).digest('hex');
  const makeToken = () => {
    const ts = Date.now().toString(36);
    return `${ts}.${sign(ts)}`;
  };
  const tokenValid = (token) => {
    const [ts, sig] = String(token || '').split('.');
    if (!ts || !sig) return false;
    if (Date.now() - parseInt(ts, 36) > SESSION_DAYS * 86400000) return false;
    const expected = Buffer.from(sign(ts));
    const given = Buffer.from(sig);
    return expected.length === given.length && crypto.timingSafeEqual(expected, given);
  };
  const isAuthed = (req) => !authRequired || tokenValid(parseCookies(req.headers.cookie)[SESSION_COOKIE]);

  const loginAttempts = new Map();

  // ---------- express ----------
  const app = express();
  app.set('trust proxy', 'loopback, linklocal, uniquelocal');
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });
  app.use(express.json({ limit: '2mb' }));
  app.use(express.static(path.join(ROOT_DIR, 'public'), { index: 'index.html' }));

  const api = express.Router();

  api.get('/health', (req, res) => res.json({ ok: true }));

  api.get('/session', (req, res) => {
    res.json({ authRequired, authenticated: isAuthed(req), demo: config.isDemo });
  });

  api.post('/login', (req, res) => {
    const ip = req.ip;
    const now = Date.now();
    const recent = (loginAttempts.get(ip) || []).filter((t) => now - t < 15 * 60000);
    if (recent.length >= 10) throw new HttpError(429, 'Too many attempts. Wait 15 minutes and try again.');
    const given = Buffer.from(String(req.body?.password || ''));
    const real = Buffer.from(config.adminPassword);
    const ok = authRequired && given.length === real.length && crypto.timingSafeEqual(given, real);
    if (!ok) {
      loginAttempts.set(ip, [...recent, now]);
      throw new HttpError(401, 'Wrong password.');
    }
    loginAttempts.delete(ip);
    const secure = req.secure ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${makeToken()}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}${secure}`);
    res.json({ ok: true });
  });

  api.post('/logout', (req, res) => {
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
    res.json({ ok: true });
  });

  // Everything below needs a login. State-changing requests must also carry the
  // X-App header, which a cross-site form can't add (simple CSRF protection).
  api.use((req, res, next) => {
    if (!isAuthed(req)) return next(new HttpError(401, 'Please log in.'));
    if (req.method !== 'GET' && req.headers['x-app'] !== '1') return next(new HttpError(403, 'Missing X-App header.'));
    next();
  });

  // ---------- live updates (Server-Sent Events) ----------
  api.get('/events', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');
    const send = (type) => (data) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    const handlers = {
      wa: send('wa'),
      chats: send('chats'),
      delivery: send('delivery'),
      campaign: (c) => send('campaign')(serializeCampaign(c)),
      campaignDeleted: send('campaignDeleted'),
    };
    for (const [event, fn] of Object.entries(handlers)) bus.on(event, fn);
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => {
      clearInterval(ping);
      for (const [event, fn] of Object.entries(handlers)) bus.off(event, fn);
    });
  });

  // ---------- overview ----------
  function stats() {
    const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
    const dayAgo = new Date(Date.now() - 86400000).toISOString();
    let sent24h = 0;
    for (const d of store.deliveries) {
      counts[d.status] = (counts[d.status] || 0) + 1;
      if (d.sentAt && d.sentAt >= dayAgo) sent24h++;
    }
    const upcoming = store.campaigns
      .filter((c) => c.active && c.nextRunAt)
      .sort((a, b) => a.nextRunAt.localeCompare(b.nextRunAt))[0];
    return { counts, sent24h, nextRun: upcoming ? { campaignId: upcoming.id, name: upcoming.name, at: upcoming.nextRunAt } : null };
  }

  api.get('/state', (req, res) => {
    res.json({ wa: wa.getState(), settings: store.settings, stats: stats(), demo: config.isDemo, dataDir: config.dataDir });
  });

  // ---------- WhatsApp connection ----------
  api.post('/wa/connect', async (req, res) => {
    const method = req.body?.method === 'code' ? 'code' : 'qr';
    try {
      await wa.connect({ method, phone: req.body?.phone });
    } catch (err) {
      throw bad(err.message);
    }
    res.json(wa.getState());
  });
  api.post('/wa/cancel', (req, res) => {
    wa.cancel();
    res.json(wa.getState());
  });
  api.post('/wa/logout', async (req, res) => {
    await wa.logout();
    res.json(wa.getState());
  });

  api.get('/chats', (req, res) => res.json({ chats: listChats(), live: wa.isConnected() }));
  api.post('/chats/refresh', async (req, res) => {
    try {
      const chats = await wa.refreshChats();
      res.json({ chats, live: true });
    } catch (err) {
      throw bad(err.message);
    }
  });

  // ---------- media ----------
  const upload = multer({
    storage: multer.diskStorage({
      destination: paths.uploads,
      filename: (req, file, cb) => cb(null, `${newId('f_')}${path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '')}`),
    }),
    limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
  });

  api.post('/media', (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) return next(bad(err.code === 'LIMIT_FILE_SIZE' ? `File is too big (max ${MAX_UPLOAD_MB} MB).` : err.message));
      if (!req.file) return next(bad('No file received.'));
      const fileName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
      const media = {
        id: newId('m_'),
        file: req.file.filename,
        fileName,
        mimetype: req.file.mimetype,
        size: req.file.size,
        kind: mediaKind(req.file.mimetype),
        createdAt: new Date().toISOString(),
      };
      store.media.push(media);
      store.touch();
      res.json(media);
    });
  });

  api.get('/media/:id', (req, res) => {
    const media = store.media.find((m) => m.id === req.params.id);
    if (!media) throw new HttpError(404, 'File not found.');
    res.setHeader('Content-Type', media.mimetype);
    res.setHeader('Content-Security-Policy', 'sandbox'); // never run an uploaded file as a page
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(media.fileName)}`);
    res.sendFile(path.join(paths.uploads, media.file));
  });

  // ---------- campaigns (saved, scheduled messages) ----------
  function serializeCampaign(c) {
    const runRows = c.lastRunId ? store.deliveries.filter((d) => d.runId === c.lastRunId) : [];
    const lastRun = runRows.length ? Object.fromEntries(STATUSES.map((s) => [s, runRows.filter((d) => d.status === s).length])) : null;
    if (lastRun) lastRun.total = runRows.length;
    const media = c.message.mediaId ? store.media.find((m) => m.id === c.message.mediaId) || null : null;
    return { ...c, summary: describeSchedule(c.schedule), lastRun, media };
  }

  function parseCampaign(body) {
    const name = String(body?.name || '').trim();
    if (!name) throw bad('Give this schedule a name.');
    if (name.length > 120) throw bad('Name is too long (max 120 characters).');

    const text = String(body?.message?.text ?? '').replace(/\r\n/g, '\n');
    const mediaId = body?.message?.mediaId || null;
    if (mediaId && !store.media.some((m) => m.id === mediaId)) throw bad('The attachment was not found. Please upload it again.');
    if (!text.trim() && !mediaId) throw bad('Write a message or attach a file.');
    if (text.length > 60000) throw bad('Message is too long.');

    const ids = [...new Set((body?.targets || []).map((t) => (typeof t === 'string' ? t : t?.id)).filter(Boolean))];
    if (!ids.length) throw bad('Choose at least one community or group to send to.');
    const known = new Map(listChats().map((c) => [c.id, c]));
    const givenNames = new Map((body?.targets || []).filter((t) => t?.id).map((t) => [t.id, t.name]));
    const targets = ids.map((id) => ({ id, name: known.get(id)?.name || givenNames.get(id) || id }));
    const notAllowed = ids.map((id) => known.get(id)).filter((c) => c && !c.canSend);
    if (notAllowed.length) throw bad(`You can't post in: ${notAllowed.map((c) => c.name).join(', ')}. ${notAllowed[0].reason}`);

    const scheduleError = validateSchedule(body?.schedule);
    if (scheduleError) throw bad(scheduleError);
    const schedule = normalizeSchedule(body.schedule);

    return { name, message: { text, mediaId }, targets, schedule, active: body?.active !== false };
  }

  api.get('/campaigns', (req, res) => {
    const list = [...store.campaigns].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ campaigns: list.map(serializeCampaign) });
  });

  api.post('/schedule/preview', (req, res) => {
    const error = validateSchedule(req.body?.schedule);
    if (error) return res.json({ error, runs: [] });
    const schedule = normalizeSchedule(req.body.schedule);
    const runs = computeNextRuns(schedule, scheduler.timezone, 5).map((d) => d.toISOString());
    res.json({ error: null, runs, summary: describeSchedule(schedule), timezone: scheduler.timezone });
  });

  function assertHasFutureRun(campaign) {
    if (campaign.active && campaign.schedule.type === 'once' && !computeNextRun(campaign.schedule, scheduler.timezone)) {
      throw bad(`That date and time has already passed (times are in ${scheduler.timezone}).`);
    }
  }

  api.post('/campaigns', (req, res) => {
    const input = parseCampaign(req.body);
    const now = new Date().toISOString();
    const campaign = { id: newId('c_'), ...input, nextRunAt: null, lastRunAt: null, lastRunId: null, runCount: 0, createdAt: now, updatedAt: now };
    assertHasFutureRun(campaign);
    store.campaigns.push(campaign);
    scheduler.reschedule(campaign);
    if (req.body?.sendNow) scheduler.runNow(campaign);
    res.status(201).json(serializeCampaign(campaign));
  });

  const findCampaign = (id) => {
    const c = store.campaigns.find((x) => x.id === id);
    if (!c) throw new HttpError(404, 'Schedule not found.');
    return c;
  };

  api.put('/campaigns/:id', (req, res) => {
    const campaign = findCampaign(req.params.id);
    const input = parseCampaign(req.body);
    const candidate = { ...campaign, ...input };
    assertHasFutureRun(candidate);
    Object.assign(campaign, input, { updatedAt: new Date().toISOString() });
    scheduler.reschedule(campaign);
    if (req.body?.sendNow) scheduler.runNow(campaign);
    res.json(serializeCampaign(campaign));
  });

  api.post('/campaigns/:id/toggle', (req, res) => {
    const campaign = findCampaign(req.params.id);
    const active = typeof req.body?.active === 'boolean' ? req.body.active : !campaign.active;
    if (active) assertHasFutureRun({ ...campaign, active });
    campaign.active = active;
    campaign.updatedAt = new Date().toISOString();
    scheduler.reschedule(campaign);
    res.json(serializeCampaign(campaign));
  });

  api.post('/campaigns/:id/run', (req, res) => {
    const campaign = findCampaign(req.params.id);
    const run = scheduler.runNow(campaign);
    res.json({ ...run, connected: wa.isConnected() });
  });

  api.post('/campaigns/:id/duplicate', (req, res) => {
    const src = findCampaign(req.params.id);
    const now = new Date().toISOString();
    const copy = {
      ...structuredClone(src),
      id: newId('c_'), name: `${src.name} (copy)`, active: false,
      nextRunAt: null, lastRunAt: null, lastRunId: null, runCount: 0, createdAt: now, updatedAt: now,
    };
    store.campaigns.push(copy);
    store.touch();
    bus.emit('campaign', copy);
    res.status(201).json(serializeCampaign(copy));
  });

  api.delete('/campaigns/:id', (req, res) => {
    const campaign = findCampaign(req.params.id);
    store.data.campaigns = store.campaigns.filter((c) => c.id !== campaign.id);
    // stop anything of this schedule that hasn't gone out yet
    sender.cancel(store.deliveries.filter((d) => d.campaignId === campaign.id && d.status === 'queued').map((d) => d.id));
    store.touch();
    bus.emit('campaignDeleted', { id: campaign.id });
    res.json({ ok: true });
  });

  // ---------- inbox (every message to every community, with status) ----------
  api.get('/deliveries', (req, res) => {
    const { status, campaignId, chatId, q } = req.query;
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const offset = Number(req.query.offset) || 0;
    const statuses = status ? String(status).split(',') : null;
    const needle = q ? String(q).toLowerCase() : null;
    const matches = store.deliveries.filter((d) =>
      (!statuses || statuses.includes(d.status))
      && (!campaignId || d.campaignId === campaignId)
      && (!chatId || d.chatId === chatId)
      && (!needle || `${d.chatName} ${d.campaignName} ${d.text}`.toLowerCase().includes(needle)));
    matches.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    res.json({ total: matches.length, items: matches.slice(offset, offset + limit), stats: stats() });
  });

  api.post('/deliveries/resend', (req, res) => {
    let ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (req.body?.allFailed) {
      ids = store.deliveries
        .filter((d) => ['failed', 'missed'].includes(d.status) && (!req.body.campaignId || d.campaignId === req.body.campaignId))
        .map((d) => d.id);
    }
    const count = sender.resend(ids);
    res.json({ count, connected: wa.isConnected() });
  });

  api.post('/deliveries/cancel', (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    res.json({ count: sender.cancel(ids) });
  });

  // ---------- settings ----------
  api.get('/settings', (req, res) => res.json(store.settings));

  api.put('/settings', (req, res) => {
    const b = req.body || {};
    const s = { ...store.settings };
    const num = (key, min, max, label) => {
      if (b[key] === undefined) return;
      const v = Number(b[key]);
      if (!Number.isFinite(v) || v < min || v > max) throw bad(`${label} must be between ${min} and ${max}.`);
      s[key] = Math.round(v);
    };
    num('minDelaySec', 3, 600, 'Minimum pause');
    num('maxDelaySec', 3, 1800, 'Maximum pause');
    num('graceMinutes', 0, 1440, 'Late-send window');
    num('maxRetries', 0, 5, 'Automatic retries');
    num('retentionDays', 7, 3650, 'History');
    if (s.maxDelaySec < s.minDelaySec) throw bad('Maximum pause must be at least the minimum pause.');
    if (b.simulateTyping !== undefined) s.simulateTyping = !!b.simulateTyping;
    const tzChanged = b.timezone !== undefined && b.timezone !== s.timezone;
    if (tzChanged) {
      if (!isValidTimezone(b.timezone)) throw bad('Unknown timezone.');
      s.timezone = b.timezone;
    }
    store.data.settings = s;
    store.touch();
    if (tzChanged) scheduler.rescheduleAll();
    res.json(s);
  });

  app.use('/api', api);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) logger.error({ err: err.message, stack: err.stack }, 'request failed');
    res.status(status).json({ error: status >= 500 && !(err instanceof HttpError) ? 'Something went wrong. Check the app logs.' : err.message });
  });

  async function start() {
    sender.start();
    scheduler.start();
    await wa.init().catch((err) => logger.error({ err: err.message }, 'WhatsApp start failed'));
  }

  async function stop() {
    scheduler.stop();
    sender.stop();
    await wa.stop?.();
    store.flush();
  }

  return { app, start, stop, store, wa, sender, scheduler, bus };
}
