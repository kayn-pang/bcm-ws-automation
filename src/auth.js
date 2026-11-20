import crypto from 'node:crypto';
import { newId } from './store.js';

export const SESSION_DAYS = 30;
const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;
const MIN_PASSWORD = 8;

/** Passwords are never stored, only a salted scrypt hash of them. */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  const [algo, salt, hash] = String(stored || '').split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const given = crypto.scryptSync(String(password ?? ''), salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === given.length && crypto.timingSafeEqual(given, expected);
}

export class AccountError extends Error {}

const DUMMY_HASH = hashPassword(crypto.randomBytes(12).toString('hex'));

/**
 * Dashboard accounts, kept in data/db.json. Everyone with an account has full access.
 *
 * ADMIN_USERNAME / ADMIN_PASSWORD (environment) define one account that always uses
 * that password. It's how a server gets its first admin, and how you get back in if
 * you forget a password: set ADMIN_PASSWORD and restart.
 */
export class Accounts {
  constructor({ store, secret, envAdmin = {} }) {
    this.store = store;
    this.secret = secret;
    if (!Array.isArray(store.data.users)) store.data.users = [];
    this.#syncEnvAdmin(envAdmin);
  }

  get users() { return this.store.data.users; }
  get needsSetup() { return this.users.length === 0; }

  #syncEnvAdmin({ username, password }) {
    const name = (username || 'admin').trim();
    for (const u of this.users) {
      if (u.managedByEnv && (!password || u.username.toLowerCase() !== name.toLowerCase())) u.managedByEnv = false;
    }
    if (!password) return;
    if (!USERNAME_RE.test(name)) throw new AccountError(`ADMIN_USERNAME "${name}" is not valid: use 3-32 letters, numbers, dots, dashes or underscores.`);
    let user = this.users.find((u) => u.username.toLowerCase() === name.toLowerCase());
    if (!user) {
      user = { id: newId('u_'), username: name, passwordHash: null, createdAt: new Date().toISOString() };
      this.users.push(user);
    }
    // Only re-hash when the password actually changed, so logins survive restarts.
    if (!verifyPassword(password, user.passwordHash)) user.passwordHash = hashPassword(password);
    user.managedByEnv = true;
    this.store.touch();
  }

  find(id) {
    return this.users.find((u) => u.id === id) || null;
  }

  publicUser(u, me) {
    return { id: u.id, username: u.username, createdAt: u.createdAt, managedByEnv: !!u.managedByEnv, isYou: me?.id === u.id };
  }

  #checkNew(username, password) {
    const name = String(username || '').trim();
    if (!USERNAME_RE.test(name)) throw new AccountError('Username must be 3-32 characters: letters, numbers, dots, dashes or underscores.');
    if (this.users.some((u) => u.username.toLowerCase() === name.toLowerCase())) throw new AccountError('That username is already taken.');
    this.#checkPassword(password);
    return name;
  }

  #checkPassword(password) {
    if (String(password || '').length < MIN_PASSWORD) throw new AccountError(`Password must be at least ${MIN_PASSWORD} characters.`);
  }

  create(username, password) {
    const name = this.#checkNew(username, password);
    const user = { id: newId('u_'), username: name, passwordHash: hashPassword(password), createdAt: new Date().toISOString() };
    this.users.push(user);
    this.store.touch();
    return user;
  }

  remove(id) {
    const user = this.find(id);
    if (!user) throw new AccountError('Account not found.');
    if (user.managedByEnv) throw new AccountError('This account is set by ADMIN_USERNAME / ADMIN_PASSWORD on the server. Remove those settings to delete it.');
    if (this.users.length === 1) throw new AccountError("You can't remove the last account.");
    this.store.data.users = this.users.filter((u) => u.id !== id);
    this.store.touch();
  }

  changePassword(user, current, next) {
    if (user.managedByEnv) throw new AccountError('This password is set by ADMIN_PASSWORD on the server. Change it there and restart the app.');
    if (!verifyPassword(current, user.passwordHash)) throw new AccountError('Your current password is wrong.');
    this.#checkPassword(next);
    user.passwordHash = hashPassword(next);
    this.store.touch();
  }

  /** Returns the user, or null. Takes the same time whether or not the username exists. */
  authenticate(username, password) {
    const name = String(username || '').trim().toLowerCase();
    const user = this.users.find((u) => u.username.toLowerCase() === name);
    const ok = verifyPassword(password, user?.passwordHash || DUMMY_HASH);
    return user && ok ? user : null;
  }

  // Sessions are signed with a secret kept in data/secret.key and tied to the
  // password hash, so changing a password logs that account out everywhere.
  #sign(id, ts, user) {
    return crypto.createHmac('sha256', this.secret).update(`${id}.${ts}.${user.passwordHash}`).digest('hex');
  }

  makeToken(user) {
    const ts = Date.now().toString(36);
    return `${user.id}.${ts}.${this.#sign(user.id, ts, user)}`;
  }

  userFromToken(token) {
    const [id, ts, sig] = String(token || '').split('.');
    if (!id || !ts || !sig) return null;
    if (Date.now() - parseInt(ts, 36) > SESSION_DAYS * 86400000) return null;
    const user = this.find(id);
    if (!user) return null;
    const expected = Buffer.from(this.#sign(id, ts, user));
    const given = Buffer.from(sig);
    return expected.length === given.length && crypto.timingSafeEqual(expected, given) ? user : null;
  }
}
