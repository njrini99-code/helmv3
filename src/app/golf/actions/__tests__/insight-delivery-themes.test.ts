/**
 * Server-action tests — CoachHelm v3 THEMES delivery layer.
 *
 * This file covers the DELIVERY wiring around the (separately, heavily tested)
 * pure assembler `assembleThemes`. It exercises the mockable surface of
 * `src/app/golf/actions/insight-delivery.ts`:
 *
 *   - `getThemesForPlayer` / `getThemesForCoach` — public entry points; they
 *     `createClient()` internally, auth-gate via `verifyPlayerAccess`, then
 *     delegate to the private `assembleForPlayer`.
 *   - `assembleForPlayer` (via the entry points) — the per-player
 *     query + SG-fetch + best-effort shot-driver / SG-trend fetch + assemble.
 *   - `mapRowLoose` (via the entry points) — the LOOSER row→EvidenceInsight
 *     mapper used only on the themes path. We assert it survives rows that the
 *     strict `mapRowToEvidenceInsight` would drop, and that it preserves the
 *     RUNTIME-only evidence fields (counterfactual / standing /
 *     source_insight_ids / composite_rule_id) through the `AssembledEvidence`
 *     cast — proven by the assembled tree reflecting those fields.
 *
 * We do NOT retest `assembleThemes` itself (see
 * `src/lib/coachhelm/v3/themes/assemble.test.ts`). We only assert that the
 * delivery layer feeds it faithfully and that the assembler's HONESTY
 * INVARIANTS hold end-to-end through delivery.
 *
 * The supabase client + `getDetailedStatsAsAdmin` are mocked at the module
 * boundary so tests never touch the live DB. Mocks stay faithful to the real
 * query shape (INSIGHT_SELECT columns, the `golf_rounds` / `golf_shots`
 * best-effort fetches) — no invented columns.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AssembledEvidence,
  AssembledThemes,
  ThemeNode,
} from '@/lib/coachhelm/v3/themes/types';

// ---------------------------------------------------------------------------
// Module-boundary mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));

// The themes entry points call `createClient()` internally (no override
// param), so we route it to whichever mock client the active test installed.
let activeClient: unknown = {};
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => activeClient),
}));

// SG-by-category context. We mock the whole stats fetch so we don't need the
// full GolfStats shape; only the four sg*PerRound fields are read.
const getDetailedStatsAsAdminMock = vi.fn(async () => ({
  sgPuttingPerRound: null as number | null,
  sgApproachPerRound: null as number | null,
  sgTeePerRound: null as number | null,
  sgAroundGreenPerRound: null as number | null,
}));
vi.mock('@/app/golf/actions/stats-data', () => ({
  getDetailedStatsAsAdmin: (...args: unknown[]) =>
    getDetailedStatsAsAdminMock(...(args as Parameters<typeof getDetailedStatsAsAdminMock>)),
}));

// Default: grant access. Specific tests override per-call to test denial.
type VerifyReason = 'self' | 'coach' | 'denied';
const verifyPlayerAccessMock = vi.fn(
  async (): Promise<{ allowed: boolean; reason?: VerifyReason }> => ({
    allowed: true,
    reason: 'self',
  }),
);
vi.mock('@/lib/auth/verify-player-access', () => ({
  verifyPlayerAccess: (...args: unknown[]) =>
    verifyPlayerAccessMock(...(args as Parameters<typeof verifyPlayerAccessMock>)),
}));

import { getThemesForPlayer, getThemesForCoach } from '@/app/golf/actions/insight-delivery';

// ---------------------------------------------------------------------------
// Fixture builders — faithful to INSIGHT_SELECT + the runtime-real evidence.
// ---------------------------------------------------------------------------

interface RawThemeRow {
  id: string;
  player_id: string;
  category: string | null;
  title: string;
  content: string;
  signature: string | null;
  evidence: AssembledEvidence | null;
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
  drill_attachments?: Array<{
    rank: number;
    drill: {
      id: string;
      slug: string;
      title: string;
      duration_min: number;
      difficulty: string;
    } | null;
  }> | null;
}

interface EvidenceOpts {
  metric?: string | null;
  strokesImpact?: number;
  confidence?: number;
  /** strokes_saved_per_round on a NON-suppressed counterfactual. */
  strokesSaved?: number;
  /** force the counterfactual's `suppressed` flag. */
  suppressed?: boolean;
  /** omit the counterfactual key entirely (→ null). */
  noCounterfactual?: boolean;
  /** set counterfactual explicitly to null (vs. omit). */
  nullCounterfactual?: boolean;
  /** full standing anchors for the team-fraction math. */
  standingPlayer?: number | null;
  standingTeam?: number | null;
  standingPga?: number | null;
  sourceInsightIds?: string[];
  compositeRuleId?: string;
}

