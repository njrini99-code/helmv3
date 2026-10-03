import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';
import type { LoadedGenome } from '@/lib/coachhelm/v3/genome/loader';
import type { GenomeVector } from '@/lib/coachhelm/v3/genome/types';
import type { Goal } from '@/lib/coachhelm/v3/goals/types';
import type { MetricId } from '@/lib/coachhelm/v3/metrics/registry';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import type { AssembledThemes, CauseNode, ThemeNode } from '@/lib/coachhelm/v3/themes/types';
import { SLOPE_METRIC, toChInsight } from '../data/coachhelm-map';
import { diveCounts, orderDive, themesByCategory, toChDeepInsight, type ChDeepDive, type ChDeepInsight, type ChDiveInputs, type DiveFocusRow, type DiveRoundRow } from '../data/coachhelm-dive-shape';
import { speak } from '../data/coachhelm-voice';
import { toChProfile, type ChProfile } from '../data/coachhelm-profile-shape';
import { toChStanding, type ChStandBaselineRead, type ChStanding } from '../data/coachhelm-standing-shape';
import type { ChViewLoad } from '../data/coachhelm-views-shape';
import { bigNumber, breakBias, PREVIEW_TOUR, penalties, slope } from './fixtures-coachhelm';

/**
 * Sample data for the player's CoachHelm views (Game profile, Standing, Deep dive). Each fixture is the stored shape the loader reads
 * (a genome row, the standing rows) run through the same mapper the page runs, so a preview cannot draw what the page cannot.
 */

/** The day the fixtures were read: "refreshed" wording is relative to it. */
export const VIEWS_NOW = new Date('2026-10-01T15:00:00Z');

// ── Game profile ───────────────────────────────────────────────────────────

const FULL_VECTOR: GenomeVector = {
  miss_side_bias: { value: -0.42, confidence: 0.85, label: 'Left bias' },
  pressure_delta: { value: 0.82, confidence: 0.5, label: 'Tightens up' },
  scrambling_rate: { value: 0.438, confidence: 0.9, label: 'Wizard' },
  par3_proficiency: { value: -0.38, confidence: 1, label: 'Under par' },
  back_nine_delta: { value: 0.31, confidence: 0.7, label: 'Fades late' },
  scoring_trend: { value: -0.64, confidence: 0.33, label: 'Improving' },
  driver_usage: { value: 0.62, confidence: 0.95, label: 'Mixed' },
};

const genome = (vector: GenomeVector, rounds = 14): LoadedGenome => ({ player_id: 'pl-jonah', vector, computed_at: '2026-09-30T02:30:00Z', rounds_basis: rounds });
const PARTIAL_VECTOR: GenomeVector = {
  ...FULL_VECTOR,
  pressure_delta: { value: null, confidence: null },
  scoring_trend: { value: null, confidence: null },
  miss_side_bias: { value: null, confidence: null },
};

export const PREVIEW_PROFILE: ChProfile = toChProfile(genome(FULL_VECTOR), VIEWS_NOW);
export const PREVIEW_PROFILE_PARTIAL: ChProfile = toChProfile(genome(PARTIAL_VECTOR, 6), VIEWS_NOW);
export const PREVIEW_PROFILE_EMPTY: ChProfile = toChProfile(null, VIEWS_NOW);
/** Values at the edge of their scales: bounds, not measurements. */
export const PREVIEW_PROFILE_EDGE: ChProfile = toChProfile(
  genome({ ...FULL_VECTOR, pressure_delta: { value: 3, confidence: 1, label: 'Tightens up' }, back_nine_delta: { value: -2, confidence: 1, label: 'Closes strong' } }),
  VIEWS_NOW,
);

export const profileLoad = (data: ChProfile): ChViewLoad<ChProfile> => ({ status: 'ready', data });

// ── Standing ───────────────────────────────────────────────────────────────

/** A `golf_player_standing` row as `loadPlayerStandingMap` returns it: the player, the team's average and rank, and the Tour's value. */
export const standingRow = (id: MetricId, you: number, pga: number, team: { avg: number; n: number; pct: number } | null, extra: Partial<PlayerStanding> = {}): PlayerStanding => ({
  player_id: 'pl-jonah',
  metric_id: id,
  player_value: you,
  team_avg: team?.avg ?? null,
  team_n: team?.n ?? 0,
  team_pct: team?.pct ?? null,
  level_avg: null,
  level_n: 0,
  level_pct: null,
  pga_value: pga,
  pga_delta: you - pga,
  computed_at: '2026-09-30T02:30:00Z',
  ...extra,
});

const T = (avg: number, pct: number, n = 9) => ({ avg, n, pct });

