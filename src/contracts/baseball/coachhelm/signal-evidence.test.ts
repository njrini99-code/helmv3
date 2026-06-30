// =============================================================================
// src/contracts/baseball/coachhelm/signal-evidence.test.ts
//
// PRODUCT TRUTH THIS FILE PINS:
//   1. The Signal Inbox is a TRIAGE workspace, not a dump of every diagnostic
//      insight — only `medium`/`high`/`urgent` engine candidates are promoted
//      to a `baseball_signals` row; `low` priority never creates triage work.
//   2. A numeric signal whose evidence sample is below
//      `SIGNAL_SAMPLE_TOO_SMALL_THRESHOLD` is surfaced with
//      `disposition: 'sample_too_small'` — visible, but never authoritative.
//   3. Every promoted signal carries an evidence/source-ref citation; nothing
//      reaches the inbox as a bare, unsourced claim.
//   4. "Honest mode" confidence (`factors_measured === false`) never fabricates
//      a variance floor — `calcConfidence` drops the placeholder term.
//
// Source of truth: `signalFromInsight` in
// `src/lib/baseball/signal-from-insight.ts`; `calcConfidence` in
// `src/lib/coachhelm/shared/evidence-types.ts`.
//
// NOTE: `PROMOTE_PRIORITIES` is an internal (non-exported) constant in
// signal-from-insight.ts — this file pins the promotion gate through the
// PUBLIC `signalFromInsight` behavior rather than importing a private symbol.
// =============================================================================

import { describe, expect, it } from 'vitest';
import {
  signalFromInsight,
  SIGNAL_SAMPLE_TOO_SMALL_THRESHOLD,
  type SignalFromInsightOptions,
} from '@/lib/baseball/signal-from-insight';
import { calcConfidence, type InsightConfidenceFactors } from '@/lib/coachhelm/shared/evidence-types';
import type { BaseballInsightCandidate } from '@/lib/coachhelm/baseball/generators';
import type { InsightPriority } from '@/lib/coachhelm/shared/evidence-types';

function candidateFixture(
  overrides: Partial<BaseballInsightCandidate> = {},
): BaseballInsightCandidate {
  return {
    generator: 'two_strike_chase',
    playerId: 'p1',
    insightType: 'coachhelm_two_strike_chase',
    title: 'Two-strike chase rate is elevated',
    body: 'Chasing pitches out of the zone with two strikes more than the team average.',
    priority: 'medium',
    confidence: 0.8,
    playerVisible: false,
    evidence: {
      sample_n: 12,
      target_n: 20,
      confidence_factors: { sample_adequacy: 0.6, recency: 1, variance: 0.5 },
      diagnosis: {
        symptom: 'Two-strike chase rate is 38% over the last 12 at-bats.',
        root_cause: 'Elevated chase rate on two-strike counts.',
        causality_level: 'inferred_hypothesis',
        drivers: [
          {
            metric: 'two_strike_chase_pct',
            value: 38,
            unit: 'percent',
            sample_n: 12,
            source: 'baseball_box_score_batting',
          },
        ],
        recommended_action: 'Add a two-strike approach drill.',
        confidence_reason: 'Sample adequacy 0.6 of target 20.',
      },
      causality_level: 'inferred_hypothesis',
      source_refs: [
        {
          table: 'baseball_box_score_batting',
          column: 'k',
          sample_n: 12,
          confidence: 0.8,
          label: 'Last 12 at-bats (box score)',
          visibility: 'staff_only',
        },
      ],
    },
    ...overrides,
  };
}

