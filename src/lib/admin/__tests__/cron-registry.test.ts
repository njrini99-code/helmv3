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

// ---------------------------------------------------------------------------
// ET-2 — a cron that ran, returned 200, and knows its own work partly failed
// must not read as healthy.
//
// THE FALSE-GREEN, mechanically:
//
//   `log-retention` catches an autoResolveFixedIncidents() failure, keeps
//   going (the retention half is independent and still worth doing), returns
//   HTTP 200, and records status='completed' with metadata.degraded=true.
//   Its own comment says so: "`degraded` carries the honest signal instead of
//   the status code."
//
//   `classifyCronStatus` never sees it. The parameter type is literally
//   `{ started_at: string; status: string }` — metadata is not in scope — so
//   the honest signal the route took care to record was unreadable by the
//   board that exists to display it.
//
//   That matters most for Self-Heal, where `log-retention` IS the Close
//   stage's heartbeat: Close's work can fail while the circuit shows OK.
//
// PRECEDENCE, deliberately minimal: `degraded` only ever replaces what would
// have been `'ok'`. A failed run still reads `failed`; an overdue one still
// reads `overdue`. Nothing that already reported a problem is downgraded, so
// this cannot regress any existing row — it can only stop a green one lying.
// ---------------------------------------------------------------------------
describe('classifyCronStatus — degraded is not healthy', () => {
  const entry = { jobType: 'log-retention', path: '/api/cron/log-retention', cadenceMinutes: 1440 };
  const now = new Date('2026-08-28T12:00:00.000Z');
  const recent = '2026-08-28T11:30:00.000Z';
  const stale = '2026-08-20T11:30:00.000Z';

  it('completed + degraded=true  =>  degraded', () => {
    expect(
      classifyCronStatus(entry, { started_at: recent, status: 'completed', metadata: { degraded: true } }, now),
    ).toBe('degraded');
  });

  it('completed + degraded=false  =>  ok', () => {
    expect(
      classifyCronStatus(entry, { started_at: recent, status: 'completed', metadata: { degraded: false } }, now),
    ).toBe('ok');
  });

  it('a historical row with no metadata at all keeps its old answer', () => {
    // Rows written before `degraded` existed must not change meaning. Absent
    // is not degraded — it is "this run never reported either way".
    expect(classifyCronStatus(entry, { started_at: recent, status: 'completed' }, now)).toBe('ok');
    expect(classifyCronStatus(entry, { started_at: recent, status: 'completed', metadata: null }, now)).toBe('ok');
    expect(classifyCronStatus(entry, { started_at: recent, status: 'completed', metadata: {} }, now)).toBe('ok');
  });

  it('failed still outranks degraded', () => {
    expect(
      classifyCronStatus(entry, { started_at: recent, status: 'failed', metadata: { degraded: true } }, now),
    ).toBe('failed');
  });

  it('overdue still outranks degraded — a job that stopped running is the bigger fact', () => {
    expect(
      classifyCronStatus(entry, { started_at: stale, status: 'completed', metadata: { degraded: true } }, now),
    ).toBe('overdue');
  });

  it('a non-boolean degraded value is not treated as degraded', () => {
    // Only an explicit `true` means degraded. A string, a number or a nested
    // object is malformed metadata, and guessing from it would invent a
    // status the writer never claimed.
    for (const bad of ['true', 1, {}, [], 'yes']) {
      expect(
        classifyCronStatus(entry, { started_at: recent, status: 'completed', metadata: { degraded: bad } }, now),
      ).toBe('ok');
    }
  });
});
