import { describe, expect, it } from 'vitest';
import { generateTeamPatterns, type StatsRow } from '@/lib/coachhelm/v2/mining/team-pattern-generator';

/**
 * Regression coverage for #1297 / #1300 — "GolfHelm/CoachHelm: SG source
 * mismatch breaks stats coherence".
 *
 * Root cause (verified 2026-08-21 against production migration
 * supabase/migrations/20260527000000_prod_public_baseline.sql, functions
 * `update_player_stats_strokes_gained()`): golf_player_stats_cache carries
 * TWO strokes-gained column families written atomically, in the same
 * UPDATE, from the same golf_round_stats_cache query — there is no
 * write-path staleness between them:
 *   - strokes_gained_total/tee/approach/around_green/putting = SUM across
 *     every completed round in the calculation window (season-cumulative).
 *   - sg_total_per_round/sg_tee_per_round/... = AVG across the same rounds
 *     (per-round rate).
 *
 * The incident's filed numbers (-6.6 dashboard vs. -85.84 CoachHelm) are
 * exactly SUM = AVG * rounds_in_calculation (-85.84 / -6.6 ~= 13.01 rounds).
 * The bug was never a data-integrity problem — it was CoachHelm's V2 engine
 * (insights.ts, team-pattern-generator.ts, team-forecaster.ts) reading the
 * cumulative family and presenting/thresholding it as if it were the
 * per-round rate, while the dashboard and CoachHelm v3 chat metrics catalog
 * correctly read the per-round family.
 *
 * 2026-09-22 (fix #6, dead-code cleanup): `insights.ts`'s private statistic
 * composer `buildStatInsightsForTeam` and the `generateTeamForecasts`
 * (team-forecaster.ts) call site were both exclusively reachable from
 * `generateTeamInsight()` — a server action whose last UI caller
 * (`IntelligenceCommandCenter.tsx`) was deleted 2026-07-23 (#1009) and never
 * replaced. All three were removed as dead code, along with this file's
 * source-contract assertions against `buildStatInsightsForTeam` and its
 * `generateTeamForecasts` fixture test. `generateTeamPatterns`
 * (team-pattern-generator.ts) lost its own only caller in the same cleanup
 * but is left in place, untested-in-production or not, as a lib export this
 * fix's scope didn't ask for — its regression coverage below stays useful
 * documentation of the column-family contract for whoever wires it up next.
 */

const PER_ROUND_APPROACH_SG = -6.6;
const ROUNDS_IN_CALCULATION = 13;
const CUMULATIVE_APPROACH_SG = -85.8; // -6.6 * 13 — the incident's own arithmetic

/** Full StatsRow fixture for generateTeamPatterns — a wider shape than
 * PlayerStatsCacheRow (mirrors the real Supabase select). */
function makeFullStatsRow(overrides: Partial<StatsRow> = {}): StatsRow {
  return {
    player_id: 'player-1',
    rounds_in_calculation: ROUNDS_IN_CALCULATION,
    scoring_average: 74,
    scoring_average_vs_par: 2,
    sg_total_per_round: PER_ROUND_APPROACH_SG,
    sg_tee_per_round: 0,
    sg_approach_per_round: PER_ROUND_APPROACH_SG,
    sg_around_green_per_round: 0,
    sg_putting_per_round: 0,
    gir_percentage: null,
    driving_accuracy_percentage: null,
    scrambling_percentage: null,
    putts_per_round: null,
    approach_proximity_average: null,
    three_putt_percentage: null,
    penalty_strokes_per_round: null,
    putt_make_pct_5_10ft: null,
    putt_make_pct_10_15ft: null,
    putt_make_pct_15_25ft: null,
    approach_miss_left_pct: null,
    approach_miss_right_pct: null,
    approach_miss_short_pct: null,
    approach_miss_long_pct: null,
    par3_average: null,
    par4_average: null,
    par5_average: null,
    last_5_average: null,
    improvement_trend: null,
    trend_direction: null,
    best_round: null,
    worst_round: null,
    ...overrides,
  };
}

describe('CoachHelm V2 SG column family (#1297 / #1300)', () => {
  it('reproduces the incident arithmetic: cumulative SUM = per-round AVG * rounds', () => {
    expect(CUMULATIVE_APPROACH_SG).toBeCloseTo(PER_ROUND_APPROACH_SG * ROUNDS_IN_CALCULATION, 5);
  });

  it('generateTeamPatterns compares SG against the per-round team average, not a cumulative sum', () => {
    // Team of 3 so the "well below team average" (>0.8 gap) detector has a
    // real baseline; one player's around-green is meaningfully worse.
    const patternPlayers = [
      { id: 'p1', first_name: 'A', last_name: 'One' },
      { id: 'p2', first_name: 'B', last_name: 'Two' },
      { id: 'p3', first_name: 'C', last_name: 'Three' },
    ];
    const patternStats: StatsRow[] = [
      makeFullStatsRow({ player_id: 'p1', sg_around_green_per_round: 0.5 }),
      makeFullStatsRow({ player_id: 'p2', sg_around_green_per_round: 0.6 }),
      makeFullStatsRow({ player_id: 'p3', sg_around_green_per_round: -1.0 }),
    ];
    const patterns = generateTeamPatterns(patternPlayers, patternStats, []);
    const weaknessPattern = patterns.find((p) => p.id === 'pattern-sg-arg-weakness-p3');
    expect(weaknessPattern).toBeDefined();
    // Description interpolates the raw value — must be the per-round figure.
    expect(weaknessPattern?.description).toContain('-1.0 SG:ARG');
    expect(weaknessPattern?.description).not.toMatch(/-1[0-9]\.\d SG:ARG/);
  });
});
