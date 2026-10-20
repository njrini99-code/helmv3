/**
 * Read floors (CoachHelm Slice 0b; `02-accuracy-standard.md` §7 and the
 * thresholds table in `04-output-specs-and-examples.md` §2).
 *
 * Before this, the only floor was `MIN_SAMPLE_N = 5` in each generator's own
 * unit, so five bunker shots from two rounds published a sand-save read. A read
 * now needs BOTH:
 *   - at least `min_rounds` countable rounds in its window (never fewer than 3);
 *   - its family's attempt floor (`say_n`) in the unit `sample_n` counts.
 * `clear_n` (2 × the floor for rates) is recorded for the claim ladder in
 * Slice 1; it does not gate here.
 *
 * Below the floor the read is not written as an open read: the generator exits
 * the way a below-sample run always has (its scope is retracted) and its
 * receipt carries a `watching` count-down ("2 more rounds", "9 more putts"),
 * which Slice 1's run log persists for the player's Watching list.
 *
 * Gated by `coachhelm_reads_v1_copy` (off). Pure apart from the flag read.
 */
import { isFlagEnabled } from '@/lib/flags/is-enabled';
import type { InsightEvidence, InsightSampleUnit } from '@/lib/coachhelm/v2/insights/types';

/** The Slice 0 / 0b flag. Off until the owner turns it on. */
export const READS_V1_FLAG = 'coachhelm_reads_v1_copy';

/** True when the Slice 0b behavior (floors, revision key, sweep) is on. */
export function freshnessReadsEnabled(): boolean {
  return isFlagEnabled(READS_V1_FLAG);
}

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
  'composite:flyer_lie_over_the_green': { sample_unit: 'shots', min_rounds: 3, say_n: 20, clear_n: 40 },

  // Insight composites: `sample_n` is the smaller of two source reads, each of
  // which already cleared its own family floor; the composite adds the round
  // floor over the union of their rounds and takes its unit from the source.
  'composite:lag_distance_3putt': { sample_unit: null, min_rounds: 3, say_n: null, clear_n: null },
  'composite:pressure_decel_chain': { sample_unit: null, min_rounds: 3, say_n: null, clear_n: null },
  'composite:bunker_miss_side_amplifier': { sample_unit: null, min_rounds: 3, say_n: null, clear_n: null },
  'composite:short_approach_proximity_gap': { sample_unit: null, min_rounds: 3, say_n: null, clear_n: null },
};

/** Family key for a composite rule id. */
export function compositeFamilyKey(ruleId: string): string {
  return `composite:${ruleId}`;
}

/** The sample unit a family's `sample_n` counts, or null when unknown. */
export function sampleUnitFor(familyKey: string): InsightSampleUnit | null {
  return FAMILY_FLOORS[familyKey]?.sample_unit ?? null;
}

/** A read below its floor: what it has, what it needs (the Watching count-down). */
export interface ReadFloorShortfall {
  family: string;
  /** The binding shortfall first: rounds, then attempts, then arms. */
  needs: Array<{ unit: InsightSampleUnit; have_n: number; need_n: number }>;
}

/**
 * Pure: does this read clear its family floor? Returns null when it does (or
 * when the family has no entry, so an unknown family is never suppressed),
 * else the count-down. A read with no `rounds_n` (the stamp failed) is judged
 * on attempts only: a failed lookup must not hide a read.
 */
export function evaluateReadFloor(
  familyKey: string,
  evidence: Pick<InsightEvidence, 'sample_n' | 'rounds_n' | 'detail'>,
): ReadFloorShortfall | null {
  const floor = FAMILY_FLOORS[familyKey];
  if (!floor) return null;
  const needs: ReadFloorShortfall['needs'] = [];

  const minRounds = Math.max(MIN_ROUNDS_PER_READ, floor.min_rounds);
  if (typeof evidence.rounds_n === 'number' && evidence.rounds_n < minRounds) {
    needs.push({ unit: 'rounds', have_n: evidence.rounds_n, need_n: minRounds });
  }

  const sampleN = Number.isFinite(evidence.sample_n) ? evidence.sample_n : 0;
  if (floor.say_n !== null && floor.sample_unit !== null && sampleN < floor.say_n) {
    needs.push({ unit: floor.sample_unit, have_n: sampleN, need_n: floor.say_n });
  }

  if (floor.arms) {
    const detail = (evidence.detail ?? {}) as Record<string, unknown>;
    for (const key of floor.arms.keys) {
      const v = Number(detail[key]);
      if (Number.isFinite(v) && v < floor.arms.min_each) {
        needs.push({ unit: floor.arms.unit, have_n: v, need_n: floor.arms.min_each });
      }
    }
  }

  return needs.length === 0 ? null : { family: familyKey, needs };
}

/** Plain count-down words for a shortfall: "2 more rounds, 9 more putts". */
export function countdownText(shortfall: ReadFloorShortfall): string {
  return shortfall.needs
    .map((n) => {
      const more = Math.max(0, Math.ceil(n.need_n - n.have_n));
      const unit = n.unit.replace('_', ' ');
      return `${more} more ${more === 1 ? unit.replace(/s$/, '').replace(/ie$/, 'y') : unit}`;
    })
    .join(', ');
}
