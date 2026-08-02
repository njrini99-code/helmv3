import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { MinedPattern, ShotPattern } from '@/lib/coachhelm/v2/types';

// ---------------------------------------------------------------------------
// CROSS-MINER regression guard for the shared `golf_patterns_v2` table.
//
// Two miners write to the same table for the same player, CONCURRENTLY, from
// orchestrator.analyzePlayer's Promise.all:
//
//   PatternMiner.savePatterns()      → 'conditional' | 'compound' | 'anomaly',
//                                       plus a soft-supersede UPDATE that
//                                       retires this player's active rows that
//                                       are absent from the fresh batch.
//   ShotPatternMiner.savePatterns()  → 'contextual' shot-dispersion rows, with
//                                       NO supersede of its own — it relies on
//                                       nothing else retiring its rows.
//
// The supersede used to carry no `pattern_type` predicate, so whichever miner
// committed last decided: a round-level mine flipped the shot-dispersion rows
// to is_active = false even though it never produced them and could not add
// them back. This suite pins the two halves of the invariant TOGETHER, driving
// BOTH real miners against one in-memory `golf_patterns_v2`:
//
//   1. the rows ShotPatternMiner actually writes (pattern_type + lifecycle),
//   2. the rows PatternMiner's supersede filters actually match.
//
// The fix lives in pattern-miner.ts; this file is the victim-side proof.
// ---------------------------------------------------------------------------

const { shotUpsertMock, roundUpsertMock, supersedeChain, fromUntypedMock, adminFromMock } =
  vi.hoisted(() => {
    const selectInMock = vi.fn(async () => ({
      data: [] as Array<{ id: string; lifecycle_state: string | null }>,
    }));

    // ShotPatternMiner batch-upserts an ARRAY of rows in one call.
    const shotUpsertMock = vi.fn(
      async (
        _rows: Array<Record<string, unknown>>,
        _options: { onConflict: string },
      ): Promise<{ data: null; error: { code?: string; message?: string } | null }> => ({
        data: null,
        error: null,
      }),
    );
    // PatternMiner upserts ONE row per call.
    const roundUpsertMock = vi.fn(
      async (
        _row: Record<string, unknown>,
        _options: { onConflict: string },
      ): Promise<{ error: { message: string } | null }> => ({ error: null }),
    );

    // Chainable builder double for the supersede UPDATE: every filter returns
    // the builder, `.or()` is the awaited terminal.
    interface SupersedeChain {
      update: ReturnType<typeof vi.fn>;
      in: ReturnType<typeof vi.fn>;
      eq: ReturnType<typeof vi.fn>;
      not: ReturnType<typeof vi.fn>;
      or: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    }
    const supersedeChain = {} as SupersedeChain;
    supersedeChain.update = vi.fn(() => supersedeChain);
    supersedeChain.in = vi.fn(() => supersedeChain);
    supersedeChain.eq = vi.fn(() => supersedeChain);
    supersedeChain.not = vi.fn(() => supersedeChain);
    supersedeChain.or = vi.fn(async () => ({ error: null }));
    supersedeChain.delete = vi.fn(() => supersedeChain);

    const fromUntypedMock = vi.fn(() => supersedeChain);

    const adminFromMock = vi.fn(() => ({
      select: vi.fn(() => ({ in: selectInMock })),
      // One object serves both miners: they call different upsert arities, so
      // dispatch on the argument shape rather than on the table name (both
      // write `golf_patterns_v2`).
      upsert: (
        payload: Record<string, unknown> | Array<Record<string, unknown>>,
        options: { onConflict: string },
      ) =>
        Array.isArray(payload)
          ? shotUpsertMock(payload, options)
          : roundUpsertMock(payload, options),
    }));

    return { shotUpsertMock, roundUpsertMock, supersedeChain, fromUntypedMock, adminFromMock };
  });

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: adminFromMock }),
}));

