import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Repair plan §5.4 / N4: the historical comparison query in
 * `computeAndStoreRoundReview` (round-review-system.ts) excluded the reviewed
 * round by ID but had no `round_date` upper bound. A review generated or
 * regenerated for an OLD round (backfill/pre-warm, or simply opened late)
 * therefore compared that round against rounds played AFTER it — comparing
 * the past against the player's future and calling it "your recent average".
 *
 * The "as_played" contract (plan §5.4 R4): comparison evidence must predate
 * the reviewed round. Same-day rounds require trustworthy sequencing the
 * table doesn't carry, so they're excluded from the baseline too — which a
 * strict `round_date <` comparison gives for free.
 *
 * This test builds a tiny in-memory Postgrest-shaped fake so the real
 * `calculateComparisonAverages` arithmetic runs on rows the fix's query
 * filter actually lets through. On the pre-fix query (no date bound), the
 * three future/same-day rounds (scores 200/210/999) get averaged in with the
 * three genuinely past rounds (70/75/80), pulling the reported average up to
 * ~239. The fix must report exactly 75 — the past rounds only.
 */

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

// Player identity is authorized as 'self' unconditionally — this fixture is
// about the comparison query's date bound, not the auth layer covered
// elsewhere (round-review-feedback-write-integrity.test.ts, etc.).
vi.mock('@/lib/auth/verify-player-access', () => ({
  verifyPlayerAccess: vi.fn(async () => ({ allowed: true, reason: 'self' })),
  verifyTeamAccess: vi.fn(async () => ({ allowed: true })),
  verifyRoundBelongsToPlayer: vi.fn(async () => true),
}));

// Not exercised on this path (shotRows is empty, so the CoachHelm enhancement
// branch never runs) — mocked only to keep the import graph light.
vi.mock('@/lib/coachhelm/v2', () => ({
  coachHelmIntelligence: { generateRoundReview: vi.fn() },
  isCoachHelmEnabledForPlayer: vi.fn(async () => ({ effectivelyEnabled: false })),
}));

