import 'server-only';

/**
 * Behind `coachhelm_verdicts_v1` (off): after a focus area is created from a
 * read, stamp its prescription fields (04 §1.3) in a SECOND write, so the
 * create itself never carries a column the live table may not have yet.
 *
 * Best-effort by contract. Flag off: nothing is read or written. The
 * migration not applied yet (42703 / 42P01 / PGRST204 / PGRST205): logged
 * once as an info event and reported as `schema_missing`. Any other failure
 * is logged as a warning. The focus area the caller just created stands in
 * every case; a missing prescription only means no verdict later.
 *
 * Not a 'use server' module: it is imported by the focus-area actions and
 * must not become a public endpoint.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { logServerError, logServerEvent } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import { isVerdictsEnabled } from './flag';
import { buildPrescriptionFromRead, toColumnPatch, type AssignedBy, type NoCriterionReason } from './prescription';
import { isMissingSchemaError } from './schema-missing';

export type StampPrescriptionResult =
  | { status: 'flag_off' }
  | { status: 'schema_missing' }
  | { status: 'read_failed' }
  | { status: 'write_failed' }
  | { status: 'stamped'; criterion: boolean; reason: NoCriterionReason | null };

export interface StampPrescriptionArgs {
  focusAreaId: string;
  insightId: string;
  playerId: string;
  /** The canonical `target_metric` the focus area was written with. */
  targetMetric: string | null;
  /** The focus area's `target_value` (percent), when the coach set one. */
  targetValue?: number | null;
  assignedBy: AssignedBy;
}

const ACTION = 'coachhelm.verdicts.stampPrescription';

export async function stampPrescriptionFromRead(
  client: SupabaseClient<Database>,
  args: StampPrescriptionArgs,
): Promise<StampPrescriptionResult> {
  if (!isVerdictsEnabled()) return { status: 'flag_off' };

  try {
    // Scoped to the player, as resolveEvidenceRevisionForInsight is: a
    // cross-player insight id reads no row.
    const { data: insight, error: readError } = await client
      .from('golf_coach_insights')
      .select('evidence')
      .eq('id', args.insightId)
      .eq('player_id', args.playerId)
      .maybeSingle();
    if (readError) {
      await logServerError(`${ACTION}: source read lookup failed: ${describeError(readError)}`, { action: ACTION, featureArea: 'coachhelm' }, 'warning');
      return { status: 'read_failed' };
    }

    const patch = buildPrescriptionFromRead({
      evidence: insight?.evidence ?? null,
      targetMetric: args.targetMetric,
      coachTargetValue: args.targetValue ?? null,
      assignedBy: args.assignedBy,
    });

    const { error: writeError } = await client
      .from('golf_player_focus_areas')
      .update(toColumnPatch(patch)) // nosemgrep: helmv3-action-missing-revalidate -- the calling action revalidates
      .eq('id', args.focusAreaId)
      .eq('player_id', args.playerId);
    if (writeError) {
      if (isMissingSchemaError(writeError)) {
        await logServerEvent(`${ACTION}: prescription columns not applied yet; skipped`, { action: ACTION, featureArea: 'coachhelm', extra: { code: writeError.code } });
        return { status: 'schema_missing' };
      }
      await logServerError(`${ACTION}: prescription write failed: ${describeError(writeError)}`, { action: ACTION, featureArea: 'coachhelm' }, 'warning');
      return { status: 'write_failed' };
    }

    return { status: 'stamped', criterion: patch.criterionReason === null, reason: patch.criterionReason };
  } catch (err) {
    await logServerError(`${ACTION}: threw: ${describeError(err)}`, { action: ACTION, featureArea: 'coachhelm' }, 'warning');
    return { status: 'write_failed' };
  }
}