/** Builds the runtime-real `evidence` JSON exactly as the engine injects it. */
function makeEvidence(o: EvidenceOpts = {}): AssembledEvidence {
  const ev: AssembledEvidence = {
    metric: o.metric === undefined ? 'putt_make_rate_6_10ft' : (o.metric ?? undefined),
    metric_label: '6-10 ft make rate',
    strokes_impact: o.strokesImpact ?? 0,
    confidence: o.confidence ?? 0.7,
  };

  if (o.nullCounterfactual) {
    ev.counterfactual = null;
  } else if (!o.noCounterfactual) {
    ev.counterfactual = {
      current_baseline_score: 75,
      projected_score_if_closed: 74,
      strokes_saved_per_round: o.strokesSaved ?? 0,
      weeks_to_typical_close: 4,
      suppressed: o.suppressed ?? false,
    };
  }

  if (
    o.standingPlayer !== undefined ||
    o.standingTeam !== undefined ||
    o.standingPga !== undefined
  ) {
    ev.standing = {
      metric_id: o.metric ?? 'putt_make_rate_6_10ft',
      player_value: o.standingPlayer ?? null,
      team_avg: o.standingTeam ?? null,
      team_pct: null,
      pga_value: o.standingPga ?? null,
      pga_delta: null,
    };
  }

  if (o.sourceInsightIds) ev.source_insight_ids = o.sourceInsightIds;
  if (o.compositeRuleId) ev.composite_rule_id = o.compositeRuleId;

  return ev;
}

function makeRow(overrides: Partial<RawThemeRow> = {}): RawThemeRow {
  return {
    id: 'i-1',
    player_id: 'p-1',
    category: 'putting',
    title: 'Title',
    content: 'Content',
    signature: 'sig1',
    evidence: makeEvidence(),
    metadata: null,
    lifecycle_state: 'matured',
    status: 'active',
    priority: 'medium',
    acknowledged_at: null,
    resolved_at: null,
    outcome_status: null,
    outcome_measured_at: null,
    created_at: '2026-04-15T12:00:00.000Z',
    updated_at: '2026-04-22T12:00:00.000Z',
    drill_attachments: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Supabase mock — chainable builder per table.
//
// The themes path queries three tables:
//   - golf_coach_insights (assembleForPlayer): the INSIGHT_SELECT fetch
//     terminated by `.limit(...)`.
//   - golf_rounds (fetchShotDriversByCategory + fetchSgTrendsByCategory):
//     `.select(...).eq(...).eq(...).order(...).limit(...)`.
//   - golf_shots (fetchShotDriversByCategory): `.select(...).in(...).limit(...)`.
//
// Both best-effort fetchers return `undefined` when their `golf_rounds` query
// yields no rows, so by default we feed empty rounds and the assembler simply
// omits shot-drivers + trends. Tests that don't care set them empty.
// ---------------------------------------------------------------------------

interface SupabaseMockOpts {
  userId?: string | null;
  /** rows for the `golf_coach_insights` themes fetch. */
  insightRows?: RawThemeRow[] | null;
  /** error for the insight fetch (forces assembleForPlayer to throw). */
  insightError?: { message: string } | null;
}

type TerminalResult<T> = { data: T; error: { message: string } | null };

function makeSupabaseMock(opts: SupabaseMockOpts) {
  const buildInsightBuilder = () => {
    const terminal: TerminalResult<RawThemeRow[] | null> = {
      data: opts.insightRows ?? [],
      error: opts.insightError ?? null,
    };
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      // `.limit()` is the terminal awaited node on the insight query.
      limit: vi.fn(() => Promise.resolve(terminal)),
    };
    return builder;
  };

  // golf_rounds: empty completed-rounds set → both best-effort fetchers bail
  // to undefined without ever touching golf_shots.
  const buildRoundsBuilder = () => {
    const terminal: TerminalResult<unknown[]> = { data: [], error: null };
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn(() => Promise.resolve(terminal)),
    };
  };

  const buildShotsBuilder = () => {
    const terminal: TerminalResult<unknown[]> = { data: [], error: null };
    return {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      limit: vi.fn(() => Promise.resolve(terminal)),
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
      if (table === 'golf_rounds') return buildRoundsBuilder();
      if (table === 'golf_shots') return buildShotsBuilder();
      return buildInsightBuilder();
    }),
  };
}

