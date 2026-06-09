/**
 * Regression tests for the v3 causality-attribute cron candidate eligibility
 * (to-95 audit P1): the attribution loop must use the SAME visibility
 * boundary as the delivery read paths. It must never learn from:
 *   - stale v2 rows (no engine_version='v3', no 'v3:%' signature)
 *   - archived / tentative lifecycle states
 *   - coach-dismissed insights
 *
 * The mock query builder SIMULATES the PostgREST predicates the route
 * applies (.or / .in / .neq) against an in-memory fixture set, so these
 * tests fail if the route drops any of the three filters.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  V3_ENGINE_FILTER,
  VISIBLE_LIFECYCLE_STATES,
} from '@/lib/coachhelm/v3/insight-visibility';

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
  logServerEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/coachhelm/v3/causality/attribute', () => ({
  computeAttribution: vi.fn().mockResolvedValue({ ok: false, reason: 'no-data' }),
  nextWeight: vi.fn((base: { weight: number; sample_n: number }) => ({
    weight: base.weight,
    sample_n: base.sample_n + 1,
  })),
}));

import { POST } from '@/app/api/cron/v3/causality-attribute/route';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeAttribution } from '@/lib/coachhelm/v3/causality/attribute';

const createAdminMock = vi.mocked(createAdminClient);
const computeAttributionMock = vi.mocked(computeAttribution);

interface FixtureInsight {
  id: string;
  player_id: string | null;
  coach_id: string | null;
  insight_type: string;
  evidence: { metric: string };
  created_at: string;
  engine_version: string | null;
  signature: string | null;
  lifecycle_state: string;
  status: string;
}

const OLD = '2026-01-01T00:00:00.000Z'; // far older than the 21d cutoff

function fixture(over: Partial<FixtureInsight> & { id: string }): FixtureInsight {
  return {
    player_id: 'player-1',
    coach_id: 'coach-1',
    insight_type: 'putt_distance_control',
    evidence: { metric: 'putts_per_round' },
    created_at: OLD,
    engine_version: 'v3',
    signature: 'v3:putting:abc',
    lifecycle_state: 'detected',
    status: 'active',
    ...over,
  };
}

/**
 * Chainable builder that APPLIES the route's predicates to `rows`,
 * emulating PostgREST semantics for the operators the route uses.
 */
function makeCandidatesBuilder(rows: FixtureInsight[]) {
  let filtered = [...rows];
  const calls: Record<string, unknown[][]> = {};
  const record = (name: string, args: unknown[]) => {
    (calls[name] ??= []).push(args);
  };
  const builder = {
    select: vi.fn((...a: unknown[]) => (record('select', a), builder)),
    lte: vi.fn((col: string, v: string) => {
      record('lte', [col, v]);
      filtered = filtered.filter((r) => String(r[col as keyof FixtureInsight]) <= v);
      return builder;
    }),
    not: vi.fn((col: string, op: string, v: unknown) => {
      record('not', [col, op, v]);
      if (op === 'is' && v === null) {
        filtered = filtered.filter((r) => r[col as keyof FixtureInsight] !== null);
      }
      return builder;
    }),
    or: vi.fn((expr: string) => {
      record('or', [expr]);
      // Emulate exactly the V3_ENGINE_FILTER disjunction.
      expect(expr).toBe(V3_ENGINE_FILTER);
      filtered = filtered.filter(
        (r) => r.engine_version === 'v3' || (r.signature ?? '').startsWith('v3:'),
      );
      return builder;
    }),
    in: vi.fn((col: string, values: string[]) => {
      record('in', [col, values]);
      filtered = filtered.filter((r) =>
        values.includes(String(r[col as keyof FixtureInsight])),
      );
      return builder;
    }),
    neq: vi.fn((col: string, v: string) => {
      record('neq', [col, v]);
      filtered = filtered.filter((r) => r[col as keyof FixtureInsight] !== v);
      return builder;
    }),
    order: vi.fn((...a: unknown[]) => (record('order', a), builder)),
    limit: vi.fn((n: number) => {
      record('limit', [n]);
      return Promise.resolve({ data: filtered.slice(0, n), error: null });
    }),
  };
  return { builder, calls };
}

function makeClient(rows: FixtureInsight[]) {
  const { builder, calls } = makeCandidatesBuilder(rows);
  const attributionBuilder = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
  const client = {
    from: vi.fn((table: string) => {
      if (table === 'golf_coach_insights') return builder;
      if (table === 'golf_insight_outcome_attribution') return attributionBuilder;
      throw new Error(`Unexpected table: ${table}`);
    }),
  } as unknown as ReturnType<typeof createAdminClient>;
  return { client, calls };
}

function authedRequest(): NextRequest {
  return new NextRequest('http://localhost/api/cron/v3/causality-attribute', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
}

describe('causality-attribute cron candidate eligibility (audit P1)', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'test-secret');
    computeAttributionMock.mockClear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects unauthenticated requests', async () => {
    const { client } = makeClient([]);
    createAdminMock.mockReturnValue(client);
    const res = await POST(
      new NextRequest('http://localhost/api/cron/v3/causality-attribute', {
        method: 'POST',
      }),
    );
    expect(res.status).toBe(401);
  });

  it('only attributes visible v3 candidates — v2, archived, and dismissed rows never reach computeAttribution', async () => {
    const rows: FixtureInsight[] = [
      // Stale v2 row — matches neither arm of V3_ENGINE_FILTER.
      fixture({ id: 'v2-row', engine_version: 'v2', signature: 'par_scoring_par4:xyz' }),
      // v3 but archived — soft-deleted, delivery never shows it.
      fixture({ id: 'v3-archived', lifecycle_state: 'archived' }),
      // v3 but tentative — pre-maturity, never surfaced.
      fixture({ id: 'v3-tentative', lifecycle_state: 'tentative' }),
      // v3 but coach-dismissed.
      fixture({ id: 'v3-dismissed', status: 'dismissed' }),
      // Valid: stamped engine_version='v3'.
      fixture({ id: 'v3-valid', signature: null }),
      // Valid: engine_version lagging but carries a v3 signature (OR arm).
      fixture({ id: 'v3-by-signature', engine_version: null }),
    ];
    const { client, calls } = makeClient(rows);
    createAdminMock.mockReturnValue(client);

    const res = await POST(authedRequest());
    expect(res.status).toBe(200);
    const summary = await res.json();

    // Exactly the two visible v3 rows were considered.
    expect(summary.considered).toBe(2);
    const attributedIds = computeAttributionMock.mock.calls.map(
      ([, args]) => args.insight_id,
    );
    expect(attributedIds.sort()).toEqual(['v3-by-signature', 'v3-valid']);

    // The three eligibility predicates were applied with the shared values.
    expect(calls.or).toEqual([[V3_ENGINE_FILTER]]);
    expect(calls.in).toEqual([['lifecycle_state', [...VISIBLE_LIFECYCLE_STATES]]]);
    expect(calls.neq).toEqual([['status', 'dismissed']]);
  });

  it('returns an empty summary when no candidates are eligible', async () => {
    const { client } = makeClient([
      fixture({ id: 'v2-only', engine_version: 'v2', signature: 'legacy:sig' }),
    ]);
    createAdminMock.mockReturnValue(client);

    const res = await POST(authedRequest());
    const summary = await res.json();
    expect(summary.considered).toBe(0);
    expect(summary.attributed).toBe(0);
    expect(computeAttributionMock).not.toHaveBeenCalled();
  });
});
