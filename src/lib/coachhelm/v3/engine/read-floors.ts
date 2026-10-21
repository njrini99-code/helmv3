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
import { isCoachHelmFlagEnabled } from '@/lib/coachhelm/canary';
import type { InsightEvidence, InsightSampleUnit } from '@/lib/coachhelm/v2/insights/types';
import { FAMILY_FLOORS, MIN_ROUNDS_PER_READ } from './read-floor-table';

/** The Slice 0 / 0b flag. Off until the owner turns it on. */
export const READS_V1_FLAG = 'coachhelm_reads_v1_copy';

/** True when the Slice 0b behavior (floors, revision key, sweep) is on. */
export function freshnessReadsEnabled(): boolean {
  return isCoachHelmFlagEnabled(READS_V1_FLAG);
}

export { FAMILY_FLOORS, MIN_ROUNDS_PER_READ, type FamilyFloor } from './read-floor-table';

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
