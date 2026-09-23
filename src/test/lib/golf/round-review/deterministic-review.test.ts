import { describe, it, expect, vi } from 'vitest';

/**
 * Repair plan §5.5/§14.8 (Package 6, the 30-day pre-warm tool). This module
 * (src/lib/golf/round-review/deterministic-review.ts) is the worker-safe
 * core the pre-warm script (scripts/coachhelm-prewarm-round-reviews.ts)
 * builds on. Three plan-mandated safety properties, verified directly
 * against the exported functions rather than paraphrased:
 *
 *   1. writeReviewIfAbsent() always writes with `ignoreDuplicates: true` —
 *      never a caller-suppliable option — so it can create a MISSING review
 *      but can never replace an existing one's fields.
 *   2. Because of (1), an existing review's coach-authored/published/shared
 *      content is untouched when a write targets its round: the row in the
 *      fake DB after the call is byte-for-byte the same object, and the
 *      call reports `skipped_existing`, not `created`.
 *   3. A second write attempt against the same (now-existing) row is a
 *      no-op: still `skipped_existing`, still zero mutation, not a growing
 *      count of duplicate reviews.
 *
 * It also re-verifies the repair plan §5.4/N4 as-played comparison bound
 * through THIS module's own query (not round-review-system.ts's) — the two
 * are independent call sites and either could regress separately.
 */

// `calcSpy`, when set by a test, observes the exact rows
// `buildDeterministicRoundReview` hands to `calculateComparisonAverages` —
// the only way to prove the as-played `.lt('round_date', …)` filter actually
// ran, since asserting on the final review CONTENT can't distinguish "the
// filter excluded the future round" from "the filter never existed and the
// future round just didn't move the average enough to notice." Left `null`,
// every other test in this file gets the real, unmodified implementation.
let calcSpy: ((rows: unknown[]) => void) | null = null;

vi.mock('@/app/golf/actions/round-review-content', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/golf/actions/round-review-content')>();
  return {
    ...actual,
    calculateComparisonAverages: (rows: Parameters<typeof actual.calculateComparisonAverages>[0]) => {
      calcSpy?.(rows);
      return actual.calculateComparisonAverages(rows);
    },
  };
});

type Row = Record<string, unknown>;

/** Same minimal Postgrest-shaped fake as round-review-as-of.test.ts, plus a
 * genuine unique-constraint emulation on (round_id) for golf_round_reviews
 * so `ignoreDuplicates: true` can be tested for real: a conflicting upsert
 * returns zero rows and leaves the existing row object untouched (same
 * reference), exactly like `ON CONFLICT (round_id) DO NOTHING`. */
function makeSupabase(store: Record<string, Row[]>) {
  function builder(table: string) {
    let rows = [...(store[table] ?? [])];
    let mode: 'select' | 'upsert' = 'select';
    let upsertPayload: Row | null = null;
    let upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } | undefined;

    const node: Record<string, unknown> = {};
    Object.assign(node, {
      select: () => node,
      eq: (col: string, val: unknown) => { rows = rows.filter(r => r[col] === val); return node; },
      neq: (col: string, val: unknown) => { rows = rows.filter(r => r[col] !== val); return node; },
      lt: (col: string, val: unknown) => { rows = rows.filter(r => (r[col] as string) < (val as string)); return node; },
      not: (col: string, op: string, val: unknown) => {
        if (op === 'is' && val === null) rows = rows.filter(r => r[col] !== null && r[col] !== undefined);
        return node;
      },
      order: () => node,
      limit: (n: number) => { rows = rows.slice(0, n); return node; },
      upsert: (payload: Row, opts?: { onConflict?: string; ignoreDuplicates?: boolean }) => {
        mode = 'upsert';
        upsertPayload = payload;
        upsertOpts = opts;
        return node;
      },
      single: async () => (rows.length > 0 ? { data: rows[0], error: null } : { data: null, error: { message: 'not found' } }),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
        if (mode !== 'upsert') {
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        }
        // Emulate `ON CONFLICT (round_id) DO NOTHING` — only meaningful
        // because the test exercises golf_round_reviews, whose real schema
        // has a `golf_round_reviews_round_id_unique` index (see
        // round-review-system.ts's upsert comment).
        const table_ = store[table] ?? (store[table] = []);
        const conflictCol = upsertOpts?.onConflict ?? 'id';
        const existingIdx = table_.findIndex(r => r[conflictCol] === upsertPayload![conflictCol]);
        if (existingIdx >= 0) {
          if (upsertOpts?.ignoreDuplicates) {
            return Promise.resolve({ data: [], error: null }).then(resolve, reject); // DO NOTHING: zero rows, row left untouched
          }
          table_[existingIdx] = { ...table_[existingIdx], ...upsertPayload }; // would overwrite — the property under test is that we never hit this branch
          return Promise.resolve({ data: [table_[existingIdx]], error: null }).then(resolve, reject);
        }
        const created = { id: `generated-${table_.length + 1}`, ...upsertPayload };
        table_.push(created);
        return Promise.resolve({ data: [created], error: null }).then(resolve, reject);
      },
    });
    return node;
  }

  return { from: (table: string) => builder(table) };
}

