import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pino from 'pino';
import { createApp } from '../src/app.js';

process.env.MOCK_LINK_MS = '50';
const logger = pino({ level: 'silent' });

async function boot(extra = {}, { login = true, dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-app-')) } = {}) {
  const config = {
    driver: 'mock', isDemo: true, host: '127.0.0.1', adminUsername: 'admin', adminPassword: 'test-password-1',
    dataDir: dir, mockFailRate: 0, tickMs: 60000, retryBaseMs: 20, ...extra,
  };
  const paths = { db: path.join(dir, 'db.json'), auth: path.join(dir, 'auth'), uploads: path.join(dir, 'uploads'), secret: path.join(dir, 'secret.key') };
  fs.mkdirSync(paths.uploads, { recursive: true });
  const ctx = await createApp({ config, paths, logger });
  Object.assign(ctx.store.settings, { minDelaySec: 0, maxDelaySec: 0, simulateTyping: false, timezone: 'UTC' });
  await ctx.start();
  const server = await new Promise((resolve) => { const s = ctx.app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const jar = { cookie: '' };
  const call = async (method, url, body, headers = {}) => {
    const res = await fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-App': '1', ...(jar.cookie ? { Cookie: jar.cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) jar.cookie = setCookie.split(';')[0];
    return { status: res.status, body: await res.json().catch(() => null), headers: res.headers };
  };
  if (login && config.adminPassword) {
    const r = await call('POST', '/login', { username: config.adminUsername, password: config.adminPassword });
    assert.equal(r.status, 200, 'test login failed');
  }
  return { ...ctx, server, call, jar, dir, close: async () => { server.close(); await ctx.stop(); } };
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

test('login with username and password', async () => {
  const secured = await boot({ adminUsername: 'boss', adminPassword: 'correct horse' }, { login: false });
  try {
    assert.equal((await secured.call('GET', '/state')).status, 401);
    const session = (await secured.call('GET', '/session')).body;
    assert.deepEqual(session, { needsSetup: false, authenticated: false, user: null, demo: true });
    assert.equal((await secured.call('POST', '/login', { username: 'boss', password: 'nope' })).status, 401);
    assert.equal((await secured.call('POST', '/login', { username: 'someone', password: 'correct horse' })).status, 401);
    const ok = await secured.call('POST', '/login', { username: 'BOSS', password: 'correct horse' });
    assert.equal(ok.status, 200);
    assert.equal((await secured.call('GET', '/state')).status, 200);
    assert.equal((await secured.call('GET', '/state', undefined, { Cookie: 'cs_session=u_x.abc.forged' })).status, 401);
    // passwords are stored hashed, never as plain text
    secured.store.flush();
    const saved = fs.readFileSync(path.join(secured.dir, 'db.json'), 'utf8');
    assert.match(saved, /scrypt\$/);
    assert.ok(!saved.includes('correct horse'));
  } finally {
    await secured.close();
  }
});

test('first run on your own computer: create the admin account in the browser', async () => {
  const fresh = await boot({ adminPassword: '' }, { login: false });
  try {
    assert.equal((await fresh.call('GET', '/session')).body.needsSetup, true);
    assert.equal((await fresh.call('GET', '/state')).status, 401);
    assert.equal((await fresh.call('POST', '/setup', { username: 'ab', password: 'longenough' })).status, 400);
    assert.equal((await fresh.call('POST', '/setup', { username: 'owner', password: 'short' })).status, 400);
    const created = await fresh.call('POST', '/setup', { username: 'owner', password: 'longenough' });
    assert.equal(created.status, 200);
    assert.equal((await fresh.call('GET', '/state')).status, 200); // logged in straight away
    const again = await fresh.call('POST', '/setup', { username: 'hacker', password: 'longenough' });
    assert.equal(again.status, 403);
  } finally {
    await fresh.close();
  }
});

test('the first account cannot be claimed over the network', async () => {
  const exposed = await boot({ adminPassword: '', host: '0.0.0.0' }, { login: false });
  try {
    assert.equal((await exposed.call('POST', '/setup', { username: 'owner', password: 'longenough' })).status, 403);
  } finally {
    await exposed.close();
  }
});

test('add a team account, change passwords, remove the account', async () => {
  const added = await app.call('POST', '/users', { username: 'helper', password: 'helper-pass-1' });
  assert.equal(added.status, 201);
  assert.equal((await app.call('POST', '/users', { username: 'HELPER', password: 'another-pass' })).status, 400);

  const users = (await app.call('GET', '/users')).body.users;
  const admin = users.find((u) => u.username === 'admin');
  assert.equal(admin.isYou, true);
  assert.equal(admin.managedByEnv, true);
  assert.ok(users.every((u) => !('passwordHash' in u)));

  // the server-managed admin can't change its password in the dashboard, or be removed
  assert.equal((await app.call('POST', '/account/password', { currentPassword: 'test-password-1', newPassword: 'whatever-123' })).status, 400);
  assert.equal((await app.call('DELETE', `/users/${admin.id}`)).status, 400);

  // the helper logs in and changes their own password
  const helperApp = { jar: { cookie: '' } };
  const asHelper = async (method, url, body) => {
    const res = await fetch(`http://127.0.0.1:${app.server.address().port}/api${url}`, {
      method, headers: { 'Content-Type': 'application/json', 'X-App': '1', Cookie: helperApp.jar.cookie }, body: body && JSON.stringify(body),
    });
    const sc = res.headers.get('set-cookie');
    if (sc) helperApp.jar.cookie = sc.split(';')[0];
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  assert.equal((await asHelper('POST', '/login', { username: 'helper', password: 'helper-pass-1' })).status, 200);
  const oldCookie = helperApp.jar.cookie;
  assert.equal((await asHelper('POST', '/account/password', { currentPassword: 'wrong', newPassword: 'helper-pass-2' })).status, 400);
  assert.equal((await asHelper('POST', '/account/password', { currentPassword: 'helper-pass-1', newPassword: 'helper-pass-2' })).status, 200);
  assert.equal((await asHelper('GET', '/state')).status, 200); // new session issued
  assert.equal((await app.call('GET', '/state', undefined, { Cookie: oldCookie })).status, 401); // old session is dead

  assert.equal((await app.call('DELETE', `/users/${added.body.id}`)).status, 200);
  assert.equal((await asHelper('GET', '/state')).status, 401);
});

test('forgot password: setting ADMIN_PASSWORD and restarting gets you back in', async () => {
  const first = await boot({ adminPassword: '' }, { login: false });
  await first.call('POST', '/setup', { username: 'owner', password: 'forgotten-pass' });
  await first.close();
  const restarted = await boot({ adminUsername: 'owner', adminPassword: 'brand-new-pass' }, { login: false, dir: first.dir });
  try {
    assert.equal((await restarted.call('POST', '/login', { username: 'owner', password: 'forgotten-pass' })).status, 401);
    assert.equal((await restarted.call('POST', '/login', { username: 'owner', password: 'brand-new-pass' })).status, 200);
    assert.equal((await restarted.call('GET', '/users')).body.users.length, 1);
  } finally {
    await restarted.close();
  }
});
