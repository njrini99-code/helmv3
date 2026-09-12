import type { ShotRecord } from '@/lib/types/golf';
import { feetToDisplay, yardsToDisplay } from '@/lib/golf/distance-units';
import type { DiagramDistance, Direction8, ShotEvidence } from './types';

export const DIRECTIONS: readonly Direction8[] = ['short', 'short_left', 'left', 'long_left',
  'long', 'long_right', 'right', 'short_right'];
export function normalizeDirection(raw: string | null | undefined): Direction8 | null {
  const value = raw?.trim().toLowerCase().replace(/[ -]+/g, '_');
  return DIRECTIONS.includes(value as Direction8) ? value as Direction8 : null;
}
export interface PersistedShotEvidence {
  id?: string; shot_number: number; shot_type?: string | null;
  result?: string | null; lie_before?: string | null; lie_after?: string | null;
  distance_to_hole_before?: number | null; distance_to_hole_after?: number | null;
  distance_unit_before?: string | null; distance_unit_after?: string | null;
  shot_distance?: number | null; distance_unit?: string | null;
  miss_direction?: string | null; approach_miss_direction?: string | null;
  is_penalty?: boolean | null; penalty_type?: string | null;
  putt_made?: boolean | null; putt_break?: string | null; putt_slope?: string | null;
  putt_details?: { made?: boolean | null; miss_tags?: string[] | null } | null;
  approach_miss_details?: { miss_direction?: string | null; lie_type?: string | null } | null;
}
function distance(value: number | null | undefined, unit: string | null | undefined,
  basis: DiagramDistance['basis'], issues: string[]): DiagramDistance {
  const valid = value != null && Number.isFinite(value) && value >= 0;
  let valueM: number | null = null;
  if (value != null && !valid) issues.push(`${basis}:invalid_distance`);
  if (valid) {
    if (unit === 'yards') valueM = yardsToDisplay(value, 'meters', false);
    else if (unit === 'feet') valueM = feetToDisplay(value, 'meters', false);
    else if (unit === 'meters') valueM = value;
    else issues.push(`${basis}:unknown_unit`);
  }
  return { valueM, basis, originalValue: value ?? null, originalUnit: unit ?? null,
    referenceKnown: false, estimated: basis === 'legacy_derived_length' };
}
function normalize(row: PersistedShotEvidence, provenance: ShotEvidence['provenance'],
  original: Readonly<Record<string, unknown>>): ShotEvidence {
  const issues: string[] = [];
  const before = distance(row.distance_to_hole_before, row.distance_unit_before, 'recorded_before', issues);
  const after = distance(row.distance_to_hole_after, row.distance_unit_after,
    row.result === 'green' ? 'recorded_proximity' : 'recorded_remaining', issues);
  // Explicit tags win for conversion; conflicting historical semantics block
  // spatial use. Do not apply the legacy renderer's universal lie override.
  if (row.lie_before === 'green' && row.distance_unit_before && row.distance_unit_before !== 'feet') issues.push('before:unit_lie_conflict');
  if ((row.result === 'green' || row.result === 'hole' || (!row.result && row.lie_after === 'green')) &&
    row.distance_unit_after && row.distance_unit_after !== 'feet') issues.push('after:unit_lie_conflict');
  const rawMiss = row.approach_miss_direction ?? row.approach_miss_details?.miss_direction ?? row.miss_direction ?? null;
  const putting = row.shot_type === 'putting';
  const miss = putting ? null : normalizeDirection(rawMiss);
  if (rawMiss && !putting && !miss) issues.push('unrecognized_direction');
  if (row.result === 'other' && row.lie_after === 'rough') issues.push('lossy_other_lie');
  const made = row.putt_made ?? row.putt_details?.made ?? (putting && row.result === 'hole' ? true : null);
  if (made === true && row.result && row.result !== 'hole') issues.push('make_result_conflict');
  if (made === false && row.result === 'hole') issues.push('make_result_conflict');
  const tags = row.putt_details?.miss_tags ?? (putting && rawMiss ? rawMiss.split('_').filter(t => ['low', 'high', 'short', 'long'].includes(t)) : []);
  return {
    eventKey: row.id ?? `shot-${row.shot_number}`, shotNumber: row.shot_number, shotType: row.shot_type ?? null,
    result: row.result ?? null, lieBefore: row.lie_before ?? null, lieAfter: row.lie_after ?? null,
    before, after,
    // No independent writer has been established for persisted shot_distance.
    legacyLength: distance(row.shot_distance, row.distance_unit ?? (provenance === 'current_entry' ? 'yards' : null), 'legacy_derived_length', []),
    miss, rawMiss, putt: { made, break: row.putt_break ?? null, slope: row.putt_slope ?? null, tags: [...tags] },
    penalty: row.is_penalty || row.shot_type === 'penalty' || row.result === 'penalty'
      ? { type: row.penalty_type ?? null, nextLie: row.lie_before ?? null, nextDistance: after } : null,
    provenance, issues, original: structuredClone(original),
  };
}
export function normalizePersistedShot(row: PersistedShotEvidence): ShotEvidence {
  return normalize(row, 'persisted_unknown_writer', { ...row });
}
export function normalizeLiveShot(shot: ShotRecord): ShotEvidence {
  return normalize({ id: shot.id, shot_number: shot.shotNumber, shot_type: shot.shotType,
    result: shot.result, lie_before: shot.lieBefore, distance_to_hole_before: shot.distanceToHoleBefore,
    distance_to_hole_after: shot.distanceToHoleAfter, distance_unit_before: shot.distanceUnitBefore,
    distance_unit_after: shot.distanceUnitAfter, shot_distance: shot.shotDistance,
    miss_direction: shot.missDirection, approach_miss_direction: shot.approachMissDirection,
    is_penalty: shot.isPenalty, penalty_type: shot.penaltyType, putt_break: shot.puttBreak,
    putt_slope: shot.puttSlope, putt_details: { miss_tags: shot.puttMissTags },
  }, 'current_entry', { ...shot });
}
/** Rebuild from the surviving ledger after edits/undo; never alter neighbor data. */
export function auditContinuity(events: readonly ShotEvidence[]): ShotEvidence[] {
  return events.map((event, i) => {
    const issues = [...event.issues], prev = events[i - 1];
    if (prev) {
      if (event.shotNumber <= prev.shotNumber) issues.push('event_order_conflict');
      // Penalty rows encode a relocation, not a new ball flight from prior end.
      if (!event.penalty) {
        if (prev.after.valueM != null && event.before.valueM != null &&
          Math.abs(prev.after.valueM - event.before.valueM) > 0.001) issues.push('neighbor_distance_conflict');
        const finish = prev.penalty?.nextLie ?? prev.result ?? prev.lieAfter;
        if (finish && event.lieBefore && finish !== event.lieBefore) issues.push('neighbor_lie_conflict');
      }
    }
    return { ...event, issues };
  });
}
