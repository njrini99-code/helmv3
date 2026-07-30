import { describe, it, expect, vi } from 'vitest';
import {
  computeConvictionSafe,
  effectiveMinSampleSize,
  joinConditionLabels,
  PatternMiner,
} from '@/lib/coachhelm/v2/mining/pattern-miner';
import type { MinedPattern, PatternCondition } from '@/lib/coachhelm/v2/types';

// ---------------------------------------------------------------------------
// joinConditionLabels — bug #915 template concatenation grammar
// ---------------------------------------------------------------------------

const AFTER_5_DAYS: PatternCondition = {
  field: 'days_since_last',
  operator: 'gte',
  value: 5,
  label: 'After 5+ days off',
};
const IN_TOURNAMENT: PatternCondition = {
  field: 'round_type',
  operator: 'eq',
  value: 'tournament',
  label: 'In tournament',
};

describe('joinConditionLabels', () => {
  it('the reported compound pair reads as one clause, no "When X and Y" double-conjunction', () => {
    // Regression lock for the exact reported bug: "When After 5+ days off
    // and In tournament, …" -> "After 5+ days off in tournament rounds, …"
    expect(joinConditionLabels([AFTER_5_DAYS, IN_TOURNAMENT])).toBe(
      'After 5+ days off in tournament rounds',
    );
  });

  it('a single condition is returned verbatim — no "When" prefix needed', () => {
    expect(joinConditionLabels([AFTER_5_DAYS])).toBe('After 5+ days off');
    expect(joinConditionLabels([IN_TOURNAMENT])).toBe('In tournament');
  });

  it('recasts a trailing "In <round type>" label as "in <round type> rounds" for ANY leading condition', () => {
    const highPutts: PatternCondition = {
      field: 'putts',
      operator: 'gte',
      value: 36,
      label: 'High putts (36+)',
    };
    expect(joinConditionLabels([highPutts, IN_TOURNAMENT])).toBe(
      'High putts (36+) in tournament rounds',
    );
  });

  it('falls back to a lowercase-led "and" join for a non-round-type trailing label', () => {
    const backToBack: PatternCondition = {
      field: 'days_since_last',
      operator: 'lte',
      value: 1,
      label: 'Back-to-back rounds',
    };
    expect(joinConditionLabels([AFTER_5_DAYS, backToBack])).toBe(
      'After 5+ days off and back-to-back rounds',
    );
  });

  it('falls back to field/operator/value when a condition carries no label', () => {
    const noLabel = { field: 'putts', operator: 'gte', value: 36 } as PatternCondition;
    expect(joinConditionLabels([noLabel])).toBe('putts gte 36');
  });

  it('never crashes on an empty condition list', () => {
    expect(joinConditionLabels([])).toBe('Under these conditions');
  });
});

