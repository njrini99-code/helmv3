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
  // Real value (not a mock) — the route's MUST 2 pre-filter math needs the
  // real 21 to agree with `comparable-attribute.ts`'s own window check.
  POST_WINDOW_DAYS: 21,
}));

// A9 slice 1: mocked wholesale, same as `causality/attribute.ts` above — these
// tests prove the CRON'S wiring (flag on/off, pre-filter, summary counters,
// never touching updateCoachWeight/recordInsightOutcome for these rows), not
// `comparable-attribute.ts`'s own DB logic (see `comparable-attribute.test.ts`
// for that).
vi.mock('@/lib/coachhelm/v3/causality/comparable-attribute', () => ({
  computeComparableAttribution: vi.fn(),
  writeComparableAttribution: vi.fn(),
  isShotLevelAttributionMetric: vi.fn(
    (metricId: string) =>
      metricId === 'approach_proximity_50_125ft' ||
      metricId === 'approach_proximity_125_175ft' ||
      metricId === 'approach_proximity_175_plus_ft',
  ),
}));

// Defaults to the real production default (off) — a test only needs to
// mock a `true` return when it's specifically exercising the A9 slice 1 path.
vi.mock('@/lib/flags', () => ({
  isFlagEnabled: vi.fn().mockReturnValue(false),
}));

import { POST } from '@/app/api/cron/v3/causality-attribute/route';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeAttribution } from '@/lib/coachhelm/v3/causality/attribute';
import {
  computeComparableAttribution,
  writeComparableAttribution,
} from '@/lib/coachhelm/v3/causality/comparable-attribute';
import { logServerError, logServerEvent } from '@/lib/server-error-logger';
import { isFlagEnabled } from '@/lib/flags';

const createAdminMock = vi.mocked(createAdminClient);
const computeAttributionMock = vi.mocked(computeAttribution);
const computeComparableAttributionMock = vi.mocked(computeComparableAttribution);
const writeComparableAttributionMock = vi.mocked(writeComparableAttribution);
const logServerErrorMock = vi.mocked(logServerError);
const logServerEventMock = vi.mocked(logServerEvent);
const isFlagEnabledMock = vi.mocked(isFlagEnabled);

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
// A9 slice 1 (PR #2007 review, residual on MUST 2): exposure shown 25 days
// ago — the 21-day follow-up window has closed, but the 14-day
// RETRY_GRACE_DAYS horizon (closing at day 35) has not, so the candidate
// should still reach computeComparableAttribution. Relative to Date.now()
// (not an absolute date like OLD) so it stays valid regardless of when the
// suite runs.
const WINDOW_CLOSED_IN_GRACE = new Date(Date.now() - 25 * 86_400_000).toISOString();

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
  /** Insert error for the effectiveness-ledger outcome row (P1-12). */
  outcomeInsertError?: { message: string };
  /**
   * N10 unknown-column retry test: PGRST204/42703-shaped error returned ONLY
   * for the first insert attempt (the one carrying `method_version`) —
   * `isUnknownColumnError` should catch it and the route's retry (the exact
   * same row, minus `method_version`) should then succeed via the plain
   * `insertError` (or null) path above.
   */
  unknownColumnError?: { code: string; message: string };
  /**
   * A9 slice 1 (MUST 2): map of `insight_id` -> its real first `shown_at`
   * ISO string, backing the cron's per-page bulk `golf_insight_exposure`
   * pre-filter fetch. An id absent from this map has no exposure row at
   * all (the `comparable_no_exposure_record` pre-filter branch).
   */
  exposures?: Record<string, string>;
  /**
   * Advisor review (post-#2007-push): inject raw exposure rows directly,
   * including MULTIPLE rows per `insight_id` (the real table has no
   * uniqueness constraint on it) — for exercising `fetchAllRowsResult`'s
   * pagination past PostgREST's 1,000-row cap. Takes precedence over
   * `exposures` when both are supplied (it isn't, in any test below).
   */
  exposureRowsRaw?: Array<{ insight_id: string; shown_at: string }>;
  /** Force the bulk exposure pre-filter fetch (`.in()` over the page's
   *  shot-level candidate ids) to error. */
  exposureBulkFetchError?: { message: string };
}