/** Installs the given mock as the client `createClient()` returns. */
function useClient(mock: ReturnType<typeof makeSupabaseMock>): void {
  activeClient = mock as unknown as SupabaseClient;
}

// ---------------------------------------------------------------------------
// Invariant assertions (the honesty contract the assembler enforces).
// ---------------------------------------------------------------------------

function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

/** Asserts the HONESTY INVARIANTS hold across the whole assembled tree. */
function assertHonestyInvariants(assembled: AssembledThemes): void {
  // No NaN / Infinity anywhere in the numeric surface.
  expect(isFiniteNumber(assembled.totalStrokesPerRound)).toBe(true);

  for (const theme of assembled.themes) {
    // every theme.state ∈ {leak, strength, thin}
    expect(['leak', 'strength', 'thin']).toContain(theme.state);

    expect(isFiniteNumber(theme.themeStrokesPerRound)).toBe(true);
    expect(isFiniteNumber(theme.tourGapPerRound)).toBe(true);
    if (theme.sgPerRound !== null) {
      expect(isFiniteNumber(theme.sgPerRound)).toBe(true);
    }
    // theme magnitude is never negative (a strength is 0, not a "cost").
    expect(theme.themeStrokesPerRound).toBeGreaterThanOrEqual(0);

    for (const cause of theme.causes) {
      expect(isFiniteNumber(cause.strokesSavedPerRound)).toBe(true);
      // realistic team gap is never negative.
      expect(cause.strokesSavedPerRound).toBeGreaterThanOrEqual(0);

      // realistic (team) gap ≤ raw Tour gap, when the Tour gap is present.
      if (cause.tourGapPerRound != null) {
        expect(isFiniteNumber(cause.tourGapPerRound)).toBe(true);
        expect(cause.strokesSavedPerRound).toBeLessThanOrEqual(
          cause.tourGapPerRound + 1e-9,
        );
      }

      // suppressed counterfactual ⇒ NOT shown as a quantified leak.
      if (cause.counterfactualSuppressed) {
        expect(cause.strokesSavedPerRound).toBe(0);
        expect(cause.tourGapPerRound).toBeNull();
      }
    }
  }
}

function themeOf(assembled: AssembledThemes, category: string): ThemeNode {
  const theme = assembled.themes.find((t) => t.category === category);
  if (!theme) throw new Error(`theme ${category} not present in scaffold`);
  return theme;
}

beforeEach(() => {
  vi.clearAllMocks();
  activeClient = {};
  verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'self' });
  getDetailedStatsAsAdminMock.mockResolvedValue({
    sgPuttingPerRound: null,
    sgApproachPerRound: null,
    sgTeePerRound: null,
    sgAroundGreenPerRound: null,
  });
});