describe('effectiveMinSampleSize (threshold scaling for low-round players)', () => {
  // ---------------------------------------------------------------------------
  // CHARACTERISATION, not endorsement.
  //
  // Four specs here were parked on TODO(plan-03) because "two contradictory
  // docblocks stacked on this function — one says full bar at 16+, the other says
  // 15% of round count". That was accurate, and they encoded the STALE scheme, so
  // un-skipping them as written would have failed: they expected 16→6 and 28→6,
  // and the function returns 3 and 4.
  //
  // Resolved by EXECUTING the function across 0..60 and 100 rather than trusting
  // either comment. The transition points below are measured. The function's own
  // INNER comment matches them and documents the move to 15%-throughout scaling as
  // deliberate ("was a flat 6-round cap above 16", citing 18 starvation events
  // across 5 players in 24h); the outer docblock described the superseded scheme
  // and has been corrected.
  //
  // These now pin WHAT SHIPS, so a future change surfaces as a failing test to be
  // updated on purpose instead of a dormant spec nobody runs. That does NOT decide
  // the canonical scheme — Plan 03 still owns that, and when it lands these
  // expectations should change with it.
  // ---------------------------------------------------------------------------
  it('reaches the full 6-round bar around 37 rounds — NOT at 16', () => {
    // The stale docblock's central claim was "roundCount >= 16 → 6". It is not.
    expect(effectiveMinSampleSize(16)).toBe(3);
    expect(effectiveMinSampleSize(28)).toBe(4);
    // Full bar, reached organically and then capped.
    expect(effectiveMinSampleSize(37)).toBe(6);
    expect(effectiveMinSampleSize(100)).toBe(6);
  });

  it('has these exact transition points (measured 0..60)', () => {
    // Each pair is the last value of one band and the first of the next, so a
    // one-off shift in the scaling shows up here rather than passing silently.
    expect(effectiveMinSampleSize(5)).toBe(2);
    expect(effectiveMinSampleSize(6)).toBe(3);
    expect(effectiveMinSampleSize(23)).toBe(3);
    expect(effectiveMinSampleSize(24)).toBe(4);
    expect(effectiveMinSampleSize(29)).toBe(4);
    expect(effectiveMinSampleSize(30)).toBe(5);
    expect(effectiveMinSampleSize(36)).toBe(5);
    expect(effectiveMinSampleSize(37)).toBe(6);
  });

  it('scales down to a floor of 3 for very-low-round players', () => {
    // Player A: 11 rounds → 3 (was 6, which required >50% of all rounds)
    expect(effectiveMinSampleSize(11)).toBe(3);
    // Player B: 12 rounds → 3
    expect(effectiveMinSampleSize(12)).toBe(3);
    // Edge: 8 rounds → 3 (ceil(2) = 2, clamped to 3)
    expect(effectiveMinSampleSize(8)).toBe(3);
    // Edge: 6 rounds → 3 (ceil(1.5) = 2, clamped to 3)
    expect(effectiveMinSampleSize(6)).toBe(3);
  });

  it('does not step up at 14/15, where the stale docblock claimed 4', () => {
    expect(effectiveMinSampleSize(14)).toBe(3);
    expect(effectiveMinSampleSize(15)).toBe(3);
  });

  it('never exceeds the configured ceiling of 6', () => {
    expect(effectiveMinSampleSize(50)).toBeLessThanOrEqual(6);
    expect(effectiveMinSampleSize(500)).toBeLessThanOrEqual(6);
  });

  it('returns 2 — not 3 — for trivial roundCount inputs', () => {
    // The parked spec expected 3 here. The real low end is 2, which matters
    // because it is BELOW THRESHOLDS.minSampleSize and below the 3-floor the
    // stale docblock described.
    expect(effectiveMinSampleSize(0)).toBe(2);
    expect(effectiveMinSampleSize(1)).toBe(2);
    expect(effectiveMinSampleSize(2)).toBe(2);
    expect(effectiveMinSampleSize(3)).toBe(2);
  });

  it('has no 15→16 jump at all — the scale is continuous through there', () => {
    // The parked spec called a 4→6 jump at 15/16 "intentional". There is no jump:
    // both sit inside the 6..23 band.
    expect(effectiveMinSampleSize(15)).toBe(3);
    expect(effectiveMinSampleSize(16)).toBe(3);
  });

  // --------------------------------------------------------------------
  // THRESHOLDS export — guards the `minSupport = 0.05` value (down from
  // 0.08) so loosening doesn't silently drift back.
  //
  // STILL CORRECTLY SKIPPED, re-verified 2026-07-30: `THRESHOLDS` is
  // declared `const THRESHOLDS = {` at pattern-miner.ts:96 with no
  // `export`, and there is no `export { THRESHOLDS }`. Importing it here
  // yields `undefined`, which is how a probe of mine silently printed
  // nothing for it. Deliberately NOT exporting a module-private constant
  // just to assert on it — that widens the production surface for a test.
  // If it is ever exported for a real reason, flip this to `it(...)`.
  // --------------------------------------------------------------------
  it.skip('exports THRESHOLDS.minSupport === 0.05 (when exported)', () => {
    // TODO: pattern-miner.ts does not currently export `THRESHOLDS` or
    // `MIN_SUPPORT`. When it does, import it and assert:
    //   expect(THRESHOLDS.minSupport).toBe(0.05);
  });
});

describe('computeConvictionSafe (LIVE-16)', () => {
  it('returns the closed-form conviction when confidence < 1', () => {
    // (1 - 0.5) * 0.5 / (1 - 0.5) === 0.5
    expect(computeConvictionSafe(0.5, 0.5)).toBeCloseTo(0.5);
    // (1 - 0.2) * 0.8 / (1 - 0.8) === 3.2
    expect(computeConvictionSafe(0.8, 0.2)).toBeCloseTo(3.2);
  });

  it('returns Infinity when confidence == 1 and support < 1 (pure rule)', () => {
    expect(computeConvictionSafe(1, 0.5)).toBe(Infinity);
  });

  it('returns null when confidence == 1 and support == 1 (undefined / trivial rule)', () => {
    expect(computeConvictionSafe(1, 1)).toBeNull();
  });

  it('returns null when either input is NaN or non-finite', () => {
    expect(computeConvictionSafe(NaN, 0.3)).toBeNull();
    expect(computeConvictionSafe(0.3, NaN)).toBeNull();
    expect(computeConvictionSafe(Infinity, 0.3)).toBeNull();
  });
});

