import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => ({ rpc: mocks.rpc })) }));

import { fetchQueryPerformance } from '../performance';

function statRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    sampled_at: '2026-09-03T12:00:00.000Z',
    queryid: '123',
    safe_query_class: 'postgrest_query',
    source_class: 'helm_product',
    calls_delta: 100,
    total_exec_ms_delta: 1_000,
    mean_exec_ms_window: 10,
    max_exec_ms_observed: 50,
    rows_delta: 100,
    regression_flags: [],
    baseline_status: 'established',
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('fetchQueryPerformance', () => {
  it('returns unconfigured when the delta engine is not applied yet', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '3F000', message: 'invalid schema name' } });
    const result = await fetchQueryPerformance();
    expect(result.status).toBe('unconfigured');
  });

  it('maps latest and recent_regressions and computes the workload split by source_class', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        latest_sampled_at: '2026-09-03T12:00:00.000Z',
        latest: [
          statRow({ source_class: 'helm_product', total_exec_ms_delta: 1_000 }),
          statRow({ id: 2, queryid: '456', source_class: 'supabase_realtime', total_exec_ms_delta: 5_000 }),
        ],
        recent_regressions: [statRow({ id: 3, regression_flags: ['mean_3x_baseline'] })],
      },
      error: null,
    });

    const result = await fetchQueryPerformance();
    expect(result.status).toBe('ok');
    expect(result.data!.latest).toHaveLength(2);
    expect(result.data!.workloadSplit).toEqual({ helm_product: 1_000, supabase_realtime: 5_000 });
    expect(result.data!.recentRegressions[0]!.regressionFlags).toEqual(['mean_3x_baseline']);
  });

  it('handles a null total_exec_ms_delta as 0 in the workload split rather than NaN', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        latest_sampled_at: '2026-09-03T12:00:00.000Z',
        latest: [statRow({ total_exec_ms_delta: null })],
        recent_regressions: [],
      },
      error: null,
    });
    const result = await fetchQueryPerformance();
    expect(result.data!.workloadSplit.helm_product).toBe(0);
  });
});
