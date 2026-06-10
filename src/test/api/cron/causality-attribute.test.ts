/**
 * Regression tests for the v3 causality-attribute cron.
 *
 * Eligibility (to-95 audit P1): the attribution loop must use the SAME
 * visibility boundary as the delivery read paths. It must never learn from:
 *   - stale v2 rows (no engine_version='v3', no 'v3:%' signature)
 *   - archived / tentative lifecycle states
 *   - coach-dismissed insights
 *
 * Audit-B fixes covered here:
 *   - P1 stall: paginate the candidate fetch via .range() AND synchronously
 *     pre-filter intentional-null metrics out of the work list (counting them
 *     in summary.intentional_no_lift), so never-attributable rows can't clog the
 *     fixed oldest-N window / LIMIT-slot work list.
 *   - P3: a candidate-fetch infra error surfaces as a non-200 + logServerError,
 *     not a success-shaped empty summary.
 *   - P3: null-lift attributions must NOT upsert coach-weight rows.
 *   - P3: a coach-weight upsert error is captured, logged, and counted.
 *
 * The mock query builder SIMULATES the PostgREST predicates the route applies
 * (.or / .in / .neq / .range) against an in-memory fixture set, so these tests
 * fail if the route drops any of the eligibility filters or stops paginating.
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
import { logServerError } from '@/lib/server-error-logger';

const createAdminMock = vi.mocked(createAdminClient);
const computeAttributionMock = vi.mocked(computeAttribution);
const logServerErrorMock = vi.mocked(logServerError);

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
    // sg_total is an attributable (`rounds`) metric — NOT intentional-null —
    // so default fixtures land in the work list unless overridden.
    evidence: { metric: 'sg_total' },
    created_at: OLD,
    engine_version: 'v3',
    signature: 'v3:putting:abc',
    lifecycle_state: 'detected',
    status: 'active',
    ...over,
  };
}

/**
 * Chainable builder that APPLIES the route's predicates to `rows`, emulating
 * PostgREST semantics for the operators the route uses, and resolves the chain
 * on `.range(from, to)` — the route now PAGINATES rather than `.limit()`ing.
 */
function makeCandidatesBuilder(
  rows: FixtureInsight[],
  opts: { rangeError?: { message: string } } = {},
) {
  const calls: Record<string, unknown[][]> = {};
  const record = (name: string, args: unknown[]) => {
    (calls[name] ??= []).push(args);
  };
  // Each `.from('golf_coach_insights')` starts a fresh predicate chain (the
  // route re-issues the full select+filters per page), so we apply predicates
  // to a per-chain working copy.
  let filtered = [...rows];
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
    order: vi.fn((col: string, dir: { ascending: boolean }) => {
      record('order', [col, dir]);
      filtered = [...filtered].sort((a, b) =>
        String(a[col as keyof FixtureInsight]).localeCompare(
          String(b[col as keyof FixtureInsight]),
        ),
      );
      if (dir && dir.ascending === false) filtered.reverse();
      return builder;
    }),
    range: vi.fn((from: number, to: number) => {
      record('range', [from, to]);
      if (opts.rangeError) {
        return Promise.resolve({ data: null, error: opts.rangeError });
      }
      return Promise.resolve({ data: filtered.slice(from, to + 1), error: null });
    }),
  };
  // Reset the working copy at the start of each chain (each .select call).
  const origSelect = builder.select;
  builder.select = vi.fn((...a: unknown[]) => {
    filtered = [...rows];
    return origSelect(...a);
  });
  return { builder, calls };
}

interface ClientOpts {
  /** Force the candidate fetch to error (P3 fetch-error test). */
  rangeError?: { message: string };
  /** Force the coach-weight upsert to error (P3 weight-error test). */
  weightUpsertError?: { message: string };
  /** Already-attributed insight ids (anti-join). */
  attributedIds?: string[];
  /** Insert error for the attribution row. */
  insertError?: { message: string };
}

