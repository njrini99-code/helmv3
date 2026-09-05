import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ rpc: mocks.rpc })),
}));

import { fetchJobsHealth } from '../jobs';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchJobsHealth', () => {
  it('returns status:unconfigured when the migration is not applied yet', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '42883', message: 'not found' } });
    const result = await fetchJobsHealth();
    expect(result.status).toBe('unconfigured');
  });

  it('returns status:error on a genuine RPC failure', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '08006', message: 'connection failure' } });
    const result = await fetchJobsHealth();
    expect(result.status).toBe('error');
  });

  it('maps cron jobs and evaluates each with the pure classifier', async () => {
    // fetchJobsHealth evaluates against the real clock, and the classifier
    // flags a daily job with no run inside 48h as telemetry_defect. A literal
    // start_time here was a time bomb: it passed until 2026-09-05T04:10Z and
    // then failed every CI run on every branch. Keep the run one hour old
    // relative to now so the fixture never ages into a finding.
    const oneHourAgo = new Date(Date.now() - 60 * 60_000);
    const startTime = oneHourAgo.toISOString();
    const endTime = new Date(oneHourAgo.getTime() + 2_000).toISOString();
    mocks.rpc.mockResolvedValue({
      data: {
        cron: [
          {
            jobid: 1,
            jobname: 'admin-events-prune',
            schedule: '10 4 * * *',
            active: true,
            recent_runs: [
              { status: 'succeeded', start_time: startTime, end_time: endTime, duration_ms: 2000, return_message: 'ok' },
            ],
          },
        ],
        cron_capability: 'available',
        net_queue_depth: 0,
        net_queue_capability: 'available',
        net_responses_24h: [],
        net_responses_capability: 'available',
      },
      error: null,
    });

    const result = await fetchJobsHealth();
    expect(result.status).toBe('ok');
    expect(result.data!.cronJobs).toHaveLength(1);
    expect(result.data!.cronJobs[0]!.findings).toEqual([]);
    expect(result.data!.cronCapability).toBe('available');
  });

  it('surfaces cron_capability:unavailable without failing the whole read', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        cron: null,
        cron_capability: 'unavailable',
        net_queue_depth: 5,
        net_queue_capability: 'available',
        net_responses_24h: [],
        net_responses_capability: 'available',
      },
      error: null,
    });

    const result = await fetchJobsHealth();
    expect(result.status).toBe('ok');
    expect(result.data!.cronCapability).toBe('unavailable');
    expect(result.data!.cronJobs).toEqual([]);
    expect(result.data!.netQueueDepth).toBe(5);
  });

  it('surfaces net_responses_capability:unavailable independently of a healthy queue read', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        cron: [],
        cron_capability: 'available',
        net_queue_depth: 2,
        net_queue_capability: 'available',
        net_responses_24h: null,
        net_responses_capability: 'unavailable',
      },
      error: null,
    });

    const result = await fetchJobsHealth();
    expect(result.data!.netResponsesCapability).toBe('unavailable');
    expect(result.data!.netQueueCapability).toBe('available');
    expect(result.data!.netFindings).toEqual([]); // never evaluated from an unavailable capability
  });

  it('computes pg_net findings from the mapped response buckets', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        cron: [],
        cron_capability: 'available',
        net_queue_depth: 0,
        net_queue_capability: 'available',
        net_responses_24h: [
          { status_code: 200, has_error: false, response_count: 5 },
          { status_code: 500, has_error: true, response_count: 20 },
        ],
        net_responses_capability: 'available',
      },
      error: null,
    });

    const result = await fetchJobsHealth();
    expect(result.data!.netFindings).toContain('elevated_error_rate');
  });
});
