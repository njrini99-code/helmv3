import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ rpc: mocks.rpc })),
}));

import { fetchTableHealth } from '../tables';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    sampled_at: '2026-09-03T12:00:00.000Z',
    relation_name: 'public.golf_rounds',
    n_live_tup: 10_000,
    n_dead_tup: 100,
    dead_ratio: 0.01,
    last_autovacuum: '2026-09-03T00:00:00.000Z',
    last_autoanalyze: '2026-09-03T00:00:00.000Z',
    seq_scan: 10,
    idx_scan: 1_000,
    n_tup_ins: 500,
    n_tup_upd: 200,
    n_tup_del: 10,
    total_bytes: 1_000_000,
    index_bytes: 200_000,
    n_dead_tup_delta: 5,
    seq_scan_delta: 1,
    idx_scan_delta: 50,
    n_tup_ins_delta: 100,
    n_tup_upd_delta: 50,
    n_tup_del_delta: 5,
    collector_status: 'ok',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchTableHealth', () => {
  it('returns status:unconfigured when the migration is not applied yet', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'not found' } });
    const result = await fetchTableHealth();
    expect(result.status).toBe('unconfigured');
  });

  it('returns status:error on a genuine RPC failure', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '08006', message: 'connection failure' } });
    const result = await fetchTableHealth();
    expect(result.status).toBe('error');
  });

  it('keeps only the latest sample per relation from an append-log of many windows', async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        row({ id: 3, sampled_at: '2026-09-03T14:00:00.000Z', relation_name: 'public.golf_rounds' }),
        row({ id: 2, sampled_at: '2026-09-03T13:00:00.000Z', relation_name: 'public.golf_rounds' }),
        row({ id: 1, sampled_at: '2026-09-03T14:00:00.000Z', relation_name: 'public.golf_shots' }),
      ],
      error: null,
    });

    const result = await fetchTableHealth();
    expect(result.status).toBe('ok');
    expect(result.data!.tables).toHaveLength(2);
    expect(result.data!.tables.find((t) => t.relationName === 'public.golf_rounds')?.sampledAt).toBe(
      '2026-09-03T14:00:00.000Z',
    );
    expect(result.data!.latestSampledAt).toBe('2026-09-03T14:00:00.000Z');
  });

  it('surfaces evaluateTableHealth warnings computed at read time', async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        row({
          relation_name: 'public.golf_shots',
          dead_ratio: 0.5,
          n_dead_tup_delta: 500,
        }),
      ],
      error: null,
    });

    const result = await fetchTableHealth();
    expect(result.data!.warnings.some((w) => w.kind === 'dead_tuples_rising' && w.relationName === 'public.golf_shots')).toBe(
      true,
    );
  });

  it('returns an empty snapshot (not an error) when no samples exist yet', async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    const result = await fetchTableHealth();
    expect(result.status).toBe('ok');
    expect(result.data!.tables).toEqual([]);
    expect(result.data!.latestSampledAt).toBeNull();
  });
});