// ===========================================================================
// 1. mapRowLoose — exercised through the delivery entry points.
//    The loose mapper is private, so we assert its behavior via the assembled
//    output: a row it KEEPS becomes a cause; a row it DROPS does not; and the
//    runtime-only fields it casts through AssembledEvidence drive the tree.
// ===========================================================================

describe('mapRowLoose (via getThemesForPlayer) — keep/drop + runtime-field preservation', () => {
  it('(a) keeps a row with FULL evidence incl. runtime-only fields and preserves them through the cast', async () => {
    // A composite cause carrying every runtime-only field. The assembled tree
    // can only reflect these if mapRowLoose preserved them via the cast.
    const composite = makeRow({
      id: 'composite-1',
      category: 'putting',
      title: 'Composite putting cause',
      content: 'Synthesis prose',
      evidence: makeEvidence({
        metric: 'putt_make_rate_6_10ft',
        strokesSaved: 0,
        compositeRuleId: 'rule-putt-cascade',
        sourceInsightIds: ['leaf-1'],
      }),
    });
    const leaf = makeRow({
      id: 'leaf-1',
      category: 'putting',
      title: 'Leaf putting cause',
      content: 'Leaf prose',
      evidence: makeEvidence({
        metric: 'putt_make_rate_3_5ft',
        strokesSaved: 0.8,
        standingPlayer: 0.4,
        standingTeam: 0.5,
        standingPga: 0.6,
      }),
    });

    useClient(makeSupabaseMock({ userId: 'u-1', insightRows: [composite, leaf] }));

    const res = await getThemesForPlayer('p-1');
    expect(res.success).toBe(true);
    expect(res.data).toBeDefined();
    const assembled = res.data as AssembledThemes;

    // counterfactual/standing/source_insight_ids/composite_rule_id all survived:
    // the leaf got DEMOTED under the composite (source_insight_ids edge), and the
    // composite carries a driver whose source_insight_ids points at the leaf.
    const putting = themeOf(assembled, 'putting');
    const compCause = putting.causes.find((c) => c.insight_id === 'composite-1');
    expect(compCause).toBeDefined();
    expect(compCause?.drivers.some((d) => d.source === 'composite')).toBe(true);
    expect(compCause?.drivers.some((d) => d.source_insight_ids.includes('leaf-1'))).toBe(true);
    // The leaf's standing (player 0.4 / team 0.5 / pga 0.6) produced a real
    // team-anchored realistic gap on the composite — proving `standing` and
    // `counterfactual` both flowed through the loose map + cast.
    expect((compCause?.strokesSavedPerRound ?? 0)).toBeGreaterThan(0);

    assertHonestyInvariants(assembled);
  });

  it('(b) keeps a row whose counterfactual is null (it still has a usable metric)', async () => {
    const row = makeRow({
      id: 'null-cf',
      category: 'approach',
      evidence: makeEvidence({ metric: 'gir_pct', nullCounterfactual: true }),
    });
    useClient(makeSupabaseMock({ userId: 'u-1', insightRows: [row] }));

    const res = await getThemesForPlayer('p-1');
    expect(res.success).toBe(true);
    const assembled = res.data as AssembledThemes;

    const approach = themeOf(assembled, 'approach');
    const cause = approach.causes.find((c) => c.insight_id === 'null-cf');
    expect(cause).toBeDefined();
    // null counterfactual ⇒ suppressed/diagnostic-only, no fabricated number.
    expect(cause?.counterfactualSuppressed).toBe(true);
    expect(cause?.strokesSavedPerRound).toBe(0);
    expect(cause?.tourGapPerRound).toBeNull();

    assertHonestyInvariants(assembled);
  });

  it('(c) drops a row with missing/empty evidence (no metric AND no live counterfactual)', async () => {
    const noEvidence = makeRow({ id: 'no-ev', category: 'putting', evidence: null });
    const emptyEvidence = makeRow({
      id: 'empty-ev',
      category: 'putting',
      // no metric, no counterfactual at all → loose keep fails.
      evidence: makeEvidence({ metric: null, noCounterfactual: true }),
    });
    const kept = makeRow({
      id: 'kept',
      category: 'putting',
      evidence: makeEvidence({ metric: 'putt_make_rate_6_10ft', strokesSaved: 0.5 }),
    });
    useClient(
      makeSupabaseMock({ userId: 'u-1', insightRows: [noEvidence, emptyEvidence, kept] }),
    );

    const res = await getThemesForPlayer('p-1');
    expect(res.success).toBe(true);
    const assembled = res.data as AssembledThemes;

    const putting = themeOf(assembled, 'putting');
    const ids = putting.causes.map((c) => c.insight_id);
    expect(ids).toContain('kept');
    expect(ids).not.toContain('no-ev');
    expect(ids).not.toContain('empty-ev');

    assertHonestyInvariants(assembled);
  });

  it('(d) drops a row whose ONLY signal is a SUPPRESSED counterfactual (no metric)', async () => {
    // Loose keep requires a metric OR a non-suppressed counterfactual. A
    // metric-less, suppressed-counterfactual row clears neither.
    const suppressedOnly = makeRow({
      id: 'suppressed-only',
      category: 'tee',
      evidence: makeEvidence({ metric: null, suppressed: true, strokesSaved: 2.0 }),
    });
    // A sibling that DOES keep (suppressed cf but has a metric) — proves the
    // OR-branch: metric alone is enough even with a suppressed counterfactual.
    const suppressedWithMetric = makeRow({
      id: 'suppressed-with-metric',
      category: 'tee',
      evidence: makeEvidence({ metric: 'driving_accuracy', suppressed: true, strokesSaved: 2.0 }),
    });
    useClient(
      makeSupabaseMock({
        userId: 'u-1',
        insightRows: [suppressedOnly, suppressedWithMetric],
      }),
    );

    const res = await getThemesForPlayer('p-1');
    expect(res.success).toBe(true);
    const assembled = res.data as AssembledThemes;

    const tee = themeOf(assembled, 'tee');
    const ids = tee.causes.map((c) => c.insight_id);
    expect(ids).not.toContain('suppressed-only');
    expect(ids).toContain('suppressed-with-metric');

    // The kept-but-suppressed cause must not be a quantified leak.
    const kept = tee.causes.find((c) => c.insight_id === 'suppressed-with-metric');
    expect(kept?.counterfactualSuppressed).toBe(true);
    expect(kept?.strokesSavedPerRound).toBe(0);

    assertHonestyInvariants(assembled);
  });
});

