'use server';

/**
 * Root-cause analysis for one incident fingerprint.
 *
 * Thin orchestration only: gate on super-admin, then delegate to
 * `@/lib/admin/rca-run`, which does the actual work (gather context, call
 * the model, persist on success). That module is also what the
 * `selfheal-triage` Vercel cron calls directly — a cron authenticates via
 * `requireCronAuth`, not a user session, so it cannot go through this
 * `'use server'` action's `requireSuperAdmin()` gate. Splitting the gate from
 * the work is what lets both callers share one implementation.
 *
 * `analyzeErrorFingerprint` always runs a fresh analysis — `getStoredRcaAnalysis`
 * is the separate read path a page loads on mount to show the last one without
 * spending anything.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { runRcaForFingerprint, persistRcaAnalysis } from '@/lib/admin/rca-run';
import { rcaAnalysisSchema, type RcaAnalysis, type RcaResult } from '@/lib/admin/rca';

/**
 * Run a fresh root-cause analysis for a fingerprint and persist it on success.
 * Super-admin only. Never throws — every failure path (bad input, missing
 * events, unconfigured provider, model error) returns a typed `RcaResult`.
 */
export async function analyzeErrorFingerprint(fingerprint: string): Promise<RcaResult> {
  await requireSuperAdmin();

  const result = await runRcaForFingerprint(fingerprint);
  if (result.status === 'ok') {
    await persistRcaAnalysis(fingerprint.trim(), result.analysis);
  }
  return result;
}

/**
 * Read the most recent stored analysis for a fingerprint, or `null` when none
 * exists yet (a genuinely-empty state, not an error). Super-admin only, same
 * gate as the write path — this reads `admin_events` with the service-role
 * client.
 */
export async function getStoredRcaAnalysis(fingerprint: string): Promise<RcaAnalysis | null> {
  await requireSuperAdmin();

  const trimmed = (fingerprint ?? '').trim();
  if (!trimmed) return null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('admin_events')
    .select('metadata')
    .eq('event_type', 'rca_analysis')
    .eq('fingerprint', trimmed)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.metadata) return null;

  // Validate rather than trust — this is JSON out of a column, not a value
  // this module just constructed.
  const parsed = rcaAnalysisSchema.safeParse(data.metadata);
  return parsed.success ? parsed.data : null;
}
