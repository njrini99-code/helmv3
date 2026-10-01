import type { LoadedGenome } from '@/lib/coachhelm/v3/genome/loader';
import type { GenomeVector } from '@/lib/coachhelm/v3/genome/types';
import type { MetricId } from '@/lib/coachhelm/v3/metrics/registry';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import { toChProfile, type ChProfile } from '../data/coachhelm-profile-shape';
import { toChStanding, type ChStandBaselineRead, type ChStanding } from '../data/coachhelm-standing-shape';
import type { ChViewLoad } from '../data/coachhelm-views-shape';

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
