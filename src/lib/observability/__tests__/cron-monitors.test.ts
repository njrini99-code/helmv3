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
  flushTelemetryNow: vi.fn(),
}));
vi.mock('@sentry/nextjs', () => ({
  captureCheckIn: mocks.captureCheckIn,
}));
vi.mock('@/lib/observability/flush', () => ({
  flushTelemetryNow: mocks.flushTelemetryNow,
  scheduleTelemetryFlush: vi.fn(),
  TELEMETRY_FLUSH_TIMEOUT_MS: 2000,
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

  it('falls back to a generous 30-day interval for an unregistered jobType — never omits monitorConfig', () => {
    // The SDK's own "upsert" behavior only creates/attaches a monitor when
    // monitorConfig is present on the check-in — Sentry's docs never state
    // what an unconfigured check-in against an unknown slug does, and this
    // file refuses to risk instrumentation that silently achieves nothing.
    for (const jobType of ['selfheal-close', 'onCoachHelmRoundSubmitted']) {
      const config = resolveCronMonitorConfig(jobType);
      expect(config).toBeDefined();
      expect(config.schedule).toEqual({ type: 'interval', value: 30, unit: 'day' });
      expect(config.checkinMargin).toBe(60);
      expect(config.maxRuntime).toBe(120);
    }
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

  /**
   * `captureCheckIn` only BUFFERS. On Vercel the invocation returns straight
   * after this call and the instance freezes, so without an explicit flush
   * the terminal check-in is simply lost — which Sentry reads as a `timeout`,
   * i.e. an outage, for a job that ran fine. Measured 2026-09-04 on
   * api-cron-db-health-sampler: ok=1-4 vs timeout=8-11 per hour, error=0,
   * missed=0. The `in_progress` check-in needs no equivalent because the
   * job's own work runs after it and carries it out on someone else's flush.
   */
  it('flushes after the terminal check-in — a buffered envelope is a lost one', () => {
    const id = startCronCheckIn('log-retention');
    mocks.flushTelemetryNow.mockClear();
    finishCronCheckIn('log-retention', id, 'ok', 1200);
    expect(mocks.flushTelemetryNow).toHaveBeenCalledTimes(1);
  });

  it('flushes on the FAILURE path too — that is the path recordJobRun logs before reaching here', () => {
    const id = startCronCheckIn('log-retention');
    mocks.flushTelemetryNow.mockClear();
    finishCronCheckIn('log-retention', id, 'error', 300);
    expect(mocks.flushTelemetryNow).toHaveBeenCalledTimes(1);
  });

  it('does not flush when there is no check-in to deliver (gated off, or start failed)', () => {
    mocks.flushTelemetryNow.mockClear();
    finishCronCheckIn('log-retention', null, 'ok');
    expect(mocks.flushTelemetryNow).not.toHaveBeenCalled();
  });

  it('NEVER THROWS: a throwing Sentry mock does not propagate out of finishCronCheckIn', () => {
    mocks.captureCheckIn.mockImplementation(() => {
      throw new Error('Sentry SDK internal failure');
    });
    expect(() => finishCronCheckIn('log-retention', 'checkin-id-123', 'ok')).not.toThrow();
  });
});
