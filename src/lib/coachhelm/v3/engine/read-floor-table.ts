/**
 * The read-floor table (CoachHelm Slice 0b; `02-accuracy-standard.md` §7 and
 * the thresholds table in `04-output-specs-and-examples.md` §2), on its own so
 * pure code (the Slice 1 support pass and its offline back-test) can read the
 * same numbers without importing the flag reader. `read-floors.ts` re-exports
 * everything here; the floors themselves are unchanged.
 *
 * Pure data.
 */
import type { InsightSampleUnit } from '@/lib/coachhelm/v2/insights/types';

/** No read is ever said from fewer countable rounds than this. */
export const MIN_ROUNDS_PER_READ = 3;

export interface FamilyFloor {
  /** What `sample_n` counts for this family. Null: take it from the sources. */
  sample_unit: InsightSampleUnit | null;
  /** Countable rounds the window must hold (≥ MIN_ROUNDS_PER_READ). */
  min_rounds: number;
  /** Attempts (in `sample_unit`) to say anything. Null: sources carry it. */
  say_n: number | null;
  /** Attempts to be Clear (Slice 1 ladder). Null where not a rate. */
  clear_n: number | null;
  /**
   * Per-arm minimums read from `evidence.detail` (pressure gap 6 + 6 rounds,
   * tee strategy 12 non-driver tee shots).
   */
  arms?: { keys: readonly string[]; min_each: number; unit: InsightSampleUnit };
}

/**
 * Per-family floors, keyed by `insight_type` for generators and
 * `composite:<rule id>` for composite rules. Numbers from `04` §2: putts and
 * approaches 20/40 per band, tee shots 20 (12 per side), sand 12, around-green
 * 15, per-round rates 8 rounds, pressure 6 + 6 rounds, opening/closing holes
 * 12 rounds. Round floors above 3 follow the per-generator proposals in `02` §7.
 */
export const FAMILY_FLOORS: Readonly<Record<string, FamilyFloor>> = {
  putt_distance: { sample_unit: 'putts', min_rounds: 3, say_n: 20, clear_n: 40 },
  // PuttBiasGenerator and PuttSlopeBiasGenerator share this insight_type; both
  // count putts in `sample_n`.
  putt_bias: { sample_unit: 'putts', min_rounds: 3, say_n: 20, clear_n: 40 },
  approach_miss: { sample_unit: 'approaches', min_rounds: 4, say_n: 20, clear_n: 40 },
  scrambling: { sample_unit: 'opportunities', min_rounds: 4, say_n: 12, clear_n: 24 },
  tee_strategy: {
    sample_unit: 'tee_shots',
    min_rounds: 3,
    say_n: 20,
    clear_n: 40,
    arms: { keys: ['non_driver_n'], min_each: 12, unit: 'tee_shots' },
  },
  course_management: { sample_unit: 'rounds', min_rounds: 8, say_n: 8, clear_n: 16 },
  par_scoring: { sample_unit: 'rounds', min_rounds: 8, say_n: 8, clear_n: 16 },
  pressure_gap: {
    sample_unit: 'rounds',
    min_rounds: 12,
    say_n: 12,
    clear_n: null,
    arms: { keys: ['practice_rounds', 'competitive_rounds'], min_each: 6, unit: 'rounds' },
  },
  warmup_hole: { sample_unit: 'rounds', min_rounds: 12, say_n: 12, clear_n: 24 },

  // Context composites: they count their own rows.
  'composite:closing_hole_fatigue': { sample_unit: 'rounds', min_rounds: 12, say_n: 12, clear_n: 24 },
  'composite:front_9_starter': { sample_unit: 'rounds', min_rounds: 12, say_n: 12, clear_n: 24 },
  'composite:doubles_after_bogey': { sample_unit: 'holes', min_rounds: 3, say_n: 12, clear_n: 24 },
  'composite:short_side_scrambling_chain': { sample_unit: 'shots', min_rounds: 4, say_n: 15, clear_n: 30 },

  // Insight composites: `sample_n` is the smaller of two source reads, each of
  // which already cleared its own family floor; the composite adds the round
  // floor over the union of their rounds and takes its unit from the source.
  'composite:lag_distance_3putt': { sample_unit: null, min_rounds: 3, say_n: null, clear_n: null },
  'composite:pressure_decel_chain': { sample_unit: null, min_rounds: 3, say_n: null, clear_n: null },
  'composite:bunker_miss_side_amplifier': { sample_unit: null, min_rounds: 3, say_n: null, clear_n: null },
  'composite:short_approach_proximity_gap': { sample_unit: null, min_rounds: 3, say_n: null, clear_n: null },
};
