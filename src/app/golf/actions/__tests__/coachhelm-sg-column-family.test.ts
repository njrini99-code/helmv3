import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateTeamPatterns, type StatsRow } from '@/lib/coachhelm/v2/mining/team-pattern-generator';
import { generateTeamForecasts } from '@/lib/coachhelm/v2/prediction/team-forecaster';

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
 * The insights action keeps its statistic composer private so it cannot become
 * a publicly callable server action. Its source contract therefore asserts the
 * exact per-round read sites, while the public pattern and forecast helpers
 * below exercise the same column-family behavior with fixtures.
 */

const PER_ROUND_APPROACH_SG = -6.6;
const ROUNDS_IN_CALCULATION = 13;
const CUMULATIVE_APPROACH_SG = -85.8; // -6.6 * 13 — the incident's own arithmetic
const insightsSource = readFileSync(new URL('../insights.ts', import.meta.url), 'utf8');
const buildStatInsightsStart = insightsSource.indexOf('function buildStatInsightsForTeam(');
const buildStatInsightsEnd = insightsSource.indexOf(
  '// ============================================================================\n// ACKNOWLEDGE COMPOSED INSIGHT',
  buildStatInsightsStart,
);
const buildStatInsightsSource = insightsSource.slice(buildStatInsightsStart, buildStatInsightsEnd);

/** Full StatsRow fixture for generateTeamPatterns/generateTeamForecasts — a
 * wider shape than PlayerStatsCacheRow (mirrors the real Supabase select,
 * which fetches every column both call sites need from one query). */
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

  it('reads every team SG average from the per-round column family', () => {
    expect(buildStatInsightsStart).toBeGreaterThanOrEqual(0);
    expect(buildStatInsightsEnd).toBeGreaterThan(buildStatInsightsStart);

    for (const column of [
      'sg_total_per_round',
      'sg_tee_per_round',
      'sg_approach_per_round',
      'sg_around_green_per_round',
      'sg_putting_per_round',
    ]) {
      expect(buildStatInsightsSource).toContain(`statsRows.map((row) => row.${column})`);
    }

    expect(buildStatInsightsSource).not.toContain('statsRows.map((row) => row.strokes_gained_');
  });

  it('keeps the team-weakness threshold on the per-round team average', () => {
    expect(buildStatInsightsSource).toContain('value: teamAverages.sgApproach');
    expect(buildStatInsightsSource).toContain('if ((teamWeakness.value as number) < -0.3)');
    expect(buildStatInsightsSource).toContain('per round');
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

  it('generateTeamForecasts only flags "Elite Putting" at a per-round threshold', () => {
    const forecastPlayers = [{ id: 'p1', first_name: 'A', last_name: 'One' }];
    // A cumulative SUM of +6.5 over 13 rounds is really +0.5/round — right at
    // the >0.5 threshold boundary, so use a clearly-below-threshold per-round
    // value to prove the forecaster reads the per-round column, not the sum.
    const forecastStats: StatsRow[] = [makeFullStatsRow({ player_id: 'p1', sg_putting_per_round: 0.2 })];
    const forecasts = generateTeamForecasts(forecastPlayers, forecastStats, []);
    const elitePutting = forecasts
      .flatMap((f) => f.keyFactors ?? [])
      .find((s) => s.name === 'Elite Putting');
    expect(elitePutting).toBeUndefined();
  });
});
