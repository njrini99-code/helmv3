import { describe, it, expect } from 'vitest';
import {
  evaluateCronJob,
  inferCronCadenceMinutes,
  evaluatePgNetHealth,
  NET_BACKLOG_WARNING,
  NET_ERROR_RATE_MIN_TOTAL,
  type CronJobRecord,
  type CronRunRecord,
  type PgNetHealth,
} from '../jobs-health';

const NOW = new Date('2026-09-03T12:00:00.000Z');

function run(overrides: Partial<CronRunRecord> = {}): CronRunRecord {
  return { status: 'succeeded', startTime: '2026-09-03T11:00:00.000Z', endTime: '2026-09-03T11:00:05.000Z', durationMs: 5_000, ...overrides };
}

function job(overrides: Partial<CronJobRecord> = {}): CronJobRecord {
  return { jobId: 1, jobName: 'admin-events-prune', schedule: '10 4 * * *', active: true, recentRuns: [run()], ...overrides };
}

describe('inferCronCadenceMinutes', () => {
  it('parses every-N-minutes', () => {
    expect(inferCronCadenceMinutes('*/5 * * * *')).toBe(5);
    expect(inferCronCadenceMinutes('*/15 * * * *')).toBe(15);
  });

  it('parses every-N-hours', () => {
    expect(inferCronCadenceMinutes('10 */4 * * *')).toBe(240);
  });

  it('parses a fixed daily time as 24h', () => {
    expect(inferCronCadenceMinutes('30 4 * * *')).toBe(24 * 60);
  });

  it('returns null (never guesses) for a pattern outside the recognized shapes', () => {
    expect(inferCronCadenceMinutes('17 3,9,15,21 * * *')).toBeNull();
    expect(inferCronCadenceMinutes('0 0 * * 1')).toBeNull();
  });
});

describe('evaluateCronJob', () => {
  it('flags never_run when there is no run history at all', () => {
    const result = evaluateCronJob(job({ recentRuns: [] }), NOW);
    expect(result.findings).toEqual(['never_run']);
    expect(result.medianDurationMs).toBeNull();
  });

  it('reports no findings for a healthy, on-time, succeeding job', () => {
    const recent = run({ startTime: '2026-09-03T04:10:00.000Z', status: 'succeeded', durationMs: 1_000 });
    const result = evaluateCronJob(job({ schedule: '10 4 * * *', recentRuns: [recent] }), NOW);
    expect(result.findings).toEqual([]);
  });

  it('flags last_run_failed when the most recent run did not succeed', () => {
    const result = evaluateCronJob(job({ recentRuns: [run({ status: 'failed' })] }), NOW);
    expect(result.findings).toContain('last_run_failed');
  });

  it('flags repeated_failure at 2+ consecutive failures from the most recent run backward', () => {
    const result = evaluateCronJob(
      job({ recentRuns: [run({ status: 'failed' }), run({ status: 'failed' }), run({ status: 'succeeded' })] }),
      NOW,
    );
    expect(result.findings).toContain('repeated_failure');
  });

  it('does not flag repeated_failure when only the single most recent run failed', () => {
    const result = evaluateCronJob(
      job({ recentRuns: [run({ status: 'failed' }), run({ status: 'succeeded' }), run({ status: 'succeeded' })] }),
      NOW,
    );
    expect(result.findings).not.toContain('repeated_failure');
  });

  it('flags abnormal_duration when the latest run exceeds 3x the median of recent runs', () => {
    const history = [
      run({ durationMs: 40_000 }), // latest, way above median
      run({ durationMs: 1_000 }),
      run({ durationMs: 1_000 }),
      run({ durationMs: 1_000 }),
    ];
    const result = evaluateCronJob(job({ recentRuns: history }), NOW);
    expect(result.findings).toContain('abnormal_duration');
  });

  it('does not flag abnormal_duration for a modest fluctuation under 3x median', () => {
    const history = [run({ durationMs: 2_500 }), run({ durationMs: 1_000 }), run({ durationMs: 1_000 })];
    const result = evaluateCronJob(job({ recentRuns: history }), NOW);
    expect(result.findings).not.toContain('abnormal_duration');
  });

  it('flags telemetry_defect when the last run is older than 2x the inferred cadence, never guessing an unparseable schedule', () => {
    const stale = run({ startTime: '2026-09-03T05:00:00.000Z' }); // 7h before NOW
    const fiveMinuteJob = evaluateCronJob(job({ schedule: '*/5 * * * *', recentRuns: [stale] }), NOW);
    expect(fiveMinuteJob.findings).toContain('telemetry_defect');

    const unparseableSchedule = evaluateCronJob(job({ schedule: '0 0 * * 1', recentRuns: [stale] }), NOW);
    expect(unparseableSchedule.findings).not.toContain('telemetry_defect');
  });

  it('does not flag telemetry_defect when the last run is within 2x cadence', () => {
    const recent = run({ startTime: '2026-09-03T11:58:00.000Z' });
    const result = evaluateCronJob(job({ schedule: '*/5 * * * *', recentRuns: [recent] }), NOW);
    expect(result.findings).not.toContain('telemetry_defect');
  });
});

function netHealth(overrides: Partial<PgNetHealth> = {}): PgNetHealth {
  return {
    queueDepth: 0,
    queueCapability: 'available',
    responseBuckets: [],
    responsesCapability: 'available',
    ...overrides,
  };
}

describe('evaluatePgNetHealth', () => {
  it('produces no findings for an empty, healthy queue', () => {
    expect(evaluatePgNetHealth(netHealth())).toEqual([]);
  });

  it('flags backlog_anomaly at or above the queue-depth threshold', () => {
    const result = evaluatePgNetHealth(netHealth({ queueDepth: NET_BACKLOG_WARNING }));
    expect(result).toContain('backlog_anomaly');
  });

  it('never flags backlog_anomaly when the queue capability is unavailable, even with a stale null depth', () => {
    const result = evaluatePgNetHealth(netHealth({ queueCapability: 'unavailable', queueDepth: null }));
    expect(result).not.toContain('backlog_anomaly');
  });

  it('flags elevated_error_rate once errors clear both the rate and the minimum-total floor', () => {
    const result = evaluatePgNetHealth(
      netHealth({
        responseBuckets: [
          { statusCode: 200, hasError: false, responseCount: 90 },
          { statusCode: 500, hasError: true, responseCount: 10 },
        ],
      }),
    );
    expect(result).toContain('elevated_error_rate');
  });

  it('does not flag elevated_error_rate below the minimum-total floor even at 100% errors', () => {
    const result = evaluatePgNetHealth(
      netHealth({ responseBuckets: [{ statusCode: 500, hasError: true, responseCount: NET_ERROR_RATE_MIN_TOTAL - 1 }] }),
    );
    expect(result).not.toContain('elevated_error_rate');
  });

  it('never flags elevated_error_rate when the responses capability is unavailable', () => {
    const result = evaluatePgNetHealth(
      netHealth({
        responsesCapability: 'unavailable',
        responseBuckets: [{ statusCode: 500, hasError: true, responseCount: 1000 }],
      }),
    );
    expect(result).not.toContain('elevated_error_rate');
  });
});