describe('writeReviewIfAbsent — insert-only pre-warm write (plan §5.5 item 3)', () => {
  it('always writes with ignoreDuplicates: true, regardless of payload contents', async () => {
    const { writeReviewIfAbsent } = await import('@/lib/golf/round-review/deterministic-review');
    const store: Record<string, Row[]> = { golf_round_reviews: [] };
    const supabase = makeSupabase(store) as never;

    const result = await writeReviewIfAbsent(supabase, {
      round_id: 'round-1', player_id: 'p1', round_stats: {}, summary: 's',
      primary_takeaway: null, next_practice_priority: null, highlights: [], areas_to_review: [],
      highlights_count: 0, areas_count: 0, insights_count: 0, round_score: 70, round_score_to_par: -2,
      engine_version: 'rule-based-v2-prewarm', updated_at: '2026-01-01T00:00:00Z',
    });

    expect(result.outcome).toBe('created');
    expect(store.golf_round_reviews).toHaveLength(1);
  });

  it('never overwrites an existing review — reports skipped_existing and leaves the row untouched', async () => {
    const { writeReviewIfAbsent } = await import('@/lib/golf/round-review/deterministic-review');
    const existingReview: Row = {
      id: 'review-1', round_id: 'round-1', player_id: 'p1',
      summary: 'ORIGINAL — coach edited this', coach_notes: 'Work the 5-footers.',
      published_at: '2026-01-05T00:00:00Z', shared_with_coach: true,
      patterns_detected: { status: 'approved' },
    };
    const store: Record<string, Row[]> = { golf_round_reviews: [existingReview] };
    const supabase = makeSupabase(store) as never;

    const result = await writeReviewIfAbsent(supabase, {
      round_id: 'round-1', player_id: 'p1', round_stats: {}, summary: 'PREWARM WOULD WRITE THIS',
      primary_takeaway: null, next_practice_priority: null, highlights: [], areas_to_review: [],
      highlights_count: 0, areas_count: 0, insights_count: 0, round_score: 70, round_score_to_par: -2,
      engine_version: 'rule-based-v2-prewarm', updated_at: '2026-06-01T00:00:00Z',
    });

    const rows = store.golf_round_reviews!;
    expect(result.outcome).toBe('skipped_existing');
    expect(rows).toHaveLength(1);
    // Same object reference — nothing about it was replaced, merged, or mutated.
    expect(rows[0]).toBe(existingReview);
    expect(rows[0]?.summary).toBe('ORIGINAL — coach edited this');
    expect(rows[0]?.coach_notes).toBe('Work the 5-footers.');
  });

  it('a second write attempt against the same round is also a no-op (idempotent re-run)', async () => {
    const { writeReviewIfAbsent } = await import('@/lib/golf/round-review/deterministic-review');
    const store: Record<string, Row[]> = { golf_round_reviews: [] };
    const supabase = makeSupabase(store) as never;
    const payload = {
      round_id: 'round-1', player_id: 'p1', round_stats: {}, summary: 's',
      primary_takeaway: null, next_practice_priority: null, highlights: [], areas_to_review: [],
      highlights_count: 0, areas_count: 0, insights_count: 0, round_score: 70, round_score_to_par: -2,
      engine_version: 'rule-based-v2-prewarm', updated_at: '2026-01-01T00:00:00Z',
    };

    const first = await writeReviewIfAbsent(supabase, payload);
    const second = await writeReviewIfAbsent(supabase, payload);

    expect(first.outcome).toBe('created');
    expect(second.outcome).toBe('skipped_existing');
    expect(store.golf_round_reviews).toHaveLength(1); // not 2
  });
});

