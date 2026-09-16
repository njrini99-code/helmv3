import type { PointM } from '../course-geometry/types';
import type { HoleStats, ShotRecord } from '@/lib/types/golf';
import { calculateHoleStats } from '@/lib/utils/shot-helpers';
import { assessHoleIntegrity, type HoleIntegrityFlag, type HoleIntegrityReport } from './hole-integrity';
import { DAILY_PIN } from './hole-lifecycle';
import { metresToFeet, metresToYards } from './hole-distances';
import type { LieClass } from './lie-classifier';
import { livePenalties, unresolvedPenalties, type PenaltyEvent, type PenaltyKind } from './penalty-event';
import { deriveShots, liveAnchors, type ShotAnchor } from './shot-anchor';

/** Master design §77: the One-Tap subsystem is evidence collection, not a
 * competing round ledger. Anchors → derived shots → this adapter → the
 * existing GolfHelm shot/round model (ShotRecord, HoleStats). Rules: no club
 * invention; source = one_tap_location; anchor provenance preserved on every
 * record; penalties feed the official score as their own records; a low
 * confidence position remains evidence; a hole whose count is not on record
 * (missing start or cup, unresolved penalty, sequence anomaly) is handed back
 * for manual completion instead of being scored short. */
export const ROUND_SHOT_SOURCE = 'one_tap_location' as const;
export const AROUND_GREEN_THRESHOLD_YARDS = 50;
export interface OneTapShotProvenance {
  source: typeof ROUND_SHOT_SOURCE;
  fromAnchorId: string | null;
  toAnchorId: string | null;
  /** Calibrated 1σ of each endpoint, metres; the record's numbers are only this honest. */
  sigmaStartM: number | null;
  sigmaEndM: number | null;
  confidenceStart: ShotAnchor['confidence'] | null;
  confidenceEnd: ShotAnchor['confidence'] | null;
  /** Planimetric separation of the two marks, metres; never carry or roll. */
  horizontalM: number | null;
  distanceBasis: 'inferred_endpoint_separation' | 'penalty_event';
  /** Distances to the hole are to the green centre: the daily pin is UNSPECIFIED. */
  pin: typeof DAILY_PIN;
  /** No independent club source exists in One-Tap; the record's clubType is the app's non-driver default. */
  clubSource: 'unknown';
  penaltyEventId: string | null;
}
export type OneTapShotRecord = ShotRecord & { source: typeof ROUND_SHOT_SOURCE; provenance: OneTapShotProvenance };
export interface RoundShotsHole { number: number; par: number; yardage: number }
export interface ToRoundShotsInput {
  anchors: readonly ShotAnchor[];
  penalties?: readonly PenaltyEvent[];
  hole: RoundShotsHole;
  /** Green centre in the package's local frame; null when the hole has no mapped green. */
  greenCentreENU: PointM | null;
}
export interface RoundShotsResult {
  shots: OneTapShotRecord[];
  /** Present only for a hole closed by a cup mark with its count on record. */
  stats: HoleStats | null;
  integrity: HoleIntegrityReport;
  complete: boolean;
  /** The recorded count is short (no tee mark, no cup mark, a penalty without its drop, or marks out of order): finish the hole by hand. */
  needsManualCompletion: boolean;
  penaltyStrokes: number;
  basis: 'one_tap_anchors';
}
/** Flags that mean the stroke count itself is not on record. */
export const MANUAL_COMPLETION_FLAGS: readonly HoleIntegrityFlag[] = Object.freeze(['MISSING_START', 'MISSING_CUP', 'PENALTY_UNRESOLVED', 'SEQUENCE_ANOMALY']);

