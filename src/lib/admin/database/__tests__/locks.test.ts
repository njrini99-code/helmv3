import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ rpc: mocks.rpc })),
}));

import { fetchLockIncidents } from '../locks';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchLockIncidents', () => {
  it('returns status:unconfigured when the migration is not applied yet', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '42883', message: 'not found' } });
    const result = await fetchLockIncidents();
    expect(result.status).toBe('unconfigured');
  });

  it('returns status:error on a genuine RPC failure', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '08006', message: 'connection failure' } });
    const result = await fetchLockIncidents();
    expect(result.status).toBe('error');
  });

  it('maps rows and counts only unresolved incidents as open', async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          id: 1,
          detected_at: '2026-09-03T12:00:00.000Z',
          kind: 'lock_wait',
          severity: 'critical',
          role_class: 'app',
          wait_ms: 6500,
          blocked_query_class: 'update golf_rounds',
          blocking_query_class: 'select golf_rounds',
          blocked_pid_count: 1,
          relation_name: 'golf_rounds',
          feature: 'round_tracking',
          release_sha: 'abc123',
          resolved_at: null,
        },
        {
          id: 2,
          detected_at: '2026-09-03T11:00:00.000Z',
          kind: 'deadlock',
          severity: 'critical',
          role_class: 'other',
          wait_ms: null,
          blocked_query_class: null,
          blocking_query_class: null,
          blocked_pid_count: null,
          relation_name: null,
          feature: null,
          release_sha: null,
          resolved_at: '2026-09-03T11:05:00.000Z',
        },
      ],
      error: null,
    });

    const result = await fetchLockIncidents();
    expect(result.status).toBe('ok');
    expect(result.data!.incidents).toHaveLength(2);
    expect(result.data!.openCount).toBe(1);
    expect(result.data!.criticalOpenCount).toBe(1);
    expect(result.data!.incidents[0]?.relationName).toBe('golf_rounds');
  });

  it('reports zero open incidents when the store is empty', async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    const result = await fetchLockIncidents();
    expect(result.status).toBe('ok');
    expect(result.data!.incidents).toEqual([]);
    expect(result.data!.openCount).toBe(0);
  });
});
