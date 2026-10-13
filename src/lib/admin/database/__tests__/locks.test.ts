import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ rpc: mocks.rpc })),
}));

import { fetchLockIncidents, LOCK_INCIDENT_ACTIVE_WINDOW_MS } from '../locks';

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

    const result = await fetchLockIncidents(Date.parse('2026-09-03T12:05:00.000Z'));
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

  // record_db_lock_incident re-stamps detected_at while db-health-sampler
  // (every 5 min) still sees the lock, inside a 15-minute window. Nothing
  // writes resolved_at, so an unresolved row the sampler stopped re-stamping
  // has ended. Counting those as open pinned the Bridge at "100 (at least)"
  // for incidents that ended 2026-10-05 (production, 2026-10-13).
  function row(id: number, detectedAt: string, severity: 'warning' | 'critical' = 'critical') {
    return {
      id,
      detected_at: detectedAt,
      kind: 'lock_wait',
      severity,
      role_class: 'app',
      wait_ms: 9000,
      blocked_query_class: 'update golf_rounds',
      blocking_query_class: null,
      blocked_pid_count: 1,
      relation_name: 'golf_rounds',
      feature: null,
      release_sha: null,
      resolved_at: null,
    };
  }

  it('counts an unresolved incident the sampler stopped re-stamping as ended, not open', async () => {
    const now = Date.parse('2026-10-13T17:30:00.000Z');
    mocks.rpc.mockResolvedValue({
      data: [row(10, '2026-10-13T17:25:00.000Z'), row(9, '2026-10-05T13:10:11.000Z')],
      error: null,
    });
    const result = await fetchLockIncidents(now);
    expect(result.data!.openCount).toBe(1);
    expect(result.data!.criticalOpenCount).toBe(1);
    expect(result.data!.incidents.map((i) => i.active)).toEqual([true, false]);
  });

  it('does not call a full page of ended incidents a floor', async () => {
    const now = Date.parse('2026-10-13T17:30:00.000Z');
    const stale = Array.from({ length: 100 }, (_, i) => row(i + 1, '2026-10-05T13:10:11.000Z'));
    mocks.rpc.mockResolvedValue({ data: stale, error: null });
    const result = await fetchLockIncidents(now);
    expect(result.data!.openCount).toBe(0);
    expect(result.data!.criticalOpenCount).toBe(0);
    expect(result.data!.openCountIsFloor).toBe(false);
  });

  it('keeps the floor when every fetched row is still active', async () => {
    const now = Date.parse('2026-10-13T17:30:00.000Z');
    const live = Array.from({ length: 100 }, (_, i) => row(i + 1, '2026-10-13T17:29:00.000Z'));
    mocks.rpc.mockResolvedValue({ data: live, error: null });
    const result = await fetchLockIncidents(now);
    expect(result.data!.openCount).toBe(100);
    expect(result.data!.openCountIsFloor).toBe(true);
  });

  it('treats the window edge as active', async () => {
    const now = Date.parse('2026-10-13T17:30:00.000Z');
    const edge = new Date(now - LOCK_INCIDENT_ACTIVE_WINDOW_MS).toISOString();
    mocks.rpc.mockResolvedValue({ data: [row(1, edge)], error: null });
    const result = await fetchLockIncidents(now);
    expect(result.data!.openCount).toBe(1);
  });
});