/** A college player's standing: ahead of the Tour nowhere much, ahead of the team on most, with every kind of row the page draws. */
export const STANDING_ROWS: PlayerStanding[] = [
  standingRow('sg_total', -2.14, 0, T(-3.2, 78)),
  standingRow('sg_ott', -0.42, 0, T(-0.9, 67)),
  standingRow('sg_approach', -0.91, 0, T(-1.1, 56)),
  standingRow('sg_around_green', -0.18, 0, T(-0.5, 78)),
  standingRow('sg_putting', -0.63, 0, T(-0.7, 56)),
  standingRow('putts_made_3_5ft_pct', 71, 88, T(66, 70)),
  standingRow('putts_made_5_10ft_pct', 38, 51, T(35, 67)),
  standingRow('putts_made_10_15ft_pct', 21, 26, T(19, 56)),
  standingRow('putts_made_15_25ft_pct', 9, 12, T(8, 56)),
  standingRow('approach_proximity_50_125ft', 31, 22, T(34, 67), { basis: 'on_green', pga_omitted: true, pga_omitted_reason: 'basis_mismatch' }),
  standingRow('approach_proximity_125_175ft', 47, 34, T(52, 78), { basis: 'all_shot' }),
  standingRow('gir_pct', 58, 66, T(52, 89)),
  standingRow('scrambling_pct_sand', 41, 50, T(44, 33, 3)),
  standingRow('penalty_rate_per_round', 1.1, 0.2, T(0.8, 33)),
  standingRow('big_number_rate', 11, 4, T(9, 44)),
  standingRow('scoring_par_3', 3.24, 3.05, T(3.31, 67)),
  standingRow('scoring_par_4', 4.31, 4.1, T(4.4, 67)),
  standingRow('scoring_par_5', 4.9, 4.6, T(5.0, 56)),
  standingRow('practice_tournament_delta', 0.82, 0, T(1.1, 67)),
  standingRow('opening_hole_delta', 0.3, 0, null),
];

const BASELINE: ChStandBaselineRead = { status: 'ok', roundsPlayed: 14, scoringAverage: 77.2 };

export const PREVIEW_STANDING: ChStanding = toChStanding(STANDING_ROWS, BASELINE);
/** Three rounds in: every comparison draws, no projection does, and the page says it is an early read. */
export const PREVIEW_STANDING_EARLY: ChStanding = toChStanding(STANDING_ROWS.slice(0, 8), { status: 'ok', roundsPlayed: 3, scoringAverage: 80.4 });
export const PREVIEW_STANDING_EMPTY: ChStanding = toChStanding([], { status: 'ok', roundsPlayed: 2, scoringAverage: null });
/** A women's team: the LPGA's values, and the metrics with no women's benchmark say so instead of drawing the men's. */
export const PREVIEW_STANDING_WOMENS: ChStanding = toChStanding(
  STANDING_ROWS.map((r) => (r.metric_id === 'big_number_rate' || r.metric_id === 'scoring_par_4' ? { ...r, pga_omitted: true, pga_omitted_reason: 'no_womens_anchor' as const, is_womens: true } : { ...r, is_womens: true })),
  BASELINE,
);
/** The scoring-average read failed: the rows still draw, with no projections and a notice. */
export const PREVIEW_STANDING_NOBASELINE: ChStanding = toChStanding(STANDING_ROWS, { status: 'failed' });

export const standingLoad = (data: ChStanding): ChViewLoad<ChStanding> => ({ status: 'ready', data });

// ── Deep dive ──────────────────────────────────────────────────────────────

