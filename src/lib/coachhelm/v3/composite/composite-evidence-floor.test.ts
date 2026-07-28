/**
 * Contract guard: a composite rule must never compose evidence that the
 * platform evidence floor will refuse.
 *
 * `upsertInsight` enforces `MIN_SAMPLE_N` (see
 * docs/architecture/coachhelm-evidence-contract.md) by THROWING an
 * `InsightEvidenceRefusal`. A rule whose own detect() gate sits below that
 * floor therefore fires, composes, and is then rejected on every single run —
 * it can never publish. Worse, `synthesizeForPlayer` counts the throw and its
 * stale-composite scope sweep only runs on `errors === 0`, so one
 * permanently-refusing rule silently disables stale-insight retraction for
 * that player forever.
 *
 * The fix is to DECLINE honestly in detect() (the floor is a real evidence
 * threshold), never to clamp `sample_n` up — see the contract doc: "A pattern
 * with one real observation MUST NOT become an insight claiming sample_n: 5."
 */

import { describe, it, expect } from 'vitest';
import { MIN_SAMPLE_N } from '@/lib/coachhelm/v2/insights/upsert';
import { COMPOSITE_RULES } from './registry';
import type { CompositeContext, HoleScore } from './types';

const EMPTY_INSIGHTS: never[] = [];

/** Build a full 18-hole round with a per-hole to-par delta function. */
function round(roundId: string, toParAt: (hole: number) => number): HoleScore[] {
  return Array.from({ length: 18 }, (_, i) => {
    const hole = i + 1;
    const par = 4;
    return { round_id: roundId, hole_number: hole, par, score: par + toParAt(hole) };
  });
}

function ctx(partial: Partial<CompositeContext>): CompositeContext {
  return {
    hole_scores: [],
    short_game_shots: [],
    flyer_lie_shots: [],
    ...partial,
  };
}

/** Round ids for a run of `n` rounds. */
function roundIds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `r${i + 1}`);
}

describe('composite rules · evidence floor', () => {
  it('MIN_SAMPLE_N is the exported floor upsertInsight enforces', () => {
    expect(MIN_SAMPLE_N).toBe(5);
  });

  /**
   * The two hole-sequence rules gate on distinct-round count and then report
   * that same count as `sample_n`. Below the floor they must stay silent
   * rather than compose evidence that is guaranteed to be refused.
   */
  const holeSequenceRules = [
    {
      id: 'closing_hole_fatigue',
      // holes 13-18 play +1.0 to par worse than 1-12
      toParAt: (hole: number) => (hole >= 13 ? 1 : 0),
    },
    {
      id: 'front_9_starter',
      // holes 1-3 play +2.0 to par worse than the rest
      toParAt: (hole: number) => (hole <= 3 ? 2 : 0),
    },
  ];

  for (const { id, toParAt } of holeSequenceRules) {
    const rule = COMPOSITE_RULES.find((r) => r.id === id);

    it(`${id} exists in the rule registry`, () => {
      expect(rule).toBeDefined();
    });

    for (let rounds = 1; rounds < MIN_SAMPLE_N; rounds += 1) {
      it(`${id} stays silent at ${rounds} round(s) — below the sample floor`, () => {
        const hole_scores = roundIds(rounds).flatMap((rid) => round(rid, toParAt));
        expect(rule!.detect(EMPTY_INSIGHTS, ctx({ hole_scores }))).toBeNull();
      });
    }

    it(`${id} fires at the floor (${MIN_SAMPLE_N} rounds) with publishable sample_n`, () => {
      const hole_scores = roundIds(MIN_SAMPLE_N).flatMap((rid) => round(rid, toParAt));
      const match = rule!.detect(EMPTY_INSIGHTS, ctx({ hole_scores }));
      expect(match).not.toBeNull();

      const composed = rule!.compose(match!);
      expect(composed.evidence.sample_n).toBeGreaterThanOrEqual(MIN_SAMPLE_N);
    });
  }
});