// ===========================================================================
// 2. getThemesForPlayer / assembleForPlayer — honesty invariants end-to-end.
// ===========================================================================

describe('getThemesForPlayer — auth gating', () => {
  it('returns Unauthorized when no user', async () => {
    useClient(makeSupabaseMock({ userId: null }));
    const res = await getThemesForPlayer('p-1');
    expect(res.success).toBe(false);
    expect(res.error).toBe('Unauthorized');
    expect(res.data).toBeUndefined();
  });

  it('returns Forbidden when verifyPlayerAccess denies', async () => {
    verifyPlayerAccessMock.mockResolvedValueOnce({ allowed: false, reason: 'denied' });
    useClient(makeSupabaseMock({ userId: 'u-1', insightRows: [makeRow()] }));
    const res = await getThemesForPlayer('p-1');
    expect(res.success).toBe(false);
    expect(res.error).toBe('Forbidden');
  });

  it('returns an error for an empty playerId without touching the DB', async () => {
    const mock = makeSupabaseMock({ userId: 'u-1' });
    useClient(mock);
    const res = await getThemesForPlayer('');
    expect(res.success).toBe(false);
    expect(res.error).toBe('playerId required');
    expect(mock.from).not.toHaveBeenCalled();
  });

  it('surfaces a failed insight query as a wrapped error (not a throw)', async () => {
    useClient(
      makeSupabaseMock({ userId: 'u-1', insightError: { message: 'db boom' } }),
    );
    const res = await getThemesForPlayer('p-1');
    expect(res.success).toBe(false);
    expect(res.error).toBe('Failed to assemble themes');
  });
});

