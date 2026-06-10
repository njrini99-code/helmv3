/**
 * Regression tests for `getAlertCounts` (audit P1/P2): the live unread-signal
 * badge on every redesigned CoachHelm page must
 *   - apply the SAME product-visibility contract every coach surface uses
 *     (v3 engine only, visible lifecycle states, not dismissed) so it never
 *     counts stale v2 phantoms or sweep-archived rows (lifecycle_state=
 *     'archived' while status stays 'active'), and
 *   - bucket `urgent` priority into CRITICAL (the old code tested a 'critical'
 *     value the live enum never emits and silently dropped urgent rows to INFO).
 *
 * The mock query builder SIMULATES the PostgREST predicates the action applies
 * (.or / .in / .neq / .eq) against an in-memory fixture set, so these tests fail
 * if the action drops the shared visibility filter or mis-buckets a priority.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  V3_ENGINE_FILTER,
  VISIBLE_LIFECYCLE_STATES,
} from '@/lib/coachhelm/v3/insight-visibility';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// coachHelmIntelligence is imported at module load by alerts.ts; stub it.
vi.mock('@/lib/coachhelm/v2', () => ({
  coachHelmIntelligence: { analyzePlayer: vi.fn() },
}));

import { getAlertCounts } from '@/app/golf/actions/alerts';
import { createClient } from '@/lib/supabase/server';

const createClientMock = vi.mocked(createClient);

interface FixtureRow {
  priority: string | null;
  // Visibility-relevant columns (used by the simulated predicates).
  engine_version: string | null;
  signature: string | null;
  lifecycle_state: string;
  status: string;
  dismissed: boolean;
  coach_id: string;
}

function row(over: Partial<FixtureRow>): FixtureRow {
  return {
    priority: 'high',
    engine_version: 'v3',
    signature: 'v3:putting:abc',
    lifecycle_state: 'detected',
    status: 'active',
    dismissed: false,
    coach_id: 'coach-1',
    ...over,
  };
}

/**
 * Chainable builder that APPLIES the action's predicates to `rows`, emulating
 * PostgREST semantics for the operators the action uses. The terminal `await`
 * resolves to `{ data, error }` — the builder is thenable.
 */
function makeInsightsBuilder(rows: FixtureRow[]) {
  let filtered = [...rows];
  const calls: Record<string, unknown[][]> = {};
  const record = (name: string, args: unknown[]) => {
    (calls[name] ??= []).push(args);
  };
  const result = () => ({ data: filtered, error: null });

  const builder = {
    select: vi.fn((...a: unknown[]) => (record('select', a), builder)),
    eq: vi.fn((col: string, v: unknown) => {
      record('eq', [col, v]);
      filtered = filtered.filter((r) => r[col as keyof FixtureRow] === v);
      return builder;
    }),
    neq: vi.fn((col: string, v: unknown) => {
      record('neq', [col, v]);
      filtered = filtered.filter((r) => r[col as keyof FixtureRow] !== v);
      return builder;
    }),
    in: vi.fn((col: string, values: string[]) => {
      record('in', [col, values]);
      filtered = filtered.filter((r) => values.includes(String(r[col as keyof FixtureRow])));
      return builder;
    }),
    or: vi.fn((expr: string) => {
      record('or', [expr]);
      expect(expr).toBe(V3_ENGINE_FILTER);
      filtered = filtered.filter(
        (r) => r.engine_version === 'v3' || (r.signature ?? '').startsWith('v3:'),
      );
      return builder;
    }),
    // Thenable: `await builder` resolves the query.
    then: (onFulfilled?: ((value: unknown) => unknown) | null) => {
      const p = Promise.resolve(result());
      return onFulfilled ? p.then(onFulfilled) : p;
    },
  };
  return { builder, calls };
}

function makeClient(rows: FixtureRow[]) {
  const { builder, calls } = makeInsightsBuilder(rows);
  const coachBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: 'coach-1' }, error: null }),
  };
  const client = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) },
    from: vi.fn((table: string) => {
      if (table === 'golf_coaches') return coachBuilder;
      if (table === 'golf_coach_insights') return builder;
      throw new Error(`Unexpected table: ${table}`);
    }),
  } as unknown as Awaited<ReturnType<typeof createClient>>;
  return { client, calls };
}

describe('getAlertCounts visibility + priority bucketing (audit P1/P2)', () => {
  beforeEach(() => {
    createClientMock.mockReset();
  });

  it('applies the shared product-visibility contract (.or / .in / .neq)', async () => {
    const { client, calls } = makeClient([row({ priority: 'high' })]);
    createClientMock.mockResolvedValue(client);

    const res = await getAlertCounts('coach-1');
    expect(res.success).toBe(true);

    expect(calls.or).toEqual([[V3_ENGINE_FILTER]]);
    expect(calls.in).toEqual([['lifecycle_state', [...VISIBLE_LIFECYCLE_STATES]]]);
    expect(calls.neq).toEqual([['status', 'dismissed']]);
  });

  it('counts urgent + high as critical; excludes archived / tentative / v2 rows', async () => {
    const rows: FixtureRow[] = [
      // Visible criticals: should both land in the CRITICAL bucket.
      row({ priority: 'urgent' }),
      row({ priority: 'high' }),
      // Visible warning + info.
      row({ priority: 'medium' }),
      row({ priority: 'low' }),
      // Stale v2 — excluded by the v3 engine filter.
      row({ priority: 'high', engine_version: 'v2', signature: 'par_scoring_par4:x' }),
      // v3 but archived (status still 'active') — excluded by lifecycle filter.
      row({ priority: 'urgent', lifecycle_state: 'archived' }),
      // v3 but tentative — excluded by lifecycle filter.
      row({ priority: 'high', lifecycle_state: 'tentative' }),
    ];
    const { client } = makeClient(rows);
    createClientMock.mockResolvedValue(client);

    const res = await getAlertCounts('coach-1');
    expect(res.success).toBe(true);
    // Only the 4 visible rows survive the filter.
    expect(res.counts?.total).toBe(4);
    // urgent + high → critical (the dropped-urgent bug would make this 1).
    expect(res.counts?.critical).toBe(2);
    expect(res.counts?.warning).toBe(1); // medium
    expect(res.counts?.info).toBe(1); // low
  });
});
