/**
 * Server action tests — Foundation / Task F1.
 *
 * Covers:
 *  - Auth gating (anonymous → null / [])
 *  - Ownership gating via verifyPlayerAccess
 *  - Ranking math (strokes_impact * confidence)
 *  - Urgent priority override
 *  - Drill pre-fetch shape
 *  - Empty-result path
 *
 * The supabase client is mocked at the module boundary so tests never touch
 * the live DB. Each from(`golf_coach_insights`) call returns a small,
 * explicitly shaped builder — enough to exercise the action logic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));

// We override the factory per-test via the `createClient` mock. Tests inject
// a supabase client via the explicit override parameter, so the factory just
// needs to exist.
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({})),
}));

// Default: grant access. Specific tests override this mock to test denial.
// The reason union matches the VerifyResult type exported from verify-player-access.
type VerifyReason = 'self' | 'coach' | 'denied';
const verifyPlayerAccessMock = vi.fn(
  async (): Promise<{ allowed: boolean; reason?: VerifyReason }> => ({
    allowed: true,
    reason: 'self',
  }),
);
vi.mock('@/lib/auth/verify-player-access', () => ({
  verifyPlayerAccess: (...args: unknown[]) => verifyPlayerAccessMock(...(args as Parameters<typeof verifyPlayerAccessMock>)),
}));

import {
  getTopInsightForPlayer,
  getInsightsForPlayer,
  getInsightsForCoach,
  getRoundTakeawayInsight,
} from '@/app/golf/actions/insight-delivery';

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function makeEvidence(partial: Partial<Record<string, unknown>> = {}) {
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

interface RawRow {
  id: string;
  player_id: string;
  title: string;
  content: string;
  category: string | null;
  signature: string | null;
  evidence: ReturnType<typeof makeEvidence>;
  metadata: Record<string, unknown> | null;
  lifecycle_state: string;
  status: string;
  priority: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  drill_attachments?: Array<{
    rank: number;
    drill: {
      id: string;
      slug: string;
      title: string;
      duration_min: number;
      difficulty: string;
    } | null;
  }>;
}

function makeRow(overrides: Partial<RawRow> = {}): RawRow {
  return {
    id: 'i-1',
    player_id: 'p-1',
    title: 'Title',
    content: 'Content',
    category: 'putting',
    signature: 'sig1',
    evidence: makeEvidence(),
    metadata: null,
    lifecycle_state: 'matured',
    status: 'active',
    priority: 'medium',
    acknowledged_at: null,
    resolved_at: null,
    created_at: '2026-04-15T12:00:00.000Z',
    updated_at: '2026-04-22T12:00:00.000Z',
    drill_attachments: [
      {
        rank: 1,
        drill: {
          id: 'd1',
          slug: 'gate-drill',
          title: 'Gate drill',
          duration_min: 10,
          difficulty: 'beginner',
        },
      },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Supabase mock — we build a minimal chainable query builder that resolves
// to { data, error }. Each `from()` call is routed through a small state
// machine so tests can queue up multiple query responses in order.
// ---------------------------------------------------------------------------

function makeSupabaseMock(opts: {
  userId?: string | null;
  /** Queued responses for `from('golf_coach_insights').select(...)` calls. */
  insightQueries?: Array<{ data: RawRow[] | null; error: { message: string } | null }>;
  /** Queued responses for `from('golf_rounds').select(...)` lookups. */
  roundQueries?: Array<{
    data: { round_date: string } | null;
    error: { message: string } | null;
  }>;
}) {
  const insightQueue = [...(opts.insightQueries ?? [])];
  const roundQueue = [...(opts.roundQueries ?? [])];

  const buildInsightBuilder = () => {
    const terminal = insightQueue.shift() ?? { data: [], error: null };
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      contains: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      then: (resolve: (v: typeof terminal) => void) => Promise.resolve(resolve(terminal)),
    };
    return builder;
  };

  const buildRoundBuilder = () => {
    const terminal = roundQueue.shift() ?? { data: null, error: null };
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue(terminal),
    };
  };

  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: opts.userId ? { id: opts.userId } : null },
        error: null,
      })),
    },
    from: vi.fn((table: string) => {
      if (table === 'golf_coach_insights') return buildInsightBuilder();
      if (table === 'golf_rounds') return buildRoundBuilder();
      return buildInsightBuilder();
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'self' });
});