function makeClient(rows: FixtureInsight[], opts: ClientOpts = {}) {
  const { builder, calls } = makeCandidatesBuilder(rows, {
    rangeError: opts.rangeError,
  });
  const exposureRows =
    opts.exposureRowsRaw ??
    Object.entries(opts.exposures ?? {}).map(([insight_id, shown_at]) => ({
      insight_id,
      shown_at,
    }));
  let exposureQueriedIds: string[] = [];
  const exposureBuilder = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn((_col: string, ids: string[]) => {
      exposureQueriedIds = ids;
      return exposureBuilder;
    }),
    // Two `.order()` calls (shown_at, then the id tiebreaker) chain, and
    // `.range(from, to)` is what actually resolves — mirrors
    // `fetchAllRowsResult`'s pagination contract in route.ts.
    order: vi.fn().mockReturnThis(),
    range: vi.fn((from: number, to: number) => {
      if (opts.exposureBulkFetchError) {
        return Promise.resolve({ data: null, error: opts.exposureBulkFetchError });
      }
      const matched = exposureRows
        .filter((r) => exposureQueriedIds.includes(r.insight_id))
        .sort((a, b) => a.shown_at.localeCompare(b.shown_at));
      return Promise.resolve({ data: matched.slice(from, to + 1), error: null });
    }),
  };
  const attributedSet = new Set(opts.attributedIds ?? []);
  const attributionInserts: Record<string, unknown>[] = [];
  const attributionBuilder = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn((_col: string, ids: string[]) =>
      Promise.resolve({
        data: ids.filter((id) => attributedSet.has(id)).map((id) => ({ insight_id: id })),
        error: null,
      }),
    ),
    insert: vi.fn((row: Record<string, unknown>) => {
      attributionInserts.push(row);
      if (opts.unknownColumnError && 'method_version' in row) {
        return Promise.resolve({ error: opts.unknownColumnError });
      }
      return Promise.resolve({ error: opts.insertError ?? null });
    }),
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
  // P1-12: the route mirrors every attributed outcome onto the effectiveness
  // event ledger (golf_insight_outcome) via a failure-silent fire-and-forget
  // write. The table exists in prod, so model a succeeding insert here — without
  // it the ledger writer would catch a "missing table" throw and log a spurious
  // 2nd error, polluting the coach-weight error-count assertions below.
  const outcomeCalls: { inserts: unknown[] } = { inserts: [] };
  const outcomeBuilder = {
    insert: vi.fn((row: unknown) => {
      outcomeCalls.inserts.push(row);
      return Promise.resolve({ error: opts.outcomeInsertError ?? null });
    }),
  };
  const client = {
    from: vi.fn((table: string) => {
      if (table === 'golf_coach_insights') return builder;
      if (table === 'golf_insight_outcome_attribution') return attributionBuilder;
      if (table === 'golf_coachhelm_coach_weights') return weightBuilder;
      if (table === 'golf_insight_outcome') return outcomeBuilder;
      if (table === 'golf_insight_exposure') return exposureBuilder;
      throw new Error(`Unexpected table: ${table}`);
    }),
  } as unknown as ReturnType<typeof createAdminClient>;
  return { client, calls, weightCalls, attributionBuilder, attributionInserts, outcomeCalls };
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
        // P0-01: the route reads raw_delta (DB delta) + improvement_lift (DB
        // lift, direction-corrected). Mirror the real AttributionRow shape;
        // `delta`/`lift` aliases kept for backwards compat.
        raw_delta: 1,
        delta: 1,
        n_rounds_before: 3,
        n_rounds_after: 3,
        improvement_lift: lift,
        lift,
        method_version: 'v2_observed_delta' as const,
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
        raw_delta: 1,
        delta: 1,
        n_rounds_before: 3,
        n_rounds_after: 3,
        improvement_lift: 0.5,
        lift: 0.5,
        method_version: 'v2_observed_delta' as const,
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

