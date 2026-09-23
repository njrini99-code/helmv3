import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Repair plan §5.4 / N14: `round-reviews.ts` had three review-history
 * readers, each deriving "when did this happen" and "what status is this"
 * differently:
 *
 *   - getTeamReviewsImpl ordered by the REVIEW's created_at (generation
 *     time), applied the status filter to the page AFTER `.range()` had
 *     already cut it down, and returned `count` for the UNFILTERED set.
 *   - getPendingCoachReviewsImpl ordered by created_at too, and fell back
 *     to a bare 'draft' when patterns_detected.status was unset — even for
 *     a review that was actually shared_with_coach.
 *   - getPlayerReviewHistoryImpl also ordered by created_at.
 *   - dbRowToReview derived status as `patterns_detected.status ??
 *     (shared_with_coach ? 'shared' : 'draft')` — a THIRD rule, disagreeing
 *     with the other two.
 *
 * The fix: one `effectiveReviewStatus()` helper for status, one
 * `compareByRoundChronologyDesc()` for ordering (the REVIEWED ROUND's date,
 * not the review row's creation time), used by all three readers; filtering
 * happens before pagination and `total` always matches the filtered set.
 *
 * This fixture builds a small in-memory Postgrest-shaped fake that performs
 * real filtering/ordering/counting (including PostgREST's actual `count:
 * 'exact'` semantics — the count of rows matching the query's DB-level
 * filters, independent of `.range()`), so the assertions below exercise the
 * real bug rather than a paraphrase of it.
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

vi.mock('@/lib/auth/verify-player-access', () => ({
  verifyPlayerAccess: vi.fn(async () => ({ allowed: true, reason: 'self' })),
}));

vi.mock('@/lib/golf/resolve-team-server', () => ({
  resolveCoachTeamIdWithCookie: vi.fn(async () => '11111111-1111-4111-8111-111111111111'),
}));

type Row = Record<string, unknown>;

function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== 'object') return undefined;
    return (acc as Row)[key];
  }, obj);
}

/**
 * A minimal Postgrest-shaped fake that actually filters, orders, ranges and
 * counts — including the real PostgREST `count: 'exact'` behavior: the
 * report is the number of rows matching every filter chained BEFORE
 * `.range()`, independent of the page window. That is exactly the property
 * the pre-fix `getTeamReviewsImpl` got wrong (it filtered by status AFTER
 * fetching a page, so `count` never reflected the status filter at all).
 */
function makeSupabase(store: Record<string, Row[]>) {
  function builder(table: string) {
    let rows = [...(store[table] ?? [])];
    let wantCount = false;
    let preRangeCount: number | undefined;

    const node: Record<string, unknown> = {};
    Object.assign(node, {
      select: (_cols: string, opts?: { count?: string }) => {
        wantCount = opts?.count === 'exact';
        return node;
      },
      eq: (col: string, val: unknown) => { rows = rows.filter(r => getPath(r, col) === val); return node; },
      neq: (col: string, val: unknown) => { rows = rows.filter(r => getPath(r, col) !== val); return node; },
      in: (col: string, vals: unknown[]) => { rows = rows.filter(r => vals.includes(getPath(r, col))); return node; },
      order: (col: string, opts?: { ascending?: boolean }) => {
        const dir = opts?.ascending === false ? -1 : 1;
        rows = [...rows].sort((a, b) => {
          const av = getPath(a, col) as string | number;
          const bv = getPath(b, col) as string | number;
          if (av === bv) return 0;
          return av < bv ? -1 * dir : 1 * dir;
        });
        return node;
      },
      range: (from: number, to: number) => {
        preRangeCount = rows.length;
        rows = rows.slice(from, to + 1);
        return node;
      },
      maybeSingle: async () => (rows.length > 0 ? { data: rows[0], error: null } : { data: null, error: null }),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve({ data: rows, error: null, count: wantCount ? (preRangeCount ?? rows.length) : null }).then(resolve, reject),
    });
    return node;
  }

  return {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    from: (table: string) => builder(table),
  };
}

function review(id: string, opts: {
  roundDate: string;
  reviewCreatedAt: string;
  playerId?: string;
  teamId?: string;
  status?: string; // patterns_detected.status; omit for the shared_with_coach-derived default
  sharedWithCoach?: boolean;
  /** The raw top-level `status` DB column — only ever null or 'published' in
   * production (only `publishReviewImpl` writes it). Takes precedence over
   * `status`/`sharedWithCoach` above when set. */
  rawStatusColumn?: string;
}): Row {
  return {
    id,
    player_id: opts.playerId ?? 'p1',
    created_at: opts.reviewCreatedAt,
    status: opts.rawStatusColumn ?? null,
    patterns_detected: opts.status ? { status: opts.status } : null,
    shared_with_coach: opts.sharedWithCoach ?? false,
    round: {
      id: `round-${id}`,
      round_date: opts.roundDate,
      created_at: opts.roundDate + 'T12:00:00Z',
      team_id: opts.teamId ?? '11111111-1111-4111-8111-111111111111',
      player: { id: opts.playerId ?? 'p1', profile: {} },
      course: {},
    },
  };
}

describe('round-review chronology and status reconciliation (N14)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getTeamReviews', () => {
    // Round-chronology order (desc by round_date): r5, r4, r3, r2, r1.
    // Review created_at order (desc, the PRE-FIX sort key): r1, r5, r3, r2, r4.
    // The two orders disagree everywhere except r3's position — that's what
    // makes this fixture prove the sort key changed, not just tolerate it.
    const reviews = [
      review('r1', { roundDate: '2026-01-05', reviewCreatedAt: '2026-06-20T00:00:00Z' }), // draft (no status, not shared)
      review('r2', { roundDate: '2026-02-10', reviewCreatedAt: '2026-02-11T00:00:00Z', status: 'shared' }),
      review('r3', { roundDate: '2026-03-15', reviewCreatedAt: '2026-03-16T00:00:00Z', status: 'coach_review' }),
      review('r4', { roundDate: '2026-04-20', reviewCreatedAt: '2026-01-01T00:00:00Z', sharedWithCoach: true }), // shared, via the fallback rule — not patterns_detected.status
      review('r5', { roundDate: '2026-05-25', reviewCreatedAt: '2026-05-26T00:00:00Z', status: 'draft' }),
    ];

    function makeStore() {
      return {
        golf_coaches: [{ id: 'coach-1', organization_id: 'org-1', user_id: 'user-1' }],
        golf_teams: [{ id: '11111111-1111-4111-8111-111111111111', organization_id: 'org-1' }],
        golf_round_reviews: reviews,
      };
    }

    it('orders by the reviewed round\'s date, not by when the review row was generated', async () => {
      vi.resetModules();
      vi.doMock('@/lib/supabase/server', () => ({ createClient: async () => makeSupabase(makeStore()) }));
      const { getTeamReviews } = await import('@/app/golf/actions/round-reviews');

      const result = await getTeamReviews('11111111-1111-4111-8111-111111111111', { limit: 10, offset: 0 });

      expect(result.success).toBe(true);
      expect((result.reviews ?? []).map(r => r.id)).toEqual(['r5', 'r4', 'r3', 'r2', 'r1']);
    });

    it('filters before pagination and reports a count matching the filtered set, including the shared_with_coach fallback', async () => {
      vi.resetModules();
      vi.doMock('@/lib/supabase/server', () => ({ createClient: async () => makeSupabase(makeStore()) }));
      const { getTeamReviews } = await import('@/app/golf/actions/round-reviews');

      // Two reviews are effectively 'shared': r2 (explicit status) and r4
      // (shared_with_coach fallback — dbRowToReview's rule, which the old
      // getTeamReviewsImpl filter ignored entirely).
      const page1 = await getTeamReviews('11111111-1111-4111-8111-111111111111', { status: 'shared', limit: 1, offset: 0 });
      expect(page1.total).toBe(2);
      expect((page1.reviews ?? []).map(r => r.id)).toEqual(['r4']); // more recent round first

      const page2 = await getTeamReviews('11111111-1111-4111-8111-111111111111', { status: 'shared', limit: 1, offset: 1 });
      expect(page2.total).toBe(2);
      expect((page2.reviews ?? []).map(r => r.id)).toEqual(['r2']);

      const page3 = await getTeamReviews('11111111-1111-4111-8111-111111111111', { status: 'shared', limit: 1, offset: 2 });
      expect(page3.total).toBe(2);
      expect(page3.reviews ?? []).toEqual([]);
    });
  });

  describe('getPendingCoachReviews', () => {
    it('orders by round chronology and applies one reconciled status rule', async () => {
      const reviews = [
        review('p1', { roundDate: '2026-01-10', reviewCreatedAt: '2026-06-01T00:00:00Z', playerId: 'player-a' }), // draft
        review('p2', { roundDate: '2026-03-10', reviewCreatedAt: '2026-01-01T00:00:00Z', playerId: 'player-b', status: 'approved' }), // not pending
        review('p3', { roundDate: '2026-02-10', reviewCreatedAt: '2026-05-01T00:00:00Z', playerId: 'player-a', status: 'coach_review' }),
      ];
      const store = {
        golf_coaches: [{ id: 'coach-1', organization_id: 'org-1', user_id: 'user-1' }],
        golf_team_members: [
          { player_id: 'player-a', team_id: '11111111-1111-4111-8111-111111111111', status: 'active' },
          { player_id: 'player-b', team_id: '11111111-1111-4111-8111-111111111111', status: 'active' },
        ],
        golf_round_reviews: reviews,
      };
      vi.resetModules();
      vi.doMock('@/lib/supabase/server', () => ({ createClient: async () => makeSupabase(store) }));
      const { getPendingCoachReviews } = await import('@/app/golf/actions/round-reviews');

      const result = await getPendingCoachReviews();

      expect(result.success).toBe(true);
      // p2 is 'approved' — excluded from the pending queue. p3's round
      // (02-10) is more recent than p1's (01-10), despite p1's review row
      // having been generated later.
      expect((result.reviews ?? []).map(r => r.id)).toEqual(['p3', 'p1']);
    });
  });

  describe('getPlayerReviewHistory', () => {
    it('orders the player\'s own history by round chronology, not review creation time', async () => {
      const reviews = [
        review('h1', { roundDate: '2026-01-01', reviewCreatedAt: '2026-09-01T00:00:00Z' }),
        review('h2', { roundDate: '2026-08-01', reviewCreatedAt: '2026-01-01T00:00:00Z' }),
      ];
      const store = { golf_round_reviews: reviews };
      vi.resetModules();
      vi.doMock('@/lib/supabase/server', () => ({ createClient: async () => makeSupabase(store) }));
      const { getPlayerReviewHistory } = await import('@/app/golf/actions/round-reviews');

      const result = await getPlayerReviewHistory('p1');

      expect(result.success).toBe(true);
      expect((result.reviews ?? []).map(r => r.id)).toEqual(['h2', 'h1']);
    });

    it('reports "published" once publishReviewImpl has set the raw status column, overriding a stale patterns_detected.status', async () => {
      // publishReviewImpl writes ONLY the top-level `status` column
      // (round-reviews.ts publishReviewImpl) — patterns_detected.status is
      // left at whatever it was before publishing (here, 'approved'). A
      // reconciliation that reads patterns_detected only would keep
      // reporting a published review as merely "approved".
      const reviews = [
        review('pub1', {
          roundDate: '2026-01-01',
          reviewCreatedAt: '2026-01-01T00:00:00Z',
          status: 'approved',
          rawStatusColumn: 'published',
        }),
      ];
      const store = { golf_round_reviews: reviews };
      vi.resetModules();
      vi.doMock('@/lib/supabase/server', () => ({ createClient: async () => makeSupabase(store) }));
      const { getPlayerReviewHistory } = await import('@/app/golf/actions/round-reviews');

      const result = await getPlayerReviewHistory('p1');

      expect(result.success).toBe(true);
      expect(result.reviews?.[0]?.status).toBe('published');
    });

    it('still returns a review whose round is inaccessible (RLS-hidden after a transfer), sorted last', async () => {
      // getPlayerReviewHistoryImpl's join is deliberately NOT `!inner` — a
      // review can outlive its round's visibility to this caller (e.g. a
      // player transferred to another team). Dropping such a review from a
      // player's own history would be a regression the `!inner` variant of
      // this join introduced; it must come back, just undated and sorted
      // after everything with a real round date.
      const orphan = review('orphan', { roundDate: '2026-06-01', reviewCreatedAt: '2026-06-01T00:00:00Z' });
      orphan.round = null;
      const dated = review('dated', { roundDate: '2026-01-01', reviewCreatedAt: '2026-01-01T00:00:00Z' });
      const store = { golf_round_reviews: [orphan, dated] };
      vi.resetModules();
      vi.doMock('@/lib/supabase/server', () => ({ createClient: async () => makeSupabase(store) }));
      const { getPlayerReviewHistory } = await import('@/app/golf/actions/round-reviews');

      const result = await getPlayerReviewHistory('p1');

      expect(result.success).toBe(true);
      // Both come back — the orphan isn't silently dropped — and it sorts
      // last since it has no round_date to compare with.
      expect((result.reviews ?? []).map(r => r.id)).toEqual(['dated', 'orphan']);
    });
  });
});