describe('getThemesForPlayer — honesty invariants on a realistic fixture', () => {
  it('upholds every honesty invariant across a mixed leak / strength / thin fixture', async () => {
    // putting: a real LEAK with a full standing → team-anchored realistic gap.
    const puttLeak = makeRow({
      id: 'putt-leak',
      category: 'putting',
      evidence: makeEvidence({
        metric: 'putt_make_rate_6_10ft',
        strokesImpact: 1.2,
        strokesSaved: 1.5, // raw Tour gap
        standingPlayer: 0.30,
        standingTeam: 0.42,
        standingPga: 0.55,
      }),
    });
    // approach: a diagnostic-only suppressed cause (kept via metric).
    const approachDiag = makeRow({
      id: 'approach-diag',
      category: 'approach',
      evidence: makeEvidence({ metric: 'gir_pct', suppressed: true, strokesSaved: 0.9 }),
    });
    // tee: a cause with no standing → realistic gap falls back to full Tour gap.
    const teeNoStanding = makeRow({
      id: 'tee-cause',
      category: 'tee',
      evidence: makeEvidence({ metric: 'driving_accuracy', strokesSaved: 0.7 }),
    });

    // approach reads as a category STRENGTH via SG; short_game a real loss.
    getDetailedStatsAsAdminMock.mockResolvedValueOnce({
      sgPuttingPerRound: -0.9,
      sgApproachPerRound: 0.8,
      sgTeePerRound: null,
      sgAroundGreenPerRound: -1.0,
    });

    useClient(
      makeSupabaseMock({
        userId: 'u-1',
        insightRows: [puttLeak, approachDiag, teeNoStanding],
      }),
    );

    const res = await getThemesForPlayer('p-1');
    expect(res.success).toBe(true);
    const assembled = res.data as AssembledThemes;

    assertHonestyInvariants(assembled);

    // The 4 SG themes are always present (honest scaffold, never blank).
    for (const cat of ['putting', 'approach', 'tee', 'short_game']) {
      expect(assembled.themes.some((t) => t.category === cat)).toBe(true);
    }

    // Positive-SG approach is a strength (themeStrokesPerRound clamps to 0).
    const approach = themeOf(assembled, 'approach');
    expect(approach.state).toBe('strength');
    expect(approach.themeStrokesPerRound).toBe(0);

    // The team-anchored putting cause: realistic gap is the fraction of the
    // Tour gap between player (0.30) and team (0.42) over player→PGA (0.30→0.55):
    //   teamFraction = (0.30 - 0.42) / (0.30 - 0.55) = 0.48 → realistic = 1.5 * 0.48 = 0.72
    const putting = themeOf(assembled, 'putting');
    const puttCause = putting.causes.find((c) => c.insight_id === 'putt-leak');
    expect(puttCause).toBeDefined();
    expect(puttCause?.tourGapPerRound).toBeCloseTo(1.5, 6);
    expect(puttCause?.strokesSavedPerRound).toBeCloseTo(0.72, 6);

    // tee cause with no standing falls back to the full Tour gap.
    const tee = themeOf(assembled, 'tee');
    const teeCause = tee.causes.find((c) => c.insight_id === 'tee-cause');
    expect(teeCause?.strokesSavedPerRound).toBeCloseTo(0.7, 6);
    expect(teeCause?.tourGapPerRound).toBeCloseTo(0.7, 6);
  });

  it('routes the SG-fetch failure to a still-honest scaffold (best-effort SG)', async () => {
    getDetailedStatsAsAdminMock.mockRejectedValueOnce(new Error('stats down'));
    useClient(
      makeSupabaseMock({
        userId: 'u-1',
        insightRows: [
          makeRow({
            id: 'putt-1',
            category: 'putting',
            evidence: makeEvidence({ metric: 'putt_make_rate_6_10ft', strokesSaved: 0.6 }),
          }),
        ],
      }),
    );

    const res = await getThemesForPlayer('p-1');
    expect(res.success).toBe(true);
    const assembled = res.data as AssembledThemes;
    // SG unknown for every category, but the cause still surfaces.
    const putting = themeOf(assembled, 'putting');
    expect(putting.sgPerRound).toBeNull();
    expect(putting.causes.map((c) => c.insight_id)).toContain('putt-1');
    assertHonestyInvariants(assembled);
  });
});

