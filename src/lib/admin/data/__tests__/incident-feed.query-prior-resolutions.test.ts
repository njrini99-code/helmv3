import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Chain-builder mock for the admin client, in the shape
 * incident-resolver.test.ts already established: every fluent method returns
 * the same chain, and `.order()` is the terminal call this query's real code
 * actually awaits (queryPriorResolutions never chains anything after it).
 *
 * `neq`/`not` calls are recorded so the RCA-exclusion filter
 * (@/lib/admin/rca inserts admin_events rows with event_type='rca_analysis')
 * can be asserted on directly, rather than only inferred from returned rows —
 * the mock can't emulate real Postgres filtering, so what actually matters is
 * that the filter was CHAINED onto the query.
 */
const mocks = vi.hoisted(() => ({
  neqCalls: [] as Array<{ column: string; value: unknown }>,
  notCalls: [] as Array<{ column: string; op: string; value: unknown }>,
  rows: [] as Array<{ fingerprint: string; resolved_at: string }>,
}));

function makeChain() {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    not: (column: string, op: string, value: unknown) => {
      mocks.notCalls.push({ column, op, value });
      return chain;
    },
    neq: (column: string, value: unknown) => {
      mocks.neqCalls.push({ column, value });
      return chain;
    },
    in: () => chain,
    gte: () => chain,
    // Terminal call in queryPriorResolutions' real query — resolves directly
    // rather than returning the chain, matching what `await ...order(...)`
    // needs.
    order: () => Promise.resolve({ data: mocks.rows, error: null }),
  };
  return chain;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'admin_events') throw new Error(`unexpected table ${table}`);
      return makeChain();
    },
  }),
}));

import { queryPriorResolutions } from '@/lib/admin/data/incident-feed';

beforeEach(() => {
  mocks.neqCalls.length = 0;
  mocks.notCalls.length = 0;
  mocks.rows = [];
});

describe('queryPriorResolutions — RCA-exclusion filter', () => {
  it('chains a neq(event_type, rca_analysis) filter so an in-app analysis can never read as a prior resolution', async () => {
    mocks.rows = [{ fingerprint: 'fp-1', resolved_at: '2026-08-01T00:00:00Z' }];

    await queryPriorResolutions(['fp-1']);

    expect(mocks.neqCalls).toContainEqual({ column: 'event_type', value: 'rca_analysis' });
  });

  it('keeps the pre-existing resolved_by-not-null guard alongside the new filter', async () => {
    await queryPriorResolutions(['fp-1']);

    expect(mocks.notCalls).toContainEqual({ column: 'resolved_by', op: 'is', value: null });
  });

  it('still returns real prior resolutions unaffected by the added filter', async () => {
    mocks.rows = [{ fingerprint: 'fp-1', resolved_at: '2026-08-01T00:00:00Z' }];

    const result = await queryPriorResolutions(['fp-1']);

    expect(result.get('fp-1')).toBe('2026-08-01T00:00:00Z');
  });

  it('never touches the client for an empty fingerprint list', async () => {
    const result = await queryPriorResolutions([]);

    expect(result.size).toBe(0);
    expect(mocks.neqCalls).toHaveLength(0);
  });
});
