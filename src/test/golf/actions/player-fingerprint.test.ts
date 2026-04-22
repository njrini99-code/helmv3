/**
 * Player Fingerprint aggregator tests — Wave 2 / Task G1.
 *
 * Covers:
 *  - Auth gating — anonymous / denied callers get null.
 *  - Sections emit in the stable FINGERPRINT_SECTION_ORDER.
 *  - Insights are routed to the correct section by `category`.
 *  - Composite rating is derived from stats cache when present; falls back
 *    to recent rounds otherwise.
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

  it('computes composite rating from stats cache when available', async () => {
    const sb = makeSupabaseMock({
      userId: 'u-1',
      stats: {
        data: {
          rounds_in_calculation: 12,
          scoring_average_vs_par: 5,
          last_5_average: 75,
          last_10_average: 78,
          // Everything else null.
          scoring_average: 77,
        },
        error: null,
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getPlayerFingerprint('p-1', sb as any);
    expect(result).not.toBeNull();
    // 80 - (5 * 3) = 65.
    expect(result!.composite.rating).toBe(65);
    expect(result!.composite.rounds_in_calculation).toBe(12);
    // last_10 (78) - last_5 (75) = 3 > 0.8 → trending "up" (recent is lower).
    expect(result!.composite.trend).toBe('up');
  });

  it('falls back to recent rounds when stats cache is empty', async () => {
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
});
