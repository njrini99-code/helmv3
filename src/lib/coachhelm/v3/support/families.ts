/**
 * Per-family support settings (02-accuracy-standard §7, 04 §2), keyed by the
 * insight row's `insight_type` and `evidence.metric`.
 *
 * Each family says how its evidence is tested (the {@link GapInput} shape), the
 * unit its floor counts in, the floor for SAYING anything, the round floor,
 * the shrinkage κ, the highest ladder rung it can reach, whether the team
 * standing on the row is on the same basis as `your_value` (so it may be the
 * benchmark), and whether a better-than-benchmark result is a strength read.
 *
 * Coordination: Slice 0b (`claude/coachhelm-freshness`) owns the round and
 * attempt floors the GENERATORS apply before they write a row. The numbers
 * here are the ladder's floors from 02 §7; the ladder only ever reads them,
 * so a generator floor below them can never lift a read's rung.
 *
 * Pure data.
 */
import type { LadderRung } from './ladder';
import { KAPPA } from './shrink';

export type FamilyShape = 'proportion' | 'two_proportion' | 'mean' | 'rate_per_round' | 'untestable';
export type CountUnit = 'attempts' | 'opportunities' | 'rounds' | 'shots';

export interface FamilyDef {
  family: string;
  shape: FamilyShape;
  /** Why a family is untestable today (no counts or spread on its evidence). */
  untestableReason?: string;
  nUnit: CountUnit;
  /** Floor for saying anything, in `nUnit` (the smaller side of a contrast). */
  floor: number;
  /** Countable-round floor (>= 3). */
  roundFloor: number;
  kappa: number;
  cap: LadderRung;
  /** The row's `standing.team_avg` measures the same quantity as `your_value`. */
  teamBenchmark: boolean;
  /** A better-than-benchmark result is a strength read (02 §6); false for within-player contrasts. */
  allowStrength: boolean;
  /**
   * Strokes a round per unit of gap, for families whose gap is itself in
   * strokes or in stroke-costing events. Used only when the row carries no
   * strokes estimate of its own.
   */
  strokesPerGapUnit?: number;
}

