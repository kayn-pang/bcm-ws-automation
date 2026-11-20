import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import QRCode from 'qrcode';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  jidNormalizedUser,
  useMultiFileAuthState,
} from 'baileys';
import { buildChatList } from './chats.js';

const SEND_TIMEOUT_MS = 90000;
const NETWORK_ERROR = /WebSocket Error|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENETUNREACH/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function withTimeout(promise, ms, message = 'Timed out') {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); }),
  ]);
}

// proto.WebMessageInfo.Status: 0 ERROR, 1 PENDING, 2 SERVER_ACK, 3 DELIVERY_ACK, 4 READ, 5 PLAYED
const ACK_STATUS = { 2: 'sent', 3: 'delivered', 4: 'read', 5: 'read' };

/**
 * Connects to WhatsApp as a "linked device" (the same way WhatsApp Web / Desktop does),
 * using the Baileys library. Link by scanning a QR code or by entering a pairing code
 * on the phone. The login is saved in data/whatsapp-auth so it survives restarts.
 */
export class BaileysDriver extends EventEmitter {
  constructor({ authDir, logger }) {
    super();
    this.authDir = authDir;
    this.log = logger;
    this.waLogger = logger.child({ module: 'baileys' }, { level: process.env.BAILEYS_LOG_LEVEL || 'warn' });
    this.sock = null;
    this.state = { status: 'idle', qr: null, pairingCode: null, me: null, error: null, connectedAt: null, method: null };
    this.groups = new Map();
    this.recent = new Map();
    this.retryDelay = 0;
    this.reconnectTimer = null;
    this.pairingPhone = null;
    this.pairingRequested = false;
    this.manualStop = false;
    this.refreshTimer = null;
    this.starting = false;
  }

  hasSession() {
    try {
      const creds = JSON.parse(fs.readFileSync(path.join(this.authDir, 'creds.json'), 'utf8'));
      return !!(creds.me && creds.account);
    } catch {
      return false;
    }
  }

  async init() {
    if (this.hasSession()) await this.connect();
  }

  isConnected() {
    return this.state.status === 'connected';
  }

  getState() {
    return { ...this.state };
  }

