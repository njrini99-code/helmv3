/**
 * Triage — apply.
 *
 * Extracted from `scripts/run-triage.ts` so both the CLI's `--apply` flag and
 * the `selfheal-triage` Vercel cron (`src/app/api/cron/selfheal-triage/route.ts`)
 * close the closeable set through the exact same two-write mechanism.
 */
import type { AdminClient } from '@/lib/admin/triage-collect';
import type { TriageGroup, TriagePlan } from '@/lib/admin/triage-engine';

export interface TriageMemberResolution {
  /** Exact count of `admin_events` rows actually flipped `resolved = true`
   *  (a fingerprint can back more than one unresolved row). Always 0 for a
   *  `rel:` reliability-signal member — there is no row to flip, only the
   *  ledger. */
  rowsResolved: number;
  ledger: 'recorded' | 'declined' | 'failed';
}

/**
 * Close one member of a group — BOTH writes, never just the first.
 *
 * `admin_events.resolved` is per-ROW and only hides what exists now; the next
 * occurrence arrives as a fresh unresolved row with no memory anything was
 * ever decided. `admin_auto_resolve_error_fingerprint` is what makes a
 * recurrence read as a REGRESSION instead of a new bug, and it refuses to
 * downgrade a human's `manual` resolution. Measured 2026-08-27: 12
 * fingerprints resolved with the bare UPDATE alone and the ledger held zero
 * rows.
 *
 * Exported so the cron route's own STEP-4 resolver (an analysis-driven close,
 * not a plan.closeable close) reuses this exact mechanism instead of
 * re-implementing the two-write shape a second time.
 */
export async function resolveTriageMember(
  admin: AdminClient,
  member: { key: string; origin: string; lastSeen: string },
  reason: string,
): Promise<TriageMemberResolution> {
  let rowsResolved = 0;

  // Reliability signals have no admin_events rows to flip — ledger only.
  if (member.origin === 'admin_events') {
    const { error, count } = await admin
      .from('admin_events')
      .update({ resolved: true, resolved_at: new Date().toISOString() }, { count: 'exact' })
      .eq('fingerprint', member.key)
      .eq('event_type', 'error')
      .eq('resolved', false);
    if (error) {
      console.error(`  resolve ${member.key} FAILED: ${error.message}`);
      return { rowsResolved: 0, ledger: 'failed' };
    }
    rowsResolved = count ?? 0;
  }

  const { data, error: rpcError } = await admin.rpc('admin_auto_resolve_error_fingerprint', {
    p_fingerprint: member.key,
    p_last_seen_at: member.lastSeen,
    p_fixed_in_sha: null,
    p_note: reason.slice(0, 500),
  });
  if (rpcError) {
    console.error(`  ledger ${member.key} FAILED: ${rpcError.message}`);
    return { rowsResolved, ledger: 'failed' };
  }

  return { rowsResolved, ledger: data === true ? 'recorded' : 'declined' };
}

export interface ApplyPlanResult {
  rowsResolved: number;
  ledgerRecorded: number;
  ledgerDeclined: number;
}

/**
 * Close what the plan says is closeable, member by member, via
 * `resolveTriageMember`.
 */
export async function applyPlan(admin: AdminClient, plan: TriagePlan): Promise<ApplyPlanResult> {
  let rowsResolved = 0;
  let ledgerRecorded = 0;
  let ledgerDeclined = 0;

  for (const group of plan.closeable) {
    for (const member of group.members) {
      const result = await resolveTriageMember(admin, member, `triage: ${group.reason}`);
      rowsResolved += result.rowsResolved;
      if (result.ledger === 'recorded') ledgerRecorded += 1;
      else if (result.ledger === 'declined') ledgerDeclined += 1;
    }
  }

  return { rowsResolved, ledgerRecorded, ledgerDeclined };
}

// Re-exported so a caller that only imports triage-apply.ts can still type a
// group without a second import.
export type { TriageGroup };
