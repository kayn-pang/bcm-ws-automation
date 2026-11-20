import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import pino from 'pino';
import { Store } from '../src/store.js';
import { Sender } from '../src/sender.js';
import { Scheduler } from '../src/scheduler.js';

const logger = pino({ level: 'silent' });

/** A stand-in for WhatsApp that fails the first N sends. */
class FakeWA extends EventEmitter {
  constructor({ failFirst = 0, connected = true } = {}) {
    super();
    this.failFirst = failFirst;
    this.connected = connected;
    this.sent = [];
  }
  isConnected() { return this.connected; }
  async sendMessage(jid, { text }) {
    if (this.failFirst > 0) {
      this.failFirst--;
      throw new Error('network hiccup');
    }
    const messageId = `M${this.sent.length + 1}`;
    this.sent.push({ jid, text, messageId });
    return { messageId };
  }
}

function setup(waOptions, settings = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-sender-'));
  const store = new Store(path.join(dir, 'db.json'));
  Object.assign(store.settings, { minDelaySec: 0, maxDelaySec: 0, ...settings });
  const wa = new FakeWA(waOptions);
  const bus = new EventEmitter();
  const sender = new Sender({ store, wa, bus, logger, uploadsDir: dir, retryBaseMs: 20 });
  const campaign = {
    id: 'c1', name: 'Test', active: true, message: { text: 'Hello', mediaId: null },
    targets: [{ id: 'a@g.us', name: 'A' }, { id: 'b@g.us', name: 'B' }],
    schedule: { type: 'daily', times: ['09:00'] },
  };
  store.campaigns.push(campaign);
  return { store, wa, sender, bus, campaign, dir };
}

async function until(fn, ms = 3000) {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > ms) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 10));
  }
}

test('sends every target and records receipts', async () => {
  const { store, wa, sender, campaign } = setup();
  sender.start();
  sender.createRun(campaign, { trigger: 'manual' });
  await until(() => store.deliveries.every((d) => d.status === 'sent'));
  assert.deepEqual(wa.sent.map((s) => s.jid), ['a@g.us', 'b@g.us']);

  wa.emit('ack', { messageId: 'M1', status: 'delivered' });
  wa.emit('ack', { messageId: 'M1', status: 'read' });
  wa.emit('ack', { messageId: 'M1', status: 'delivered' }); // late, must not downgrade
  const first = store.deliveries.find((d) => d.messageId === 'M1');
  assert.equal(first.status, 'read');
  assert.ok(first.readAt && first.deliveredAt);
  sender.stop();
});

test('retries a failed send automatically', async () => {
  const { store, sender, campaign } = setup({ failFirst: 1 }, { maxRetries: 2 });
  campaign.targets = [{ id: 'a@g.us', name: 'A' }];
  sender.start();
  sender.createRun(campaign, { trigger: 'manual' });
  await until(() => store.deliveries[0].status === 'sent');
  assert.equal(store.deliveries[0].attempts, 2);
  sender.stop();
});

test('marks as failed when retries run out, and Resend fixes it', async () => {
  const { store, wa, sender, campaign } = setup({ failFirst: 1 }, { maxRetries: 0 });
  campaign.targets = [{ id: 'a@g.us', name: 'A' }];
  sender.start();
  sender.createRun(campaign, { trigger: 'manual' });
  await until(() => store.deliveries[0].status === 'failed');
  assert.match(store.deliveries[0].error, /network hiccup/);

  assert.equal(sender.resend([store.deliveries[0].id]), 1);
  await until(() => store.deliveries[0].status === 'sent');
  assert.equal(store.deliveries[0].trigger, 'resend');
  assert.equal(wa.sent.length, 1);
  sender.stop();
});

test('waits while WhatsApp is disconnected, then sends', async () => {
  const { store, wa, sender, campaign } = setup({ connected: false });
  sender.start();
  sender.createRun(campaign, { trigger: 'manual' });
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(store.deliveries.every((d) => d.status === 'queued'));
  wa.connected = true;
  wa.emit('state', { status: 'connected' });
  await until(() => store.deliveries.every((d) => d.status === 'sent'));
  sender.stop();
});

test('a scheduled message that is too late is marked missed, not sent', async () => {
  const { store, wa, sender, campaign } = setup({}, { graceMinutes: 30 });
  sender.start();
  sender.createRun(campaign, { trigger: 'schedule', scheduledFor: new Date(Date.now() - 2 * 3600000) });
  await until(() => store.deliveries.every((d) => d.status === 'missed'));
  assert.equal(wa.sent.length, 0);
  sender.stop();
});

test('scheduler fires due campaigns once and moves to the next run', () => {
  const { store, sender, bus, campaign, dir } = setup({ connected: false });
  const scheduler = new Scheduler({ store, sender, bus, logger, uploadsDir: dir });
  store.settings.timezone = 'UTC';
  campaign.nextRunAt = new Date(Date.now() - 60000).toISOString(); // due a minute ago
  scheduler.tick();
  assert.equal(store.deliveries.length, 2);
  assert.ok(store.deliveries.every((d) => d.status === 'queued'));
  assert.ok(new Date(campaign.nextRunAt) > new Date());
  scheduler.tick(); // nothing new is due
  assert.equal(store.deliveries.length, 2);
});

test('scheduler records a run as missed when the app was offline for too long', () => {
  const { store, sender, bus, campaign, dir } = setup({ connected: false }, { graceMinutes: 60 });
  const scheduler = new Scheduler({ store, sender, bus, logger, uploadsDir: dir });
  campaign.nextRunAt = new Date(Date.now() - 5 * 3600000).toISOString();
  scheduler.tick();
  assert.ok(store.deliveries.every((d) => d.status === 'missed'));
});

test('a send interrupted by a restart is flagged, never silently re-sent', () => {
  const { store, sender, campaign } = setup({ connected: false });
  sender.createRun(campaign, { trigger: 'manual' });
  store.deliveries[0].status = 'sending';
  sender.start();
  assert.equal(store.deliveries[0].status, 'failed');
  assert.match(store.deliveries[0].error, /stopped while this was sending/);
  sender.stop();
});
