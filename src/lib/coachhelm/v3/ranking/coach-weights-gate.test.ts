/**
 * Code review follow-up on PR #1980: production's `golf_coachhelm_coach_weights`
 * has 4 rows (sample_n up to 36, weights 0.77-1.60) built entirely from v1's
 * outcome attribution — the pre-N10 formula that algebraically cancelled to
 * post-vs-ambient instead of the observed lift. Per the 2026-09-12 repair
 * plan §6.7 step 8, those weights must stay neutral (not multiply into
 * rank_score) until outcome quality under the corrected v2 attribution
 * justifies applying them again.
 *
 * `loadCoachWeightsForPlayer` (./score.ts) is now gated behind the existing
 * `coachhelm_learned_personalization` flag (default OFF everywhere). This
 * file proves: (1) flag off skips the Supabase round-trip entirely and
 * returns `{}`; (2) a live-production-shaped weight (1.6 @ sample_n 36)
 * does NOT change `scoreInsight`'s rank score when the flag is off — it is
 * bit-identical to the neutral default; (3) flag on still resolves and
 * applies a calibrated weight, so the gate only suppresses the read, it
 * doesn't break it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { isFlagEnabled } = vi.hoisted(() => ({ isFlagEnabled: vi.fn() }));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled }));

import { loadCoachWeightsForPlayer, scoreInsight, type RankableInsight } from './score';

const PLAYER_ID = 'player-1';
const TEAM_ID = 'team-1';
const COACH_ID = 'coach-1';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeSupabase(fromSpy: ReturnType<typeof vi.fn>): any {
  return { from: fromSpy };
}

/** Deliberately omits `metric`/`sample_n` so coachabilityBoost/sampleDamping
 * stay neutral (1.0) — isolates the coach_weight factor under test. */
function makeInsight(overrides: Partial<RankableInsight> = {}): RankableInsight {
  return {
    insight_type: 'putting_lag_distance',
    strokes_impact: 1.2,
    confidence: 0.8,
    priority: 'medium',
    ...overrides,
  };
}

describe('loadCoachWeightsForPlayer — gated behind coachhelm_learned_personalization', () => {
  let fromSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    isFlagEnabled.mockReset();
    fromSpy = vi.fn();
  });

  it('flag OFF: returns {} without querying Supabase at all', async () => {
    isFlagEnabled.mockReturnValue(false);
    const weights = await loadCoachWeightsForPlayer(makeSupabase(fromSpy), PLAYER_ID);

    expect(weights).toEqual({});
    expect(fromSpy).not.toHaveBeenCalled();
    expect(isFlagEnabled).toHaveBeenCalledWith('coachhelm_learned_personalization');
  });

  it("flag OFF: a live-production-shaped weight (1.6 @ sample_n 36) does not change scoreInsight's rank", async () => {
    isFlagEnabled.mockReturnValue(false);
    const weights = await loadCoachWeightsForPlayer(makeSupabase(fromSpy), PLAYER_ID);

    const insight = makeInsight();
    const scoreWithGatedWeights = scoreInsight(insight, weights);
    const scoreWithExplicitNeutral = scoreInsight(insight, {});
    const scoreIfWeightHadApplied = scoreInsight(insight, { putting_lag_distance: 1.6 });

    // Gated read is bit-identical to the neutral (1.0-for-everyone) case...
    expect(scoreWithGatedWeights).toBe(scoreWithExplicitNeutral);
    // ...and provably different from what the real prod weight would produce,
    // so this test would fail if the gate were removed or bypassed.
    expect(scoreWithGatedWeights).not.toBe(scoreIfWeightHadApplied);
    expect(scoreIfWeightHadApplied).toBeCloseTo(scoreWithGatedWeights * 1.6, 10);
  });

  it('flag ON: still resolves the coach and applies a calibrated weight', async () => {
    isFlagEnabled.mockReturnValue(true);
    fromSpy.mockImplementation((table: string) => {
      if (table === 'golf_team_members') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: { team_id: TEAM_ID }, error: null }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'golf_team_coach_staff') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: { coach_id: COACH_ID }, error: null }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'golf_coachhelm_coach_weights') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                gte: async () => ({
                  data: [{ insight_type: 'putting_lag_distance', weight: 1.6, sample_n: 36 }],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table in test: ${table}`);
    });

    const weights = await loadCoachWeightsForPlayer(makeSupabase(fromSpy), PLAYER_ID);
    expect(weights).toEqual({ putting_lag_distance: 1.6 });

    const insight = makeInsight();
    expect(scoreInsight(insight, weights)).toBeCloseTo(scoreInsight(insight, {}) * 1.6, 10);
  });
});
