import path from 'node:path';
import { newId } from './store.js';

const STATUS_RANK = { queued: 0, sending: 1, sent: 2, delivered: 3, read: 4 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randomBetween = (min, max) => min + Math.random() * Math.max(0, max - min);

/**
 * The outbox. Every message to every community is a "delivery" row.
 * A single worker sends them one at a time, with a random pause between sends,
 * waits while WhatsApp is disconnected, retries failures, and tracks delivery receipts.
 */
export class Sender {
  constructor({ store, wa, bus, logger, uploadsDir, retryBaseMs = 30000 }) {
    this.store = store;
    this.retryBaseMs = retryBaseMs;
    this.uploadsDir = uploadsDir;
    this.wa = wa;
    this.bus = bus;
    this.log = logger;
    this.wakeUp = null;
    this.running = false;
    this.earlyAcks = new Map(); // receipts that arrive before we know the message id

    wa.on('ack', (ack) => this.#handleAck(ack));
    wa.on('state', (state) => { if (state.status === 'connected') this.kick(); });
  }

  start() {
    // A send that was in flight when the app stopped may or may not have reached WhatsApp.
    // Never re-send it automatically (that could double post); flag it so you can decide.
    for (const d of this.store.deliveries) {
      if (d.status === 'sending') {
        d.status = 'failed';
        d.error = 'The app stopped while this was sending. Check the community, then resend if it is missing.';
        d.updatedAt = new Date().toISOString();
      }
    }
    this.store.touch();
    this.running = true;
    this.#loop().catch((err) => this.log.error({ err }, 'sender loop crashed'));
  }

  stop() {
    this.running = false;
    this.kick();
  }

  kick() {
    if (this.wakeUp) this.wakeUp();
  }

  #wait(ms) {
    return new Promise((resolve) => {
      const t = setTimeout(done, ms);
      function done() { clearTimeout(t); resolve(); }
      this.wakeUp = done;
    });
  }

  /** Create delivery rows for one run of a campaign. */
  createRun(campaign, { trigger, scheduledFor = new Date(), missed = false } = {}) {
    const runId = newId('run_');
    const now = new Date().toISOString();
    const rows = campaign.targets.map((t) => ({
      id: newId('dl_'),
      runId,
      campaignId: campaign.id,
      campaignName: campaign.name,
      chatId: t.id,
      chatName: t.name,
      text: campaign.message.text || '',
      mediaId: campaign.message.mediaId || null,
      status: missed ? 'missed' : 'queued',
      trigger,
      scheduledFor: new Date(scheduledFor).toISOString(),
      createdAt: now,
      updatedAt: now,
      sentAt: null,
      deliveredAt: null,
      readAt: null,
      attempts: 0,
      error: missed ? 'The app was offline at the scheduled time, so this was not sent. Click Resend to send it now.' : null,
      messageId: null,
      notBefore: null,
    }));
    this.store.deliveries.push(...rows);
    this.store.touch();
    for (const row of rows) this.bus.emit('delivery', row);
    this.kick();
    return { runId, deliveries: rows };
  }

  resend(ids) {
    const now = new Date().toISOString();
    const changed = [];
    for (const d of this.store.deliveries) {
      if (!ids.includes(d.id) || d.status === 'queued' || d.status === 'sending') continue;
      Object.assign(d, {
        status: 'queued', trigger: 'resend', scheduledFor: now, updatedAt: now, attempts: 0,
        error: null, notBefore: null, messageId: null, sentAt: null, deliveredAt: null, readAt: null,
      });
      changed.push(d);
      this.bus.emit('delivery', d);
    }
    this.store.touch();
    this.kick();
    return changed.length;
  }

  cancel(ids) {
    let count = 0;
    for (const d of this.store.deliveries) {
      if (ids.includes(d.id) && d.status === 'queued') {
        d.status = 'cancelled';
        d.updatedAt = new Date().toISOString();
        this.bus.emit('delivery', d);
        count++;
      }
    }
    this.store.touch();
    return count;
  }

  #nextQueued() {
    const now = Date.now();
    let best = null;
    for (const d of this.store.deliveries) {
      if (d.status !== 'queued') continue;
      if (d.notBefore && Date.parse(d.notBefore) > now) continue;
      if (!best || d.scheduledFor < best.scheduledFor) best = d;
    }
    return best;
  }

  #hasRetryPending() {
    return this.store.deliveries.some((d) => d.status === 'queued' && d.notBefore);
  }

  #update(d, patch) {
    Object.assign(d, patch, { updatedAt: new Date().toISOString() });
    this.store.touch();
    this.bus.emit('delivery', d);
  }

  async #loop() {
    while (this.running) {
      if (!this.wa.isConnected()) {
        await this.#wait(10000);
        continue;
      }
      const d = this.#nextQueued();
      if (!d) {
        await this.#wait(this.#hasRetryPending() ? Math.min(5000, this.retryBaseMs) : 60000);
        continue;
      }
      const settings = this.store.settings;
      const lateMs = Date.now() - Date.parse(d.scheduledFor);
      if (d.trigger === 'schedule' && lateMs > settings.graceMinutes * 60000) {
        this.#update(d, {
          status: 'missed',
          error: `WhatsApp was not connected at the scheduled time and it is now more than ${settings.graceMinutes} min late, so it was not sent. Click Resend to send it now.`,
        });
        continue;
      }
      await this.#sendOne(d);
      if (this.#nextQueued()) {
        await sleep(randomBetween(settings.minDelaySec, settings.maxDelaySec) * 1000);
      }
    }
  }

  #media(d) {
    if (!d.mediaId) return null;
    const media = this.store.media.find((m) => m.id === d.mediaId);
    if (!media) {
      const err = new Error('The attached file was deleted. Edit the schedule and attach it again.');
      err.permanent = true;
      throw err;
    }
    return { ...media, path: path.join(this.uploadsDir, media.file) };
  }

  async #sendOne(d) {
    this.#update(d, { status: 'sending', attempts: d.attempts + 1 });
    try {
      const media = this.#media(d);
      const { messageId } = await this.wa.sendMessage(d.chatId, {
        text: d.text,
        media,
        simulateTyping: this.store.settings.simulateTyping,
      });
      this.#update(d, { status: 'sent', sentAt: new Date().toISOString(), messageId, error: null, notBefore: null });
      const early = this.earlyAcks.get(messageId);
      if (early) {
        this.earlyAcks.delete(messageId);
        this.#handleAck({ messageId, status: early });
      }
      this.log.info({ chat: d.chatName, campaign: d.campaignName }, 'message sent');
    } catch (err) {
      const message = err?.message || String(err);
      const retriesLeft = d.attempts <= this.store.settings.maxRetries;
      this.log.warn({ chat: d.chatName, err: message, attempt: d.attempts }, 'send failed');
      if (retriesLeft && !err?.permanent) {
        this.#update(d, {
          status: 'queued',
          error: `Attempt ${d.attempts} failed: ${message}. Retrying automatically…`,
          notBefore: new Date(Date.now() + this.retryBaseMs * d.attempts).toISOString(),
        });
      } else {
        this.#update(d, { status: 'failed', error: message, notBefore: null });
      }
    }
  }

  #handleAck({ messageId, status }) {
    const d = this.store.deliveries.find((x) => x.messageId === messageId);
    if (!d) {
      // The receipt beat the send() promise. Remember it briefly.
      this.earlyAcks.set(messageId, status);
      setTimeout(() => this.earlyAcks.delete(messageId), 60000).unref?.();
      return;
    }
    if ((STATUS_RANK[status] ?? -1) <= (STATUS_RANK[d.status] ?? 99)) return;
    const now = new Date().toISOString();
    const patch = { status };
    if (status === 'delivered') patch.deliveredAt = now;
    if (status === 'read') {
      patch.readAt = now;
      patch.deliveredAt = d.deliveredAt || now;
    }
    this.#update(d, patch);
  }
}
