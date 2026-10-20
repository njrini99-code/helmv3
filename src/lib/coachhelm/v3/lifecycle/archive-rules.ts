/**
 * Round-based archive rules (CoachHelm Slice 3; 07 §2 D "Archive to
 * history"), used only while `coachhelm_recheck_v1` is on. They replace the
 * age rules for v3 reads (`ARCHIVE_DETECTED_AGE_DAYS 30`,
 * `ARCHIVE_HARD_AGE_DAYS 90` in the lifecycle cron), which stay exactly as
 * they are with the flag off and for every non-v3 row.
 *
 * A read archives when:
 *   - Cleared, and 2 further checkpoints have passed without the recheck
 *     saying it holds again (04 Example 5: "Stays here two more checks, then
 *     moves to history");
 *   - Contradicted and retired (a newer supported read on the same subject
 *     says the opposite);
 *   - Out of date at 3 checkpoints in a row: rounds newer than its window
 *     exist and no generator run has refreshed it (the player kept logging
 *     but the read no longer re-qualifies).
 * A coach-engaged read (`addressed`) is never archived here: its prescription
 * and verdict (Slice 4) decide it. Pure.
 */
import { RECHECK_RESOLVED_BY, RECHECK_RETIRED_REASON } from '@/lib/coachhelm/v3/engine/recent-recheck';
import {
  CONTRADICTION_RESOLVED_BY,
  CONTRADICTION_RETIRED_REASON,
  LIFECYCLE_ARCHIVED_BY,
  OUT_OF_DATE_ARCHIVE_REASON,
  type ReadLifecycleMeta,
} from './types';

export const CLEARED_ARCHIVE_AFTER_CHECKPOINTS = 2;
export const OUT_OF_DATE_ARCHIVE_CHECKPOINTS = 3;

export type ArchiveReason =
  | typeof RECHECK_RETIRED_REASON
  | typeof CONTRADICTION_RETIRED_REASON
  | typeof OUT_OF_DATE_ARCHIVE_REASON;

const ARCHIVABLE: readonly string[] = ['tentative', 'detected', 'matured'];

export function decideArchive(input: {
  lifecycle: string | null;
  meta: ReadLifecycleMeta;
  /** Retired by tonight's opposing_direction pairing. */
  contradictedRetired: boolean;
  /** Out of date right now (rounds newer than the window exist). */
  outOfDate: boolean;
}): ArchiveReason | null {
  if (!ARCHIVABLE.includes(input.lifecycle ?? '')) return null;
  const { meta } = input;
  if (input.contradictedRetired) return CONTRADICTION_RETIRED_REASON;
  if (
    typeof meta.cleared_at_checkpoint === 'number' &&
    meta.checkpoints_seen - meta.cleared_at_checkpoint >= CLEARED_ARCHIVE_AFTER_CHECKPOINTS
  ) {
    return RECHECK_RETIRED_REASON;
  }
  if (
    input.outOfDate &&
    typeof meta.out_of_date_since_checkpoint === 'number' &&
    meta.checkpoints_seen - meta.out_of_date_since_checkpoint + 1 >= OUT_OF_DATE_ARCHIVE_CHECKPOINTS
  ) {
    return OUT_OF_DATE_ARCHIVE_REASON;
  }
  return null;
}

/** Metadata keys stamped with the archive (the shape the engine already writes). */
export function archiveMetadata(reason: ArchiveReason, nowIso: string, fromState: string | null): Record<string, unknown> {
  const base: Record<string, unknown> = {
    archived_by: LIFECYCLE_ARCHIVED_BY,
    archive_reason: reason,
    retired_from_state: fromState,
    retired_at: nowIso,
  };
  if (reason === RECHECK_RETIRED_REASON) {
    return { ...base, resolved_by: RECHECK_RESOLVED_BY, retired_reason: RECHECK_RETIRED_REASON };
  }
  if (reason === CONTRADICTION_RETIRED_REASON) {
    return { ...base, resolved_by: CONTRADICTION_RESOLVED_BY, retired_reason: CONTRADICTION_RETIRED_REASON };
  }
  return { ...base, retired_reason: OUT_OF_DATE_ARCHIVE_REASON };
}

/** Keys removed when a retired read is restored. */
export const RETIREMENT_KEYS = [
  'archived_by',
  'archive_reason',
  'retired_from_state',
  'retired_at',
  'resolved_by',
  'retired_reason',
] as const;

/**
 * True while a re-emit must NOT resurrect this archived row: this step
 * retired it as Cleared or Contradicted, and only this step (a recheck that
 * holds again, or the winner going away) brings it back. An Out-of-date
 * retirement resurrects normally: a re-emit with a newer window IS the
 * refresh it was waiting for. Pure; the caller checks the flag.
 */
export function isLifecycleRetired(
  lifecycle: string | null | undefined,
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  if (lifecycle !== 'archived') return false;
  return metadata?.resolved_by === RECHECK_RESOLVED_BY || metadata?.resolved_by === CONTRADICTION_RESOLVED_BY;
}
