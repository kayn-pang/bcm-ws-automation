import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Minimal .env loader so the app has no dotenv dependency. Real env vars win. */
function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv(path.join(ROOT_DIR, '.env'));

const driver = process.argv.includes('--demo') ? 'mock' : (process.env.WA_DRIVER || 'baileys').toLowerCase();
const isDemo = driver === 'mock' || driver === 'demo';

const defaultDataDir = path.join(ROOT_DIR, isDemo ? 'data-demo' : 'data');

export const config = {
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || '127.0.0.1',
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  dataDir: path.resolve(process.env.DATA_DIR || defaultDataDir),
  driver: isDemo ? 'mock' : 'baileys',
  isDemo,
  logLevel: process.env.LOG_LEVEL || 'info',
  /** Demo driver only: chance (0-1) that a simulated send fails, to show the retry flow. */
  mockFailRate: process.env.MOCK_FAIL_RATE !== undefined ? Number(process.env.MOCK_FAIL_RATE) : 0.12,
  /** Scheduler tick in ms. Lower only for tests. */
  tickMs: Number(process.env.TICK_MS) || 15000,
};

export const paths = {
  db: path.join(config.dataDir, 'db.json'),
  auth: path.join(config.dataDir, 'whatsapp-auth'),
  uploads: path.join(config.dataDir, 'uploads'),
  secret: path.join(config.dataDir, 'secret.key'),
};

export function ensureDirs() {
  for (const dir of [config.dataDir, paths.uploads]) fs.mkdirSync(dir, { recursive: true });
}

export function isLocalHost(host) {
  return ['127.0.0.1', 'localhost', '::1'].includes(host);
}