const JONAH = 'pl-jonah';
const named = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${String(i + 1).padStart(2, '0')}`);
const round = (n: number, date: string, course: string, total: number, toPar: number, holes = 18): DiveRoundRow => ({
  id: `rd-${String(n).padStart(2, '0')}`,
  round_date: date,
  course_name: course,
  total_score: total,
  score_to_par: toPar,
  holes_played: holes,
});
/** The rounds the loader reads for the first insights' ids: the newest twelve Jonah has (one a nine, one under par). */
export const DIVE_ROUND_ROWS: DiveRoundRow[] = [
  round(1, '2026-09-28', 'Oak Hollow', 74, 2),
  round(2, '2026-09-21', 'Oak Hollow', 77, 5),
  round(3, '2026-09-14', 'Pine Ridge', 72, 0),
  round(4, '2026-09-07', 'Pine Ridge', 75, 3),
  round(5, '2026-08-31', 'Lakeshore', 71, -1),
  round(6, '2026-08-24', 'Oak Hollow', 79, 7),
  round(7, '2026-08-17', 'Lakeshore', 38, 2, 9),
  round(8, '2026-08-10', 'Pine Ridge', 78, 6),
  round(9, '2026-08-03', 'Oak Hollow', 80, 8),
  round(10, '2026-07-27', 'Lakeshore', 76, 4),
  round(11, '2026-07-20', 'Pine Ridge', 79, 7),
  round(12, '2026-07-13', 'Oak Hollow', 81, 9),
];

const evidenceOf = (ins: EvidenceInsight, extra: Partial<InsightEvidence>): EvidenceInsight => ({ ...ins, evidence: { ...ins.evidence, ...extra } });

/** The insights Jonah's Board draws, with what the generators also write: the rounds they were made from, a window, a diagnosis, a movement, an outcome. */
export const DIVE_SLOPE: EvidenceInsight = {
  ...evidenceOf(slope(JONAH), {
    source_round_ids: [...DIVE_ROUND_ROWS.map((r) => r.id), 'rd-13', 'rd-14'],
    window_start: '2026-07-05',
    window_end: '2026-10-01',
    diagnosis: {
      symptom: 'Downhill putts inside 4-6 ft go in far less often than level ones',
      root_cause: 'It looks like a pace-control pattern rather than a green-reading one: the gap shows up inside 6 ft and not beyond it, where line matters more than speed',
      causality_level: 'inferred_hypothesis',
      drivers: [
        { metric: 'putts_made_4_6ft_downhill_pct', label: 'Downhill make rate, 4-6 ft', value: 58, unit: 'percent', sample_n: 31, source: 'golf_putts' },
        { metric: 'putts_made_4_6ft_level_pct', label: 'Level make rate, 4-6 ft', value: 81, unit: 'percent', sample_n: 44, source: 'golf_putts' },
      ],
      recommended_action: 'Rehearse a downhill-only ladder',
      confidence_reason: 'Both groups have enough putts to compare, and a gap this size is not likely to be chance',
    },
  }),
  metadata: { movement: { from: 31, to: 23, direction: 'down', percent_change: -0.26 } },
};
export const DIVE_PENALTIES: EvidenceInsight = evidenceOf(penalties(JONAH), {
  source_round_ids: [...DIVE_ROUND_ROWS.map((r) => r.id), ...named('rd-y', 9)],
  diagnosis: {
    symptom: 'You average 1.1 penalty strokes a round',
    root_cause: 'Most of them come off the tee with the driver, on holes where the trouble is on the right',
    causality_level: 'observed_sequence',
    drivers: [
      { metric: 'penalty_rate_per_round', label: 'Penalties off the tee, per round', value: 0.8, unit: 'count', sample_n: 17, source: 'golf_holes' },
      { metric: 'penalty_rate_per_round', label: 'Penalties from the approach, per round', value: 0.3, unit: 'count', sample_n: 6, source: 'golf_holes' },
    ],
    recommended_action: 'Play to the wide side off the tee',
    confidence_reason: 'Twenty-one rounds is enough to trust an average this size',
  },
});
export const DIVE_BIG: EvidenceInsight = {
  ...evidenceOf(bigNumber(JONAH), { source_round_ids: [...DIVE_ROUND_ROWS.map((r) => r.id), ...named('rd-y', 9)] }),
  metadata: { movement: { from: 3.1, to: 1.6, direction: 'down', percent_change: -0.48 } },
  outcome_status: 'improved',
  outcome_measured_at: '2026-09-28T12:00:00Z',
};
/** A read that names no rounds (it uses lifetime stats), belongs to no plan and has no trend. */
export const DIVE_BREAK: EvidenceInsight = breakBias(JONAH);

export const DIVE_FOCUS: DiveFocusRow[] = [{ id: 'fa-1', title: 'Downhill putts inside 6 ft', status: 'active', from_insight_id: 'in-slope', target_metric: SLOPE_METRIC }];
export const DIVE_GOALS: Goal[] = [
  {
    id: 'gl-1',
    player_id: JONAH,
    team_id: null,
    created_by_user_id: 'u-jonah',
    creator_role: 'player',
    coach_id_if_assigned: null,
    metric_id: 'penalty_rate_per_round',
    title: 'Cut penalties to 0.8 a round',
    category: 'course_management',
    started_at: '2026-09-15T00:00:00Z',
    ends_at: '2026-11-15T00:00:00Z',
    window_days: 60,
    baseline_value: 1.1,
    current_value: 1.1,
    target_value: 0.8,
    target_source: 'manual',
    state: 'active',
    outcome_evaluated_at: null,
    shared_with_coach: false,
    shared_at: null,
    coach_assignment_mode: null,
    player_accepted_at: null,
    player_declined_at: null,
    origin: 'from_insight',
    origin_insight_id: 'in-pen',
    snapshots: [],
    created_at: '2026-09-15T00:00:00Z',
    updated_at: '2026-09-15T00:00:00Z',
  },
];

const themeNode = (n: Pick<ThemeNode, 'category' | 'displayLabel' | 'state'> & Partial<ThemeNode>): ThemeNode => ({
  sgMetricId: null,
  isOutcomeTheme: false,
  themeStrokesPerRound: 0,
  tourGapPerRound: 0,
  sgPerRound: null,
  causes: [],
  ...n,
});
/** The category reads the cascade assembles: putting is improving, course management has no trend, and the penalty cause carries what closing the gap to the team's average is worth (a cause with no team average would carry the Tour gap, 1.4). */
export const DIVE_THEMES: AssembledThemes = {
  playerId: JONAH,
  totalStrokesPerRound: 1.3,
  themes: [
    themeNode({
      category: 'putting',
      displayLabel: 'Putting',
      state: 'leak',
      sgPerRound: -0.42,
      trend: { direction: 'improving', recentAvg: -0.31, priorAvg: -0.62, delta: 0.31, recentN: 5, priorN: 5 },
    }),
    themeNode({
      category: 'course_management',
      displayLabel: 'Course management',
      state: 'leak',
      themeStrokesPerRound: 0.9,
      causes: [{ insight_id: 'in-pen', strokesSavedPerRound: 0.9, tourGapPerRound: 1.4, counterfactualSuppressed: false, standingPlayerValue: 1.1, standingPgaValue: 0.3, standingTeamAvgValue: 0.6 } as CauseNode],
    }),
  ],
};

const DRILL = 'Rehearse a downhill-only ladder: start 2 ft below the hole and add a foot at a time, focused on dying the ball into the front of the cup rather than a firm strike.';
const diveSay = (t: string) => speak(t, { role: 'player' });
const diveBase = (raw: EvidenceInsight, drillText: string | null = null) => toChInsight(raw, { drillText, tour: PREVIEW_TOUR, viewer: { role: 'player' } });
export type Inputs = Pick<ChDiveInputs, 'rounds' | 'focusAreas' | 'goals' | 'themes'>;
export const FULL_INPUTS: Inputs = { rounds: new Map(DIVE_ROUND_ROWS.map((r) => [r.id, r])), focusAreas: DIVE_FOCUS, goals: DIVE_GOALS, themes: DIVE_THEMES };
export const BARE_INPUTS: Inputs = { rounds: FULL_INPUTS.rounds, focusAreas: [], goals: [], themes: null };
const FAILED_INPUTS: Inputs = { rounds: new Map(), focusAreas: [], goals: [], themes: null };

export const deep = (raw: EvidenceInsight, inputs: Inputs, drillText: string | null = null) => toChDeepInsight(raw, diveBase(raw, drillText), inputs, diveSay);
export const diveOf = (list: ChDeepInsight[], over: Partial<ChDeepDive> = {}): ChDeepDive => {
  const ordered = orderDive(list);
  return { list: ordered, tour: 'Tour', rounds: null, themes: themesByCategory(DIVE_THEMES), roundsFailed: false, plansFailed: false, themesFailed: false, counts: diveCounts(ordered), ...over };
};

export const PREVIEW_DIVE: ChDeepDive = diveOf([deep(DIVE_SLOPE, FULL_INPUTS, DRILL), deep(DIVE_PENALTIES, FULL_INPUTS), deep(DIVE_BREAK, FULL_INPUTS), deep(DIVE_BIG, FULL_INPUTS)]);
/** The rounds, the plans and the category reads each failed to load: the insights still draw, and each part says so in place. */
export const PREVIEW_DIVE_PARTS_FAILED: ChDeepDive = diveOf([deep(DIVE_SLOPE, FAILED_INPUTS, DRILL), deep(DIVE_PENALTIES, FAILED_INPUTS), deep(DIVE_BIG, FAILED_INPUTS)], {
  themes: {},
  roundsFailed: true,
  plansFailed: true,
  themesFailed: true,
});
/** Two reads, no plan and no category read: what a player with a young account sees. */
export const PREVIEW_DIVE_YOUNG: ChDeepDive = diveOf([deep(DIVE_BREAK, BARE_INPUTS), deep(DIVE_BIG, BARE_INPUTS)], { themes: {} });
export const PREVIEW_DIVE_EMPTY: ChDeepDive = diveOf([], { rounds: 14, themes: {} });
export const PREVIEW_DIVE_NO_ROUNDS: ChDeepDive = diveOf([], { rounds: 0, themes: {} });

export const diveLoad = (data: ChDeepDive): ChViewLoad<ChDeepDive> => ({ status: 'ready', data });
