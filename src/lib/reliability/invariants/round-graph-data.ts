import 'server-only';

/**
 * I/O for the round-graph invariants — `round-graph-invariants.ts` holds the
 * pure labeling/severity logic; this file holds the bounded, read-only
 * Supabase reads. Every query here is a SELECT with an exact-count probe,
 * never a write — mirrors `qualifier-logic.ts`'s `BoundedFetch` honesty
 * contract at a smaller scale (a fixed sample, not a full-table page).
 */

import { createAdminClient } from '@/lib/supabase/admin';
import {
  evaluateCompletedRoundsWithoutHoles,
  evaluateOrphanedShots,
  type RoundGraphInvariantResult,
} from './round-graph-invariants';

const SAMPLE_LIMIT = 5;

export interface RoundGraphInvariantsOutcome {
  status: 'ok' | 'error';
  results: RoundGraphInvariantResult[];
  error: string | null;
}

/**
 * Runs both round-graph checks. Each is an independent bounded read; one
 * failing does not blank the other — a failed check is reported via
 * `status: 'error'` for THAT check's slot rather than throwing, so the
 * collector's caller can fold "some invariants unreadable this run" without
 * losing the ones that did read.
 */
export async function fetchRoundGraphInvariants(): Promise<RoundGraphInvariantsOutcome> {
  const admin = createAdminClient();

  const [orphanedShots, completedWithoutHoles] = await Promise.allSettled([
    fetchOrphanedShots(admin),
    fetchCompletedRoundsWithoutHoles(admin),
  ]);

  const results: RoundGraphInvariantResult[] = [];
  const errors: string[] = [];

  if (orphanedShots.status === 'fulfilled') {
    if (orphanedShots.value.error) errors.push(`orphaned-shots: ${orphanedShots.value.error}`);
    else results.push(evaluateOrphanedShots(orphanedShots.value.count, orphanedShots.value.sampleIds));
  } else {
    errors.push(`orphaned-shots: ${orphanedShots.reason instanceof Error ? orphanedShots.reason.message : String(orphanedShots.reason)}`);
  }

  if (completedWithoutHoles.status === 'fulfilled') {
    if (completedWithoutHoles.value.error) errors.push(`completed-without-holes: ${completedWithoutHoles.value.error}`);
    else results.push(evaluateCompletedRoundsWithoutHoles(completedWithoutHoles.value.count, completedWithoutHoles.value.sampleIds));
  } else {
    errors.push(
      `completed-without-holes: ${completedWithoutHoles.reason instanceof Error ? completedWithoutHoles.reason.message : String(completedWithoutHoles.reason)}`,
    );
  }

  return {
    // 'ok' whenever at least one check produced a real result — a single
    // failing check degrades that ONE row to unknown upstream (see
    // run-checks.ts), it does not blank the whole outcome.
    status: results.length > 0 ? 'ok' : 'error',
    results,
    error: errors.length > 0 ? errors.join('; ') : null,
  };
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function fetchOrphanedShots(admin: AdminClient): Promise<{ count: number; sampleIds: string[]; error: string | null }> {
  const [countRes, sampleRes] = await Promise.all([
    admin.from('golf_shots').select('id', { count: 'exact', head: true }).is('hole_id', null),
    admin.from('golf_shots').select('id').is('hole_id', null).order('created_at', { ascending: false }).limit(SAMPLE_LIMIT),
  ]);

  if (countRes.error) return { count: 0, sampleIds: [], error: countRes.error.message };
  if (sampleRes.error) return { count: 0, sampleIds: [], error: sampleRes.error.message };

  return {
    count: countRes.count ?? 0,
    sampleIds: (sampleRes.data ?? []).map((r) => r.id),
    error: null,
  };
}

async function fetchCompletedRoundsWithoutHoles(
  admin: AdminClient,
): Promise<{ count: number; sampleIds: string[]; error: string | null }> {
  const filter = 'holes_played.is.null,holes_played.eq.0';

  const [countRes, sampleRes] = await Promise.all([
    admin.from('golf_rounds').select('id', { count: 'exact', head: true }).eq('status', 'completed').or(filter),
    admin
      .from('golf_rounds')
      .select('id')
      .eq('status', 'completed')
      .or(filter)
      .order('created_at', { ascending: false })
      .limit(SAMPLE_LIMIT),
  ]);

  if (countRes.error) return { count: 0, sampleIds: [], error: countRes.error.message };
  if (sampleRes.error) return { count: 0, sampleIds: [], error: sampleRes.error.message };

  return {
    count: countRes.count ?? 0,
    sampleIds: (sampleRes.data ?? []).map((r) => r.id),
    error: null,
  };
}
