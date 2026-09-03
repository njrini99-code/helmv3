import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => ({ rpc: mocks.rpc })) }));

import { fetchDatabaseErrors } from '../errors';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'row-1',
    fingerprint: 'supabase|postgrest|round_tracking|rpc|save_partial_round_atomic|42501',
    service: 'postgrest',
    environment: 'production',
    release_sha: null,
    feature: 'round_tracking',
    action: 'save_partial_round',
    operation: 'rpc',
    relation_name: null,
    rpc_name: 'save_partial_round_atomic',
    error_code: '42501',
    sqlstate: '42501',
    severity: 'error',
    expectedness: 'unexpected',
    retryability: 'no',
    normalized_message: 'permission denied',
    safe_details: null,
    safe_hint: null,
    occurrence_count: 3,
    first_seen_at: '2026-09-03T10:00:00.000Z',
    last_seen_at: '2026-09-03T11:00:00.000Z',
    helm_trace_id: null,
    sentry_trace_id: null,
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('fetchDatabaseErrors', () => {
  it('returns unconfigured when the read RPC is not applied yet', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '42883', message: 'undefined function' } });
    const result = await fetchDatabaseErrors();
    expect(result.status).toBe('unconfigured');
  });

  it('groups multiple hour-bucket rows sharing a fingerprint into one card', async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        row({ id: 'a', last_seen_at: '2026-09-03T09:00:00.000Z', occurrence_count: 2 }),
        row({ id: 'b', last_seen_at: '2026-09-03T11:00:00.000Z', occurrence_count: 3 }),
      ],
      error: null,
    });

    const result = await fetchDatabaseErrors();
    expect(result.data!.groups).toHaveLength(1);
    const group = result.data!.groups[0]!;
    expect(group.totalOccurrences).toBe(5);
    expect(group.bucketCount).toBe(2);
    expect(group.latest.id).toBe('b'); // the LATER bucket is "latest"
    expect(result.data!.totalEvents).toBe(5);
  });

  it('keeps distinct fingerprints as separate groups', async () => {
    mocks.rpc.mockResolvedValue({
      data: [row({ id: 'a' }), row({ id: 'b', fingerprint: 'supabase|postgrest|round_tracking|rpc|submit_round_atomic|23505', severity: 'warning' })],
      error: null,
    });
    const result = await fetchDatabaseErrors();
    expect(result.data!.groups).toHaveLength(2);
  });

  it('counts critical groups correctly', async () => {
    mocks.rpc.mockResolvedValue({
      data: [row({ severity: 'critical' }), row({ id: 'b', fingerprint: 'other', severity: 'warning' })],
      error: null,
    });
    const result = await fetchDatabaseErrors();
    expect(result.data!.criticalCount).toBe(1);
  });
});
