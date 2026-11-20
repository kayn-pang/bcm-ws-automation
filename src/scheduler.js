import fs from 'node:fs';
import path from 'node:path';
import { computeNextRun } from './schedule.js';

/**
 * Wakes up every few seconds, finds campaigns whose next run is due,
 * hands their messages to the Sender, and works out the following run.
 * Next-run times are persisted, so a restart picks up where it left off.
 */
export class Scheduler {
  constructor({ store, sender, bus, logger, tickMs = 15000, uploadsDir }) {
    this.store = store;
    this.sender = sender;
    this.bus = bus;
    this.log = logger;
    this.tickMs = tickMs;
    this.uploadsDir = uploadsDir;
    this.interval = null;
    this.lastPrune = 0;
  }

  get timezone() {
    return this.store.settings.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  start() {
    for (const c of this.store.campaigns) {
      if (c.active && !c.nextRunAt) this.reschedule(c, { emit: false });
    }
    this.store.touch();
    this.tick();
    this.interval = setInterval(() => this.tick(), this.tickMs);
  }

  stop() {
    clearInterval(this.interval);
  }

  /** Recompute a campaign's next run (after create / edit / resume / timezone change). */
  reschedule(campaign, { emit = true, after = new Date() } = {}) {
    campaign.nextRunAt = campaign.active ? computeNextRun(campaign.schedule, this.timezone, after)?.toISOString() || null : null;
    this.store.touch();
    if (emit) this.bus.emit('campaign', campaign);
  }

  rescheduleAll() {
    for (const c of this.store.campaigns) this.reschedule(c);
  }

  runNow(campaign) {
    const run = this.sender.createRun(campaign, { trigger: 'manual', scheduledFor: new Date() });
    campaign.lastRunAt = new Date().toISOString();
    campaign.lastRunId = run.runId;
    campaign.runCount = (campaign.runCount || 0) + 1;
    this.store.touch();
    this.bus.emit('campaign', campaign);
    return run;
  }

  tick() {
    const now = new Date();
    const graceMs = this.store.settings.graceMinutes * 60000;
    for (const c of this.store.campaigns) {
      if (!c.active || !c.nextRunAt) continue;
      const due = new Date(c.nextRunAt);
      if (due > now) continue;
      const missed = now - due > graceMs;
      if (missed) this.log.warn({ campaign: c.name, due: c.nextRunAt }, 'scheduled run missed (app was offline)');
      else this.log.info({ campaign: c.name }, 'running scheduled campaign');
      const run = this.sender.createRun(c, { trigger: 'schedule', scheduledFor: due, missed });
      c.lastRunAt = due.toISOString();
      c.lastRunId = run.runId;
      c.runCount = (c.runCount || 0) + 1;
      this.reschedule(c, { after: now });
    }
    if (Date.now() - this.lastPrune > 6 * 3600000) this.prune();
  }

  /** Drop old inbox history and attachments nothing refers to any more. */
  prune() {
    this.lastPrune = Date.now();
    const cutoff = new Date(Date.now() - this.store.settings.retentionDays * 86400000).toISOString();
    const before = this.store.deliveries.length;
    this.store.data.deliveries = this.store.deliveries.filter(
      (d) => d.createdAt >= cutoff || d.status === 'queued' || d.status === 'sending',
    );
    const used = new Set([
      ...this.store.campaigns.map((c) => c.message.mediaId),
      ...this.store.deliveries.map((d) => d.mediaId),
    ]);
    const dayAgo = new Date(Date.now() - 86400000).toISOString();
    const keep = [];
    for (const m of this.store.media) {
      // keep fresh uploads: they may belong to a schedule that is still being written
      if (used.has(m.id) || m.createdAt > dayAgo) keep.push(m);
      else fs.rm(path.join(this.uploadsDir, m.file), { force: true }, () => {});
    }
    this.store.data.media = keep;
    if (before !== this.store.deliveries.length) this.log.info({ removed: before - this.store.deliveries.length }, 'pruned old history');
    this.store.touch();
  }
}
