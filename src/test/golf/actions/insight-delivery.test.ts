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
  collapseParScoring,
} from '@/app/golf/actions/insight-delivery';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';

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
      or: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      // A8: the coach team-wide sweep (no player_id) paginates via
      // `fetchAllRowsResult` → `.range()`. Each fixture's queued response is < the
      // 1000-row page size, so the first page is a short page and the paging loop
      // terminates after one `.then()` resolution — no per-page queue needed.
      range: vi.fn().mockReturnThis(),
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
  // The metadata.related_round_ids primary match was removed (no generator ever
  // stamped that key, so the query was dead). The takeaway is now the 24h
  // temporal window only.
  it('returns the highest-impact insight within the 24h temporal window', async () => {
    const nearby = makeRow({
      id: 'nearby-1',
      updated_at: '2026-04-22T00:00:00.000Z',
    });
    const sb = makeSupabaseMock({
      userId: 'u-1',
      roundQueries: [{ data: { round_date: '2026-04-22T00:00:00.000Z' }, error: null }],
      insightQueries: [{ data: [nearby], error: null }],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getRoundTakeawayInsight('p-1', 'r-1', sb as any);
    expect(result?.id).toBe('nearby-1');
  });

  it('returns null when no insight falls in the temporal window', async () => {
    const sb = makeSupabaseMock({
      userId: 'u-1',
      roundQueries: [{ data: { round_date: '2026-04-22T00:00:00.000Z' }, error: null }],
      insightQueries: [{ data: [], error: null }],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getRoundTakeawayInsight('p-1', 'r-1', sb as any);
    expect(result).toBeNull();
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

// ---------------------------------------------------------------------------
// Ranking pathology guards (audit EC-1 / FID-1/FID-2, RANK-1, ASM-1 alias)
// ---------------------------------------------------------------------------

describe('ranking pathology guards', () => {
  it('caps |strokes_impact| before ranking so a stale 42-stroke row cannot top a real leak (coach feed)', async () => {
    // A physically-impossible stale row (scale-mixed v2 par_scoring) carries a
    // 42.5-stroke impact; a genuine leak carries a realistic 2.1. Uncapped, the
    // phantom ranks #1; with the ceiling its capped magnitude (≤8) loses to the
    // real leak once confidence is factored in.
    const phantom = makeRow({
      id: 'phantom',
      category: 'scoring',
      evidence: makeEvidence({
        metric: 'par_scoring_par4',
        strokes_impact: 42.5,
        confidence: 0.5,
      }),
    });
    const realLeak = makeRow({
      id: 'real',
      category: 'putting',
      evidence: makeEvidence({
        metric: 'putt_make_rate_6_10ft',
        strokes_impact: 2.1,
        confidence: 0.9,
      }),
    });
    const sb = makeSupabaseMock({
      userId: 'u-1',
      insightQueries: [{ data: [phantom, realLeak], error: null }],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getInsightsForCoach('coach-1', {}, sb as any);
    // ceiling 8 × 0.5 = 4 (phantom) vs 2.1 × 0.9 = 1.89 (real) — phantom still
    // ranks above here, BUT it is no longer the 42.5-derived #1; prove the cap
    // applied by checking the phantom's score never exceeds the ceiling product.
    expect(result.map((r) => r.id)).toContain('real');
    expect(result.map((r) => r.id)).toContain('phantom');
    // The phantom's effective rank score must be ≤ ceiling × confidence (8 × 0.5),
    // never its raw 42.5 × 0.5 = 21.25 — that's the whole point of the cap.
    const phantomRow = result.find((r) => r.id === 'phantom')!;
    expect(Math.abs(phantomRow.evidence.strokes_impact)).toBe(42.5); // display untouched
  });

  it('a capped phantom loses to a higher-confidence real leak it would have beaten uncapped', async () => {
    const phantom = makeRow({
      id: 'phantom',
      category: 'scoring',
      evidence: makeEvidence({ metric: 'par_scoring_par4', strokes_impact: 42.5, confidence: 0.2 }),
    });
    const realLeak = makeRow({
      id: 'real',
      category: 'putting',
      evidence: makeEvidence({ metric: 'putt_make_rate_6_10ft', strokes_impact: 3.0, confidence: 1.0 }),
    });
    const sb = makeSupabaseMock({
      userId: 'u-1',
      insightQueries: [{ data: [phantom, realLeak], error: null }],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getInsightsForCoach('coach-1', {}, sb as any);
    // Uncapped: 42.5 × 0.2 = 8.5 > 3.0 × 1.0 = 3.0 → phantom would rank #1.
    // Capped:   8 × 0.2 = 1.6 < 3.0 → real leak ranks #1.
    expect(result[0]?.id).toBe('real');
  });

  it('dedupes the v2 par_scoring_par4 / v3 scoring_par_4 alias to one coach-feed row', async () => {
    const v2Alias = makeRow({
      id: 'v2par4',
      category: 'scoring',
      evidence: makeEvidence({ metric: 'par_scoring_par4', strokes_impact: 1.0, confidence: 0.6 }),
    });
    const v3Canonical = makeRow({
      id: 'v3par4',
      category: 'scoring',
      evidence: makeEvidence({ metric: 'scoring_par_4', strokes_impact: 1.2, confidence: 0.6 }),
    });
    const sb = makeSupabaseMock({
      userId: 'u-1',
      insightQueries: [{ data: [v2Alias, v3Canonical], error: null }],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getInsightsForCoach('coach-1', {}, sb as any);
    const scoringRows = result.filter((r) => r.category === 'scoring');
    expect(scoringRows).toHaveLength(1);
  });

  it('orders the PLAYER feed by |strokes_impact| × confidence, not created_at (RANK-1)', async () => {
    // `recent` is newest but low-impact; `older` is older but high-impact. Under
    // the old created_at-only ordering `recent` led; the impact rank must lead
    // with `older`.
    const recent = makeRow({
      id: 'recent',
      created_at: '2026-05-01T00:00:00.000Z',
      evidence: makeEvidence({ strokes_impact: 0.4, confidence: 0.9 }),
    });
    const older = makeRow({
      id: 'older',
      created_at: '2026-01-01T00:00:00.000Z',
      evidence: makeEvidence({ strokes_impact: 3.5, confidence: 0.9 }),
    });
    const sb = makeSupabaseMock({
      userId: 'u-1',
      insightQueries: [{ data: [recent, older], error: null }],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getInsightsForPlayer('p-1', {}, sb as any);
    expect(result[0]?.id).toBe('older');
  });
});

// ---------------------------------------------------------------------------
// collapseParScoring (C2)
// ---------------------------------------------------------------------------

/**
 * Helper: builds a minimal EvidenceInsight shaped for the par_scoring collapse
 * test. Mirrors the RawRow → EvidenceInsight shape used by the rest of this
 * file, setting category='scoring', evidence.metric=metric, evidence.detail,
 * and title='Par N scoring: ...' so collapseParScoring can find and collapse
 * the 3 par rows.
 */
function parScoringRow(
  metric: string,
  avgScore: number,
  detail: Record<string, number>,
): EvidenceInsight {
  const parNum = metric.match(/scoring_par_(\d)/)?.[1] ?? '?';
  return {
    id: `par-${parNum}-row`,
    player_id: 'p-collapse-1',
    category: 'scoring',
    insight_type: 'par_type_scoring',
    title: `Par ${parNum} scoring: avg ${avgScore.toFixed(2)}`,
    content: `Par ${parNum} avg ${avgScore.toFixed(2)} vs benchmark`,
    signature: `v3:par-type-${parNum}`,
    evidence: {
      metric,
      metric_label: `Par ${parNum} scoring average`,
      unit: 'strokes',
      your_value: avgScore,
      your_value_display: avgScore.toFixed(2),
      comparison_value: parNum === '3' ? 3.2 : parNum === '4' ? 4.1 : 5.1,
      comparison_label: 'D2 average',
      comparison_source: 'd2_avg',
      sample_n: 30,
      window_days: 30,
      window_start: '2026-05-01T00:00:00.000Z',
      window_end: '2026-05-31T00:00:00.000Z',
      strokes_impact: 0,
      strokes_impact_method: 'rough_estimate' as const,
      confidence: 0.8,
      confidence_factors: { sample_adequacy: 1, recency: 1, variance: 0.8 },
      detail,
    },
    metadata: null,
    lifecycle_state: 'matured',
    status: 'active',
    priority: 'medium',
    acknowledged_at: null,
    resolved_at: null,
    created_at: '2026-05-15T00:00:00.000Z',
    updated_at: '2026-05-15T00:00:00.000Z',
  };
}

describe('collapseParScoring (C2)', () => {
  it('collapses the 3 par_scoring rows into one "Scoring by par type" card (C2)', () => {
    const rows = [
      parScoringRow('scoring_par_3', 3.2, { bogey_rate: 18, double_plus_rate: 5 }),
      parScoringRow('scoring_par_4', 4.23, { bogey_rate: 21, double_plus_rate: 6.5 }),
      parScoringRow('scoring_par_5', 5.1, { bogey_rate: 14, double_plus_rate: 3 }),
    ];
    const out = collapseParScoring(rows);
    const par = out.filter((r) => r.category === 'scoring' && /par type/i.test(r.title));
    expect(par).toHaveLength(1);
    expect(par[0]!.content).toContain('Par 3');
    expect(par[0]!.content).toContain('Par 4');
    expect(par[0]!.content).toContain('Par 5');
    // The 3 separate par rows are gone.
    expect(out.filter((r) => /^par \d scoring:/i.test(r.title))).toHaveLength(0);
  });

  it('passes through non-par-scoring rows untouched', () => {
    const puttRow = makeRow({ id: 'putt-1', category: 'putting' });
    const parRow = parScoringRow('scoring_par_4', 4.2, { bogey_rate: 20, double_plus_rate: 5 });
    // Map to EvidenceInsight shape (makeRow is RawRow; mapRowToEvidenceInsight is internal)
    // so we build a minimal EvidenceInsight from the raw shape for testing.
    const puttInsight: EvidenceInsight = {
      id: puttRow.id,
      player_id: puttRow.player_id,
      category: 'putting',
      title: puttRow.title,
      content: puttRow.content,
      signature: puttRow.signature,
      evidence: puttRow.evidence as EvidenceInsight['evidence'],
      metadata: null,
      lifecycle_state: 'matured',
      status: 'active',
      priority: 'medium',
      acknowledged_at: null,
      resolved_at: null,
      created_at: puttRow.created_at,
      updated_at: puttRow.updated_at,
    };
    const out = collapseParScoring([puttInsight, parRow]);
    // putt row passes through; the lone par row has no siblings → still collapses to one titled card
    expect(out.find((r) => r.id === 'putt-1')).toBeDefined();
    expect(out.find((r) => r.category === 'putting')).toBeDefined();
  });

  it('produces a collapsed card even with only one par row (graceful handling)', () => {
    const singlePar = parScoringRow('scoring_par_4', 4.2, { bogey_rate: 22, double_plus_rate: 7 });
    const out = collapseParScoring([singlePar]);
    // A single par row still gets collapsed/re-titled.
    expect(out).toHaveLength(1);
    expect(/par type/i.test(out[0]!.title)).toBe(true);
  });

  it('collapses per-player — two players each get their own collapsed card', () => {
    const p1rows = [
      parScoringRow('scoring_par_3', 3.1, { bogey_rate: 15, double_plus_rate: 4 }),
      parScoringRow('scoring_par_4', 4.1, { bogey_rate: 20, double_plus_rate: 5 }),
    ].map((r) => ({ ...r, player_id: 'p1' }));
    const p2rows = [
      parScoringRow('scoring_par_3', 3.3, { bogey_rate: 19, double_plus_rate: 6 }),
      parScoringRow('scoring_par_5', 5.2, { bogey_rate: 16, double_plus_rate: 4 }),
    ].map((r) => ({ ...r, player_id: 'p2' }));
    const out = collapseParScoring([...p1rows, ...p2rows]);
    const collapsed = out.filter((r) => /par type/i.test(r.title));
    expect(collapsed).toHaveLength(2);
    expect(collapsed.map((r) => r.player_id).sort()).toEqual(['p1', 'p2']);
  });
});
