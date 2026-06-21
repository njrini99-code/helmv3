/**
 * P2-14 / P2-19 — Scan Team (generateAlerts) honesty contract.
 *
 *   1. An INSERT failure must return { success:false }, NOT a success that
 *      reports the requested count (the old code swallowed the insert error and
 *      claimed `generated: newAlerts.length`).
 *   2. The reported `generated` count is the VISIBLE DELTA from the canonical
 *      V3 read (count-after − count-before), not the raw insert count — because
 *      the legacy alert rows are structurally invisible to the V3 feed, so the
 *      insert count over-claimed what the coach will actually see.
 *
 * The supabase mock simulates the four table interactions generateAlerts makes:
 * golf_coaches (ownership single), golf_team_members + golf_players (roster),
 * and golf_coach_insights (the count query, the insert, and the re-read).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

// Each scanned player yields a critical analysis → one alert row per player.
vi.mock('@/lib/coachhelm/v2', () => ({
  coachHelmIntelligence: {
    analyzePlayer: vi.fn(async () => ({
      alertLevel: 'critical',
      primaryInsight: {
        headline: 'Needs attention',
        body: 'body',
        callToAction: 'cta',
        tone: 'urgent',
        confidence: 0.8,
      },
      patterns: [],
      recommendations: [],
      insights: [],
    })),
  },
}));

import { generateAlerts } from '@/app/golf/actions/alerts';
import { createClient } from '@/lib/supabase/server';

const createClientMock = vi.mocked(createClient);

/**
 * Builds a supabase mock. `countSequence` is the value `countVisibleCoachInsights`
 * returns on successive calls (before, after). `insertError` forces the alert
 * insert to fail.
 */
function makeClient(opts: { countSequence: number[]; insertError?: boolean }) {
  const counts = [...opts.countSequence];

  const coachBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: 'coach-1' }, error: null }),
  };

  const teamMembersBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => void) =>
      Promise.resolve(resolve({ data: [{ player_id: 'p-1' }], error: null })),
  };

  const playersBuilder = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => void) =>
      Promise.resolve(
        resolve({ data: [{ id: 'p-1', first_name: 'A', last_name: 'B', avatar_url: null }], error: null }),
      ),
  };

  // golf_coach_insights is used three ways. We discriminate by the call shape:
  //   • count query   → select('id', { count:'exact', head:true }) then awaited
  //   • insert        → insert(rows) then awaited (returns { error })
  //   • re-read       → select(longCols).eq().eq().is?().order().limit() awaited
  function makeInsightsBuilder() {
    let isCountQuery = false;
    let isInsert = false;
    const builder = {
      select: vi.fn((_cols: string, options?: { count?: string; head?: boolean }) => {
        if (options?.head || options?.count) isCountQuery = true;
        return builder;
      }),
      insert: vi.fn(() => {
        isInsert = true;
        return builder;
      }),
      not: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      then: (resolve: (v: unknown) => void) => {
        if (isCountQuery) {
          const count = counts.shift() ?? 0;
          isCountQuery = false;
          return Promise.resolve(resolve({ count, error: null, data: null }));
        }
        if (isInsert) {
          isInsert = false;
          return Promise.resolve(
            resolve({ error: opts.insertError ? { message: 'insert boom', code: '500' } : null }),
          );
        }
        // re-read (getCoachAlerts) — empty alert list is fine for these assertions.
        return Promise.resolve(resolve({ data: [], error: null }));
      },
    };
    return builder;
  }

  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
    },
    from: vi.fn((table: string) => {
      if (table === 'golf_coaches') return coachBuilder;
      if (table === 'golf_team_members') return teamMembersBuilder;
      if (table === 'golf_players') return playersBuilder;
      if (table === 'golf_coach_insights') return makeInsightsBuilder();
      throw new Error(`Unexpected table: ${table}`);
    }),
  } as unknown as Awaited<ReturnType<typeof createClient>>;

  return client;
}

describe('generateAlerts — P2-14 honest count + error contract', () => {
  beforeEach(() => createClientMock.mockReset());

  it('returns success:false on an insert failure (never success with a count)', async () => {
    createClientMock.mockResolvedValue(makeClient({ countSequence: [2, 5], insertError: true }));

    const res = await generateAlerts('coach-1', 'team-1');
    expect(res.success).toBe(false);
    expect(res.generated).toBeUndefined();
  });

  it('reports the visible delta from the canonical read, not the raw insert count', async () => {
    // before=2, after=4 → visible delta is 2, regardless of how many rows were
    // inserted (one per scanned player).
    createClientMock.mockResolvedValue(makeClient({ countSequence: [2, 4] }));

    const res = await generateAlerts('coach-1', 'team-1');
    expect(res.success).toBe(true);
    expect(res.generated).toBe(2);
  });

  it('clamps a negative delta to 0 (never reports a phantom negative)', async () => {
    createClientMock.mockResolvedValue(makeClient({ countSequence: [5, 3] }));

    const res = await generateAlerts('coach-1', 'team-1');
    expect(res.success).toBe(true);
    expect(res.generated).toBe(0);
  });
});