const DEFS: ReadonlyArray<FamilyDef & { match: (insightType: string, metric: string) => boolean }> = [
  {
    family: 'putt_distance',
    match: (t, m) => t === 'putt_distance' || m.startsWith('putts_made_'),
    shape: 'proportion',
    nUnit: 'attempts',
    floor: 20,
    roundFloor: 3,
    kappa: KAPPA.attempts,
    cap: 'seen_repeatedly',
    teamBenchmark: true,
    allowStrength: true,
  },
  {
    family: 'approach_green_hit',
    match: (t, m) => t === 'approach_miss' || m.startsWith('approach_proximity_'),
    shape: 'proportion',
    nUnit: 'attempts',
    floor: 20,
    roundFloor: 4,
    kappa: KAPPA.attempts,
    cap: 'seen_repeatedly',
    // The row's standing is on-green PROXIMITY (feet), not the green-hit
    // percent the card leads with (production 2026-10-20: mean |player_value −
    // your_value| = 35 on 156 rows), so it cannot be the benchmark.
    teamBenchmark: false,
    allowStrength: true,
  },
  {
    family: 'sand_save',
    match: (t, m) => t === 'scrambling' || m.startsWith('scrambling_pct_'),
    shape: 'proportion',
    nUnit: 'opportunities',
    floor: 12,
    roundFloor: 4,
    kappa: KAPPA.attempts,
    cap: 'observed',
    teamBenchmark: true,
    allowStrength: true,
  },
  {
    family: 'penalty_rate',
    match: (t, m) => m === 'penalty_rate_per_round',
    shape: 'rate_per_round',
    nUnit: 'rounds',
    floor: 8,
    roundFloor: 8,
    kappa: KAPPA.per_round_rate,
    cap: 'observed',
    teamBenchmark: true,
    allowStrength: true,
    // A penalty adds one stroke by rule; a lower bound on its cost.
    strokesPerGapUnit: 1,
  },
  {
    family: 'big_number',
    match: (t, m) => m === 'big_number_rate',
    shape: 'untestable',
    untestableReason: 'no_hole_count',
    nUnit: 'rounds',
    floor: 8,
    roundFloor: 8,
    kappa: KAPPA.per_round_rate,
    cap: 'observed',
    teamBenchmark: true,
    allowStrength: true,
  },
  {
    family: 'par_scoring',
    match: (t, m) => t === 'par_scoring' || m.startsWith('scoring_par_'),
    shape: 'untestable',
    untestableReason: 'no_per_round_spread',
    nUnit: 'rounds',
    floor: 8,
    roundFloor: 8,
    kappa: KAPPA.par_scoring_rounds,
    cap: 'likely',
    teamBenchmark: true,
    allowStrength: true,
  },
  {
    family: 'pressure_gap',
    match: (t, m) => t === 'pressure_gap' || m === 'practice_tournament_delta',
    shape: 'mean',
    nUnit: 'rounds',
    // 6 practice + 6 tournament rounds (02 §7 #14).
    floor: 12,
    roundFloor: 12,
    kappa: KAPPA.per_round_rate,
    cap: 'likely',
    teamBenchmark: true,
    allowStrength: false,
    // The delta is strokes a round.
    strokesPerGapUnit: 1,
  },
  {
    family: 'opening_hole',
    match: (t, m) => t === 'warmup_hole' || m === 'opening_hole_delta',
    shape: 'mean',
    nUnit: 'rounds',
    floor: 12,
    roundFloor: 12,
    kappa: KAPPA.par_scoring_rounds,
    cap: 'likely',
    teamBenchmark: true,
    allowStrength: false,
    // One opening hole a round: strokes per hole = strokes a round.
    strokesPerGapUnit: 1,
  },
  {
    family: 'putt_slope',
    match: (t, m) => m === 'putt_slope_downhill_penalty_pct',
    shape: 'two_proportion',
    nUnit: 'attempts',
    // `stats/proportion-test.ts` default per side (02 §7 #7).
    floor: 15,
    roundFloor: 3,
    kappa: KAPPA.attempts,
    cap: 'seen_repeatedly',
    teamBenchmark: false,
    allowStrength: false,
  },
  {
    family: 'putt_break',
    match: (t, m) => t === 'putt_bias' || m.startsWith('putt_miss_bias_'),
    shape: 'two_proportion',
    nUnit: 'attempts',
    floor: 15,
    roundFloor: 3,
    kappa: KAPPA.attempts,
    cap: 'seen_repeatedly',
    teamBenchmark: false,
    allowStrength: false,
  },
  {
    family: 'tee_strategy',
    match: (t) => t === 'tee_strategy',
    shape: 'two_proportion',
    nUnit: 'attempts',
    // 20 driver / 12 non-driver (02 §7 #19); the smaller side is held to 12.
    floor: 12,
    roundFloor: 3,
    kappa: KAPPA.attempts,
    cap: 'likely',
    teamBenchmark: false,
    allowStrength: false,
  },
  {
    family: 'composite',
    match: (t) => t === 'composite',
    shape: 'untestable',
    untestableReason: 'composite_no_counts',
    nUnit: 'attempts',
    floor: 20,
    roundFloor: 3,
    kappa: KAPPA.attempts,
    cap: 'working_hypothesis',
    teamBenchmark: false,
    allowStrength: false,
  },
];

const UNKNOWN: FamilyDef = {
  family: 'unknown',
  shape: 'untestable',
  untestableReason: 'unknown_family',
  nUnit: 'attempts',
  floor: 20,
  roundFloor: 3,
  kappa: KAPPA.attempts,
  cap: 'working_hypothesis',
  teamBenchmark: false,
  allowStrength: false,
};

/** The family settings for a row; `unknown` (untestable) when nothing matches. */
export function familyFor(insightType: string | null | undefined, metric: string | null | undefined): FamilyDef {
  const t = insightType ?? '';
  const m = metric ?? '';
  // Metric-specific families first (slope rows are written as insight_type 'putt_bias').
  const byMetric = DEFS.find((d) => d.family === 'putt_slope' && d.match(t, m));
  if (byMetric) return byMetric;
  return DEFS.find((d) => d.match(t, m)) ?? UNKNOWN;
}

/** Every family id, for reports. */
export const FAMILY_IDS: readonly string[] = [...DEFS.map((d) => d.family), UNKNOWN.family];
