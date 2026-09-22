/**
 * Synthetic aggregates for every v3 single-metric generator, so the
 * claim-honesty sweep can call `composeContent()` without a database. Shapes
 * mirror the `makeAgg` helpers in src/test/coachhelm/v3/*Generator.test.ts;
 * values sit in the ranges the generators' own tests use, with a few chosen
 * to exercise the more assertive prose branches (a significant bias, a cause
 * split, a laggy driver).
 */

import { ApproachMissGenerator } from '@/lib/coachhelm/v3/generators/approach-miss';
import { CourseMgmtGenerator } from '@/lib/coachhelm/v3/generators/course-mgmt';
import { ParTypeGenerator } from '@/lib/coachhelm/v3/generators/par-type';
import { PressureGapGenerator } from '@/lib/coachhelm/v3/generators/pressure-gap';
import { PuttBiasGenerator } from '@/lib/coachhelm/v3/generators/putt-bias';
import { PuttDistanceGenerator } from '@/lib/coachhelm/v3/generators/putt-distance';
import { PuttSlopeBiasGenerator } from '@/lib/coachhelm/v3/generators/putt-slope-bias';
import { ScramblingGenerator } from '@/lib/coachhelm/v3/generators/scrambling';
import { TeeStrategyGenerator } from '@/lib/coachhelm/v3/generators/tee-strategy';
import { WarmupHoleGenerator } from '@/lib/coachhelm/v3/generators/warmup-hole';
import type { ComposedContent } from '@/lib/coachhelm/v3/engine/types';

const PLAYER_ID = '00000000-0000-4000-8000-000000000001';