function opts(overrides: Partial<SignalFromInsightOptions> = {}): SignalFromInsightOptions {
  return {
    teamId: 'team-1',
    createdByUserId: 'user-1',
    dedupeKey: 'two_strike_chase:p1',
    nowIso: '2026-04-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('Signal promotion gate (#377) — only medium/high/urgent create triage work', () => {
  it('low priority never creates a signal', () => {
    const row = signalFromInsight(candidateFixture({ priority: 'low' }), opts());
    expect(row).toBeNull();
  });

  it.each<InsightPriority>(['medium', 'high', 'urgent'])(
    '%s priority is promoted to a signal row',
    (priority) => {
      const row = signalFromInsight(candidateFixture({ priority }), opts());
      expect(row).not.toBeNull();
    },
  );
});

describe('Minimum-sample honesty (#377) — sample_too_small is surfaced, never authoritative', () => {
  it('SIGNAL_SAMPLE_TOO_SMALL_THRESHOLD is 6 (matches signal-inbox.ts honesty floor)', () => {
    expect(SIGNAL_SAMPLE_TOO_SMALL_THRESHOLD).toBe(6);
  });

  it('a sample below the threshold gets disposition sample_too_small', () => {
    const row = signalFromInsight(
      candidateFixture({
        priority: 'high',
        evidence: {
          ...candidateFixture().evidence,
          sample_n: SIGNAL_SAMPLE_TOO_SMALL_THRESHOLD - 1,
        },
      }),
      opts(),
    );
    expect(row).not.toBeNull();
    expect(row?.disposition).toBe('sample_too_small');
  });

  it('a sample at/above the threshold is NOT sample_too_small', () => {
    const row = signalFromInsight(
      candidateFixture({
        priority: 'high',
        evidence: {
          ...candidateFixture().evidence,
          sample_n: SIGNAL_SAMPLE_TOO_SMALL_THRESHOLD,
        },
      }),
      opts(),
    );
    expect(row).not.toBeNull();
    expect(row?.disposition).not.toBe('sample_too_small');
  });
});

describe('Evidence citation (#377) — every promoted signal carries a source ref', () => {
  it('a promoted signal carries source_refs derived from the insight evidence', () => {
    const row = signalFromInsight(candidateFixture({ priority: 'medium' }), opts());
    expect(row).not.toBeNull();
    const refs = row?.source_refs as unknown as Array<Record<string, unknown>>;
    expect(Array.isArray(refs)).toBe(true);
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.some((r) => r.source_table === 'baseball_box_score_batting')).toBe(true);
  });

  it('when persisted, the signal additionally cites the insight row it was promoted from', () => {
    const row = signalFromInsight(
      candidateFixture({ priority: 'medium' }),
      opts({ insightId: 'insight-1' }),
    );
    const refs = row?.source_refs as unknown as Array<Record<string, unknown>>;
    expect(refs.some((r) => r.source_table === 'baseball_coach_insights' && r.source_id === 'insight-1')).toBe(
      true,
    );
  });
});

describe('calcConfidence honest mode (#377) — never fabricates a variance floor', () => {
  it('factors_measured=false drops the placeholder variance term', () => {
    const honest: InsightConfidenceFactors = {
      sample_adequacy: 0.5,
      recency: 1,
      variance: 0.9, // a placeholder the caller stuffed in — must be ignored
      factors_measured: false,
    };
    const score = calcConfidence({ confidence_factors: honest });
    // recency >= 1 -> the honest-mode branch returns sample_adequacy alone,
    // clamped [0,1] — NOT the legacy 0.4/0.3/0.3 blend that would bake the
    // fabricated 0.9 variance into the score.
    expect(score).toBeCloseTo(0.5, 5);
  });

  it('factors_measured=true (or omitted) keeps the legacy measured blend', () => {
    const measured: InsightConfidenceFactors = {
      sample_adequacy: 0.5,
      recency: 1,
      variance: 0.9,
      factors_measured: true,
    };
    const score = calcConfidence({ confidence_factors: measured });
    expect(score).toBeCloseTo(0.4 * 0.5 + 0.3 * 1 + 0.3 * 0.9, 5);
  });

  it('honest mode still honors a genuinely decayed recency (< 1)', () => {
    const decayed: InsightConfidenceFactors = {
      sample_adequacy: 0.8,
      recency: 0.5,
      variance: 0.9,
      factors_measured: false,
    };
    const score = calcConfidence({ confidence_factors: decayed });
    expect(score).toBeCloseTo((0.4 * 0.8 + 0.3 * 0.5) / 0.7, 5);
  });
});