function makeClient(rows: FixtureInsight[], opts: ClientOpts = {}) {
  const { builder, calls } = makeCandidatesBuilder(rows, {
    rangeError: opts.rangeError,
  });
  const attributedSet = new Set(opts.attributedIds ?? []);
  const attributionBuilder = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn((_col: string, ids: string[]) =>
      Promise.resolve({
        data: ids.filter((id) => attributedSet.has(id)).map((id) => ({ insight_id: id })),
        error: null,
      }),
    ),
    insert: vi.fn(() =>
      Promise.resolve({ error: opts.insertError ?? null }),
    ),
  };
  const weightCalls: { upserts: unknown[]; selects: number } = {
    upserts: [],
    selects: 0,
  };
  const weightBuilder = {
    select: vi.fn(() => {
      weightCalls.selects += 1;
      return weightBuilder;
    }),
    eq: vi.fn(() => weightBuilder),
    maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
    upsert: vi.fn((row: unknown) => {
      weightCalls.upserts.push(row);
      return Promise.resolve({ error: opts.weightUpsertError ?? null });
    }),
  };
  const client = {
    from: vi.fn((table: string) => {
      if (table === 'golf_coach_insights') return builder;
      if (table === 'golf_insight_outcome_attribution') return attributionBuilder;
      if (table === 'golf_coachhelm_coach_weights') return weightBuilder;
      throw new Error(`Unexpected table: ${table}`);
    }),
  } as unknown as ReturnType<typeof createAdminClient>;
  return { client, calls, weightCalls, attributionBuilder };
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
    computeAttributionMock.mockResolvedValue({ ok: false, reason: 'no-data' });
    logServerErrorMock.mockClear();
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
      fixture({ id: 'v2-row', engine_version: 'v2', signature: 'par_scoring_par4:xyz' }),
      fixture({ id: 'v3-archived', lifecycle_state: 'archived' }),
      fixture({ id: 'v3-tentative', lifecycle_state: 'tentative' }),
      fixture({ id: 'v3-dismissed', status: 'dismissed' }),
      fixture({ id: 'v3-valid', signature: null }),
      fixture({ id: 'v3-by-signature', engine_version: null }),
    ];
    const { client, calls } = makeClient(rows);
    createAdminMock.mockReturnValue(client);

    const res = await POST(authedRequest());
    expect(res.status).toBe(200);
    const summary = await res.json();

    expect(summary.considered).toBe(2);
    const attributedIds = computeAttributionMock.mock.calls.map(
      ([, args]) => args.insight_id,
    );
    expect(attributedIds.sort()).toEqual(['v3-by-signature', 'v3-valid']);

    // The three eligibility predicates were applied with the shared values
    // (asserted on the first page).
    expect(calls.or![0]).toEqual([V3_ENGINE_FILTER]);
    expect(calls.in![0]).toEqual(['lifecycle_state', [...VISIBLE_LIFECYCLE_STATES]]);
    expect(calls.neq![0]).toEqual(['status', 'dismissed']);
    // It paginated via .range (not .limit).
    expect(calls.range).toBeTruthy();
    expect(calls.range![0]).toEqual([0, 199]);
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

describe('causality-attribute cron P1: intentional-null pre-filter + pagination', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'test-secret');
    computeAttributionMock.mockClear();
    computeAttributionMock.mockResolvedValue({ ok: false, reason: 'no-data' });
    logServerErrorMock.mockClear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('drops intentional-null metrics from the work list synchronously and counts them in summary', async () => {
    // approach_proximity_125_175ft / putts_made_5_10ft_pct resolve to
    // intentional-null in the registry; sg_total is attributable.
    const rows: FixtureInsight[] = [
      fixture({ id: 'sticky-1', evidence: { metric: 'approach_proximity_125_175ft' } }),
      fixture({ id: 'sticky-2', evidence: { metric: 'putts_made_5_10ft_pct' } }),
      fixture({ id: 'measurable', evidence: { metric: 'sg_total' } }),
      fixture({ id: 'sticky-3', evidence: { metric: 'putt_miss_bias_left_pct' } }),
    ];
    const { client } = makeClient(rows);
    createAdminMock.mockReturnValue(client);

    const res = await POST(authedRequest());
    const summary = await res.json();

    // Only the one measurable row entered the work list (considered).
    expect(summary.considered).toBe(1);
    // The 3 intentional-null rows were counted but never sent to compute.
    expect(summary.intentional_no_lift).toBe(3);
    const sentIds = computeAttributionMock.mock.calls.map(([, a]) => a.insight_id);
    expect(sentIds).toEqual(['measurable']);
  });

  it('paginates past intentional-null + already-attributed rows to fill the work list', async () => {
    // 250 eligible rows: every other one is intentional-null, and the first 60
    // attributable rows are already attributed. The route must page (200/page)
    // and anti-join per page to still collect up to LIMIT (50) fresh measurable
    // rows — a single fixed oldest-N window would have starved them.
    const rows: FixtureInsight[] = [];
    const attributedIds: string[] = [];
    for (let i = 0; i < 250; i++) {
      const ts = new Date(Date.parse(OLD) + i * 60_000).toISOString();
      if (i % 2 === 0) {
        rows.push(
          fixture({
            id: `null-${i}`,
            created_at: ts,
            evidence: { metric: 'approach_proximity_125_175ft' },
          }),
        );
      } else {
        const id = `meas-${i}`;
        rows.push(fixture({ id, created_at: ts, evidence: { metric: 'sg_total' } }));
        // First 60 measurable rows are already attributed (sticky in dedup).
        if (attributedIds.length < 60) attributedIds.push(id);
      }
    }
    const { client, calls } = makeClient(rows, { attributedIds });
    createAdminMock.mockReturnValue(client);

    const res = await POST(authedRequest());
    const summary = await res.json();

    // It filled the full LIMIT (50) with fresh, unattributed, measurable rows.
    expect(summary.considered).toBe(50);
    // It needed more than one page (intentional-null + attributed eat slots).
    expect(calls.range!.length).toBeGreaterThan(1);
    // None of the considered rows were already attributed.
    const sentIds = computeAttributionMock.mock.calls.map(([, a]) => String(a.insight_id));
    expect(sentIds.every((id) => !attributedIds.includes(id))).toBe(true);
    expect(sentIds.length).toBe(50);
  });

  it('stops paging once candidates are exhausted (short final page)', async () => {
    // 10 attributable rows — under one page. Should fetch exactly one page.
    const rows = Array.from({ length: 10 }, (_, i) =>
      fixture({
        id: `r-${i}`,
        created_at: new Date(Date.parse(OLD) + i * 60_000).toISOString(),
      }),
    );
    const { client, calls } = makeClient(rows);
    createAdminMock.mockReturnValue(client);

    const res = await POST(authedRequest());
    const summary = await res.json();
    expect(summary.considered).toBe(10);
    expect(calls.range!.length).toBe(1); // short page -> stop
  });
});