vi.mock('@/lib/supabase/untyped', () => ({
  fromUntyped: fromUntypedMock,
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));

// Import AFTER the mocks are registered.
const { PatternMiner } = await import('@/lib/coachhelm/v2/mining/pattern-miner');
const { ShotPatternMiner } = await import('@/lib/coachhelm/v2/mining/shot-pattern-miner');

type SaveRoundPatterns = { savePatterns: (p: MinedPattern[]) => Promise<void> };
type SaveShotPatterns = { savePatterns: (p: ShotPattern[]) => Promise<void> };

function makeRoundPattern(i: number): MinedPattern {
  return {
    id: `round-${i}`,
    playerId: 'player-1',
    patternType: 'conditional',
    conditions: [],
    outcome: { metric: 'score_to_par', direction: 'increase', magnitude: 1, comparison: 'vs_baseline' },
    support: 0.2,
    confidence: 0.8,
    lift: 1.5,
    conviction: 2,
    strokeImpact: 1.2,
    actionability: 0.7,
    sampleSize: 10,
    firstDetected: new Date().toISOString(),
    lastOccurrence: new Date().toISOString(),
    occurrenceCount: 10,
    trend: 'stable',
    isActive: true,
  };
}

/** Shaped so `computeShotStrokeImpact` clears the 0.1 persistence floor. */
function makeShotPattern(i: number): ShotPattern {
  const now = new Date().toISOString();
  return {
    id: `shot-${i}`,
    playerId: 'player-1',
    situation: {
      distanceRange: { min: 140, max: 160, label: '140-160 yards' },
      lie: 'fairway',
      shotType: 'approach',
    },
    tendencies: [
      { direction: 'long_right', frequency: 0.67, avgDistance: 18, consistency: 0.7 },
    ],
    primaryMiss: 'long_right',
    dispersionPattern: 'one_way_right',
    avgDistanceError: 18,
    avgProximity: 42,
    distanceControlScore: 0.35,
    sampleSize: 12,
    confidence: 0.8,
    insight: 'From 140-160 yards you miss long right.',
    recommendation: 'Work the 8-iron start line.',
    createdAt: now,
    updatedAt: now,
  };
}

type TableRow = {
  id: string;
  player_id: string;
  pattern_type: string;
  is_active: boolean;
  lifecycle_state: string | null;
};

/**
 * Replay the filters recorded on the supersede double against an in-memory
 * table: "which rows would this UPDATE actually touch?" — not a filter-string
 * comparison, which can stay green while the blast radius changes.
 */
function matchedBySupersede(row: TableRow): boolean {
  const PRESERVED = new Set(['confirmed', 'addressed', 'resolved', 'dismissed']);

  const inCalls = supersedeChain.in.mock.calls as unknown as Array<[string, string[]]>;
  for (const [column, values] of inCalls) {
    if (!values.includes(String(row[column as keyof TableRow]))) return false;
  }

  const eqCalls = supersedeChain.eq.mock.calls as unknown as Array<[string, unknown]>;
  for (const [column, value] of eqCalls) {
    if (row[column as keyof TableRow] !== value) return false;
  }

  const notCalls = supersedeChain.not.mock.calls as unknown as Array<[string, string, string]>;
  for (const [column, operator, list] of notCalls) {
    if (operator !== 'in') throw new Error(`unhandled not() operator: ${operator}`);
    const excluded = list.slice(1, -1).split(',').map((value) => value.replace(/"/g, ''));
    if (excluded.includes(String(row[column as keyof TableRow]))) return false;
  }

  if (supersedeChain.or.mock.calls.length !== 1) {
    throw new Error(`expected exactly one or() filter, saw ${supersedeChain.or.mock.calls.length}`);
  }
  if (row.lifecycle_state !== null && PRESERVED.has(row.lifecycle_state)) return false;

  return true;
}

describe('golf_patterns_v2 cross-miner supersede (concurrent analyzePlayer path)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ShotPatternMiner's persisted rows survive a concurrent round-level savePatterns()", async () => {
    // 1. ShotPatternMiner writes first — capture the rows it REALLY persists
    //    instead of asserting against a hand-written fixture that could drift.
    const shotMiner = new ShotPatternMiner('player-1');
    await (shotMiner as unknown as SaveShotPatterns).savePatterns([
      makeShotPattern(1),
      makeShotPattern(2),
    ]);

    expect(shotUpsertMock).toHaveBeenCalledTimes(1);
    const persistedShotRows = shotUpsertMock.mock.calls[0]![0] as Array<Record<string, unknown>>;
    expect(persistedShotRows.length).toBe(2);

    // The two properties the round-level supersede keys on. ShotPatternMiner
    // sets NO lifecycle_state, so those rows carry the column default
    // ('detected'), which is NOT in the preserved set — that is precisely why
    // a pattern_type-agnostic supersede swept them up.
    for (const row of persistedShotRows) {
      expect(row.pattern_type).toBe('contextual');
      expect(row.is_active).toBe(true);
      expect(row).not.toHaveProperty('lifecycle_state');
    }

    // 2. PatternMiner then commits its own batch + supersede for the SAME
    //    player, exactly as it does in orchestrator.analyzePlayer's Promise.all.
    const roundMiner = new PatternMiner('player-1');
    await (roundMiner as unknown as SaveRoundPatterns).savePatterns([
      makeRoundPattern(1),
      makeRoundPattern(2),
    ]);

    // One upsert per round-level pattern, then the supersede — the shot rows
    // are NOT re-written by this miner, so nothing can add them back.
    expect(roundUpsertMock).toHaveBeenCalledTimes(2);
    expect(fromUntypedMock).toHaveBeenCalledWith(expect.anything(), 'golf_patterns_v2');
    expect(supersedeChain.delete).not.toHaveBeenCalled();

    // 3. Replay the supersede against a table holding both miners' rows.
    const table: TableRow[] = [
      ...persistedShotRows.map((row) => ({
        id: String(row.id),
        player_id: String(row.player_id),
        pattern_type: String(row.pattern_type),
        is_active: Boolean(row.is_active),
        // Column default applied by Postgres, since the writer omits it.
        lifecycle_state: 'detected',
      })),
      // Freshly upserted round-level rows — excluded by the not-in id list.
      { id: 'round-1', player_id: 'player-1', pattern_type: 'conditional', is_active: true, lifecycle_state: 'detected' },
      // Genuinely stale round-level row — the supersede's actual target.
      { id: 'stale-1', player_id: 'player-1', pattern_type: 'anomaly', is_active: true, lifecycle_state: 'detected' },
    ];

    expect(table.filter(matchedBySupersede).map((r) => r.id)).toEqual(['stale-1']);
  });
});
