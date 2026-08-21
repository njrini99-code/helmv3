import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CRON_REGISTRY, classifyCronStatus } from '@/lib/admin/cron-registry';

// Minutes between runs implied by a standard 5-field cron expression, for the
// shapes actually used in vercel.json today: "M H * * *" (fixed daily run),
// "star-slash-N * * * *" (every N minutes), "M * * * *" (hourly), and
// "M star-slash-N * * *" (every N hours) — written out here instead of in
// literal cron syntax because a literal "*" immediately followed by "/"
// inside a /* */ block comment terminates the comment early. Not a general
// cron parser — deliberately narrow, so an unrecognized shape fails loudly
// (via the throw) rather than silently producing a wrong number that would
// make this contract test lie the same way refresh-engagement's
// hand-maintained 5-minute value did.
function cronScheduleToMinutes(schedule: string): number {
  const [min, hour, day, month, weekday] = schedule.trim().split(/\s+/);
  if (day !== '*' || month !== '*' || weekday !== '*') {
    throw new Error(`cronScheduleToMinutes: day/month/weekday fields must be '*' (got "${schedule}")`);
  }
  const everyNMin = min?.match(/^\*\/(\d+)$/);
  if (everyNMin && hour === '*') return Number(everyNMin[1]);
  const everyNHour = hour?.match(/^\*\/(\d+)$/);
  if (everyNHour && min !== undefined && /^\d+$/.test(min)) return Number(everyNHour[1]) * 60;
  if (hour === '*' && min !== undefined && /^\d+$/.test(min)) return 60;
  if (hour !== undefined && /^\d+$/.test(hour) && min !== undefined && /^\d+$/.test(min)) return 24 * 60;
  throw new Error(`cronScheduleToMinutes: unrecognized schedule shape "${schedule}"`);
}

describe('CRON_REGISTRY ↔ vercel.json contract', () => {
  const vercel = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as {
    crons: Array<{ path: string; schedule: string }>;
  };

  it('covers every scheduled cron path exactly', () => {
    const scheduled = vercel.crons.map((c) => c.path).sort();
    const registered = CRON_REGISTRY.map((e) => e.path).sort();
    expect(registered).toEqual(scheduled);
  });

  // The path-only check above passed for months while `refresh-engagement`
  // carried cadenceMinutes: 5 against a real "10 */4 * * *" (240 min)
  // schedule — a 48x drift that made the Jobs board show it falsely
  // "overdue" almost continuously. This is the check that would have caught
  // it: cadenceMinutes must match what vercel.json's own schedule string
  // implies, not just agree that the path exists on both sides.
  it.each(CRON_REGISTRY.map((entry) => [entry.jobType, entry] as const))(
    '%s: cadenceMinutes matches what vercel.json\'s schedule string implies',
    (_jobType, entry) => {
      const cronEntry = vercel.crons.find((c) => c.path === entry.path);
      expect(cronEntry, `no vercel.json cron found for path ${entry.path}`).toBeDefined();
      expect(entry.cadenceMinutes).toBe(cronScheduleToMinutes(cronEntry!.schedule));
    },
  );
});

describe('classifyCronStatus', () => {
  const now = new Date('2026-07-01T12:00:00Z');
  const hourly = { jobType: 'event-reminders', path: '/api/cron/event-reminders', cadenceMinutes: 60 };
  const runAt = (minAgo: number, status = 'completed') => ({
    started_at: new Date(now.getTime() - minAgo * 60000).toISOString(),
    status,
  });

  it('ok within 1.5x cadence', () => {
    expect(classifyCronStatus(hourly, runAt(45), now)).toBe('ok');
  });
  it('OVERDUE past 1.5x cadence — a dead cron writes nothing, absence IS the signal', () => {
    expect(classifyCronStatus(hourly, runAt(95), now)).toBe('overdue');
  });
  it('never-ran when no row exists', () => {
    expect(classifyCronStatus(hourly, null, now)).toBe('never-ran');
  });
  it('failed when the latest run failed (even if recent)', () => {
    expect(classifyCronStatus(hourly, runAt(5, 'failed'), now)).toBe('failed');
  });
});
