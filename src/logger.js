import pino from 'pino';

const LEVELS = { 10: 'TRACE', 20: 'DEBUG', 30: 'INFO ', 40: 'WARN ', 50: 'ERROR', 60: 'FATAL' };
const SKIP = new Set(['level', 'time', 'pid', 'hostname', 'msg', 'module']);

/** Readable one-line logs (pino writes JSON; we reformat it). */
const prettyStream = {
  write(line) {
    let o;
    try { o = JSON.parse(line); } catch { process.stdout.write(line); return; }
    const time = new Date(o.time).toLocaleTimeString();
    const extras = Object.entries(o)
      .filter(([k]) => !SKIP.has(k))
      .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join(' ');
    const prefix = o.module ? `[${o.module}] ` : '';
    const out = `${time} ${LEVELS[o.level] || o.level} ${prefix}${o.msg || ''}${extras ? `  ${extras}` : ''}\n`;
    (o.level >= 50 ? process.stderr : process.stdout).write(out);
  },
};

export function createLogger(level = 'info') {
  return pino({ level }, process.env.LOG_FORMAT === 'json' ? process.stdout : prettyStream);
}