describe('causality-attribute cron N10: unknown-column retry (method_version not yet applied)', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'test-secret');
    computeAttributionMock.mockClear();
    logServerErrorMock.mockClear();
    logServerEventMock.mockClear();
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
        raw_delta: 1,
        delta: 1,
        n_rounds_before: 3,
        n_rounds_after: 3,
        improvement_lift: lift,
        lift,
        method_version: 'v2_observed_delta' as const,
      },
    };
  }

  it.each([
    ['PGRST204', 'Could not find the \'method_version\' column of \'golf_insight_outcome_attribution\' in the schema cache'],
    ['42703', 'column "method_version" of relation "golf_insight_outcome_attribution" does not exist'],
  ])('code %s: drops method_version and retries once, succeeding', async (code, message) => {
    computeAttributionMock.mockResolvedValue(okAttribution(0.5));
    const { client, attributionInserts } = makeClient([fixture({ id: 'r-1' })], {
      unknownColumnError: { code, message },
    });
    createAdminMock.mockReturnValue(client);

    const res = await POST(authedRequest());
    expect(res.status).toBe(200);
    const summary = await res.json();

    // The row is NOT lost — the retry without method_version succeeded.
    expect(summary.attributed).toBe(1);
    expect(summary.errors).toBe(0);
    expect(summary.method_version_column_missing).toBe(true);

    // Exactly two insert attempts: first carrying method_version (rejected),
    // second identical minus that field (accepted).
    expect(attributionInserts).toHaveLength(2);
    expect(attributionInserts[0]).toHaveProperty('method_version', 'v2_observed_delta');
    expect(attributionInserts[1]).not.toHaveProperty('method_version');
    // Every other field is byte-identical between the two attempts.
    const { method_version: _omit, ...retryComparableFirst } = attributionInserts[0]!;
    expect(attributionInserts[1]).toEqual(retryComparableFirst);

    // One info-level event per RUN, not per row — never paging noise.
    expect(logServerEventMock).toHaveBeenCalledTimes(1);
    const [message0, meta0, level0] = logServerEventMock.mock.calls[0]!;
    expect(message0).toContain('method_version');
    expect(meta0).toMatchObject({
      action: 'cron.v3.causality.method-version-missing',
      metadata: { migration: '20260922230000_v3_attribution_method_version' },
    });
    expect(level0).toBe('info');

    // Not a real failure — no error logged for the expected/handled retry.
    expect(logServerErrorMock).not.toHaveBeenCalled();
  });

  it('a genuine (non-unknown-column) insert error is NOT retried and still surfaces', async () => {
    computeAttributionMock.mockResolvedValue(okAttribution(0.5));
    const { client, attributionInserts } = makeClient([fixture({ id: 'r-1' })], {
      insertError: { message: 'permission denied for table golf_insight_outcome_attribution' },
    });
    createAdminMock.mockReturnValue(client);

    const res = await POST(authedRequest());
    const summary = await res.json();

    expect(summary.errors).toBe(1);
    expect(summary.method_version_column_missing).toBeUndefined();
    expect(attributionInserts).toHaveLength(1); // no retry attempted
    expect(logServerErrorMock).toHaveBeenCalledTimes(1);
    expect(logServerEventMock).not.toHaveBeenCalled();
  });
});

