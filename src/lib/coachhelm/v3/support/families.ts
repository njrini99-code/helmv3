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
 * Floors (post-merge review, finding 4): the attempt, round and per-arm
 * floors are DERIVED from Slice 0b's shared table (`FAMILY_FLOORS` in
 * `engine/read-floor-table.ts`, 02 §7 and 04 §2), whatever
 * `coachhelm_reads_v1_copy` says, so the ladder can never hold a family to a
 * looser floor than the one the generators publish under. The only floor not
 * in that table is the per-side minimum of the within-player putt contrasts,
 * which is the proportion test's own (`MIN_PUTTS_PER_SIDE`, 02 §7 #7). Every
 * two-arm contrast also needs at least {@link MIN_ARM} in each arm.
 *
 * Pure data.
 */
import { FAMILY_FLOORS, MIN_ROUNDS_PER_READ } from '@/lib/coachhelm/v3/engine/read-floor-table';
import { MIN_PUTTS_PER_SIDE } from '@/lib/coachhelm/v3/stats/proportion-test';
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
  /** The `FAMILY_FLOORS` key the floors come from; null for families it does not list. */
  floorsKey: string | null;
  /**
   * Per-arm floors of a two-arm contrast, read from `evidence.detail[key]`
   * (each at least {@link MIN_ARM}). A missing arm count fails its floor.
   */
  arms?: ReadonlyArray<{ key: string; min: number }>;
  kappa: number;
  cap: LadderRung;
  /** The row's `standing.team_avg` measures the same quantity as `your_value`. */
  teamBenchmark: boolean;
  /**
   * The generator writes both leak and strength rows for this family and
   * picks the side from the same comparison the test judges (02 §6 mirror
   * test). The tested direction then follows the row's framing, and BH gets
   * the two-sided p (post-merge review, blocker 1). False: the family only
   * ever claims the weakness side (within-player contrasts, where the
   * generator names the side it suspects), so the direction is declared.
   */
  allowStrength: boolean;
  /**
   * Strokes a round per unit of gap, for families whose gap is itself in
   * strokes or in stroke-costing events. Used only when the row carries no
   * strokes estimate of its own.
   */
  strokesPerGapUnit?: number;
}

/** Smallest arm of any two-arm contrast (02 §7: 6 + 6 for the pressure split). */
export const MIN_ARM = 6;

type Floors = Pick<FamilyDef, 'floor' | 'roundFloor' | 'floorsKey' | 'arms'>;

function shared(key: string) {
  const f = FAMILY_FLOORS[key];
  if (!f || f.say_n === null) throw new Error(`support families: no shared floor for ${key}`);
  return f;
}

/** A one-sample family: the shared attempt floor, round floor and any arms. */
function floorsFrom(key: string): Floors {
  const f = shared(key);
  return {
    floor: f.say_n!,
    roundFloor: Math.max(MIN_ROUNDS_PER_READ, f.min_rounds),
    floorsKey: key,
    ...(f.arms ? { arms: f.arms.keys.map((k) => ({ key: k, min: Math.max(MIN_ARM, f.arms!.min_each) })) } : {}),
  };
}

/** A within-player contrast held to `perSide` on each side. */
function contrastFloors(key: string, sides: readonly [string, string], perSide: number): Floors {
  const f = shared(key);
  const min = Math.max(MIN_ARM, perSide);
  return {
    floor: min,
    roundFloor: Math.max(MIN_ROUNDS_PER_READ, f.min_rounds),
    floorsKey: key,
    arms: sides.map((k) => ({ key: k, min })),
  };
}

/** Tee strategy: driver shots to the family floor, non-driver to its arm floor. */
function teeFloors(): Floors {
  const f = shared('tee_strategy');
  const nonDriver = Math.max(MIN_ARM, f.arms?.min_each ?? f.say_n!);
  return {
    floor: nonDriver,
    roundFloor: Math.max(MIN_ROUNDS_PER_READ, f.min_rounds),
    floorsKey: 'tee_strategy',
    arms: [
      { key: 'driver_n', min: Math.max(MIN_ARM, f.say_n!) },
      { key: 'non_driver_n', min: nonDriver },
    ],
  };
}

const DEFS: ReadonlyArray<FamilyDef & { match: (insightType: string, metric: string) => boolean }> = [
  {
    family: 'putt_distance',
    match: (t, m) => t === 'putt_distance' || m.startsWith('putts_made_'),
    shape: 'proportion',
    nUnit: 'attempts',
    ...floorsFrom('putt_distance'),
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
    ...floorsFrom('approach_miss'),
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
    ...floorsFrom('scrambling'),
    kappa: KAPPA.attempts,
    cap: 'observed',
    teamBenchmark: true,
    allowStrength: true,
  },
  {
    family: 'penalty_rate',
    match: (_t, m) => m === 'penalty_rate_per_round',
    shape: 'rate_per_round',
    nUnit: 'rounds',
    ...floorsFrom('course_management'),
    kappa: KAPPA.per_round_rate,
    cap: 'observed',
    teamBenchmark: true,
    allowStrength: true,
    // A penalty adds one stroke by rule; a lower bound on its cost.
    strokesPerGapUnit: 1,
  },
  {
    family: 'big_number',
    match: (_t, m) => m === 'big_number_rate',
    shape: 'untestable',
    untestableReason: 'no_hole_count',
    nUnit: 'rounds',
    ...floorsFrom('course_management'),
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
    ...floorsFrom('par_scoring'),
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
    // 12 rounds, of which 6 practice + 6 tournament (02 §7 #14).
    ...floorsFrom('pressure_gap'),
    kappa: KAPPA.per_round_rate,
    cap: 'likely',
    teamBenchmark: true,
    // Strength at or under 0, leak past half a stroke (pressure-gap.ts).
    allowStrength: true,
    // The delta is strokes a round.
    strokesPerGapUnit: 1,
  },
  {
    family: 'opening_hole',
    match: (t, m) => t === 'warmup_hole' || m === 'opening_hole_delta',
    shape: 'mean',
    nUnit: 'rounds',
    ...floorsFrom('warmup_hole'),
    kappa: KAPPA.par_scoring_rounds,
    cap: 'likely',
    teamBenchmark: true,
    // Strength at or under 0, leak past the 0.1 Tour tax (warmup-hole.ts).
    allowStrength: true,
    // One opening hole a round: strokes per hole = strokes a round.
    strokesPerGapUnit: 1,
  },
  {
    family: 'putt_slope',
    match: (_t, m) => m === 'putt_slope_downhill_penalty_pct',
    shape: 'two_proportion',
    nUnit: 'attempts',
    // `stats/proportion-test.ts` default per side (02 §7 #7); the family's
    // 20 putts in all (FAMILY_FLOORS.putt_bias) is implied by 15 + 15.
    ...contrastFloors('putt_bias', ['downhill_n', 'level_n'], MIN_PUTTS_PER_SIDE),
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
    ...contrastFloors('putt_bias', ['ltr_n', 'rtl_n'], MIN_PUTTS_PER_SIDE),
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
    // 20 driver tee shots (the family's `sample_n` floor) and 12 non-driver
    // (its arm floor), 02 §7 #19; the smaller side is held to 12.
    ...teeFloors(),
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
    roundFloor: MIN_ROUNDS_PER_READ,
    floorsKey: null,
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
  roundFloor: MIN_ROUNDS_PER_READ,
  floorsKey: null,
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
