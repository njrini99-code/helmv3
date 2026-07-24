/**
 * Player Fingerprint aggregator tests — Wave 2 / Task G1.
 *
 * Covers:
 *  - Auth gating — anonymous / denied callers get null.
 *  - Sections emit in the stable FINGERPRINT_SECTION_ORDER.
 *  - Insights are routed to the correct section by `category`.
 *  - Composite rating is derived from the canonical
 *    `@/lib/coachhelm/composite-rating` formula (recent rounds + active
 *    severe-pattern penalty) — NEVER from `golf_player_stats_cache` (Wave 2
 *    unification with the Scouting Report tab's composite).
 *
 * The supabase client is mocked at the module boundary — the aggregator
 * never touches a live DB in tests. We also mock `getInsightsForCoach` so
 * we can control the insight list independent of the insight-delivery
 * fetcher's own test suite.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({})),
}));

type VerifyReason = 'self' | 'coach' | 'denied';
const verifyPlayerAccessMock = vi.fn(
  async (): Promise<{ allowed: boolean; reason?: VerifyReason }> => ({
    allowed: true,
    reason: 'coach',
  }),
);
vi.mock('@/lib/auth/verify-player-access', () => ({
  verifyPlayerAccess: (...args: unknown[]) =>
    verifyPlayerAccessMock(
      ...(args as Parameters<typeof verifyPlayerAccessMock>),
    ),
}));

const getInsightsForCoachMock = vi.fn(
  async (
    _coachId: string,
    _opts?: { player_id?: string; limit?: number },
    _sb?: unknown,
  ): Promise<EvidenceInsight[]> => [],
);
vi.mock('@/app/golf/actions/insight-delivery', () => ({
  getInsightsForCoach: (...args: unknown[]) =>
    getInsightsForCoachMock(
      ...(args as Parameters<typeof getInsightsForCoachMock>),
    ),
}));

import { getPlayerFingerprint } from '@/app/golf/actions/player-fingerprint';
import { FINGERPRINT_SECTION_ORDER } from '@/app/golf/actions/player-fingerprint-types';

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function makeEvidence(partial: Record<string, unknown> = {}) {
  return {
    metric: 'putt_make_rate_6_10ft',
    metric_label: '6-10 ft make rate',
    unit: 'percent',
    your_value: 0.38,
    your_value_display: '38%',
    comparison_value: 0.52,
    comparison_label: 'D2 average',
    comparison_source: 'd2_avg',
    sample_n: 47,
    window_days: 30,
    window_start: '2026-03-23T00:00:00.000Z',
    window_end: '2026-04-22T00:00:00.000Z',
    strokes_impact: 2.1,
    strokes_impact_method: 'peer_delta',
    confidence: 0.78,
    confidence_factors: { sample_adequacy: 1, recency: 1, variance: 0.5 },
    ...partial,
  };
}

function makeInsight(overrides: Partial<EvidenceInsight> = {}): EvidenceInsight {
  return {
    id: 'i-1',
    player_id: 'p-1',
    category: 'putting',
    title: 'Title',
    content: 'Content',
    signature: 'sig',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    evidence: makeEvidence() as any,
    metadata: null,
    lifecycle_state: 'matured',
    status: 'active',
    priority: 'medium',
    acknowledged_at: null,
    resolved_at: null,
    created_at: '2026-04-15T12:00:00.000Z',
    updated_at: '2026-04-22T12:00:00.000Z',
    drills: [],
    ...overrides,
  };
}

type Queued<T> = { data: T; error: { message: string } | null };

interface SupabaseMockOpts {
  userId?: string | null;
  player?: Queued<{
    id: string;
    first_name: string | null;
    last_name: string | null;
  } | null>;
  team?: Queued<{
    team_id: string | null;
    golf_teams: { id: string; name: string } | null;
  } | null>;
  stats?: Queued<Record<string, unknown> | null>;
  rounds?: Queued<Array<Record<string, unknown>>>;
  patterns?: Queued<Array<Record<string, unknown>>>;
  /** `golf_insight_player_feedback` rows with `rating='dismissed'` — only
   *  consulted by the aggregator when `access.reason === 'self'`. */
  dismissedFeedback?: Queued<Array<{ insight_id: string }>>;
}

