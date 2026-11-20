import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeNextRun, computeNextRuns, describeSchedule, normalizeSchedule, validateSchedule } from '../src/schedule.js';

const iso = (d) => d?.toISOString() ?? null;
const KL = 'Asia/Kuala_Lumpur'; // UTC+8, no daylight saving

test('daily schedule uses the configured timezone', () => {
  const next = computeNextRun({ type: 'daily', times: ['09:00'] }, KL, new Date('2026-11-20T00:00:00Z'));
  assert.equal(iso(next), '2026-11-20T01:00:00.000Z');
});

test('next run is strictly after the given moment (no double send)', () => {
  const next = computeNextRun({ type: 'daily', times: ['09:00'] }, KL, new Date('2026-11-20T01:00:00Z'));
  assert.equal(iso(next), '2026-11-21T01:00:00.000Z');
});

test('weekly schedule with several days and times', () => {
  const runs = computeNextRuns({ type: 'weekly', days: [1, 4], times: ['09:00', '18:30'] }, 'UTC', 5, new Date('2026-11-20T00:00:00Z'));
  assert.deepEqual(runs.map(iso), [
    '2026-11-23T09:00:00.000Z',
    '2026-11-23T18:30:00.000Z',
    '2026-11-26T09:00:00.000Z',
    '2026-11-26T18:30:00.000Z',
    '2026-11-30T09:00:00.000Z',
  ]);
});

test('monthly schedule supports "last day of month"', () => {
  const runs = computeNextRuns({ type: 'monthly', monthDays: [1, 15, 'L'], times: ['09:00'] }, 'UTC', 4, new Date('2026-02-02T00:00:00Z'));
  assert.deepEqual(runs.map(iso), [
    '2026-02-15T09:00:00.000Z',
    '2026-02-28T09:00:00.000Z',
    '2026-03-01T09:00:00.000Z',
    '2026-03-15T09:00:00.000Z',
  ]);
});

test('one-time schedule runs once, then never again', () => {
  const s = { type: 'once', date: '2026-12-01', times: ['10:30'] };
  assert.equal(iso(computeNextRun(s, KL, new Date('2026-11-20T00:00:00Z'))), '2026-12-01T02:30:00.000Z');
  assert.equal(computeNextRun(s, KL, new Date('2026-12-01T02:30:00Z')), null);
});

test('manual schedules never run on their own', () => {
  assert.equal(computeNextRun({ type: 'manual' }, KL, new Date()), null);
});

test('wall-clock time is kept across daylight saving changes', () => {
  // New York switches to daylight time on 8 March 2026.
  const runs = computeNextRuns({ type: 'daily', times: ['09:00'] }, 'America/New_York', 3, new Date('2026-03-06T20:00:00Z'));
  assert.deepEqual(runs.map(iso), ['2026-03-07T14:00:00.000Z', '2026-03-08T13:00:00.000Z', '2026-03-09T13:00:00.000Z']);
});

test('custom cron expressions', () => {
  const next = computeNextRun({ type: 'cron', cron: '0 9 * * 1-5' }, 'UTC', new Date('2026-11-21T00:00:00Z')); // Saturday
  assert.equal(iso(next), '2026-11-23T09:00:00.000Z');
});

test('validation catches bad input', () => {
  assert.match(validateSchedule(null), /Pick when/);
  assert.match(validateSchedule({ type: 'daily', times: [] }), /at least one send time/);
  assert.match(validateSchedule({ type: 'daily', times: ['25:00'] }), /not a valid time/);
  assert.match(validateSchedule({ type: 'weekly', days: [], times: ['09:00'] }), /day of the week/);
  assert.match(validateSchedule({ type: 'monthly', monthDays: [32], times: ['09:00'] }), /Invalid day of month/);
  assert.match(validateSchedule({ type: 'once', date: 'tomorrow', times: ['09:00'] }), /Pick a date/);
  assert.match(validateSchedule({ type: 'cron', cron: 'not a cron' }), /Invalid cron/);
  assert.equal(validateSchedule({ type: 'weekly', days: [1], times: ['09:00'] }), null);
});

test('normalising sorts and de-duplicates', () => {
  assert.deepEqual(normalizeSchedule({ type: 'weekly', days: [4, 1, 4], times: ['18:00', '09:00', '09:00'], date: 'x' }), {
    type: 'weekly', days: [1, 4], times: ['09:00', '18:00'],
  });
  assert.deepEqual(normalizeSchedule({ type: 'monthly', monthDays: ['L', 15, 1], times: ['09:00'] }).monthDays, [1, 15, 'L']);
});

test('human readable summaries', () => {
  assert.equal(describeSchedule({ type: 'weekly', days: [1, 4], times: ['09:00'] }), 'Every Mon & Thu at 09:00');
  assert.equal(describeSchedule({ type: 'weekly', days: [1, 2, 3, 4, 5], times: ['08:00'] }), 'Every weekday at 08:00');
  assert.equal(describeSchedule({ type: 'daily', times: ['09:00', '18:30'] }), 'Every day at 09:00 & 18:30');
  assert.equal(describeSchedule({ type: 'monthly', monthDays: [1, 'L'], times: ['20:00'] }), 'Monthly on the 1st & last day at 20:00');
});
