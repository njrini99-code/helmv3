/**
 * scripts/lib/sentry-cron-checkin.mjs — the standalone-script equivalent of
 * src/lib/observability/cron-monitors.ts, for the launchd Repair job
 * (scripts/run-selfheal-repair.mjs), which cannot import the TS module (no
 * `@/` path alias / Next bundler outside `next build`/`next dev`).
 *
 * Dependency-injectable (`loadSentry`) so this is a real unit test — no live
 * DSN, no network call, matching run-selfheal-repair.test.ts's own "unit
 * tests never touch production" discipline.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCronCheckIn } from '../../../scripts/lib/sentry-cron-checkin.mjs';

function fakeSentry(overrides: Partial<{ captureCheckIn: unknown; init: unknown; flush: unknown }> = {}) {
  return {
    init: vi.fn(),
    captureCheckIn: vi.fn(() => 'checkin-id-abc'),
    flush: vi.fn(async () => true),
    ...overrides,
  };
}

describe('createCronCheckIn — enabled/disabled gating', () => {
  it('disabled when no DSN is configured — never calls loadSentry at all', async () => {
    const loadSentry = vi.fn();
    const checkIn = createCronCheckIn({ dsn: undefined, environment: 'launchd-repair', loadSentry });

    expect(checkIn.enabled).toBe(false);
    const id = await checkIn.start('job-selfheal-repair');
    expect(id).toBeNull();
    expect(loadSentry).not.toHaveBeenCalled();
  });

  it('disabled when HELM_SENTRY_CRON_CHECKINS=false, even with a DSN present', async () => {
    vi.stubEnv('HELM_SENTRY_CRON_CHECKINS', 'false');
    const loadSentry = vi.fn();
    const checkIn = createCronCheckIn({ dsn: 'https://key@sentry.io/1', environment: 'launchd-repair', loadSentry });

    expect(checkIn.enabled).toBe(false);
    await checkIn.start('job-selfheal-repair');
    expect(loadSentry).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it('enabled when a DSN is configured and no kill-switch is set', () => {
    const checkIn = createCronCheckIn({ dsn: 'https://key@sentry.io/1', environment: 'launchd-repair' });
    expect(checkIn.enabled).toBe(true);
  });
});

describe('createCronCheckIn — start/finish, with a fake Sentry client', () => {
  let sentry: ReturnType<typeof fakeSentry>;
  let loadSentry: () => Promise<ReturnType<typeof fakeSentry>>;

  beforeEach(() => {
    sentry = fakeSentry();
    loadSentry = async () => sentry;
  });

  it('start() initializes the SDK once and captures an in_progress check-in', async () => {
    const checkIn = createCronCheckIn({ dsn: 'https://key@sentry.io/1', environment: 'launchd-repair', loadSentry });
    const monitorConfig = { schedule: { type: 'interval', value: 1, unit: 'day' } };

    const id = await checkIn.start('job-selfheal-repair', monitorConfig);

    expect(id).toBe('checkin-id-abc');
    expect(sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: 'https://key@sentry.io/1', environment: 'launchd-repair' }),
    );
    expect(sentry.captureCheckIn).toHaveBeenCalledWith(
      { monitorSlug: 'job-selfheal-repair', status: 'in_progress' },
      monitorConfig,
    );
  });

  it('finish() sends ok/error with duration in seconds, then flushes', async () => {
    const checkIn = createCronCheckIn({ dsn: 'https://key@sentry.io/1', environment: 'launchd-repair', loadSentry });

    await checkIn.finish('job-selfheal-repair', 'checkin-id-abc', 'ok', 4200);

    expect(sentry.captureCheckIn).toHaveBeenCalledWith({
      monitorSlug: 'job-selfheal-repair',
      status: 'ok',
      checkInId: 'checkin-id-abc',
      duration: 4.2,
    });
    expect(sentry.flush).toHaveBeenCalled();
  });

  it('finish() is a no-op for a null checkInId', async () => {
    const checkIn = createCronCheckIn({ dsn: 'https://key@sentry.io/1', environment: 'launchd-repair', loadSentry });

    await checkIn.finish('job-selfheal-repair', null, 'ok');

    expect(sentry.captureCheckIn).not.toHaveBeenCalled();
    expect(sentry.flush).not.toHaveBeenCalled();
  });

  it('reuses the same initialized client across start() and finish() (init called once)', async () => {
    const checkIn = createCronCheckIn({ dsn: 'https://key@sentry.io/1', environment: 'launchd-repair', loadSentry });

    await checkIn.start('job-selfheal-repair');
    await checkIn.finish('job-selfheal-repair', 'checkin-id-abc', 'ok');

    expect(sentry.init).toHaveBeenCalledTimes(1);
  });
});

describe('createCronCheckIn — NEVER THROWS, and bounds a hung call', () => {
  it('start() swallows a throwing captureCheckIn and returns null', async () => {
    const sentry = fakeSentry({
      captureCheckIn: vi.fn(() => {
        throw new Error('Sentry SDK internal failure');
      }),
    });
    const checkIn = createCronCheckIn({
      dsn: 'https://key@sentry.io/1',
      environment: 'launchd-repair',
      loadSentry: async () => sentry,
    });

    await expect(checkIn.start('job-selfheal-repair')).resolves.toBeNull();
  });

  it('finish() swallows a throwing captureCheckIn without throwing', async () => {
    const sentry = fakeSentry({
      captureCheckIn: vi.fn(() => {
        throw new Error('Sentry SDK internal failure');
      }),
    });
    const checkIn = createCronCheckIn({
      dsn: 'https://key@sentry.io/1',
      environment: 'launchd-repair',
      loadSentry: async () => sentry,
    });

    await expect(checkIn.finish('job-selfheal-repair', 'id', 'ok')).resolves.toBeUndefined();
  });

  it('a loadSentry() that rejects (package unresolvable) degrades to disabled behavior, not a throw', async () => {
    const checkIn = createCronCheckIn({
      dsn: 'https://key@sentry.io/1',
      environment: 'launchd-repair',
      loadSentry: async () => {
        throw new Error('Cannot find module @sentry/node');
      },
    });

    await expect(checkIn.start('job-selfheal-repair')).resolves.toBeNull();
  });

  it('a loadSentry() that never resolves is bounded by timeoutMs, not left hanging forever', async () => {
    const checkIn = createCronCheckIn({
      dsn: 'https://key@sentry.io/1',
      environment: 'launchd-repair',
      loadSentry: () => new Promise(() => {}), // never resolves
      timeoutMs: 20,
    });

    const id = await checkIn.start('job-selfheal-repair');
    expect(id).toBeNull();
  });
});