function makeSupabaseMock(opts: SupabaseMockOpts) {
  const playerResponse = opts.player ?? {
    data: { id: 'p-1', first_name: 'Jake', last_name: 'Doe' },
    error: null,
  };
  const teamResponse = opts.team ?? {
    data: { team_id: 't-1', golf_teams: { id: 't-1', name: 'Helmetta CC' } },
    error: null,
  };
  const statsResponse = opts.stats ?? { data: null, error: null };
  const roundsResponse = opts.rounds ?? { data: [], error: null };
  const patternsResponse = opts.patterns ?? { data: [], error: null };
  const dismissedFeedbackResponse = opts.dismissedFeedback ?? { data: [], error: null };

  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: opts.userId ? { id: opts.userId } : null },
        error: null,
      })),
    },
    from: vi.fn((table: string) => {
      if (table === 'golf_players') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue(playerResponse),
        };
      }
      if (table === 'golf_team_members') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue(teamResponse),
        };
      }
      if (table === 'golf_player_stats_cache') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue(statsResponse),
        };
      }
      if (table === 'golf_rounds') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          not: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue(roundsResponse),
        };
      }
      if (table === 'golf_patterns_v2') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue(patternsResponse),
        };
      }
      if (table === 'golf_insight_player_feedback') {
        // The real supabase-js query builder is itself a thenable — the
        // production code `await`s straight off `.select().eq().eq()` with
        // no terminal `.maybeSingle()`/`.limit()`, so this mock builder must
        // resolve on `await`, not on a specific chained call.
        const builder: Record<string, unknown> = {
          select: vi.fn(() => builder),
          eq: vi.fn(() => builder),
          then: (resolve: (v: typeof dismissedFeedbackResponse) => void) =>
            resolve(dismissedFeedbackResponse),
        };
        return builder;
      }
      // Unknown table — return an empty builder.
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'coach' });
  getInsightsForCoachMock.mockResolvedValue([]);
});

