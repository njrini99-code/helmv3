// Regression pack — #477: postgame review regenerate must preserve any coach
// disposition (converted_to_timeline / converted_to_task / dismissed /
// resolved) across re-runs, never reset it back to 'new'. Also covers the
// stale-item soft-dismiss path (item no longer emitted -> disposition
// 'dismissed', never deleted) and idempotent re-emit of untouched 'new' items.
//
// buildPostgameReview is mocked so this test targets ONLY the persistence
// logic in generatePostgameReview (the priorDisposition overlay + stale
// reconciliation), not the pure builder's candidate-generation heuristics.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

vi.mock('@/lib/baseball/with-baseball-action', () => ({
  withBaseballAction:
    (_name: string, _opts: unknown, fn: (ctx: unknown, ...a: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      fn(
        {
          user: { id: 'user-1' },
          activeCoachId: 'coach-1',
          targetTeamId: 'team-1',
          activeTeamId: 'team-1',
        },
        ...args,
      ),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/baseball/coachhelm/outcome-sweep', () => ({
  sweepActionOutcomes: vi.fn(async () => {}),
}));

let fake: FakeSupabase;
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

/** Candidates returned by the mocked builder for a given test run. */
let candidateDedupeKeys: string[] = [];
vi.mock('@/lib/baseball/postgame/build-review', () => ({
  buildPostgameReview: vi.fn(() => ({
    title: 'Postgame Review',
    summary: 'summary',
    confidence: 0.5,
    visibility: 'staff_only',
    items: candidateDedupeKeys.map((dedupeKey) => ({
      playerId: 'player-1',
      itemKind: 'player_action',
      signalSource: 'test',
      title: `Item ${dedupeKey}`,
      detail: 'detail',
      actionLabel: 'do it',
      actionType: 'log',
      ownerRole: 'coach',
      priority: 'medium',
      confidence: 0.5,
      visibility: 'staff_only',
      playerVisible: false,
      sourceRefs: [],
      dedupeKey,
    })),
  })),
}));

const GAME_ID = 'game-1';
const TEAM_ID = 'team-1';

interface ReviewItemRow {
  id: string;
  dedupe_key: string;
  disposition: string;
}

/** Typed accessor for the fake table, avoiding `any` at every call site. */
function reviewItemsTable() {
  return fake.from('baseball_postgame_review_items') as unknown as {
    select: () => Promise<{ data: ReviewItemRow[] }>;
    update: (patch: Record<string, unknown>) => { eq: (col: string, value: string) => Promise<unknown> };
  };
}

function seedGameAndBoxScore() {
  return {
    baseball_games: [
      { id: GAME_ID, team_id: TEAM_ID, game_date: '2026-07-01', opponent_name: 'Rivals', game_type: 'game', our_score: 5, opponent_score: 3 },
    ],
    baseball_box_score_batting: [],
    baseball_box_score_pitching: [],
    baseball_player_season_stats: [],
  };
}

describe('generatePostgameReview (#477 disposition preservation)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    candidateDedupeKeys = ['sig:a'];
  });

  it('a fresh review inserts new items with disposition "new"', async () => {
    fake = createFakeSupabase({ user: { id: 'user-1' }, tables: seedGameAndBoxScore() });
    const { generatePostgameReview } = await import('@/app/baseball/actions/postgame');

    const result = await generatePostgameReview(GAME_ID);
    expect(result.success).toBe(true);
    expect(result.itemsGenerated).toBe(1);

    const { data: rows } = await reviewItemsTable().select();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.disposition).toBe('new');
  });

  it('regenerate preserves converted_to_timeline disposition instead of resetting to new', async () => {
    const tables = seedGameAndBoxScore();
    fake = createFakeSupabase({ user: { id: 'user-1' }, tables });

    const { generatePostgameReview } = await import('@/app/baseball/actions/postgame');

    // First run creates the item as 'new'.
    const first = await generatePostgameReview(GAME_ID);
    expect(first.success).toBe(true);
    const reviewId = first.reviewId!;

    // Simulate a coach converting the item to a player-timeline entry —
    // exactly what convertPostgameItemToTimeline does at the DB layer.
    const before = await reviewItemsTable().select();
    const itemId = before.data[0]!.id;
    await reviewItemsTable().update({ disposition: 'converted_to_timeline' }).eq('id', itemId);

    // Regenerate — the SAME candidate (same dedupeKey) is re-emitted. Content
    // fields may be refreshed, but disposition must stay converted_to_timeline.
    const second = await generatePostgameReview(GAME_ID);
    expect(second.success).toBe(true);
    expect(second.reviewId).toBe(reviewId);

    const after = await reviewItemsTable().select();
    expect(after.data).toHaveLength(1);
    expect(after.data[0]!.disposition).toBe('converted_to_timeline');
  });

  it('regenerate preserves dismissed and resolved dispositions the same way', async () => {
    for (const disposition of ['dismissed', 'resolved'] as const) {
      const tables = seedGameAndBoxScore();
      fake = createFakeSupabase({ user: { id: 'user-1' }, tables });
      const { generatePostgameReview } = await import('@/app/baseball/actions/postgame');

      await generatePostgameReview(GAME_ID);
      const before = await reviewItemsTable().select();
      const itemId = before.data[0]!.id;
      await reviewItemsTable().update({ disposition }).eq('id', itemId);

      await generatePostgameReview(GAME_ID);
      const after = await reviewItemsTable().select();
      expect(after.data).toHaveLength(1);
      expect(after.data[0]!.disposition).toBe(disposition);
    }
  });

  it('an item no longer emitted is soft-dismissed, never deleted', async () => {
    const tables = seedGameAndBoxScore();
    fake = createFakeSupabase({ user: { id: 'user-1' }, tables });
    const { generatePostgameReview } = await import('@/app/baseball/actions/postgame');

    candidateDedupeKeys = ['sig:a', 'sig:b'];
    const first = await generatePostgameReview(GAME_ID);
    expect(first.itemsGenerated).toBe(2);

    // Next run only re-derives sig:a (e.g. a corrected box score no longer
    // triggers the sig:b signal).
    candidateDedupeKeys = ['sig:a'];
    const second = await generatePostgameReview(GAME_ID);
    expect(second.success).toBe(true);
    expect(second.itemsDismissed).toBe(1);

    const rows = (await reviewItemsTable().select()).data;
    expect(rows).toHaveLength(2); // never deleted
    const sigB = rows.find((r) => r.dedupe_key === 'sig:b');
    expect(sigB!.disposition).toBe('dismissed');
    const sigA = rows.find((r) => r.dedupe_key === 'sig:a');
    expect(sigA!.disposition).toBe('new');
  });

  it('a stale item already converted/dismissed is left untouched, not re-flagged', async () => {
    const tables = seedGameAndBoxScore();
    fake = createFakeSupabase({ user: { id: 'user-1' }, tables });
    const { generatePostgameReview } = await import('@/app/baseball/actions/postgame');

    candidateDedupeKeys = ['sig:a', 'sig:b'];
    await generatePostgameReview(GAME_ID);
    const before = await reviewItemsTable().select();
    const sigBId = before.data.find((r) => r.dedupe_key === 'sig:b')!.id;
    await reviewItemsTable().update({ disposition: 'converted_to_task' }).eq('id', sigBId);

    // sig:b no longer emitted, but it's already converted_to_task — the
    // stale sweep only targets disposition='new' rows, so it must be
    // left alone (not overwritten to 'dismissed').
    candidateDedupeKeys = ['sig:a'];
    const second = await generatePostgameReview(GAME_ID);
    expect(second.itemsDismissed).toBe(0);

    const rows = (await reviewItemsTable().select()).data;
    const sigB = rows.find((r) => r.dedupe_key === 'sig:b');
    expect(sigB!.disposition).toBe('converted_to_task');
  });
});