  #setState(patch) {
    Object.assign(this.state, patch);
    this.emit('state', this.getState());
  }

  /** method: 'qr' (scan a QR code) or 'code' (type a pairing code on the phone). */
  async connect({ method = 'qr', phone } = {}) {
    clearTimeout(this.reconnectTimer);
    if (method === 'code') {
      const digits = String(phone || '').replace(/\D/g, '');
      if (digits.length < 8) throw new Error('Enter the full phone number with country code, digits only (e.g. 60123456789).');
      this.pairingPhone = digits;
      this.pairingRequested = false;
    } else {
      this.pairingPhone = null;
    }
    if (this.starting) return; // a connection attempt is already being set up
    if (this.sock) {
      if (this.state.status === 'connected') return;
      if (method === 'code' && this.state.status === 'qr') {
        await this.#requestPairingCode();
        return;
      }
      this.#teardown();
    }
    this.manualStop = false;
    await this.#start();
  }

  /** Unlink this device from WhatsApp and delete the saved login. */
  async logout() {
    this.manualStop = true;
    clearTimeout(this.reconnectTimer);
    const sock = this.sock;
    this.sock = null;
    if (sock) {
      try { await withTimeout(sock.logout(), 10000); } catch { /* already gone */ }
      try { sock.end(undefined); } catch { /* ignore */ }
    }
    this.#wipeAuth();
    this.groups.clear();
    this.#setState({ status: 'idle', qr: null, pairingCode: null, me: null, error: null, connectedAt: null });
    this.emit('chats', []);
  }

  /** Cancel a pending QR / pairing attempt without touching a saved login. */
  cancel() {
    this.manualStop = true;
    clearTimeout(this.reconnectTimer);
    this.#teardown();
    this.#setState({ status: 'idle', qr: null, pairingCode: null, error: null });
  }

  async stop() {
    this.manualStop = true;
    clearTimeout(this.reconnectTimer);
    this.#teardown();
  }

  #teardown() {
    const sock = this.sock;
    this.sock = null;
    if (sock) {
      try { sock.ev.removeAllListeners(); } catch { /* ignore */ }
      try { sock.end(undefined); } catch { /* ignore */ }
    }
  }

  #wipeAuth() {
    fs.rmSync(this.authDir, { recursive: true, force: true });
  }

  async #start() {
    if (this.starting) return;
    this.starting = true;
    try {
      await this.#createSocket();
    } finally {
      this.starting = false;
    }
  }

  async #createSocket() {
    this.#teardown(); // never run two sockets on one login
    this.#setState({ status: 'connecting', qr: null, pairingCode: null, error: null, method: this.pairingPhone ? 'code' : 'qr' });
    fs.mkdirSync(this.authDir, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
    let version;
    try {
      ({ version } = await withTimeout(fetchLatestBaileysVersion(), 8000));
    } catch {
      // fall back to the WhatsApp Web version bundled with Baileys
    }
    const sock = makeWASocket({
      ...(version ? { version } : {}),
      auth: state,
      logger: this.waLogger,
      browser: Browsers.macOS('Chrome'),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      getMessage: async (key) => this.recent.get(key.id),
      cachedGroupMetadata: async (jid) => this.groups.get(jid),
    });
    this.sock = sock;

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', (update) => {
      this.#onConnectionUpdate(sock, update).catch((err) => this.log.error({ err }, 'connection update handler failed'));
    });
    sock.ev.on('groups.upsert', (list) => {
      for (const g of list) this.groups.set(g.id, g);
      this.#emitChats();
    });
    sock.ev.on('groups.update', (list) => {
      for (const g of list) {
        const current = this.groups.get(g.id);
        if (current) Object.assign(current, g);
      }
      this.#emitChats();
    });
    sock.ev.on('group-participants.update', ({ id }) => this.#refreshGroupSoon(id));
    sock.ev.on('messages.update', (updates) => {
      for (const { key, update } of updates) {
        const status = ACK_STATUS[update?.status];
        if (key?.fromMe && status) this.emit('ack', { messageId: key.id, status });
      }
    });
    sock.ev.on('message-receipt.update', (updates) => {
      for (const { key, receipt } of updates) {
        if (!key?.fromMe) continue;
        this.emit('ack', { messageId: key.id, status: receipt?.readTimestamp ? 'read' : 'delivered' });
      }
    });
  }

  async #onConnectionUpdate(sock, { connection, lastDisconnect, qr }) {
    if (sock !== this.sock) return; // event from an old socket

    if (qr) {
      if (this.pairingPhone) {
        if (!this.pairingRequested) await this.#requestPairingCode();
      } else {
        const dataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
        this.#setState({ status: 'qr', qr: dataUrl, pairingCode: null });
      }
    }

    if (connection === 'open') {
      this.retryDelay = 0;
      this.pairingPhone = null;
      const user = sock.user || {};
      const id = user.id ? jidNormalizedUser(user.id) : '';
      this.#setState({
        status: 'connected',
        qr: null,
        pairingCode: null,
        error: null,
        connectedAt: new Date().toISOString(),
        me: { id, lid: user.lid ? jidNormalizedUser(user.lid) : null, name: user.name || user.notify || '', phone: id.split('@')[0] },
      });
      this.log.info({ phone: this.state.me.phone }, 'WhatsApp connected');
      this.refreshChats().catch((err) => this.log.warn({ err: err.message }, 'could not load groups'));
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const reason = lastDisconnect?.error?.message;
      this.sock = null;
      if (this.manualStop) return;
      this.log.warn({ code, reason }, 'WhatsApp connection closed');

      if (code === DisconnectReason.loggedOut) {
        this.#wipeAuth();
        this.groups.clear();
        this.emit('chats', []);
        this.#setState({
          status: 'logged_out', qr: null, pairingCode: null, me: null,
          error: 'This app was unlinked from WhatsApp (removed under Linked devices on the phone). Link it again to keep sending.',
        });
        return;
      }
      if (code === DisconnectReason.connectionReplaced) {
        this.#setState({
          status: 'error',
          error: 'This login was opened somewhere else, probably another copy of this app. Stop the other copy, then click Reconnect.',
        });
        return;
      }
      if (code === DisconnectReason.restartRequired) {
        await this.#start(); // expected right after a successful link
        return;
      }
      if (!this.hasSession()) {
        let error = `Could not link: ${reason || 'connection closed'}.`;
        if (/QR refs attempts ended/i.test(reason || '')) error = 'The code expired before it was used. Click Connect to get a new one.';
        else if (NETWORK_ERROR.test(reason || '')) error = `Could not reach WhatsApp's servers (${reason}). Check this computer's internet connection, then try again.`;
        this.#setState({ status: 'idle', qr: null, pairingCode: null, error });
        return;
      }
      this.retryDelay = Math.min(this.retryDelay ? this.retryDelay * 2 : 2000, 60000);
      this.#setState({
        status: 'reconnecting',
        error: `Connection lost (${reason || code || 'network'}). Retrying in ${Math.round(this.retryDelay / 1000)}s…`,
      });
      this.reconnectTimer = setTimeout(() => {
        this.#start().catch((err) => this.log.error({ err }, 'reconnect failed'));
      }, this.retryDelay);
    }
  }

  async #requestPairingCode() {
    if (!this.sock || !this.pairingPhone) return;
    this.pairingRequested = true;
    try {
      const raw = await this.sock.requestPairingCode(this.pairingPhone);
      const pretty = raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
      this.#setState({ status: 'pairing', pairingCode: pretty, qr: null, error: null, method: 'code' });
    } catch (err) {
      this.pairingRequested = false;
      this.#setState({ error: `Could not get a pairing code: ${err.message}` });
    }
  }

  #myIds() {
    return [this.state.me?.id, this.state.me?.lid, this.sock?.user?.id, this.sock?.user?.lid];
  }

  listChats() {
    return buildChatList([...this.groups.values()], this.#myIds());
  }

  #emitChats() {
    this.emit('chats', this.listChats());
  }

  async refreshChats() {
    if (!this.sock || !this.isConnected()) throw new Error('WhatsApp is not connected.');
    const all = await this.sock.groupFetchAllParticipating();
    this.groups = new Map(Object.entries(all));
    // Some accounts don't get the community parent in the list; look those up so we know their names.
    const parents = new Set([...this.groups.values()].map((g) => g.linkedParent).filter((p) => p && !this.groups.has(p)));
    for (const jid of parents) {
      try {
        this.groups.set(jid, await this.sock.groupMetadata(jid));
      } catch {
        this.groups.set(jid, { id: jid, subject: 'Community', isCommunity: true, participants: [] });
      }
    }
    this.#emitChats();
    return this.listChats();
  }

  #refreshGroupSoon(jid) {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(async () => {
      if (!this.sock) return;
      try {
        this.groups.set(jid, await this.sock.groupMetadata(jid));
        this.#emitChats();
      } catch { /* left the group, or it was deleted */ }
    }, 3000);
  }

  /** Send text, or a file with the text as its caption. Resolves with the WhatsApp message id. */
  async sendMessage(jid, { text, media, simulateTyping }) {
    if (!this.sock || !this.isConnected()) throw new Error('WhatsApp is not connected.');
    const sock = this.sock;
    const meta = this.groups.get(jid);
    if (meta && meta.isCommunity) {
      const err = new Error('This is the community itself. Choose its Announcements group instead.');
      err.permanent = true;
      throw err;
    }

    let content;
    if (!media) {
      content = { text };
    } else {
      const file = { url: media.path };
      const caption = text || undefined;
      if (media.kind === 'image') content = { image: file, caption, mimetype: media.mimetype };
      else if (media.kind === 'video') content = { video: file, caption, mimetype: media.mimetype };
      else content = { document: file, caption, mimetype: media.mimetype || 'application/octet-stream', fileName: media.fileName };
    }

    if (simulateTyping) {
      try {
        await sock.sendPresenceUpdate('composing', jid);
        await sleep(1200 + Math.random() * 1800);
        await sock.sendPresenceUpdate('paused', jid);
      } catch { /* typing indicator is cosmetic */ }
    }

    const msg = await withTimeout(sock.sendMessage(jid, content), SEND_TIMEOUT_MS, 'WhatsApp did not confirm the send within 90 seconds.');
    const id = msg?.key?.id;
    if (!id) throw new Error('WhatsApp did not return a message id.');
    this.recent.set(id, msg.message);
    if (this.recent.size > 1000) this.recent.delete(this.recent.keys().next().value);
    return { messageId: id };
  }
}