describe('getPlayerFingerprint', () => {
  it('returns null when the user is not authenticated', async () => {
    const sb = makeSupabaseMock({ userId: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getPlayerFingerprint('p-1', sb as any);
    expect(result).toBeNull();
  });

  it('returns null when verifyPlayerAccess denies the coach', async () => {
    verifyPlayerAccessMock.mockResolvedValueOnce({ allowed: false, reason: 'denied' });
    const sb = makeSupabaseMock({ userId: 'u-1' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getPlayerFingerprint('p-1', sb as any);
    expect(result).toBeNull();
  });

  it('returns null when the player row does not exist', async () => {
    const sb = makeSupabaseMock({
      userId: 'u-1',
      player: { data: null, error: null },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getPlayerFingerprint('p-1', sb as any);
    expect(result).toBeNull();
  });

  it('emits sections in the stable FINGERPRINT_SECTION_ORDER', async () => {
    const sb = makeSupabaseMock({ userId: 'u-1' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getPlayerFingerprint('p-1', sb as any);
    expect(result).not.toBeNull();

    const expectedKeys = ['tee', 'approach', 'short_game', 'putting', 'scoring', 'pressure'];
    expect([...FINGERPRINT_SECTION_ORDER]).toEqual(expectedKeys);

    for (const key of expectedKeys) {
      const resolved = result!;
      expect(resolved.sections).toHaveProperty(key);
      expect(resolved.sections[key as keyof typeof resolved.sections].key).toBe(key);
    }
  });

  it('routes evidence insights to the correct section by category', async () => {
    getInsightsForCoachMock.mockResolvedValueOnce([
      makeInsight({ id: 'putt-1', category: 'putting' }),
      makeInsight({ id: 'tee-1', category: 'tee' }),
      makeInsight({ id: 'approach-1', category: 'approach' }),
      makeInsight({ id: 'cm-1', category: 'course_management' }),
      makeInsight({ id: 'pres-1', category: 'pressure' }),
      makeInsight({ id: 'sg-1', category: 'short_game' }),
      makeInsight({ id: 'score-1', category: 'scoring' }),
    ]);

    const sb = makeSupabaseMock({ userId: 'u-1' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getPlayerFingerprint('p-1', sb as any);
    expect(result).not.toBeNull();

    expect(result!.sections.putting.insights.map((i) => i.id)).toEqual(['putt-1']);
    expect(result!.sections.tee.insights.map((i) => i.id)).toEqual(['tee-1']);
    expect(result!.sections.approach.insights.map((i) => i.id)).toEqual(['approach-1']);
    expect(result!.sections.short_game.insights.map((i) => i.id)).toEqual(['sg-1']);
    expect(result!.sections.pressure.insights.map((i) => i.id)).toEqual(['pres-1']);
    // Scoring catches both `scoring` and `course_management` by design.
    expect(result!.sections.scoring.insights.map((i) => i.id).sort()).toEqual([
      'cm-1',
      'score-1',
    ]);
  });

  it('ranks urgent-priority insights first within a section', async () => {
    getInsightsForCoachMock.mockResolvedValueOnce([
      makeInsight({
        id: 'high-1',
        category: 'putting',
        priority: 'high',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        evidence: makeEvidence({ strokes_impact: 3.0, confidence: 0.9 }) as any,
      }),
      makeInsight({
        id: 'urgent-1',
        category: 'putting',
        priority: 'urgent',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        evidence: makeEvidence({ strokes_impact: 0.3, confidence: 0.4 }) as any,
      }),
    ]);

    const sb = makeSupabaseMock({ userId: 'u-1' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getPlayerFingerprint('p-1', sb as any);
    expect(result).not.toBeNull();
    expect(result!.sections.putting.insights[0]!.id).toBe('urgent-1');
    expect(result!.sections.putting.insights[1]!.id).toBe('high-1');
  });

  it('computes composite rating from recent rounds, IGNORING the stats cache (Wave 2 unification)', async () => {
    // Composite unification (see src/lib/coachhelm/composite-rating.ts): the
    // Game Fingerprint tab's composite used to prefer
    // `golf_player_stats_cache.scoring_average_vs_par` over the fetched
    // rounds — the exact reason the Scouting Report tab (which always used
    // recent rounds) could show a DIFFERENT number for the same player at the
    // same moment. Both tabs now import the SAME canonical function, which
    // never reads the stats cache for the composite. `scoring_average_vs_par:
    // 999` below would produce a wildly different (clamped) rating if it were
    // still consulted — asserting 65 (derived purely from the one round)
    // proves the cache is ignored.
    const sb = makeSupabaseMock({
      userId: 'u-1',
      stats: {
        data: {
          rounds_in_calculation: 12,
          scoring_average_vs_par: 999,
          last_5_average: 75,
          last_10_average: 78,
          scoring_average: 77,
        },
        error: null,
      },
      rounds: {
        data: [
          { id: 'r1', round_date: '2026-04-20', total_score: 77, score_to_par: 5, course_name: null, holes_played: 18, round_type: 'practice' },
        ],
        error: null,
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getPlayerFingerprint('p-1', sb as any);
    expect(result).not.toBeNull();
    // 80 - (5 * 3) = 65 — derived from the ROUND, not scoring_average_vs_par.
    expect(result!.composite.rating).toBe(65);
    expect(result!.composite.rounds_in_calculation).toBe(1);
    // A single round can't establish a windowed trend — honest 'flat', not the
    // stats-cache last_5/last_10 delta the old formula would have used.
    expect(result!.composite.trend).toBe('flat');
  });

  it('derives composite rating from recent rounds when stats cache is empty', async () => {
    const rounds = [
      { id: 'r1', round_date: '2026-04-20', total_score: 76, course_par: 72, score_to_par: 4, course_name: null, holes_played: 18, round_type: 'practice' },
      { id: 'r2', round_date: '2026-04-15', total_score: 78, course_par: 72, score_to_par: 6, course_name: null, holes_played: 18, round_type: 'practice' },
      { id: 'r3', round_date: '2026-04-10', total_score: 74, course_par: 72, score_to_par: 2, course_name: null, holes_played: 18, round_type: 'practice' },
      { id: 'r4', round_date: '2026-04-05', total_score: 80, course_par: 72, score_to_par: 8, course_name: null, holes_played: 18, round_type: 'practice' },
    ];
    const sb = makeSupabaseMock({
      userId: 'u-1',
      rounds: { data: rounds, error: null },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getPlayerFingerprint('p-1', sb as any);
    expect(result).not.toBeNull();
    // avg score_to_par = (4+6+2+8)/4 = 5 → 80 - 15 = 65.
    expect(result!.composite.rating).toBe(65);
    expect(result!.composite.rounds_in_calculation).toBe(4);
  });

  it('penalizes active severe patterns in the composite (mirrors the Scouting Report tab)', async () => {
    const sb = makeSupabaseMock({
      userId: 'u-1',
      rounds: {
        data: [
          { id: 'r1', round_date: '2026-04-20', total_score: 72, score_to_par: 0, course_name: null, holes_played: 18, round_type: 'practice' },
        ],
        error: null,
      },
      patterns: {
        data: [{ severity: 'critical' }, { severity: 'high' }],
        error: null,
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getPlayerFingerprint('p-1', sb as any);
    expect(result).not.toBeNull();
    // 80 (even par) - 10 (two severe patterns) = 70.
    expect(result!.composite.rating).toBe(70);
  });

  it('marks sections as sparse when there are no metrics + no rounds', async () => {
    const sb = makeSupabaseMock({
      userId: 'u-1',
      stats: { data: null, error: null },
      rounds: { data: [], error: null },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getPlayerFingerprint('p-1', sb as any);
    expect(result).not.toBeNull();
    // No data → most sections sparse.
    expect(result!.sections.tee.sparse).toBe(true);
    expect(result!.sections.putting.sparse).toBe(true);
    expect(result!.sections.approach.sparse).toBe(true);
  });

  it('includes player and team names in the output', async () => {
    const sb = makeSupabaseMock({
      userId: 'u-1',
      player: { data: { id: 'p-1', first_name: 'Jake', last_name: 'Doe' }, error: null },
      team: {
        data: {
          team_id: 't-1',
          golf_teams: { id: 't-1', name: 'Helmetta CC' },
        },
        error: null,
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getPlayerFingerprint('p-1', sb as any);
    expect(result).not.toBeNull();
    expect(result!.player.first_name).toBe('Jake');
    expect(result!.player.last_name).toBe('Doe');
    expect(result!.player.team_name).toBe('Helmetta CC');
  });

  it('includes the rolling trend with notable flagging based on insight updates', async () => {
    getInsightsForCoachMock.mockResolvedValueOnce([
      makeInsight({ id: 'i-1', category: 'putting', updated_at: '2026-04-15T12:00:00.000Z' }),
    ]);
    const rounds = [
      { id: 'r1', round_date: '2026-04-20', total_score: 76, course_par: 72, score_to_par: 4, course_name: 'A', holes_played: 18, round_type: 'practice' },
      { id: 'r2', round_date: '2026-04-15', total_score: 78, course_par: 72, score_to_par: 6, course_name: 'B', holes_played: 18, round_type: 'practice' },
    ];
    const sb = makeSupabaseMock({
      userId: 'u-1',
      rounds: { data: rounds, error: null },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getPlayerFingerprint('p-1', sb as any);
    expect(result).not.toBeNull();
    expect(result!.trend.rolling).toHaveLength(2);
    // Ordered oldest → newest.
    expect(result!.trend.rolling[0]!.round_date).toBe('2026-04-15');
    expect(result!.trend.rolling[0]!.notable).toBe(true); // matches insight update date
    expect(result!.trend.rolling[1]!.round_date).toBe('2026-04-20');
    expect(result!.trend.rolling[1]!.notable).toBe(false);
  });

  it('passes player_id scope through to getInsightsForCoach', async () => {
    const sb = makeSupabaseMock({ userId: 'u-1' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await getPlayerFingerprint('p-1', sb as any);
    expect(getInsightsForCoachMock).toHaveBeenCalledTimes(1);
    const call = getInsightsForCoachMock.mock.calls[0];
    expect(call?.[1]).toMatchObject({ player_id: 'p-1' });
  });

  // ---------------------------------------------------------------------
  // Player-self auth path — the player's own "Game profile" tab reuses this
  // SAME aggregator, authorized via `verifyPlayerAccess`'s `reason: 'self'`
  // branch (the user IS the requested player, not a coach who staffs their
  // team). Coverage: the self branch resolves a fingerprint at all, carries
  // avatar_url through, and additionally filters insights the player has
  // dismissed from their OWN feedback table — a filter the coach branch must
  // NEVER apply (a player's dismissal can't hide an insight from their coach).
  // ---------------------------------------------------------------------
  describe('player-self access (access.reason === "self")', () => {
    it('resolves a fingerprint when verifyPlayerAccess grants self-access', async () => {
      verifyPlayerAccessMock.mockResolvedValueOnce({ allowed: true, reason: 'self' });
      const sb = makeSupabaseMock({ userId: 'u-1' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await getPlayerFingerprint('p-1', sb as any);
      expect(result).not.toBeNull();
      expect(result!.player.id).toBe('p-1');
    });

    it('carries avatar_url through to the player object', async () => {
      verifyPlayerAccessMock.mockResolvedValueOnce({ allowed: true, reason: 'self' });
      const sb = makeSupabaseMock({
        userId: 'u-1',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        player: { data: { id: 'p-1', first_name: 'Jake', last_name: 'Doe', avatar_url: 'https://cdn.example/p1.jpg' } as any, error: null },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await getPlayerFingerprint('p-1', sb as any);
      expect(result).not.toBeNull();
      expect(result!.player.avatar_url).toBe('https://cdn.example/p1.jpg');
    });

    it('filters out an insight the player has dismissed via their own feedback', async () => {
      verifyPlayerAccessMock.mockResolvedValueOnce({ allowed: true, reason: 'self' });
      getInsightsForCoachMock.mockResolvedValueOnce([
        makeInsight({ id: 'kept-1', category: 'putting' }),
        makeInsight({ id: 'dismissed-1', category: 'putting' }),
      ]);
      const sb = makeSupabaseMock({
        userId: 'u-1',
        dismissedFeedback: { data: [{ insight_id: 'dismissed-1' }], error: null },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await getPlayerFingerprint('p-1', sb as any);
      expect(result).not.toBeNull();
      expect(result!.sections.putting.insights.map((i) => i.id)).toEqual(['kept-1']);
    });

    it('does NOT apply the player-dismissed filter on the coach access path', async () => {
      // Default beforeEach already stubs verifyPlayerAccess → reason: 'coach'.
      getInsightsForCoachMock.mockResolvedValueOnce([
        makeInsight({ id: 'kept-1', category: 'putting' }),
        makeInsight({ id: 'dismissed-1', category: 'putting' }),
      ]);
      const sb = makeSupabaseMock({
        userId: 'u-1',
        // Same player-dismissed row as above — a coach viewing the SAME
        // player must still see both insights.
        dismissedFeedback: { data: [{ insight_id: 'dismissed-1' }], error: null },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await getPlayerFingerprint('p-1', sb as any);
      expect(result).not.toBeNull();
      expect(result!.sections.putting.insights.map((i) => i.id).sort()).toEqual([
        'dismissed-1',
        'kept-1',
      ]);
    });
  });
});
