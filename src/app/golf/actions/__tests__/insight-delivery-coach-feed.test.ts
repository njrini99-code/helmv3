/**
 * Phase A exit-criteria fixtures (Task A7) — the coach-feed cross-surface guard.
 *
 * These two contracts close Phase A end-to-end on the COACH feed surface
 * (`getInsightsForCoach`), the path that drives the dashboard alert sweep:
 *
 *   1. A high-confidence zero-impact approach leak now out-ranks a
 *      recency-fresh zero-impact diagnostic — proving the shared `scoreInsight`
 *      floor (not created_at recency) orders the zero-impact band the coach sees.
 *   2. The candidate-window pre-order is `created_at DESC`, NOT
 *      `evidence->strokes_impact DESC`. 176/232 live rows carry
 *      strokes_impact≈0; an impact-DESC pre-order would push every legit-zero
 *      diagnostic to the bottom of the window and TRUNCATE it at PRE_RANK_FETCH
 *      before the in-app floor can rescue it. This asserts the pre-order column
 *      so a regression back to impact-DESC fails loudly.
 *
 * The unit-level ordering contract lives in insight-delivery-rank.test.ts
 * (`rankEvidenceInsights`); this file proves the SAME contract holds through the
 * real server-action fetch + map + rank + dedupe pipeline the coach hits.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';

// ---------------------------------------------------------------------------
// Module-boundary mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));

let activeClient: unknown = {};
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => activeClient),
}));

// Coach sweep with no player_id loads neither weights nor goals; the per-player
// branch is covered by insight-delivery-rank.test.ts. Stub both so an accidental
// call can't reach a real loader.
vi.mock('@/lib/coachhelm/v3/ranking/score', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/coachhelm/v3/ranking/score')>();
  return { ...actual, loadCoachWeightsForPlayer: vi.fn(async () => ({})) };
});
vi.mock('@/lib/coachhelm/v3/goals/loader', () => ({
  loadActiveGoals: vi.fn(async () => []),
}));

import { getInsightsForCoach } from '@/app/golf/actions/insight-delivery';

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

interface RawRow {
  id: string;
  player_id: string;
  category: string | null;
  insight_type: string | null;
  title: string;
  content: string;
  signature: string | null;
  evidence: InsightEvidence;
  metadata: Record<string, unknown> | null;
  lifecycle_state: string;
  status: string;
  priority: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  outcome_status: string | null;
  outcome_measured_at: string | null;
  created_at: string;
  updated_at: string;
  drill_attachments: null;
}

interface RowOpts {
  id: string;
  metric: string;
  category?: string;
  insight_type?: string;
  confidence?: number;
  strokesImpact?: number;
  priority?: string;
  sampleN?: number;
  created_at?: string;
}

function makeRow(o: RowOpts): RawRow {
  const evidence = {
    metric: o.metric,
    metric_label: o.metric,
    strokes_impact: o.strokesImpact ?? 0,
    confidence: o.confidence ?? 0.5,
    sample_n: o.sampleN ?? 20,
  } as unknown as InsightEvidence;

  return {
    id: o.id,
    player_id: 'p-1',
    category: o.category ?? 'approach',
    insight_type: o.insight_type ?? 'approach_proximity',
    title: `Title ${o.id}`,
    content: `Content ${o.id}`,
    signature: 'v3:x',
    evidence,
    metadata: null,
    lifecycle_state: 'detected',
    status: 'active',
    priority: o.priority ?? 'low',
    acknowledged_at: null,
    resolved_at: null,
    outcome_status: null,
    outcome_measured_at: null,
    created_at: o.created_at ?? '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    drill_attachments: null,
  };
}

// ---------------------------------------------------------------------------
// Supabase mock — a chainable THENABLE builder, matching the established pattern
// in src/test/golf/actions/insight-delivery.test.ts: every filter method returns
// `this` (incl. `.limit()`) and resolution happens through a `then` trap. We do
// NOT reuse that file's local `makeSupabaseMock` because it isn't exported and
// doesn't record `.order()` — the load-bearing regression guard here.
//
// The thenable shape matters: getInsightsForCoach appends CONDITIONAL filters
// (`.eq('player_id',…)`, `.in('category',…)`, `.in('priority',…)`) AFTER
// `.limit()`. A mock that resolved a Promise at `.limit()` would throw
// `.eq is not a function` the moment a future fixture sets those opts —
// silently false-greening. Returning the builder from every node (limit too)
// keeps the post-`.limit()` chain valid for tests that do exercise opts.
// ---------------------------------------------------------------------------

interface OrderCall {
  column: string;
  opts: { ascending?: boolean } | undefined;
}

function makeSupabaseMock(rows: RawRow[], orderCalls: OrderCall[]) {
  const terminal = { data: rows, error: null as { message: string } | null };
  const builder = {
    select: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    order: vi.fn((column: string, opts?: { ascending?: boolean }) => {
      orderCalls.push({ column, opts });
      return builder;
    }),
    limit: vi.fn().mockReturnThis(),
    // A8: the team-wide sweep paginates via `fetchAllRowsResult` → `.range()`.
    // These two fixtures (each < page size) resolve the full array on the first
    // page; rows.length < pageSize terminates the paging loop after one page.
    range: vi.fn().mockReturnThis(),
    then: (resolve: (v: typeof terminal) => void) => Promise.resolve(resolve(terminal)),
  };
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'coach-1' } }, error: null })),
    },
    from: vi.fn((table: string) => {
      if (table === 'golf_coach_insights') return builder;
      throw new Error(`unexpected table "${table}" in coach-feed test`);
    }),
  };
}

// ---------------------------------------------------------------------------
// Pagination-aware Supabase mock (A8). Unlike `makeSupabaseMock` above (which
// resolves the FULL array on every `.then()`), this one honors `.range(from,to)`
// and resolves the matching SLICE of the full row array — so
// `fetchAllRowsResult`'s paging loop terminates on a final page shorter than the
// page size. It records `.range()` calls (proving the team sweep paginates) and
// uses a small `pageSize` so a >100-row fixture spans multiple pages without
// needing 1000+ synthetic rows. The chain stays a thenable builder so every
// conditional filter the action appends after `.range()` remains valid.
// ---------------------------------------------------------------------------

interface RangeCall {
  from: number;
  to: number;
}

function makePaginatedSupabaseMock(
  rows: RawRow[],
  orderCalls: OrderCall[],
  rangeCalls: RangeCall[],
  pageSize: number,
) {
  let pendingRange: RangeCall | null = null;
  let pendingLimit: number | null = null;

  // Faithfully simulate newest-first DB order so the OLD high-impact row really
  // does sort to the bottom of a `.limit()` window (the truncation bug). PostgREST
  // applies `.order('created_at', { ascending:false })`; mirror that here.
  const sortedByCreatedDesc = () =>
    [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));

  const resolveSlice = () => {
    const ordered = sortedByCreatedDesc();
    // `.range()` → paginated team-sweep path: return exactly that slice.
    // No `.range()` but a `.limit(n)` → legacy windowed path: return the newest n
    // rows, faithfully truncating the OLD high-impact row past the window.
    let slice: RawRow[];
    if (pendingRange != null) {
      slice = ordered.slice(pendingRange.from, pendingRange.to + 1);
    } else if (pendingLimit != null) {
      slice = ordered.slice(0, pendingLimit);
    } else {
      slice = ordered;
    }
    pendingRange = null;
    pendingLimit = null;
    return { data: slice, error: null as { message: string } | null };
  };

  const builder = {
    select: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    order: vi.fn((column: string, opts?: { ascending?: boolean }) => {
      orderCalls.push({ column, opts });
      return builder;
    }),
    limit: vi.fn((n: number) => {
      pendingLimit = n;
      return builder;
    }),
    range: vi.fn((from: number, to: number) => {
      pendingRange = { from, to };
      rangeCalls.push({ from, to });
      return builder;
    }),
    then: (resolve: (v: { data: RawRow[]; error: { message: string } | null }) => void) =>
      Promise.resolve(resolve(resolveSlice())),
  };
  return {
    __pageSize: pageSize,
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'coach-1' } }, error: null })),
    },
    from: vi.fn((table: string) => {
      if (table === 'golf_coach_insights') return builder;
      throw new Error(`unexpected table "${table}" in coach-feed test`);
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  activeClient = {};
});

// ===========================================================================
// Phase A exit-criteria fixtures
// ===========================================================================

describe('getInsightsForCoach — Phase A cross-surface ordering guard', () => {
  it('a high-confidence zero-impact approach leak out-ranks a recency-fresh zero-impact diagnostic', async () => {
    // Both rows: strokes_impact 0 (the 176/232 live zero-impact case). The weak
    // diagnostic is the NEWEST row, so a recency-only order would float it first.
    // The shared scoreInsight floor × confidence must instead rank the
    // high-confidence approach leak above it on the coach feed.
    const strongApproach = makeRow({
      id: 'approach-strong',
      metric: 'approach_proximity_175_plus_ft',
      category: 'approach',
      insight_type: 'approach_proximity',
      confidence: 0.91,
      strokesImpact: 0,
      priority: 'low',
      created_at: '2026-01-01T00:00:00.000Z',
    });
    const freshWeakDiag = makeRow({
      id: 'penalty-weak-fresh',
      metric: 'penalty_rate_per_round',
      category: 'course_management',
      insight_type: 'penalty_rate',
      confidence: 0.3,
      strokesImpact: 0,
      priority: 'low',
      created_at: '2026-06-01T00:00:00.000Z', // newest → would win a recency sort
    });

    const orderCalls: OrderCall[] = [];
    activeClient = makeSupabaseMock(
      [freshWeakDiag, strongApproach],
      orderCalls,
    ) as unknown as SupabaseClient;

    const out = await getInsightsForCoach('coach-1');
    expect(out.map((i) => i.id)).toEqual(['approach-strong', 'penalty-weak-fresh']);
  });

  it('pre-orders the team sweep by id (stable pagination), NEVER strokes_impact, so legit-zero rows survive to the in-app floor', async () => {
    // Regression guard for the truncation bug. The original A5/A7 form pre-ordered
    // by created_at DESC + .limit(100); A8 replaced that with a FULL paginated
    // fetch ordered by `id` ASC (a stable pagination tiebreaker — the DB order is
    // irrelevant because ranking happens in-app afterward). The load-bearing
    // invariant is UNCHANGED: the candidate set is NEVER pre-ordered by
    // evidence->strokes_impact (an impact-DESC pre-order would push every
    // zero-impact diagnostic to the bottom and truncate it before the floor ranks
    // it). Assert the recorded order column is `id`, not strokes_impact.
    const zeroRows = [
      makeRow({ id: 'z1', metric: 'approach_proximity_175_plus_ft', confidence: 0.9, strokesImpact: 0 }),
      makeRow({ id: 'z2', metric: 'putts_made_5_10ft_pct', category: 'putting', confidence: 0.7, strokesImpact: 0 }),
    ];

    const orderCalls: OrderCall[] = [];
    activeClient = makeSupabaseMock(zeroRows, orderCalls) as unknown as SupabaseClient;

    const out = await getInsightsForCoach('coach-1');

    // The team-sweep pre-order column is `id` (ascending, stable pagination) —
    // and emphatically NOT strokes_impact.
    expect(orderCalls.length).toBeGreaterThan(0);
    const orderColumns = orderCalls.map((c) => c.column);
    expect(orderColumns).toContain('id');
    expect(orderColumns).not.toContain('strokes_impact');
    // Substring guard, not duplication: `.not.toContain` only catches an EXACT
    // 'strokes_impact' column, while a real regression would pass the JSON-path
    // form `evidence->strokes_impact`. This regex catches that embedded form too.
    expect(orderColumns.join()).not.toMatch(/strokes_impact/);
    const idOrder = orderCalls.find((c) => c.column === 'id');
    expect(idOrder?.opts?.ascending).toBe(true);

    // And both legit-zero rows survived the full fetch into the ranked output (the
    // floor kept them orderable rather than truncating them).
    expect(out.map((i) => i.id).sort()).toEqual(['z1', 'z2']);
  });
});

// ===========================================================================
// A8 — team-wide sweep window-starvation fix (paginate-then-rank)
// ===========================================================================

describe('getInsightsForCoach — A8 team sweep paginates past the newest-100 window', () => {
  it('surfaces a high-impact OLD insight that the newest-100 window would have truncated', async () => {
    // 130 synthetic team rows. 129 are RECENT, zero/low-impact noise. ONE is a
    // genuinely high-impact leak (large strokes_impact) but the OLDEST row, so a
    // newest-first `.limit(100)` window drops it (it sorts to the bottom, beyond
    // index 100) BEFORE the in-app `scoreInsight` rank ever sees it. The full
    // paginated fetch must keep it AND rank it to the top.
    const NOISE = 129;
    const noiseRows: RawRow[] = Array.from({ length: NOISE }, (_, i) =>
      makeRow({
        id: `noise-${String(i).padStart(3, '0')}`,
        // Distinct metric per row so dedupe (player:category:metric-subject)
        // doesn't collapse the noise into a single survivor and mask the test.
        metric: `noise_metric_${i}`,
        category: 'course_management',
        insight_type: 'penalty_rate',
        confidence: 0.2,
        strokesImpact: 0,
        priority: 'low',
        // Recent dates — all newer than the high-impact OLD row below, so a
        // newest-first window keeps these and evicts the old one.
        created_at: `2026-06-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
      }),
    );

    const oldHighImpact = makeRow({
      id: 'old-high-impact',
      metric: 'approach_proximity_175_plus_ft',
      category: 'approach',
      insight_type: 'approach_proximity',
      confidence: 0.95,
      strokesImpact: 4.2, // genuinely high impact
      priority: 'high',
      created_at: '2024-01-01T00:00:00.000Z', // OLDEST → truncated by newest-100
    });

    // Full set as the DB would hold it. Order here is irrelevant to the A8
    // path (it ranks in-app); the OLD row is placed LAST to mirror a
    // newest-first DB order where it'd fall past the 100-row window.
    const allRows: RawRow[] = [...noiseRows, oldHighImpact];

    const orderCalls: OrderCall[] = [];
    const rangeCalls: RangeCall[] = [];
    activeClient = makePaginatedSupabaseMock(
      allRows,
      orderCalls,
      rangeCalls,
      1000,
    ) as unknown as SupabaseClient;

    const out = await getInsightsForCoach('coach-1', { limit: 100 });

    const ids = out.map((i) => i.id);
    // The high-impact OLD row MUST be present (not truncated by a newest-100 cap)
    // and rank at the very top (its impact × confidence dominates the noise).
    expect(ids).toContain('old-high-impact');
    expect(ids[0]).toBe('old-high-impact');

    // Pagination actually ran: the team sweep used `.range()` (full fetch), not a
    // bare newest-100 `.limit()` cap.
    expect(rangeCalls.length).toBeGreaterThan(0);
  });
});