describe('causality-attribute cron P3: fetch-error surfacing', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'test-secret');
    computeAttributionMock.mockClear();
    logServerErrorMock.mockClear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 500 + logs when the candidate fetch errors (not a success-shaped empty run)', async () => {
    const { client } = makeClient([fixture({ id: 'r-1' })], {
      rangeError: { message: 'connection terminated unexpectedly' },
    });
    createAdminMock.mockReturnValue(client);

    const res = await POST(authedRequest());
    expect(res.status).toBe(500);
    const summary = await res.json();
    expect(summary.errors).toBe(1);
    expect(logServerErrorMock).toHaveBeenCalledTimes(1);
    const fetchCall = logServerErrorMock.mock.calls[0];
    expect(fetchCall?.[1]).toMatchObject({
      action: 'cron.v3.causality.fetch',
    });
    // It never attempted any attribution after the fetch failed.
    expect(computeAttributionMock).not.toHaveBeenCalled();
  });
});

describe('causality-attribute cron P3: null-lift does not upsert coach weights', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'test-secret');
    computeAttributionMock.mockClear();
    logServerErrorMock.mockClear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function okAttribution(lift: number | null) {
    return {
      ok: true as const,
      row: {
        insight_id: 'r-1',
        surfaced_at: OLD,
        target_metric_id: 'sg_total',
        baseline_value: 0,
        post_value: 1,
        delta: 1,
        n_rounds_before: 3,
        n_rounds_after: 3,
        lift,
      },
    };
  }

  it('skips the coach-weight upsert entirely when lift is null', async () => {
    computeAttributionMock.mockResolvedValue(okAttribution(null));
    const { client, weightCalls } = makeClient([fixture({ id: 'r-1' })]);
    createAdminMock.mockReturnValue(client);

    const res = await POST(authedRequest());
    const summary = await res.json();
    expect(summary.attributed).toBe(1); // row still written
    expect(weightCalls.upserts.length).toBe(0); // but NO weight upsert
    expect(weightCalls.selects).toBe(0); // not even the prev read
  });

  it('upserts the coach weight when lift is non-null', async () => {
    computeAttributionMock.mockResolvedValue(okAttribution(0.8));
    const { client, weightCalls } = makeClient([fixture({ id: 'r-1' })]);
    createAdminMock.mockReturnValue(client);

    const res = await POST(authedRequest());
    const summary = await res.json();
    expect(summary.attributed).toBe(1);
    expect(weightCalls.upserts.length).toBe(1);
  });
});

describe('causality-attribute cron P3: coach-weight upsert error is captured', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'test-secret');
    computeAttributionMock.mockClear();
    logServerErrorMock.mockClear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('logs + counts an error when the weight upsert fails (does not fail the row)', async () => {
    computeAttributionMock.mockResolvedValue({
      ok: true,
      row: {
        insight_id: 'r-1',
        surfaced_at: OLD,
        target_metric_id: 'sg_total',
        baseline_value: 0,
        post_value: 1,
        delta: 1,
        n_rounds_before: 3,
        n_rounds_after: 3,
        lift: 0.5,
      },
    });
    const { client } = makeClient([fixture({ id: 'r-1' })], {
      weightUpsertError: { message: 'permission denied for table golf_coachhelm_coach_weights' },
    });
    createAdminMock.mockReturnValue(client);

    const res = await POST(authedRequest());
    expect(res.status).toBe(200);
    const summary = await res.json();
    // The attribution row still landed; the weight failure is surfaced.
    expect(summary.attributed).toBe(1);
    expect(summary.errors).toBe(1);
    expect(logServerErrorMock).toHaveBeenCalledTimes(1);
    const weightCall = logServerErrorMock.mock.calls[0];
    expect(weightCall?.[1]).toMatchObject({
      action: 'cron.v3.causality.coach-weight',
    });
  });
});
