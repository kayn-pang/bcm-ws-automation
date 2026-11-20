import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import QRCode from 'qrcode';
import { buildChatList } from './chats.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ME = '60123456789@s.whatsapp.net';

const g = (id, subject, extra = {}) => ({
  id: `1203630${id}@g.us`,
  subject,
  size: extra.size ?? 20 + (Number(id) % 400),
  participants: [{ id: ME, admin: extra.admin === false ? null : 'admin' }],
  ...extra,
  admin: undefined,
});

/** Fake communities and groups so the whole dashboard can be tried without a phone. */
function demoGroups() {
  const c1 = '1203630100000001@g.us';
  const c2 = '1203630100000002@g.us';
  const c3 = '1203630100000003@g.us';
  return [
    g('100000001', 'Sunrise Traders Network', { isCommunity: true, size: 812 }),
    g('100000011', 'Sunrise Traders Network', { isCommunityAnnounce: true, announce: true, linkedParent: c1, size: 812 }),
    g('100000012', 'Sunrise · General Chat', { linkedParent: c1, size: 433 }),
    g('100000013', 'Sunrise · Deals & Offers', { linkedParent: c1, announce: true, size: 517 }),

    g('100000002', 'Yoga Studio Members', { isCommunity: true, size: 264 }),
    g('100000021', 'Yoga Studio Members', { isCommunityAnnounce: true, announce: true, linkedParent: c2, size: 264 }),
    g('100000022', 'Yoga · Beginners Class', { linkedParent: c2, size: 58 }),
    g('100000023', 'Yoga · Weekend Retreat 2026', { linkedParent: c2, size: 31 }),

    g('100000003', 'Property Investors Club', { isCommunity: true, size: 1490, admin: false }),
    g('100000031', 'Property Investors Club', { isCommunityAnnounce: true, announce: true, linkedParent: c3, size: 1490, admin: false }),
    g('100000032', 'Property · Q&A', { linkedParent: c3, size: 640, admin: false }),

    g('100000041', 'Team Leads', { size: 9 }),
    g('100000042', 'Webinar Attendees · Nov', { size: 187, announce: true }),
    g('100000043', 'VIP Clients', { size: 46 }),
  ];
}

export class MockDriver extends EventEmitter {
  constructor({ dataDir, logger, failRate = 0.12 }) {
    super();
    this.sessionFile = path.join(dataDir, 'demo-session.json');
    this.log = logger;
    this.failRate = failRate;
    this.state = { status: 'idle', qr: null, pairingCode: null, me: null, error: null, connectedAt: null, method: null, demo: true };
    this.groups = [];
    this.pending = null;
  }

  async init() {
    if (fs.existsSync(this.sessionFile)) this.#open();
  }

  isConnected() { return this.state.status === 'connected'; }
  getState() { return { ...this.state }; }

  #setState(patch) {
    Object.assign(this.state, patch);
    this.emit('state', this.getState());
  }

  async connect({ method = 'qr', phone } = {}) {
    if (this.isConnected()) return;
    clearTimeout(this.pending);
    if (method === 'code') {
      const digits = String(phone || '').replace(/\D/g, '');
      if (digits.length < 8) throw new Error('Enter the full phone number with country code, digits only (e.g. 60123456789).');
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      this.#setState({ status: 'pairing', method: 'code', qr: null, pairingCode: `${code.slice(0, 4)}-${code.slice(4)}`, error: null });
    } else {
      const qr = await QRCode.toDataURL(`demo-login-${crypto.randomBytes(16).toString('hex')}`, { margin: 1, width: 320 });
      this.#setState({ status: 'qr', method: 'qr', qr, pairingCode: null, error: null });
    }
    // In demo mode the "phone" links itself after a few seconds.
    this.pending = setTimeout(() => {
      fs.writeFileSync(this.sessionFile, JSON.stringify({ linkedAt: new Date().toISOString() }));
      this.#open();
    }, Number(process.env.MOCK_LINK_MS) || 6000);
  }

  #open() {
    this.groups = demoGroups();
    this.#setState({
      status: 'connected', qr: null, pairingCode: null, error: null,
      connectedAt: new Date().toISOString(),
      me: { id: ME, lid: null, name: 'Demo Account', phone: ME.split('@')[0] },
    });
    this.emit('chats', this.listChats());
  }

  cancel() {
    clearTimeout(this.pending);
    this.#setState({ status: 'idle', qr: null, pairingCode: null, error: null });
  }

  async logout() {
    clearTimeout(this.pending);
    fs.rmSync(this.sessionFile, { force: true });
    this.groups = [];
    this.#setState({ status: 'idle', qr: null, pairingCode: null, me: null, error: null, connectedAt: null });
    this.emit('chats', []);
  }

  async stop() { clearTimeout(this.pending); }

  listChats() {
    return buildChatList(this.groups, [ME]);
  }

  async refreshChats() {
    if (!this.isConnected()) throw new Error('WhatsApp is not connected.');
    await sleep(400);
    this.emit('chats', this.listChats());
    return this.listChats();
  }

  async sendMessage(jid, { text, media }) {
    if (!this.isConnected()) throw new Error('WhatsApp is not connected.');
    const chat = this.listChats().find((c) => c.id === jid);
    if (!chat) throw new Error('This group was not found. The number may have left it.');
    if (!chat.canSend) {
      const err = new Error(chat.reason);
      err.permanent = true;
      throw err;
    }
    if (media && !fs.existsSync(media.path)) throw new Error('Attachment file is missing on disk.');
    await sleep(300 + Math.random() * 900);
    if (Math.random() < this.failRate) throw new Error('Simulated network timeout (demo mode)');
    const messageId = `DEMO${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    this.log.info({ chat: chat.name, chars: text?.length || 0, media: media?.fileName }, '[demo] pretend-sent message');
    setTimeout(() => this.emit('ack', { messageId, status: 'delivered' }), 1500 + Math.random() * 2000);
    if (Math.random() < 0.7) setTimeout(() => this.emit('ack', { messageId, status: 'read' }), 6000 + Math.random() * 8000);
    return { messageId };
  }
}