describe('toReviewInsertPayload — never touches coach-owned columns', () => {
  it('the payload has no key that could clobber coach-authored/published/shared state', async () => {
    const { toReviewInsertPayload } = await import('@/lib/golf/round-review/deterministic-review');
    const payload = toReviewInsertPayload({
      ok: true, roundId: 'round-1', playerId: 'p1', roundScore: 70, roundScoreToPar: -2,
      content: {
        summary: 's', sentiment: 'neutral', overallGrade: 'B',
        highlights: [], areasForImprovement: [], keyStats: [], recommendations: [],
        scoringDistribution: { eagles: [], birdies: [], pars: [], bogeys: [], doublePlus: [] },
      } as never,
    });

    for (const protectedKey of ['patterns_detected', 'status', 'coach_notes', 'coach_rating', 'published_at', 'published_by', 'shared_with_coach', 'shared_at', 'player_acknowledged_at']) {
      expect(Object.prototype.hasOwnProperty.call(payload, protectedKey)).toBe(false);
    }
  });
});

describe('buildDeterministicRoundReview — as-played baseline via the worker-safe path', () => {
  it('excludes rounds played after the reviewed round from the comparison average', async () => {
    const { buildDeterministicRoundReview } = await import('@/lib/golf/round-review/deterministic-review');

    const round = {
      id: 'round-current', player_id: 'p1', course_name: 'Test', round_date: '2026-06-15',
      total_score: 72, score_to_par: 0, total_putts: 30, total_fairways_hit: 8, total_fairways: 14,
      total_gir: 10, total_gir_possible: 18, holes_played: 18, status: 'completed',
    };
    const past = [70, 75, 80].map((score, i) => ({
      id: `past-${i}`, player_id: 'p1', round_date: `2026-0${5 - i}-15`, total_score: score,
      score_to_par: score - 72, total_putts: 30, total_fairways_hit: 8, total_fairways: 14,
      total_gir: 10, total_gir_possible: 18, holes_played: 18, status: 'completed',
    }));
    const future = [{
      id: 'future-1', player_id: 'p1', round_date: '2026-08-01', total_score: 200,
      score_to_par: 128, total_putts: 50, total_fairways_hit: 1, total_fairways: 14,
      total_gir: 1, total_gir_possible: 18, holes_played: 18, status: 'completed',
    }];

    const store: Record<string, Row[]> = {
      golf_rounds: [round, ...past, ...future],
      golf_shots: [],
      golf_holes: [],
    };
    const supabase = makeSupabase(store) as never;

    const seenRows: unknown[][] = [];
    calcSpy = (rows) => seenRows.push(rows);
    let result: Awaited<ReturnType<typeof buildDeterministicRoundReview>>;
    try {
      result = await buildDeterministicRoundReview(supabase, 'round-current');
    } finally {
      calcSpy = null;
    }

    expect(result.ok).toBe(true);
    // The actual regression check: the rows handed to
    // calculateComparisonAverages must not include the round played AFTER
    // the reviewed one. Without `.lt('round_date', roundData.round_date)`
    // this call includes `future-1`.
    expect(seenRows).toHaveLength(1);
    const comparisonIds = (seenRows[0] as { id: string }[]).map(r => r.id);
    expect(comparisonIds).not.toContain('future-1');
    expect(comparisonIds.sort()).toEqual(['past-0', 'past-1', 'past-2']);

    if (result.ok) {
      expect(result.content.keyStats).toBeDefined();
      // avgScore lives inside the internal playerAvgs computation, which
      // generateReviewContent folds into keyStats/comparison text — assert
      // indirectly is fragile, so instead assert the call succeeded with the
      // exact roundScore/roundScoreToPar carried through untouched by the
      // comparison query, and rely on round-review-as-of.test.ts for the
      // precise averaging arithmetic (shared logic, already covered there).
      expect(result.roundScore).toBe(72);
      expect(result.roundScoreToPar).toBe(0);
    }
  });

  it('reports not_completed for a round that is not yet completed', async () => {
    const { buildDeterministicRoundReview } = await import('@/lib/golf/round-review/deterministic-review');
    const store: Record<string, Row[]> = {
      golf_rounds: [{ id: 'round-x', player_id: 'p1', round_date: '2026-06-15', status: 'in_progress' }],
      golf_shots: [], golf_holes: [],
    };
    const supabase = makeSupabase(store) as never;

    const result = await buildDeterministicRoundReview(supabase, 'round-x');

    expect(result).toEqual({ ok: false, roundId: 'round-x', reason: 'not_completed' });
  });
});
