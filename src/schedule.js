import { Cron } from 'croner';

/**
 * Schedule shapes (stored on each campaign):
 *   { type: 'once',    date: '2026-12-01', times: ['09:00'] }
 *   { type: 'daily',   times: ['09:00', '18:30'] }
 *   { type: 'weekly',  days: [1, 4], times: ['09:00'] }          // 0 = Sunday … 6 = Saturday
 *   { type: 'monthly', monthDays: [1, 15, 'L'], times: ['09:00'] } // 'L' = last day of month
 *   { type: 'manual' }                                            // only when "Send now" is clicked
 *   { type: 'cron',    cron: '0 9 * * 1-5' }                       // advanced
 * All times are wall-clock times in the app's timezone.
 */

export const SCHEDULE_TYPES = ['once', 'daily', 'weekly', 'monthly', 'manual', 'cron'];
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function uniqSortedTimes(times) {
  return [...new Set((times || []).map(String))].sort();
}

/** Returns an error message, or null when the schedule is valid. */
export function validateSchedule(schedule) {
  if (!schedule || !SCHEDULE_TYPES.includes(schedule.type)) return 'Pick when this message should be sent.';
  const { type } = schedule;
  if (type === 'manual') return null;
  if (type === 'cron') {
    if (!schedule.cron || typeof schedule.cron !== 'string') return 'Enter a cron expression.';
    try {
      new Cron(schedule.cron, { paused: true });
    } catch (err) {
      return `Invalid cron expression: ${err.message}`;
    }
    return null;
  }
  const times = schedule.times || [];
  if (!times.length) return 'Add at least one send time.';
  for (const t of times) if (!TIME_RE.test(t)) return `"${t}" is not a valid time (use HH:MM, 24-hour).`;
  if (type === 'once') {
    if (!DATE_RE.test(schedule.date || '')) return 'Pick a date.';
    if (times.length !== 1) return 'A one-time message has exactly one send time.';
  }
  if (type === 'weekly') {
    const days = schedule.days || [];
    if (!days.length) return 'Pick at least one day of the week.';
    if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return 'Invalid day of week.';
  }
  if (type === 'monthly') {
    const days = schedule.monthDays || [];
    if (!days.length) return 'Pick at least one day of the month.';
    if (days.some((d) => d !== 'L' && (!Number.isInteger(d) || d < 1 || d > 31))) return 'Invalid day of month.';
  }
  return null;
}

/** Normalise user input into a clean schedule object (assumes validateSchedule passed). */
export function normalizeSchedule(s) {
  switch (s.type) {
    case 'manual': return { type: 'manual' };
    case 'cron': return { type: 'cron', cron: s.cron.trim() };
    case 'once': return { type: 'once', date: s.date, times: [s.times[0]] };
    case 'daily': return { type: 'daily', times: uniqSortedTimes(s.times) };
    case 'weekly': return { type: 'weekly', days: [...new Set(s.days)].sort(), times: uniqSortedTimes(s.times) };
    case 'monthly': {
      const nums = [...new Set(s.monthDays.filter((d) => d !== 'L'))].sort((a, b) => a - b);
      return { type: 'monthly', monthDays: s.monthDays.includes('L') ? [...nums, 'L'] : nums, times: uniqSortedTimes(s.times) };
    }
    default: return s;
  }
}

/** Cron patterns (or an ISO local datetime for one-offs) that together describe the schedule. */
function patternsFor(schedule) {
  const { type } = schedule;
  if (type === 'manual') return [];
  if (type === 'cron') return [schedule.cron];
  if (type === 'once') return [`${schedule.date}T${schedule.times[0]}:00`];
  return schedule.times.map((t) => {
    const [h, m] = t.split(':').map(Number);
    if (type === 'daily') return `${m} ${h} * * *`;
    if (type === 'weekly') return `${m} ${h} * * ${schedule.days.join(',')}`;
    if (type === 'monthly') return `${m} ${h} ${schedule.monthDays.join(',')} * *`;
    throw new Error(`Unknown schedule type ${type}`);
  });
}

/** Next run strictly after `after`, or null if there is none (manual / one-off in the past). */
export function computeNextRun(schedule, timezone, after = new Date()) {
  let best = null;
  for (const pattern of patternsFor(schedule)) {
    const job = new Cron(pattern, { timezone: timezone || undefined, paused: true });
    const next = job.nextRun(after);
    job.stop();
    if (next && next > after && (!best || next < best)) best = next;
  }
  return best;
}

export function computeNextRuns(schedule, timezone, count = 5, after = new Date()) {
  const runs = [];
  let cursor = after;
  while (runs.length < count) {
    const next = computeNextRun(schedule, timezone, cursor);
    if (!next) break;
    runs.push(next);
    cursor = next;
  }
  return runs;
}

const joinList = (items) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} & ${items.at(-1)}`);
const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

/** Human readable summary, e.g. "Every Mon & Thu at 09:00". */
export function describeSchedule(schedule) {
  if (!schedule) return '';
  const at = schedule.times ? ` at ${joinList(schedule.times)}` : '';
  switch (schedule.type) {
    case 'manual': return 'Only when you click "Send now"';
    case 'cron': return `Custom: ${schedule.cron}`;
    case 'once': return `Once on ${schedule.date}${at}`;
    case 'daily': return `Every day${at}`;
    case 'weekly': {
      const days = schedule.days;
      if (days.length === 7) return `Every day${at}`;
      if (days.join() === '1,2,3,4,5') return `Every weekday${at}`;
      if (days.join() === '0,6') return `Every weekend${at}`;
      return `Every ${joinList(days.map((d) => DAY_NAMES[d]))}${at}`;
    }
    case 'monthly': {
      const days = schedule.monthDays.map((d) => (d === 'L' ? 'last day' : ordinal(d)));
      return `Monthly on the ${joinList(days)}${at}`;
    }
    default: return '';
  }
}
