import fs from 'node:fs';
import { config, paths, ensureDirs, isLocalHost } from './config.js';
import { createLogger } from './logger.js';
import { createApp } from './app.js';

const logger = createLogger(config.logLevel);

try {
  ensureDirs();
  fs.accessSync(config.dataDir, fs.constants.W_OK);
} catch (err) {
  logger.fatal(
    `Can't write to the data folder ${config.dataDir} (${err.code || err.message}). `
    + 'Give the app write access to it. On Railway, add the variable RAILWAY_RUN_UID=0.',
  );
  process.exit(1);
}
let created;
try {
  created = await createApp({ config, paths, logger });
} catch (err) {
  logger.fatal(err.message);
  process.exit(1);
}
const { app, start, stop, accounts } = created;

// Reachable from other machines but nobody can log in yet: anyone could claim the
// first account, so require ADMIN_USERNAME / ADMIN_PASSWORD instead.
if (accounts.needsSetup && !isLocalHost(config.host)) {
  logger.fatal(
    `HOST is ${config.host}, so the dashboard can be reached from other machines, but there is no admin account yet. `
    + 'Set ADMIN_USERNAME and ADMIN_PASSWORD (in .env, or in your host\'s variables) and start again.',
  );
  process.exit(1);
}

const server = app.listen(config.port, config.host, async () => {
  const shownHost = isLocalHost(config.host) ? 'localhost' : config.host;
  logger.info(`Dashboard running at http://${shownHost}:${config.port}`);
  if (config.isDemo) logger.warn('DEMO MODE: no real WhatsApp is used. Messages are only pretend-sent.');
  if (accounts.needsSetup) logger.info(`First run: open http://localhost:${config.port} to create your admin account.`);
  logger.info(`Data folder: ${config.dataDir}`);
  await start();
});

server.on('error', (err) => {
  logger.fatal({ err: err.message }, err.code === 'EADDRINUSE' ? `Port ${config.port} is already in use. Set PORT in .env to another number.` : 'server error');
  process.exit(1);
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received, saving and shutting down…`);
  server.close();
  try {
    await stop();
  } finally {
    process.exit(0);
  }
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (err) => logger.error({ err: err?.message || String(err) }, 'unhandled rejection'));