// ===========================================================================
// 3. Empty-rows fixture → honest empty/thin scaffold (not a throw).
// ===========================================================================

describe('getThemesForPlayer — empty rows yield the honest scaffold', () => {
  it('returns success with the 4 SG themes as thin stubs and 0 total when there are no rows', async () => {
    useClient(makeSupabaseMock({ userId: 'u-1', insightRows: [] }));

    const res = await getThemesForPlayer('p-1');
    expect(res.success).toBe(true);
    const assembled = res.data as AssembledThemes;

    // The 4 SG themes always render; the 3 empty outcome themes are gated out.
    expect(assembled.themes).toHaveLength(4);
    for (const theme of assembled.themes) {
      expect(theme.causes).toHaveLength(0);
      expect(theme.state).toBe('thin');
    }
    expect(assembled.totalStrokesPerRound).toBe(0);
    expect(assembled.playerId).toBe('p-1');

    assertHonestyInvariants(assembled);
  });

  it('tolerates a null data payload (treated as empty) without throwing', async () => {
    useClient(makeSupabaseMock({ userId: 'u-1', insightRows: null }));

    const res = await getThemesForPlayer('p-1');
    expect(res.success).toBe(true);
    const assembled = res.data as AssembledThemes;
    expect(assembled.themes).toHaveLength(4);
    expect(assembled.totalStrokesPerRound).toBe(0);
  });
});

// ===========================================================================
// getThemesForCoach — same per-player assemble behind a coach access gate.
// ===========================================================================

describe('getThemesForCoach — auth gating + delegation', () => {
  it('requires a player_id', async () => {
    const res = await getThemesForCoach({ player_id: '' });
    expect(res.success).toBe(false);
    expect(res.error).toBe('player_id required');
  });

  it('returns Unauthorized when no user', async () => {
    useClient(makeSupabaseMock({ userId: null }));
    const res = await getThemesForCoach({ player_id: 'p-1' });
    expect(res.success).toBe(false);
    expect(res.error).toBe('Unauthorized');
  });

  it('returns Forbidden when verifyPlayerAccess denies', async () => {
    verifyPlayerAccessMock.mockResolvedValueOnce({ allowed: false, reason: 'denied' });
    useClient(makeSupabaseMock({ userId: 'u-1', insightRows: [makeRow()] }));
    const res = await getThemesForCoach({ player_id: 'p-1' });
    expect(res.success).toBe(false);
    expect(res.error).toBe('Forbidden');
    expect(verifyPlayerAccessMock).toHaveBeenCalledTimes(1);
  });

  it('assembles the same honest scaffold for an authorized coach', async () => {
    useClient(
      makeSupabaseMock({
        userId: 'coach-1',
        insightRows: [
          makeRow({
            id: 'sg-cause',
            category: 'short_game',
            evidence: makeEvidence({ metric: 'up_and_down_pct', strokesSaved: 0.5 }),
          }),
        ],
      }),
    );

    const res = await getThemesForCoach({ player_id: 'p-1' });
    expect(res.success).toBe(true);
    const assembled = res.data as AssembledThemes;
    expect(assembled.playerId).toBe('p-1');
    const sg = themeOf(assembled, 'short_game');
    expect(sg.causes.map((c) => c.insight_id)).toContain('sg-cause');
    assertHonestyInvariants(assembled);
  });

  it('wraps an assemble failure as an error string (no throw across the boundary)', async () => {
    useClient(makeSupabaseMock({ userId: 'coach-1', insightError: { message: 'boom' } }));
    const res = await getThemesForCoach({ player_id: 'p-1' });
    expect(res.success).toBe(false);
    expect(res.error).toBe('Failed to assemble themes');
  });
});