// ---------------------------------------------------------------------------
// getTopInsightForPlayer
// ---------------------------------------------------------------------------

describe('getTopInsightForPlayer', () => {
  it('returns null when the user is not authenticated', async () => {
    const sb = makeSupabaseMock({ userId: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getTopInsightForPlayer('p-1', sb as any);
    expect(result).toBeNull();
  });

  it('returns null when verifyPlayerAccess denies', async () => {
    verifyPlayerAccessMock.mockResolvedValueOnce({ allowed: false, reason: 'denied' });
    const sb = makeSupabaseMock({
      userId: 'u-1',
      insightQueries: [{ data: [makeRow()], error: null }],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getTopInsightForPlayer('p-1', sb as any);
    expect(result).toBeNull();
  });

  it('returns null when the player has no evidence-backed insights', async () => {
    const sb = makeSupabaseMock({
      userId: 'u-1',
      insightQueries: [
        { data: [], error: null }, // urgent pass: empty
        { data: [], error: null }, // ranking pass: empty
      ],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getTopInsightForPlayer('p-1', sb as any);
    expect(result).toBeNull();
  });

  it('returns the urgent-priority row ahead of higher-scored non-urgent rows', async () => {
    const urgent = makeRow({
      id: 'urgent-1',
      priority: 'urgent',
      evidence: makeEvidence({ strokes_impact: 0.5, confidence: 0.5 }),
    });
    const highImpact = makeRow({
      id: 'high-1',
      priority: 'high',
      evidence: makeEvidence({ strokes_impact: 3.5, confidence: 0.9 }),
    });
    const sb = makeSupabaseMock({
      userId: 'u-1',
      insightQueries: [
        { data: [urgent], error: null },     // urgent-priority pass
        { data: [urgent, highImpact], error: null }, // (not reached if urgent wins)
      ],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getTopInsightForPlayer('p-1', sb as any);
    expect(result?.id).toBe('urgent-1');
  });

  it('falls back to strokes_impact * confidence ranking when no urgent rows exist', async () => {
    const a = makeRow({
      id: 'a',
      priority: 'medium',
      evidence: makeEvidence({ strokes_impact: 1.0, confidence: 0.5 }),
    });
    const b = makeRow({
      id: 'b',
      priority: 'medium',
      evidence: makeEvidence({ strokes_impact: 2.0, confidence: 0.9 }),
    });
    const c = makeRow({
      id: 'c',
      priority: 'medium',
      evidence: makeEvidence({ strokes_impact: 0.5, confidence: 0.9 }),
    });
    const sb = makeSupabaseMock({
      userId: 'u-1',
      insightQueries: [
        { data: [], error: null },           // urgent pass empty
        { data: [a, b, c], error: null },    // ranking pass
      ],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getTopInsightForPlayer('p-1', sb as any);
    // b.impact*conf = 1.8, a = 0.5, c = 0.45
    expect(result?.id).toBe('b');
  });

  it('pre-fetches drills sorted by rank and capped at 3', async () => {
    const row = makeRow({
      drill_attachments: [
        {
          rank: 3,
          drill: { id: 'd3', slug: 's3', title: 'Third', duration_min: 5, difficulty: 'beginner' },
        },
        {
          rank: 1,
          drill: { id: 'd1', slug: 's1', title: 'First', duration_min: 10, difficulty: 'beginner' },
        },
        {
          rank: 2,
          drill: { id: 'd2', slug: 's2', title: 'Second', duration_min: 15, difficulty: 'intermediate' },
        },
        {
          rank: 4,
          drill: { id: 'd4', slug: 's4', title: 'Fourth', duration_min: 20, difficulty: 'advanced' },
        },
      ],
    });
    const sb = makeSupabaseMock({
      userId: 'u-1',
      insightQueries: [
        { data: [], error: null },
        { data: [row], error: null },
      ],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getTopInsightForPlayer('p-1', sb as any);
    expect(result?.drills).toEqual([
      { id: 'd1', slug: 's1', title: 'First', duration_min: 10, difficulty: 'beginner' },
      { id: 'd2', slug: 's2', title: 'Second', duration_min: 15, difficulty: 'intermediate' },
      { id: 'd3', slug: 's3', title: 'Third', duration_min: 5, difficulty: 'beginner' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// getInsightsForPlayer
// ---------------------------------------------------------------------------

describe('getInsightsForPlayer', () => {
  it('returns [] for unauthed callers', async () => {
    const sb = makeSupabaseMock({ userId: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getInsightsForPlayer('p-1', {}, sb as any);
    expect(result).toEqual([]);
  });

  it('returns [] when verifyPlayerAccess denies', async () => {
    verifyPlayerAccessMock.mockResolvedValueOnce({ allowed: false, reason: 'denied' });
    const sb = makeSupabaseMock({
      userId: 'u-1',
      insightQueries: [{ data: [makeRow()], error: null }],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getInsightsForPlayer('p-1', {}, sb as any);
    expect(result).toEqual([]);
  });

  it('filters out rows with confidence below minConfidence', async () => {
    const low = makeRow({
      id: 'low',
      evidence: makeEvidence({ confidence: 0.3 }),
    });
    const high = makeRow({
      id: 'high',
      evidence: makeEvidence({ confidence: 0.8 }),
    });
    const sb = makeSupabaseMock({
      userId: 'u-1',
      insightQueries: [{ data: [low, high], error: null }],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getInsightsForPlayer('p-1', { minConfidence: 0.5 }, sb as any);
    expect(result.map((r) => r.id)).toEqual(['high']);
  });

  it('drops rows whose evidence is missing required scalars', async () => {
    const valid = makeRow({ id: 'valid' });
    const malformed = makeRow({ id: 'bad' });
    // strip `strokes_impact` to simulate a generator bug
    (malformed.evidence as Record<string, unknown>).strokes_impact = null;

    const sb = makeSupabaseMock({
      userId: 'u-1',
      insightQueries: [{ data: [valid, malformed], error: null }],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getInsightsForPlayer('p-1', {}, sb as any);
    expect(result.map((r) => r.id)).toEqual(['valid']);
  });
});

// ---------------------------------------------------------------------------
// getInsightsForCoach
// ---------------------------------------------------------------------------

describe('getInsightsForCoach', () => {
  it('returns [] for unauthed callers', async () => {
    const sb = makeSupabaseMock({ userId: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getInsightsForCoach('coach-1', {}, sb as any);
    expect(result).toEqual([]);
  });

  it('returns rows without invoking verifyPlayerAccess when no player_id filter', async () => {
    const sb = makeSupabaseMock({
      userId: 'u-1',
      insightQueries: [{ data: [makeRow()], error: null }],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getInsightsForCoach('coach-1', {}, sb as any);
    expect(result.length).toBe(1);
    expect(verifyPlayerAccessMock).not.toHaveBeenCalled();
  });

  it('invokes verifyPlayerAccess when filtering by player_id', async () => {
    const sb = makeSupabaseMock({
      userId: 'u-1',
      insightQueries: [{ data: [makeRow()], error: null }],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await getInsightsForCoach('coach-1', { player_id: 'p-1' }, sb as any);
    expect(verifyPlayerAccessMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// getRoundTakeawayInsight
// ---------------------------------------------------------------------------

describe('getRoundTakeawayInsight', () => {
  it('returns the tag-matched insight when metadata.related_round_ids contains the round', async () => {
    const tagged = makeRow({
      id: 'tagged-1',
      metadata: { related_round_ids: ['r-1'] },
    });
    const sb = makeSupabaseMock({
      userId: 'u-1',
      insightQueries: [{ data: [tagged], error: null }],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getRoundTakeawayInsight('p-1', 'r-1', sb as any);
    expect(result?.id).toBe('tagged-1');
  });

  it('falls back to the 24h temporal window when no tagged rows exist', async () => {
    const tagged: RawRow[] = [];
    const nearby = makeRow({
      id: 'nearby-1',
      updated_at: '2026-04-22T00:00:00.000Z',
    });
    const sb = makeSupabaseMock({
      userId: 'u-1',
      insightQueries: [
        { data: tagged, error: null },     // tagged pass empty
        { data: [nearby], error: null },   // temporal pass
      ],
      roundQueries: [{ data: { round_date: '2026-04-22T00:00:00.000Z' }, error: null }],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getRoundTakeawayInsight('p-1', 'r-1', sb as any);
    expect(result?.id).toBe('nearby-1');
  });

  it('returns null when the round lookup fails', async () => {
    const sb = makeSupabaseMock({
      userId: 'u-1',
      insightQueries: [{ data: [], error: null }],
      roundQueries: [{ data: null, error: null }],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getRoundTakeawayInsight('p-1', 'r-1', sb as any);
    expect(result).toBeNull();
  });
});
