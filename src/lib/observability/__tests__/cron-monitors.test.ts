import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Sentry Cron Monitor check-ins (Phase A finding: automaticVercelMonitors
 * was configured but inert, and zero manual captureCheckIn/withMonitor call
 * sites existed anywhere — meaning "a job that never runs at all" had no
 * detection mechanism, since background_job_logs only gets a row from a job
 * that actually started).
 */
const mocks = vi.hoisted(() => ({
  captureCheckIn: vi.fn(() => 'checkin-id-123'),
}));
vi.mock('@sentry/nextjs', () => ({
  captureCheckIn: mocks.captureCheckIn,
}));

import {
  shouldEmitCronCheckIns,
  resolveCronMonitorSlug,
  resolveCronMonitorConfig,
  startCronCheckIn,
  finishCronCheckIn,
} from '@/lib/observability/cron-monitors';

describe('shouldEmitCronCheckIns — gated off outside a real Vercel deployment', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('off by default in a local/test run (no VERCEL_ENV, no CI)', () => {
    vi.stubEnv('VERCEL_ENV', undefined);
    vi.stubEnv('CI', undefined);
    vi.stubEnv('GITHUB_ACTIONS', undefined);
    vi.stubEnv('HELM_SENTRY_CRON_CHECKINS', undefined);
    expect(shouldEmitCronCheckIns()).toBe(false);
  });

  it('off in CI', () => {
    vi.stubEnv('CI', 'true');
    vi.stubEnv('GITHUB_ACTIONS', 'true');
    vi.stubEnv('HELM_SENTRY_CRON_CHECKINS', undefined);
    expect(shouldEmitCronCheckIns()).toBe(false);
  });

  it('on for a real Vercel production deployment', () => {
    vi.stubEnv('CI', undefined);
    vi.stubEnv('GITHUB_ACTIONS', undefined);
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('HELM_SENTRY_CRON_CHECKINS', undefined);
    expect(shouldEmitCronCheckIns()).toBe(true);
  });

  it('on for a Vercel preview deployment', () => {
    vi.stubEnv('CI', undefined);
    vi.stubEnv('GITHUB_ACTIONS', undefined);
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('HELM_SENTRY_CRON_CHECKINS', undefined);
    expect(shouldEmitCronCheckIns()).toBe(true);
  });

  it('forced on by HELM_SENTRY_CRON_CHECKINS=true even off Vercel', () => {
    vi.stubEnv('VERCEL_ENV', undefined);
    vi.stubEnv('CI', undefined);
    vi.stubEnv('GITHUB_ACTIONS', undefined);
    vi.stubEnv('HELM_SENTRY_CRON_CHECKINS', 'true');
    expect(shouldEmitCronCheckIns()).toBe(true);
  });
});

describe('resolveCronMonitorSlug', () => {
  it('derives the slug from the registered cron route path, slashes to dashes', () => {
    expect(resolveCronMonitorSlug('log-retention')).toBe('api-cron-log-retention');
  });

  it('handles a nested v3/ path the same way', () => {
    expect(resolveCronMonitorSlug('v3-genome-nightly')).toBe('api-cron-v3-genome-nightly');
  });

  it('falls back to job-<jobType> for a jobType with no CRON_REGISTRY entry', () => {
    // e.g. an Inngest function id, a launchd job, or selfheal-close (a
    // sub-step inside log-retention's single invocation, not itself scheduled).
    expect(resolveCronMonitorSlug('selfheal-close')).toBe('job-selfheal-close');
    expect(resolveCronMonitorSlug('onCoachHelmRoundSubmitted')).toBe('job-onCoachHelmRoundSubmitted');
  });
});

describe('resolveCronMonitorConfig', () => {
  it('builds a crontab MonitorConfig for a registered job, verbatim from CRON_REGISTRY', () => {
    const config = resolveCronMonitorConfig('log-retention');
    expect(config).toEqual({
      schedule: { type: 'crontab', value: '30 7 * * *' },
      checkinMargin: 5,
      maxRuntime: 30,
      timezone: 'UTC',
    });
  });

  it('uses the every-4-hours schedule for refresh-engagement, not a stale value', () => {
    const config = resolveCronMonitorConfig('refresh-engagement');
    expect(config?.schedule).toEqual({ type: 'crontab', value: '10 */4 * * *' });
  });

  it('returns undefined for an unregistered jobType — never invents a schedule', () => {
    expect(resolveCronMonitorConfig('selfheal-close')).toBeUndefined();
    expect(resolveCronMonitorConfig('onCoachHelmRoundSubmitted')).toBeUndefined();
  });
});

describe('startCronCheckIn / finishCronCheckIn', () => {
  beforeEach(() => {
    mocks.captureCheckIn.mockClear();
    mocks.captureCheckIn.mockReturnValue('checkin-id-123');
    vi.stubEnv('HELM_SENTRY_CRON_CHECKINS', 'true');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('starts an in_progress check-in with the resolved slug + monitorConfig', () => {
    const id = startCronCheckIn('log-retention');
    expect(id).toBe('checkin-id-123');
    expect(mocks.captureCheckIn).toHaveBeenCalledWith(
      { monitorSlug: 'api-cron-log-retention', status: 'in_progress' },
      expect.objectContaining({ schedule: { type: 'crontab', value: '30 7 * * *' } }),
    );
  });

  it('finishes with ok + duration in seconds', () => {
    finishCronCheckIn('log-retention', 'checkin-id-123', 'ok', 4200);
    expect(mocks.captureCheckIn).toHaveBeenCalledWith({
      monitorSlug: 'api-cron-log-retention',
      status: 'ok',
      checkInId: 'checkin-id-123',
      duration: 4.2,
    });
  });

  it('finishes with error on a failed run', () => {
    finishCronCheckIn('log-retention', 'checkin-id-123', 'error', 100);
    expect(mocks.captureCheckIn).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error', checkInId: 'checkin-id-123' }),
    );
  });

  it('finishCronCheckIn is a no-op for a null checkInId (gated off, or start failed)', () => {
    finishCronCheckIn('log-retention', null, 'ok');
    expect(mocks.captureCheckIn).not.toHaveBeenCalled();
  });

  it('returns null and never calls captureCheckIn when check-ins are gated off', () => {
    vi.stubEnv('HELM_SENTRY_CRON_CHECKINS', undefined);
    vi.stubEnv('VERCEL_ENV', undefined);
    vi.stubEnv('CI', undefined);
    vi.stubEnv('GITHUB_ACTIONS', undefined);
    const id = startCronCheckIn('log-retention');
    expect(id).toBeNull();
    expect(mocks.captureCheckIn).not.toHaveBeenCalled();
  });

  it('NEVER THROWS: a throwing Sentry mock does not propagate out of startCronCheckIn', () => {
    mocks.captureCheckIn.mockImplementation(() => {
      throw new Error('Sentry SDK internal failure');
    });
    expect(() => startCronCheckIn('log-retention')).not.toThrow();
    expect(startCronCheckIn('log-retention')).toBeNull();
  });

  it('NEVER THROWS: a throwing Sentry mock does not propagate out of finishCronCheckIn', () => {
    mocks.captureCheckIn.mockImplementation(() => {
      throw new Error('Sentry SDK internal failure');
    });
    expect(() => finishCronCheckIn('log-retention', 'checkin-id-123', 'ok')).not.toThrow();
  });
});