export interface GeneratorCase {
  label: string;
  composed: ComposedContent;
  /** The aggregate the prose was composed from — the data behind every figure. */
  aggregate: Record<string, unknown>;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- each aggregate is typed
   by its generator; the sweep only needs the composed prose + evidence. */
type Composer = { composeContent(agg: any): ComposedContent };

const approach = (over: Record<string, unknown>) => {
  const attempts = (over.attempts as number) ?? 20;
  const greenHitPct = (over.green_hit_pct as number) ?? 60;
  return {
    last_round_date: '2026-05-25',
    sampleN: attempts,
    playerValue: greenHitPct,
    bucket: '50_125ft',
    attempts,
    green_hit_n: Math.round((greenHitPct / 100) * attempts),
    green_hit_pct: greenHitPct,
    proximity_when_hit_feet: 22,
    penalty_rate_pct: 0,
    miss_short_long: { negative: 0, positive: 0, neutral: 0 },
    miss_left_right: { negative: 0, positive: 0, neutral: 0 },
    cohort_gender: 'mens',
    attempts_per_round: attempts / 15,
    par_split: { par4: { attempts: 0, greenHitPct: null }, par5: { attempts: 0, greenHitPct: null }, unknown: attempts },
    ...over,
  };
};

const courseMgmt = (variant: 'penalty' | 'big_number', over: Record<string, unknown>) => ({
  sampleN: 20,
  playerValue: 1.4,
  metric_value: 1.4,
  variant,
  rounds_played: 20,
  anchor_value: null,
  anchor_is_cohort: false,
  cohort_gender: 'mens',
  cause_penalty_pct: 0,
  cause_missed_gir_pct: 0,
  cause_three_putt_pct: 0,
  spanDays: 54,
  first_round_date: '2026-04-01',
  last_round_date: '2026-05-25',
  worst_holes: [],
  worst_holes_excluded_rounds: 0,
  ...over,
});

const tee = (pattern: 'laggy' | 'sharp', driverFw: number, ndFw: number, driverDist: number, ndDist: number) => ({
  last_round_date: '2026-05-25',
  sampleN: 30,
  playerValue: driverFw * 100,
  driver: { attempts: 30, fairwayHits: Math.round(30 * driverFw), fairwayPct: driverFw, avgDistance: driverDist, derivedDistanceN: 0, distanceN: 30 },
  nonDriver: { attempts: 15, fairwayHits: Math.round(15 * ndFw), fairwayPct: ndFw, avgDistance: ndDist, derivedDistanceN: 0, distanceN: 15 },
  pattern,
  fairwayGap: driverFw - ndFw,
  distanceGap: driverDist - ndDist,
  roundsCovered: 20,
});

const FIXTURES: Array<[string, Composer, Record<string, unknown>]> = [
  [
    'generator:approach_miss:50_125_short_bias',
    new ApproachMissGenerator(PLAYER_ID, '50_125ft'),
    approach({ green_hit_pct: 55, attempts: 20, miss_short_long: { negative: 7, positive: 3, neutral: 0 }, miss_left_right: { negative: 1, positive: 1, neutral: 8 } }),
  ],
  [
    'generator:approach_miss:175_plus_penalties',
    new ApproachMissGenerator(PLAYER_ID, '175_plus_ft'),
    approach({
      bucket: '175_plus_ft',
      green_hit_pct: 38.9,
      attempts: 18,
      green_hit_n: 7,
      proximity_when_hit_feet: null,
      penalty_rate_pct: 8.5,
      par_split: { par4: { attempts: 10, greenHitPct: 30 }, par5: { attempts: 8, greenHitPct: 50 }, unknown: 0 },
    }),
  ],
  [
    'generator:course_mgmt:penalty',
    new CourseMgmtGenerator(PLAYER_ID, 'penalty'),
    courseMgmt('penalty', {
      anchor_value: 0.6,
      anchor_is_cohort: true,
      cause_penalty_pct: 55,
      cause_missed_gir_pct: 30,
      cause_three_putt_pct: 15,
      worst_holes: [
        { course_id: 'c1', course_name: 'Pinehurst No. 2', hole_number: 14, avg_to_par: 1.8, n: 5 },
        { course_id: 'c1', course_name: 'Pinehurst No. 2', hole_number: 7, avg_to_par: 1.2, n: 5 },
      ],
    }),
  ],
  [
    'generator:course_mgmt:big_number',
    new CourseMgmtGenerator(PLAYER_ID, 'big_number'),
    courseMgmt('big_number', { playerValue: 6.5, metric_value: 6.5, cause_penalty_pct: 20, cause_missed_gir_pct: 50, cause_three_putt_pct: 30 }),
  ],
  [
    'generator:par_type:par4',
    new ParTypeGenerator(PLAYER_ID, 4),
    {
      sampleN: 22,
      playerValue: 4.4,
      par: 4,
      rounds_played: 22,
      birdie_rate: 4,
      par_rate: 58,
      bogey_rate: 30,
      double_plus_rate: 8,
      holes_scored: 220,
      holes_per_round: 10,
      spanDays: 54,
      last_round_date: '2026-05-25',
    },
  ],
  [
    'generator:pressure_gap:worse_in_tournaments',
    new PressureGapGenerator(PLAYER_ID),
    {
      sampleN: 13,
      playerValue: 1.5,
      practice_avg: 0.8,
      competitive_avg: 2.3,
      practice_count: 8,
      competitive_count: 5,
      double_rate_delta: 4,
      three_putt_delta: 2,
      penalty_delta: 1,
      opening3_delta: 0.1,
    },
  ],
  [
    'generator:putt_bias:significant_left',
    new PuttBiasGenerator(PLAYER_ID, 'left'),
    {
      sampleN: 12,
      playerValue: 16,
      rounds_played: 12,
      significant: true,
      weakest_direction: 'left',
      band: '11-20 ft',
      slope: 'downhill',
      weak_pct: 14,
      strong_pct: 30,
      gap_pp: 16,
      weak_n: 22,
      strong_n: 19,
    },
  ],
  [
    'generator:putt_bias:not_significant',
    new PuttBiasGenerator(PLAYER_ID, 'left'),
    {
      sampleN: 12,
      playerValue: 0,
      rounds_played: 12,
      significant: false,
      weakest_direction: null,
      band: null,
      slope: null,
      weak_pct: null,
      strong_pct: null,
      gap_pp: 0,
      weak_n: 0,
      strong_n: 0,
    },
  ],
  [
    'generator:putt_distance:3_5ft',
    new PuttDistanceGenerator(PLAYER_ID, '3_5ft'),
    {
      sampleN: 40,
      playerValue: 71,
      bucket: '3_5ft',
      rawValue: 0.71,
      rounds_played: 20,
      cohort_gender: 'mens',
      attempts: 40,
      spanDays: 54,
      last_round_date: '2026-05-25',
    },
  ],
  [
    'generator:putt_slope_bias:downhill_0_3',
    new PuttSlopeBiasGenerator(PLAYER_ID),
    { sampleN: 12, playerValue: 0, rounds_played: 12, band: '0-3 ft', downhill_pct: 55, level_pct: 96, gap_pp: 41, downhill_n: 13, level_n: 13 },
  ],
  [
    'generator:scrambling:sand_lag',
    new ScramblingGenerator(PLAYER_ID, 'sand'),
    {
      last_round_date: '2026-05-25',
      sampleN: 32,
      playerValue: 8,
      lie: 'sand',
      attempts: 32,
      rounds_played: 12,
      reached_green_n: 24,
      failed_escape_n: 8,
      avg_leave_feet: 13.7,
      two_putt_after_reach_n: 22,
      failure_mode: 'lag',
      cohort_gender: 'mens',
      attempts_per_round: 32 / 12,
    },
  ],
  ['generator:tee_strategy:laggy', new TeeStrategyGenerator(PLAYER_ID), tee('laggy', 0.45, 0.7, 270, 245)],
  ['generator:tee_strategy:sharp', new TeeStrategyGenerator(PLAYER_ID), tee('sharp', 0.65, 0.68, 285, 240)],
  [
    'generator:warmup_hole:slow_start',
    new WarmupHoleGenerator(PLAYER_ID),
    {
      last_round_date: '2026-05-25',
      sampleN: 12,
      playerValue: 0.4,
      hole1_avg: 0.6,
      rest_avg: 0.2,
      rounds_with_hole1: 12,
      cause_putt_pct: 60,
      cause_tee_pct: 25,
      cause_penalty_pct: 15,
    },
  ],
];

export function generatorCases(): GeneratorCase[] {
  return FIXTURES.map(([label, gen, aggregate]) => ({ label, composed: gen.composeContent(aggregate), aggregate }));
}
