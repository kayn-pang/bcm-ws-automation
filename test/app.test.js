import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pino from 'pino';
import { createApp } from '../src/app.js';

process.env.MOCK_LINK_MS = '50';
const logger = pino({ level: 'silent' });

async function boot(extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-app-'));
  const config = { driver: 'mock', isDemo: true, adminPassword: '', dataDir: dir, mockFailRate: 0, tickMs: 60000, retryBaseMs: 20, ...extra };
  const paths = { db: path.join(dir, 'db.json'), auth: path.join(dir, 'auth'), uploads: path.join(dir, 'uploads'), secret: path.join(dir, 'secret.key') };
  fs.mkdirSync(paths.uploads, { recursive: true });
  const ctx = await createApp({ config, paths, logger });
  Object.assign(ctx.store.settings, { minDelaySec: 0, maxDelaySec: 0, simulateTyping: false, timezone: 'UTC' });
  await ctx.start();
  const server = await new Promise((resolve) => { const s = ctx.app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, url, body, headers = {}) => {
    const res = await fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-App': '1', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null), headers: res.headers };
  };
  return { ...ctx, server, call, close: async () => { server.close(); await ctx.stop(); } };
}

async function until(fn, ms = 4000) {
  const start = Date.now();
  while (!(await fn())) {
    if (Date.now() - start > ms) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 20));
  }
}

let app;
before(async () => { app = await boot(); });
after(async () => { await app.close(); });

const ANNOUNCE = '1203630100000011@g.us'; // admin -> can post
const NOT_ADMIN = '1203630100000031@g.us'; // announcement group where we are not admin
const GROUP = '1203630100000041@g.us';

test('link with a phone number pairing code, then list communities', async () => {
  const bad = await app.call('POST', '/wa/connect', { method: 'code', phone: '123' });
  assert.equal(bad.status, 400);

  const r = await app.call('POST', '/wa/connect', { method: 'code', phone: '+60 12-345 6789' });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'pairing');
  assert.match(r.body.pairingCode, /^[0-9A-F]{4}-[0-9A-F]{4}$/);

  await until(async () => (await app.call('GET', '/state')).body.wa.status === 'connected');
  const chats = (await app.call('GET', '/chats')).body.chats;
  const types = new Set(chats.map((c) => c.type));
  assert.deepEqual([...types].sort(), ['announcement', 'community', 'group', 'subgroup']);
  assert.equal(chats.find((c) => c.id === NOT_ADMIN).canSend, false);
  assert.equal(chats.find((c) => c.id === ANNOUNCE).canSend, true);
});