describe('causality-attribute cron A9 slice 1: comparable-opportunity attribution', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'test-secret');
    computeAttributionMock.mockClear();
    computeAttributionMock.mockResolvedValue({ ok: false, reason: 'no-data' });
    computeComparableAttributionMock.mockReset();
    writeComparableAttributionMock.mockReset();
    isFlagEnabledMock.mockReset().mockReturnValue(false);
    logServerErrorMock.mockClear();
    logServerEventMock.mockClear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    // Never leak a `true` flag state into a later describe block — this is
    // the one mock in the file whose default lives in the module factory,
    // not reset by every other block's own `beforeEach`.
    isFlagEnabledMock.mockReturnValue(false);
  });

  const SHOT_LEVEL_METRIC = 'approach_proximity_125_175ft';

  it('flag OFF: a shot-level metric is still dropped in the pre-filter exactly as before this slice', async () => {
    const rows = [fixture({ id: 'insight-1', evidence: { metric: SHOT_LEVEL_METRIC } })];
    const { client } = makeClient(rows);
    createAdminMock.mockReturnValue(client);

    const res = await POST(authedRequest());
    const summary = await res.json();

    expect(summary.intentional_no_lift).toBe(1);
    expect(summary.comparable_attributed).toBe(0);
    expect(computeComparableAttributionMock).not.toHaveBeenCalled();
    expect(computeAttributionMock).not.toHaveBeenCalled();
  });

  it('flag ON: a shot-level metric with a closed-window exposure is NOT dropped in the pre-filter, and reaches computeComparableAttribution instead of computeAttribution', async () => {
    isFlagEnabledMock.mockReturnValue(true);
    computeComparableAttributionMock.mockResolvedValue({ ok: false, reason: 'insufficient-evidence' });
    const rows = [fixture({ id: 'insight-1', evidence: { metric: SHOT_LEVEL_METRIC } })];
    const { client } = makeClient(rows, { exposures: { 'insight-1': WINDOW_CLOSED_IN_GRACE } });
    createAdminMock.mockReturnValue(client);

    const res = await POST(authedRequest());
    const summary = await res.json();

    expect(summary.considered).toBe(1);
    expect(summary.intentional_no_lift).toBe(0);
    expect(computeComparableAttributionMock).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ insight_id: 'insight-1', target_metric_id: SHOT_LEVEL_METRIC }),
    );
    expect(computeAttributionMock).not.toHaveBeenCalled();
  });

  it('MUST 2 pre-filter: a shot-level candidate with NO real exposure row is dropped before ever reaching computeComparableAttribution', async () => {
    isFlagEnabledMock.mockReturnValue(true);
    const rows = [fixture({ id: 'insight-1', evidence: { metric: SHOT_LEVEL_METRIC } })];
    const { client } = makeClient(rows, { exposures: {} });
    createAdminMock.mockReturnValue(client);

    const res = await POST(authedRequest());
    const summary = await res.json();

    expect(summary.comparable_no_exposure_record).toBe(1);
    expect(summary.considered).toBe(0);
    expect(computeComparableAttributionMock).not.toHaveBeenCalled();
    expect(writeComparableAttributionMock).not.toHaveBeenCalled();
  });

  it('MUST 2 pre-filter: a shot-level candidate whose follow-up window has not closed yet is dropped before ever reaching computeComparableAttribution', async () => {
    isFlagEnabledMock.mockReturnValue(true);
    const shownRecently = new Date(Date.now() - 3 * 86_400_000).toISOString(); // 3 days ago
    const rows = [fixture({ id: 'insight-1', evidence: { metric: SHOT_LEVEL_METRIC } })];
    const { client } = makeClient(rows, { exposures: { 'insight-1': shownRecently } });
    createAdminMock.mockReturnValue(client);

    const res = await POST(authedRequest());
    const summary = await res.json();

    expect(summary.comparable_follow_up_open).toBe(1);
    expect(summary.considered).toBe(0);
    expect(computeComparableAttributionMock).not.toHaveBeenCalled();
  });

  it('MUST 2 pre-filter: bulk exposure fetch paginates past PostgREST\'s 1,000-row cap so a later candidate\'s real exposure is not silently dropped', async () => {
    // Advisor review (post-#2007-push): golf_insight_exposure has no
    // uniqueness constraint on insight_id (an insight can be re-shown/
    // re-ranked any number of times), so a page's shot-level candidates can
    // legitimately produce >1,000 exposure rows. An unpaginated `.in()`
    // fetch would keep only the globally-earliest 1,000 rows and silently
    // drop any candidate whose real first exposure landed later than that
    // — permanently misread as comparable_no_exposure_record, since a page
    // is never re-fetched.
    isFlagEnabledMock.mockReturnValue(true);
    computeComparableAttributionMock.mockResolvedValue({ ok: false, reason: 'insufficient-evidence' });
    // insight-1 is spammy: 1005 exposure rows, all older than insight-2's
    // single row below, so they occupy global sort indices 0-1004.
    const insight1Rows = Array.from({ length: 1005 }, (_, i) => ({
      insight_id: 'insight-1',
      shown_at: new Date(Date.now() - 25 * 86_400_000 + i * 1000).toISOString(),
    }));
    // insight-2's only exposure sorts LAST globally (index 1005) — past
    // an unpaginated fetch's 1,000-row cap.
    const insight2Row = {
      insight_id: 'insight-2',
      shown_at: new Date(Date.now() - 3 * 86_400_000).toISOString(), // 3 days ago
    };
    const rows = [
      fixture({ id: 'insight-1', evidence: { metric: SHOT_LEVEL_METRIC } }),
      fixture({ id: 'insight-2', evidence: { metric: SHOT_LEVEL_METRIC } }),
    ];
    const { client } = makeClient(rows, {
      exposureRowsRaw: [...insight1Rows, insight2Row],
    });
    createAdminMock.mockReturnValue(client);

    const res = await POST(authedRequest());
    const summary = await res.json();

    // insight-1's earliest exposure (25 days ago) is well past the
    // follow-up window — reaches the mock as usual.
    expect(computeComparableAttributionMock).toHaveBeenCalledTimes(1);
    // insight-2's exposure (3 days ago, still within the follow-up window)
    // must be FOUND, not lost — proving pagination ran past row 1,000.
    // A truncated fetch would misclassify it as no-exposure-record instead.
    expect(summary.comparable_no_exposure_record).toBe(0);
    expect(summary.comparable_follow_up_open).toBe(1);
  });

  it('MUST 2 pre-filter: candidate-page pagination continues to page 2 when EVERY shot-level candidate on page 1 is dropped by the pre-filter', async () => {
    // #2007 re-review follow-up: a whole FETCH_PAGE_SIZE (200) page of
    // shot-level candidates dropped by the bulk pre-filter must not stall
    // the outer candidate-page loop — it should keep paginating (todo.length
    // stays 0, which is still < LIMIT) until it finds an attributable
    // candidate on a later page, the same way the P1 pagination rewrite
    // guarantees for intentional-null-only pages.
    isFlagEnabledMock.mockReturnValue(true);
    computeComparableAttributionMock.mockResolvedValue({ ok: false, reason: 'insufficient-evidence' });
    const droppedRows = Array.from({ length: 200 }, (_, i) =>
      fixture({ id: `drop-${i}`, evidence: { metric: SHOT_LEVEL_METRIC } }),
    ); // default created_at is OLD; no exposure fixture below => all dropped
    // as comparable_no_exposure_record and never take a todo slot.
    const goodRow = fixture({
      id: 'insight-good',
      evidence: { metric: SHOT_LEVEL_METRIC },
      // Later than OLD (still older than the 21d cutoff) so ascending
      // created_at order sorts it onto page 2, after all 200 dropped rows.
      created_at: new Date(Date.now() - 22 * 86_400_000).toISOString(),
    });
    const rows = [...droppedRows, goodRow];
    const { client } = makeClient(rows, {
      exposures: { 'insight-good': WINDOW_CLOSED_IN_GRACE },
    });
    createAdminMock.mockReturnValue(client);

    const res = await POST(authedRequest());
    const summary = await res.json();

    // All 200 page-1 candidates dropped cheaply, never reaching the mock...
    expect(summary.comparable_no_exposure_record).toBe(200);
    // ...but pagination continued to page 2 and found the one good candidate.
    expect(computeComparableAttributionMock).toHaveBeenCalledTimes(1);
    expect(computeComparableAttributionMock).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ insight_id: 'insight-good' }),
    );
  });

  it('residual on MUST 2: a shot-level candidate whose retry horizon (window close + 14d grace) has expired is dropped for good and never reaches computeComparableAttribution', async () => {
    isFlagEnabledMock.mockReturnValue(true);
    // Shown 40 days ago: the 21-day window closed at day 21, and the 14-day
    // grace period closed at day 35 — 40 is past both.
    const shownLongAgo = new Date(Date.now() - 40 * 86_400_000).toISOString();
    const rows = [fixture({ id: 'insight-1', evidence: { metric: SHOT_LEVEL_METRIC } })];
    const { client } = makeClient(rows, { exposures: { 'insight-1': shownLongAgo } });
    createAdminMock.mockReturnValue(client);

    const res = await POST(authedRequest());
    const summary = await res.json();

    expect(summary.comparable_retry_horizon_expired).toBe(1);
    expect(summary.comparable_follow_up_open).toBe(0);
    expect(summary.considered).toBe(0);
    expect(computeComparableAttributionMock).not.toHaveBeenCalled();
  });

  it('residual on MUST 2: a shot-level candidate still within the retry grace period (window closed, horizon not yet expired) still reaches computeComparableAttribution', async () => {
    isFlagEnabledMock.mockReturnValue(true);
    computeComparableAttributionMock.mockResolvedValue({ ok: false, reason: 'insufficient-evidence' });
    const rows = [fixture({ id: 'insight-1', evidence: { metric: SHOT_LEVEL_METRIC } })];
    const { client } = makeClient(rows, { exposures: { 'insight-1': WINDOW_CLOSED_IN_GRACE } });
    createAdminMock.mockReturnValue(client);

    const res = await POST(authedRequest());
    const summary = await res.json();

    expect(summary.comparable_retry_horizon_expired).toBe(0);
    expect(computeComparableAttributionMock).toHaveBeenCalledTimes(1);
  });

  it('residual on MUST 2: the exact retry-horizon boundary instant (window close + 14d grace === now) is NOT expired — proves the check is a strict <, not <=', async () => {
    isFlagEnabledMock.mockReturnValue(true);
    computeComparableAttributionMock.mockResolvedValue({ ok: false, reason: 'insufficient-evidence' });
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-09-23T00:00:00.000Z'));
      // shownAt + POST_WINDOW_DAYS(21) + RETRY_GRACE_DAYS(14) === now exactly.
      const shownAt = new Date(Date.now() - 35 * 86_400_000).toISOString();
      const rows = [fixture({ id: 'insight-1', evidence: { metric: SHOT_LEVEL_METRIC } })];
      const { client } = makeClient(rows, { exposures: { 'insight-1': shownAt } });
      createAdminMock.mockReturnValue(client);

      const res = await POST(authedRequest());
      const summary = await res.json();

      // Not expired at the exact instant — the horizon check
      // (`followUpWindowEndMs + RETRY_GRACE_DAYS * 86_400_000 < Date.now()`)
      // is a strict `<`, so an equal value still reaches the mock.
      expect(summary.comparable_retry_horizon_expired).toBe(0);
      expect(summary.comparable_follow_up_open).toBe(0);
      expect(computeComparableAttributionMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('MUST 2 pre-filter: a bulk exposure-fetch error is logged distinctly, counted, and the page never reaches computeComparableAttribution', async () => {
    isFlagEnabledMock.mockReturnValue(true);
    const rows = [fixture({ id: 'insight-1', evidence: { metric: SHOT_LEVEL_METRIC } })];
    const { client } = makeClient(rows, {
      exposureBulkFetchError: { message: 'connection reset' },
    });
    createAdminMock.mockReturnValue(client);

    const res = await POST(authedRequest());
    const summary = await res.json();

    expect(summary.comparable_exposure_read_failed).toBe(1);
    expect(computeComparableAttributionMock).not.toHaveBeenCalled();
    const errorCall = logServerErrorMock.mock.calls.find(
      (c) =>
        (c[1] as { action?: string } | undefined)?.action ===
        'cron.v3.causality.comparable-exposure-bulk-fetch',
    );
    expect(errorCall).toBeDefined();
  });

  it('backstop: computeComparableAttribution itself reporting exposure-read-failed is logged distinctly and counted, not folded into no-exposure-record', async () => {
    isFlagEnabledMock.mockReturnValue(true);
    computeComparableAttributionMock.mockResolvedValue({
      ok: false,
      reason: 'exposure-read-failed',
      error: 'statement timeout',
    });
    const rows = [fixture({ id: 'insight-1', evidence: { metric: SHOT_LEVEL_METRIC } })];
    const { client } = makeClient(rows, { exposures: { 'insight-1': WINDOW_CLOSED_IN_GRACE } });
    createAdminMock.mockReturnValue(client);

    const res = await POST(authedRequest());
    const summary = await res.json();

    expect(summary.comparable_exposure_read_failed).toBe(1);
    expect(summary.comparable_no_exposure_record).toBe(0);
    const errorCall = logServerErrorMock.mock.calls.find(
      (c) =>
        (c[1] as { action?: string } | undefined)?.action === 'cron.v3.causality.comparable-exposure-read',
    );
    expect(errorCall).toBeDefined();
  });

  it('backstop: computeComparableAttribution itself reporting no-exposure-record (bulk pre-filter passed it through) is still counted correctly', async () => {
    isFlagEnabledMock.mockReturnValue(true);
    computeComparableAttributionMock.mockResolvedValue({ ok: false, reason: 'no-exposure-record' });
    const rows = [fixture({ id: 'insight-1', evidence: { metric: SHOT_LEVEL_METRIC } })];
    const { client } = makeClient(rows, { exposures: { 'insight-1': WINDOW_CLOSED_IN_GRACE } });
    createAdminMock.mockReturnValue(client);

    const res = await POST(authedRequest());
    const summary = await res.json();

    expect(summary.comparable_no_exposure_record).toBe(1);
    expect(summary.comparable_attributed).toBe(0);
    expect(summary.intentional_no_lift).toBe(0);
    expect(writeComparableAttributionMock).not.toHaveBeenCalled();
  });

  it('backstop: computeComparableAttribution itself reporting follow-up-window-open (bulk pre-filter passed it through) is still counted correctly', async () => {
    isFlagEnabledMock.mockReturnValue(true);
    computeComparableAttributionMock.mockResolvedValue({ ok: false, reason: 'follow-up-window-open' });
    const rows = [fixture({ id: 'insight-1', evidence: { metric: SHOT_LEVEL_METRIC } })];
    const { client } = makeClient(rows, { exposures: { 'insight-1': WINDOW_CLOSED_IN_GRACE } });
    createAdminMock.mockReturnValue(client);

    const res = await POST(authedRequest());
    const summary = await res.json();

    expect(summary.comparable_follow_up_open).toBe(1);
    expect(summary.comparable_attributed).toBe(0);
    expect(summary.intentional_no_lift).toBe(0);
    expect(writeComparableAttributionMock).not.toHaveBeenCalled();
  });

  it('flag ON: insufficient-evidence is counted separately and never written', async () => {
    isFlagEnabledMock.mockReturnValue(true);
    computeComparableAttributionMock.mockResolvedValue({ ok: false, reason: 'insufficient-evidence' });
    const rows = [fixture({ id: 'insight-1', evidence: { metric: SHOT_LEVEL_METRIC } })];
    const { client } = makeClient(rows, { exposures: { 'insight-1': WINDOW_CLOSED_IN_GRACE } });
    createAdminMock.mockReturnValue(client);

    const res = await POST(authedRequest());
    const summary = await res.json();

    expect(summary.comparable_insufficient_evidence).toBe(1);
    expect(writeComparableAttributionMock).not.toHaveBeenCalled();
  });

  it('flag ON: a successful compute writes the row, counts comparable_attributed, and never touches the round-level weight path', async () => {
    isFlagEnabledMock.mockReturnValue(true);
    computeComparableAttributionMock.mockResolvedValue({
      ok: true,
      row: {
        insight_id: 'insight-1',
        intervention_at: '2026-08-01T00:00:00.000Z',
        target_metric_id: SHOT_LEVEL_METRIC,
        baseline_value: 22.4,
        post_value: 18.1,
        delta: -4.3,
        n_rounds_before: 3,
        n_rounds_after: 4,
        method_version: 'comparable_opportunities_v1',
      },
    });
    writeComparableAttributionMock.mockResolvedValue({ written: true, methodVersionColumnMissing: false });
    const rows = [fixture({ id: 'insight-1', evidence: { metric: SHOT_LEVEL_METRIC } })];
    const { client, weightCalls } = makeClient(rows, { exposures: { 'insight-1': WINDOW_CLOSED_IN_GRACE } });
    createAdminMock.mockReturnValue(client);

    const res = await POST(authedRequest());
    const summary = await res.json();

    expect(summary.comparable_attributed).toBe(1);
    expect(writeComparableAttributionMock).toHaveBeenCalledTimes(1);
    // Never feeds the learning loop (the file header's own contract):
    // the round-level coach-weight upsert must never fire for this row.
    expect(weightCalls.upserts).toHaveLength(0);
  });

  it('MUST 3: a write degraded away for a missing method_version column is NOT counted as attributed, sets the shared flag, and logs nothing', async () => {
    isFlagEnabledMock.mockReturnValue(true);
    computeComparableAttributionMock.mockResolvedValue({
      ok: true,
      row: {
        insight_id: 'insight-1',
        intervention_at: '2026-08-01T00:00:00.000Z',
        target_metric_id: SHOT_LEVEL_METRIC,
        baseline_value: 22.4,
        post_value: 18.1,
        delta: -4.3,
        n_rounds_before: 3,
        n_rounds_after: 4,
        method_version: 'comparable_opportunities_v1',
      },
    });
    // MUST 3 (PR #2007 review): the comparable path never degrades to a
    // NULL-method_version insert — it writes NOTHING and reports
    // written:false with no `error` (not a failure, a routine degrade).
    writeComparableAttributionMock.mockResolvedValue({ written: false, methodVersionColumnMissing: true });
    const rows = [fixture({ id: 'insight-1', evidence: { metric: SHOT_LEVEL_METRIC } })];
    const { client } = makeClient(rows, { exposures: { 'insight-1': WINDOW_CLOSED_IN_GRACE } });
    createAdminMock.mockReturnValue(client);

    const res = await POST(authedRequest());
    const summary = await res.json();

    expect(summary.method_version_column_missing).toBe(true);
    expect(summary.comparable_attributed).toBe(0);
    expect(summary.errors).toBe(0);
    expect(logServerErrorMock).not.toHaveBeenCalled();
  });

  it('flag ON: a write error is logged and counted in summary.errors, tagged with its own action', async () => {
    isFlagEnabledMock.mockReturnValue(true);
    computeComparableAttributionMock.mockResolvedValue({
      ok: true,
      row: {
        insight_id: 'insight-1',
        intervention_at: '2026-08-01T00:00:00.000Z',
        target_metric_id: SHOT_LEVEL_METRIC,
        baseline_value: 22.4,
        post_value: 18.1,
        delta: -4.3,
        n_rounds_before: 3,
        n_rounds_after: 4,
        method_version: 'comparable_opportunities_v1',
      },
    });
    writeComparableAttributionMock.mockResolvedValue({
      written: false,
      methodVersionColumnMissing: false,
      error: 'permission denied for table golf_insight_outcome_attribution',
    });
    const rows = [fixture({ id: 'insight-1', evidence: { metric: SHOT_LEVEL_METRIC } })];
    const { client } = makeClient(rows, { exposures: { 'insight-1': WINDOW_CLOSED_IN_GRACE } });
    createAdminMock.mockReturnValue(client);

    const res = await POST(authedRequest());
    const summary = await res.json();

    expect(summary.errors).toBe(1);
    expect(summary.comparable_attributed).toBe(0);
    const errorCall = logServerErrorMock.mock.calls.find(
      (c) => (c[1] as { action?: string } | undefined)?.action === 'cron.v3.causality.comparable-insert',
    );
    expect(errorCall).toBeDefined();
  });
});
