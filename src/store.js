import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const DEFAULT_SETTINGS = {
  timezone: '',
  /** Random pause between two sends, in seconds. Keeps the account looking human. */
  minDelaySec: 10,
  maxDelaySec: 25,
  /** Show "typing..." for a moment before each message. */
  simulateTyping: true,
  /** If a scheduled send could not go out on time (app offline / WhatsApp disconnected),
   *  still send it if we are no more than this many minutes late. Otherwise mark it "missed". */
  graceMinutes: 60,
  /** Automatic retries after a failed send before marking it failed. */
  maxRetries: 2,
  /** Delete inbox history older than this many days. */
  retentionDays: 90,
};

export const newId = (prefix = '') => prefix + crypto.randomBytes(8).toString('hex');

/**
 * Tiny JSON-file database. Everything lives in memory and is flushed to disk
 * (atomically, via a temp file + rename) shortly after each change.
 */
export class Store {
  constructor(file) {
    this.file = file;
    this.timer = null;
    this.data = this.#load();
  }

  #load() {
    const empty = { version: 1, settings: { ...DEFAULT_SETTINGS }, campaigns: [], deliveries: [], media: [] };
    if (!fs.existsSync(this.file)) return empty;
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return {
        ...empty,
        ...parsed,
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
      };
    } catch (err) {
      const backup = `${this.file}.corrupt-${Date.now()}`;
      fs.copyFileSync(this.file, backup);
      console.error(`[store] Could not read ${this.file} (${err.message}). A copy was saved to ${backup}; starting fresh.`);
      return empty;
    }
  }

  get settings() { return this.data.settings; }
  get campaigns() { return this.data.campaigns; }
  get deliveries() { return this.data.deliveries; }
  get media() { return this.data.media; }

  /** Mark data as changed; it is written to disk within ~250ms. */
  touch() {
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), 250);
  }

  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
  }
}