const LIE_BEFORE: Readonly<Record<LieClass, ShotRecord['lieBefore']>> = Object.freeze({
  tee: 'tee', fairway: 'fairway', fringe: 'fairway', apron: 'fairway', green: 'green', bunker: 'sand',
  primary_rough: 'rough', secondary_rough: 'rough', woods: 'rough', water: 'other', UNKNOWN: 'other',
});
const RESULT: Readonly<Record<LieClass, Exclude<ShotRecord['result'], 'hole' | 'penalty'>>> = Object.freeze({
  tee: 'other', fairway: 'fairway', fringe: 'fairway', apron: 'fairway', green: 'green', bunker: 'sand',
  primary_rough: 'rough', secondary_rough: 'rough', woods: 'rough', water: 'other', UNKNOWN: 'other',
});
const PENALTY_TYPE: Readonly<Record<PenaltyKind, ShotRecord['penaltyType']>> = Object.freeze({
  penalty_area: 'water', lost_ball: 'lost', out_of_bounds: 'ob', unplayable: 'unplayable', other: undefined,
});
export function lieBeforeFor(lie: LieClass): ShotRecord['lieBefore'] { return LIE_BEFORE[lie]; }
export function resultFor(lie: LieClass): Exclude<ShotRecord['result'], 'hole' | 'penalty'> { return RESULT[lie]; }
function distanceToHole(anchor: ShotAnchor, greenCentre: PointM | null): { value: number; unit: 'yards' | 'feet' } {
  if (!greenCentre) return { value: 0, unit: 'yards' };
  const metres = Math.hypot(anchor.positionENU[0] - greenCentre[0], anchor.positionENU[1] - greenCentre[1]);
  return anchor.primaryLie === 'green' ? { value: Math.round(metresToFeet(metres)), unit: 'feet' } : { value: Math.round(metresToYards(metres)), unit: 'yards' };
}
function shotTypeFor(start: ShotAnchor, index: number, hole: RoundShotsHole, distanceYards: number): ShotRecord['shotType'] {
  if (start.primaryLie === 'green') return 'putting';
  if (start.primaryLie === 'tee' || index === 0) return hole.par === 3 ? 'approach' : 'tee';
  return distanceYards < AROUND_GREEN_THRESHOLD_YARDS ? 'around_green' : 'approach';
}
function provenanceFor(start: ShotAnchor | null, end: ShotAnchor | null, horizontalM: number | null, basis: OneTapShotProvenance['distanceBasis'], penaltyEventId: string | null): OneTapShotProvenance {
  return { source: ROUND_SHOT_SOURCE, fromAnchorId: start?.id ?? null, toAnchorId: end?.id ?? null, sigmaStartM: start?.sigmaM ?? null, sigmaEndM: end?.sigmaM ?? null,
    confidenceStart: start?.confidence ?? null, confidenceEnd: end?.confidence ?? null, horizontalM, distanceBasis: basis, pin: DAILY_PIN, clubSource: 'unknown', penaltyEventId };
}
function penaltyRecords(events: readonly PenaltyEvent[], at: ShotAnchor | null, greenCentre: PointM | null, nextNumber: () => number): OneTapShotRecord[] {
  const records: OneTapShotRecord[] = [];
  for (const event of events) {
    const distance = at ? distanceToHole(at, greenCentre) : { value: 0, unit: 'yards' as const };
    for (let stroke = 0; stroke < event.strokes; stroke++) {
      records.push({ shotNumber: nextNumber(), shotType: 'penalty', clubType: 'non_driver', lieBefore: at ? lieBeforeFor(at.primaryLie) : 'other',
        distanceToHoleBefore: distance.value, distanceUnitBefore: distance.unit, result: 'penalty', distanceToHoleAfter: distance.value, distanceUnitAfter: distance.unit,
        shotDistance: 0, isPenalty: true, penaltyType: PENALTY_TYPE[event.kind], source: ROUND_SHOT_SOURCE, provenance: provenanceFor(at, null, null, 'penalty_event', event.id) });
    }
  }
  return records;
}

/** Pure: the same anchors and penalties always yield the same records. */
export function toRoundShots({ anchors, penalties = [], hole, greenCentreENU }: ToRoundShotsInput): RoundShotsResult {
  const marks = liveAnchors(anchors).filter(a => !a.provisional);
  const events = livePenalties(penalties);
  const integrity = assessHoleIntegrity(anchors, { unresolvedPenalties: unresolvedPenalties(events, anchors).length });
  const segments = deriveShots(marks);
  const byId = new Map(marks.map(a => [a.id, a] as const));
  const shots: OneTapShotRecord[] = [];
  let number = 0;
  const next = () => ++number;
  // A penalty before any mark has no position; it opens the record.
  shots.push(...penaltyRecords(events.filter(e => e.relatedAnchorId == null || !byId.has(e.relatedAnchorId)), null, greenCentreENU, next));
  marks.forEach((start, index) => {
    const segment = segments[index];
    if (segment) {
      const end = byId.get(segment.toAnchorId)!;
      const before = distanceToHole(start, greenCentreENU), after = end.terminal && end.terminalMethod === 'CUP_MARK' ? { value: 0, unit: 'feet' as const } : distanceToHole(end, greenCentreENU);
      const beforeYards = before.unit === 'feet' ? before.value / 3 : before.value;
      const shotType = shotTypeFor(start, index, hole, beforeYards);
      shots.push({ shotNumber: next(), shotType, clubType: shotType === 'putting' ? 'putter' : 'non_driver', lieBefore: lieBeforeFor(start.primaryLie),
        distanceToHoleBefore: before.value, distanceUnitBefore: before.unit,
        result: end.terminal && end.terminalMethod === 'CUP_MARK' ? 'hole' : resultFor(end.primaryLie), distanceToHoleAfter: after.value, distanceUnitAfter: after.unit,
        shotDistance: Math.round(metresToYards(segment.horizontalM)), isPenalty: false, source: ROUND_SHOT_SOURCE,
        provenance: provenanceFor(start, end, segment.horizontalM, 'inferred_endpoint_separation', null) });
    }
    // The penalty follows the stroke played from this mark (the stroke that found the trouble).
    shots.push(...penaltyRecords(events.filter(e => e.relatedAnchorId === start.id), start, greenCentreENU, next));
  });
  const complete = integrity.status === 'COMPLETE';
  const needsManualCompletion = integrity.flags.some(f => MANUAL_COMPLETION_FLAGS.includes(f));
  const penaltyStrokes = events.reduce((s, e) => s + e.strokes, 0);
  let stats: HoleStats | null = null;
  if (complete && !needsManualCompletion) {
    // The club is never known here: the driver stat stays unknown, the measured tee separation stands.
    stats = { ...calculateHoleStats(shots, hole), usedDriver: null };
  }
  return { shots, stats, integrity, complete, needsManualCompletion, penaltyStrokes, basis: 'one_tap_anchors' };
}