test('rejects schedules that cannot work', async () => {
  const base = { name: 'x', message: { text: 'hi' }, targets: [ANNOUNCE], schedule: { type: 'manual' } };
  assert.equal((await app.call('POST', '/campaigns', { ...base, name: '' })).status, 400);
  assert.equal((await app.call('POST', '/campaigns', { ...base, message: { text: ' ' } })).status, 400);
  assert.equal((await app.call('POST', '/campaigns', { ...base, targets: [] })).status, 400);
  const notAdmin = await app.call('POST', '/campaigns', { ...base, targets: [NOT_ADMIN] });
  assert.equal(notAdmin.status, 400);
  assert.match(notAdmin.body.error, /can't post/);
  const past = await app.call('POST', '/campaigns', { ...base, schedule: { type: 'once', date: '2020-01-01', times: ['09:00'] } });
  assert.equal(past.status, 400);
  assert.match(past.body.error, /already passed/);
});

test('create a weekly schedule, send it now, see it in the inbox, resend', async () => {
  const created = await app.call('POST', '/campaigns', {
    name: 'Weekly update',
    message: { text: '*Hello* community' },
    targets: [ANNOUNCE, GROUP],
    schedule: { type: 'weekly', days: [1, 4], times: ['09:00'] },
    sendNow: true,
  });
  assert.equal(created.status, 201);
  const c = created.body;
  assert.equal(c.summary, 'Every Mon & Thu at 09:00');
  assert.ok(new Date(c.nextRunAt) > new Date());
  assert.equal(new Date(c.nextRunAt).getUTCHours(), 9);

  await until(async () => {
    const list = (await app.call('GET', `/deliveries?campaignId=${c.id}`)).body;
    return list.total === 2 && list.items.every((d) => ['sent', 'delivered', 'read'].includes(d.status));
  });
  const items = (await app.call('GET', `/deliveries?campaignId=${c.id}`)).body.items;
  assert.deepEqual(items.map((d) => d.chatId).sort(), [ANNOUNCE, GROUP].sort());

  const resend = await app.call('POST', '/deliveries/resend', { ids: [items[0].id] });
  assert.equal(resend.body.count, 1);
  await until(async () => {
    const d = (await app.call('GET', `/deliveries?campaignId=${c.id}`)).body.items.find((x) => x.id === items[0].id);
    return d.trigger === 'resend' && d.status !== 'queued' && d.status !== 'sending';
  });

  const listed = (await app.call('GET', '/campaigns')).body.campaigns.find((x) => x.id === c.id);
  assert.equal(listed.lastRun.total, 2);
});

test('pause and resume a schedule', async () => {
  const c = (await app.call('POST', '/campaigns', {
    name: 'Daily', message: { text: 'hi' }, targets: [GROUP], schedule: { type: 'daily', times: ['07:00'] },
  })).body;
  const paused = (await app.call('POST', `/campaigns/${c.id}/toggle`, { active: false })).body;
  assert.equal(paused.active, false);
  assert.equal(paused.nextRunAt, null);
  const resumed = (await app.call('POST', `/campaigns/${c.id}/toggle`, { active: true })).body;
  assert.ok(resumed.nextRunAt);
  assert.equal((await app.call('DELETE', `/campaigns/${c.id}`)).status, 200);
});

test('changing the timezone moves upcoming runs', async () => {
  const c = (await app.call('POST', '/campaigns', {
    name: 'TZ', message: { text: 'hi' }, targets: [GROUP], schedule: { type: 'daily', times: ['09:00'] },
  })).body;
  assert.equal(new Date(c.nextRunAt).getUTCHours(), 9);
  assert.equal((await app.call('PUT', '/settings', { timezone: 'Asia/Kuala_Lumpur' })).status, 200);
  const moved = (await app.call('GET', '/campaigns')).body.campaigns.find((x) => x.id === c.id);
  assert.equal(new Date(moved.nextRunAt).getUTCHours(), 1);
  assert.equal((await app.call('PUT', '/settings', { minDelaySec: 30, maxDelaySec: 5 })).status, 400);
  assert.equal((await app.call('PUT', '/settings', { timezone: 'Mars/Olympus' })).status, 400);
  await app.call('PUT', '/settings', { timezone: 'UTC' });
});

test('state-changing requests need the X-App header', async () => {
  const r = await app.call('POST', '/campaigns', {}, { 'X-App': '' });
  assert.equal(r.status, 403);
});

test('password protection', async () => {
  const secured = await boot({ adminPassword: 'correct horse' });
  try {
    assert.equal((await secured.call('GET', '/state')).status, 401);
    const session = (await secured.call('GET', '/session')).body;
    assert.deepEqual(session, { authRequired: true, authenticated: false, demo: true });
    assert.equal((await secured.call('POST', '/login', { password: 'nope' })).status, 401);
    const ok = await secured.call('POST', '/login', { password: 'correct horse' });
    assert.equal(ok.status, 200);
    const cookie = ok.headers.get('set-cookie').split(';')[0];
    assert.equal((await secured.call('GET', '/state', undefined, { Cookie: cookie })).status, 200);
    assert.equal((await secured.call('GET', '/state', undefined, { Cookie: 'cs_session=forged.token' })).status, 401);
  } finally {
    await secured.close();
  }
});