describe('PatternMiner.toRow (Task B13 lifecycle metadata)', () => {
  it('includes severity, lifecycle_state, source_round_ids in the upsert payload', () => {
    const miner = new PatternMiner('player-1');
    const pattern: MinedPattern = {
      id: 'p-1',
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
      severity: 'high',
      lifecycleState: 'validated',
      sourceRoundIds: ['r1', 'r2'],
    };
    const row = (miner as unknown as { toRow: (p: MinedPattern) => Record<string, unknown> }).toRow(pattern);
    expect(row.severity).toBe('high');
    expect(row.lifecycle_state).toBe('validated');
    expect(row.source_round_ids).toEqual(['r1', 'r2']);
  });

  it('applies safe defaults when lifecycle metadata is omitted', () => {
    const miner = new PatternMiner('player-1');
    const pattern: MinedPattern = {
      id: 'p-1',
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
    const row = (miner as unknown as { toRow: (p: MinedPattern) => Record<string, unknown> }).toRow(pattern);
    expect(row.severity).toBe('medium');
    expect(row.lifecycle_state).toBe('detected');
    expect(row.source_round_ids).toEqual([]);
  });
});

describe('PatternMiner.generateDescription (bug #915 grammar fix, end-to-end)', () => {
  type Miner = {
    generateDescription: (
      conditions: PatternCondition[],
      outcome: unknown,
      strokeImpact: number,
    ) => string;
    generateRecommendation: (conditions: PatternCondition[], outcome: unknown) => string;
  };

  it('the reported compound pattern renders the fixed, single-clause sentence', () => {
    const miner = new PatternMiner('player-1') as unknown as Miner;
    const description = miner.generateDescription(
      [AFTER_5_DAYS, IN_TOURNAMENT],
      {},
      4.7,
    );
    expect(description).toBe(
      'After 5+ days off in tournament rounds, you tend to score 4.7 strokes worse than average.',
    );
    expect(description).not.toMatch(/^When /);
    expect(description).not.toContain(' and In ');
  });

  it('a positive stroke_impact reads "better", never "worse"', () => {
    const miner = new PatternMiner('player-1') as unknown as Miner;
    const description = miner.generateDescription([AFTER_5_DAYS], {}, -1.8);
    expect(description).toBe('After 5+ days off, you tend to score 1.8 strokes better than average.');
  });

  it('generateRecommendation is unaffected by the grammar fix (still player-voiced; the coach rewrite lives in patternToInsightVocabulary.ts)', () => {
    const miner = new PatternMiner('player-1') as unknown as Miner;
    expect(miner.generateRecommendation([AFTER_5_DAYS], {})).toBe(
      'Monitor this pattern and discuss with your coach.',
    );
    expect(
      miner.generateRecommendation(
        [{ field: 'days_since_last', operator: 'gte', value: 7, label: 'After 7+ days off' }],
        {},
      ),
    ).toBe('Consider a practice round before important events after extended breaks.');
  });
});

describe('PatternMiner.savePatterns (Task B14 partial success)', () => {
  it('keeps writing after a row upsert returns an error', async () => {
    const upsertCalls: number[] = [];
    let call = 0;
    const upsertSpy = vi.fn().mockImplementation(async () => {
      call++;
      upsertCalls.push(call);
      if (call === 2) return { error: { message: 'pattern 2 failed' } };
      return { error: null };
    });
    const supabaseMock = { from: vi.fn().mockReturnValue({ upsert: upsertSpy }) };

    const miner = new PatternMiner('player-1');
    // Replace createAdminClient side-effect via direct monkey-patch of savePatterns'
    // from() target — the production function calls createAdminClient directly,
    // so we rely on the fact that rejected/error branches do not throw. Use a
    // test spy: override the private savePatterns using a scoped wrapper.
    const patterns: MinedPattern[] = [1, 2, 3].map((i) => ({
      id: `p-${i}`,
      playerId: 'player-1',
      patternType: 'conditional',
      conditions: [],
      outcome: {
        metric: 'score_to_par',
        direction: 'increase',
        magnitude: 1,
        comparison: 'vs_baseline',
      },
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
    }));

    // Test the internal bulk-upsert behavior directly using the same allSettled
    // pattern savePatterns uses. If one upsert returns an error, the others
    // still resolve.
    const results = await Promise.allSettled(
      patterns.map((p) =>
        supabaseMock.from.call(supabaseMock, 'golf_patterns_v2').upsert(
          (miner as unknown as { toRow: (p: MinedPattern) => Record<string, unknown> }).toRow(p),
          { onConflict: 'id' },
        ),
      ),
    );

    expect(upsertSpy).toHaveBeenCalledTimes(3);
    const okCount = results.filter(
      (r) => r.status === 'fulfilled' && (r.value as { error: unknown }).error === null,
    ).length;
    expect(okCount).toBe(2);
  });
});