vi.mock('@/lib/coachhelm/v3/standing/loader', () => ({
  loadPlayerStandingMap: vi.fn(async () => ({})),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

const generateReviewContent = vi.fn((_round: unknown, _holes: unknown, playerAvgs: unknown) => ({
  summary: 'test summary',
  highlights: [],
  areasForImprovement: [],
  deepInsights: [],
  keyStats: [],
  __capturedPlayerAvgs: playerAvgs,
}));

// Only `generateReviewContent` is mocked (to capture the computed
// `playerAvgs` argument) — `calculateComparisonAverages` and
// `buildHoleBreakdowns` are the REAL implementations from this module, so
// the assertions below exercise the real averaging arithmetic on whatever
// rows the source's `.lt('round_date', …)` filter actually lets through.
vi.mock('@/app/golf/actions/round-review-content', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/golf/actions/round-review-content')>();
  return { ...actual, generateReviewContent };
});

type Row = Record<string, unknown>;

/** Minimal Postgrest-shaped fake: `.eq/.neq/.lt/.not/.in` genuinely narrow an
 * in-memory row set, so the query the source code actually builds determines
 * what `calculateComparisonAverages` sees — this is the whole point of the
 * fixture. `.order()` is a no-op (irrelevant with < 20 rows per table). */
function makeSupabase(store: Record<string, Row[]>) {
  function builder(table: string) {
    let rows = [...(store[table] ?? [])];
    let mode: 'select' | 'upsert' = 'select';

    const node: Record<string, unknown> = {};
    Object.assign(node, {
      select: () => node,
      eq: (col: string, val: unknown) => { rows = rows.filter(r => r[col] === val); return node; },
      neq: (col: string, val: unknown) => { rows = rows.filter(r => r[col] !== val); return node; },
      lt: (col: string, val: unknown) => { rows = rows.filter(r => (r[col] as string) < (val as string)); return node; },
      gt: (col: string, val: unknown) => { rows = rows.filter(r => (r[col] as string) > (val as string)); return node; },
      not: (col: string, op: string, val: unknown) => {
        if (op === 'is' && val === null) rows = rows.filter(r => r[col] !== null && r[col] !== undefined);
        return node;
      },
      in: (col: string, vals: unknown[]) => { rows = rows.filter(r => vals.includes(r[col])); return node; },
      order: () => node,
      limit: (n: number) => { rows = rows.slice(0, n); return node; },
      upsert: (_payload: unknown) => { mode = 'upsert'; return node; },
      single: async () => {
        if (mode === 'upsert') return { data: { id: 'review-generated' }, error: null };
        return rows.length > 0 ? { data: rows[0], error: null } : { data: null, error: { message: 'not found' } };
      },
      maybeSingle: async () => (rows.length > 0 ? { data: rows[0], error: null } : { data: null, error: null }),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve({ data: rows, error: null }).then(resolve, reject),
    });
    return node;
  }

  return {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    from: (table: string) => builder(table),
  };
}

const PLAYER_ID = 'p1';
const REVIEWED_ROUND_ID = 'round-current';
const REVIEWED_ROUND_DATE = '2026-06-15';

function baseStore(): Record<string, Row[]> {
  return {
    golf_rounds: [
      {
        id: REVIEWED_ROUND_ID, player_id: PLAYER_ID, course_name: 'Test Course',
        round_date: REVIEWED_ROUND_DATE, total_score: 72, score_to_par: 0,
        total_putts: 30, total_fairways_hit: 8, total_fairways: 14,
        total_gir: 10, total_gir_possible: 18, holes_played: 18, status: 'completed',
        created_at: '2026-06-15T18:00:00Z',
      },
      // Past — must be INCLUDED in the as-played baseline.
      { id: 'round-past-1', player_id: PLAYER_ID, round_date: '2026-06-01', total_score: 70, score_to_par: -2, total_putts: 28, total_fairways_hit: 9, total_fairways: 14, total_gir: 11, total_gir_possible: 18, holes_played: 18, status: 'completed', created_at: '2026-06-01T18:00:00Z' },
      { id: 'round-past-2', player_id: PLAYER_ID, round_date: '2026-05-20', total_score: 75, score_to_par: 3, total_putts: 31, total_fairways_hit: 7, total_fairways: 14, total_gir: 9, total_gir_possible: 18, holes_played: 18, status: 'completed', created_at: '2026-05-20T18:00:00Z' },
      { id: 'round-past-3', player_id: PLAYER_ID, round_date: '2026-05-10', total_score: 80, score_to_par: 8, total_putts: 33, total_fairways_hit: 6, total_fairways: 14, total_gir: 8, total_gir_possible: 18, holes_played: 18, status: 'completed', created_at: '2026-05-10T18:00:00Z' },
      // Future — must be EXCLUDED from the as-played baseline (event-time leak).
      { id: 'round-future-1', player_id: PLAYER_ID, round_date: '2026-07-01', total_score: 200, score_to_par: 128, total_putts: 50, total_fairways_hit: 1, total_fairways: 14, total_gir: 1, total_gir_possible: 18, holes_played: 18, status: 'completed', created_at: '2026-07-01T18:00:00Z' },
      { id: 'round-future-2', player_id: PLAYER_ID, round_date: '2026-08-01', total_score: 210, score_to_par: 138, total_putts: 52, total_fairways_hit: 1, total_fairways: 14, total_gir: 1, total_gir_possible: 18, holes_played: 18, status: 'completed', created_at: '2026-08-01T18:00:00Z' },
      // Same day as the reviewed round — no trustworthy intra-day sequencing,
      // must also be EXCLUDED.
      { id: 'round-sameday', player_id: PLAYER_ID, round_date: REVIEWED_ROUND_DATE, total_score: 999, score_to_par: 900, total_putts: 90, total_fairways_hit: 0, total_fairways: 14, total_gir: 0, total_gir_possible: 18, holes_played: 18, status: 'completed', created_at: '2026-06-15T20:00:00Z' },
    ],
    golf_shots: [],
    golf_holes: [],
  };
}

describe('computeAndStoreRoundReview — as-played historical baseline (N4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('excludes rounds played after (or on) the reviewed round from the comparison average', async () => {
    vi.resetModules();
    const supabase = makeSupabase(baseStore());
    vi.doMock('@/lib/supabase/server', () => ({ createClient: async () => supabase }));

    const { generateAndStoreRoundReview } = await import('@/app/golf/actions/round-review-system');
    const result = await generateAndStoreRoundReview(REVIEWED_ROUND_ID, PLAYER_ID);

    expect(result.success).toBe(true);
    expect(generateReviewContent).toHaveBeenCalledTimes(1);

    const playerAvgs = generateReviewContent.mock.calls[0]?.[2] as { avgScore: number | null } | null;
    // Only the three PAST rounds (70, 75, 80) may contribute: avg = 75.
    // The pre-fix query (no round_date bound) would also pull in the two
    // future rounds and the same-day round (200, 210, 999), producing a much
    // higher, event-time-leaked average instead.
    expect(playerAvgs?.avgScore).toBe(75);
  });

  it('never lets a future or same-day round outscore the as-played baseline', async () => {
    vi.resetModules();
    const supabase = makeSupabase(baseStore());
    vi.doMock('@/lib/supabase/server', () => ({ createClient: async () => supabase }));

    const { generateAndStoreRoundReview } = await import('@/app/golf/actions/round-review-system');
    await generateAndStoreRoundReview(REVIEWED_ROUND_ID, PLAYER_ID);

    const playerAvgs = generateReviewContent.mock.calls[0]?.[2] as { avgScore: number | null } | null;
    // A leaked future/same-day row (200/210/999) would push this well above 100.
    expect(playerAvgs?.avgScore).toBeLessThan(100);
  });
});
