/**
 * Retention cron for the observability tables — GET
 * /api/cron/db-observability-prune (brief §27, §40-48)
 *
 * Calls `public.helm_debug_prune_observability(...)` — Phase 1
 * (20260903180300_helm_debug_observability_retention.sql, HELD) created it
 * with a 4-arg signature pruning `db_error_events` (30d), `db_health_samples`
 * (30d), `db_stat_deltas` (14d), and `db_stat_prior_state` (14d since last
 * seen); Phase 2's A6
 * (20260903191300_helm_debug_observability_retention_v2.sql, HELD)
 * `CREATE OR REPLACE`s the SAME 4-arg signature (deliberately unchanged —
 * see that migration's header for why adding parameters would have created
 * a second, ambiguous overload) to ALSO prune `db_lock_incidents` (30d) and
 * `db_table_samples` (30d) using fixed internal windows, and returns their
 * deleted counts alongside the four original ones. This route passes
 * through whatever the RPC returns rather than naming each key, so it
 * automatically reflects whichever migration (v1 or v2) is actually applied
 * — see the two `deleted_db_lock_incidents`/`deleted_db_table_samples` keys
 * being present-or-absent as the signal for which is live.
 *
 * Same degrade-cleanly pattern as this repo's other `helm_debug_*` cron
 * routes while a migration is HELD — see
 * `src/app/api/cron/helm-debug-prune/route.ts`'s header for the full
 * reasoning.
 *
 * Auth: `requireCronAuth`. Schedule: `45 4 * * *` (vercel.json) — daily,
 * off-peak, alongside `helm-debug-prune` (`30 4 * * *`) rather than
 * concurrent with it.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordJobRun } from '@/lib/admin/job-log';
import { describeError } from '@/lib/utils/describe-error';
import { requireCronAuth } from '@/lib/cron/auth';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

interface PruneResult {
  cutoff_error_events: string;
  cutoff_health_samples: string;
  cutoff_stat_deltas: string;
  cutoff_prior_state: string;
  deleted_db_error_events: number;
  deleted_db_health_samples: number;
  deleted_db_stat_deltas: number;
  deleted_db_stat_prior_state: number;
  // Phase 2 A6 keys — present only once
  // 20260903191300_helm_debug_observability_retention_v2.sql is applied
  // (it CREATE OR REPLACEs the same 4-arg RPC as Phase 1's function, so the
  // response shape here depends on which version is live, not on anything
  // this route passes in).
  cutoff_lock_incidents?: string;
  cutoff_table_samples?: string;
  deleted_db_lock_incidents?: number;
  deleted_db_table_samples?: number;
}

type MaybePostgrestError = { code?: string | null; message?: string | null } | null;

const MIGRATION_NOT_APPLIED_CODES = new Set(['PGRST202', '42883', '42P01', '3F000']);

function isMigrationNotAppliedError(error: MaybePostgrestError): boolean {
  if (!error) return false;
  if (MIGRATION_NOT_APPLIED_CODES.has(error.code ?? '')) return true;
  const message = (error.message ?? '').toLowerCase();
  return (
    message.includes('could not find the function') ||
    (message.includes('function') && message.includes('does not exist')) ||
    (message.includes('relation') && message.includes('does not exist')) ||
    (message.includes('schema') && message.includes('does not exist'))
  );
}

export async function GET(req: NextRequest) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;

  return recordJobRun('db-observability-prune', async () => {
    const admin = createAdminClient();

    const { data, error } = (await admin.rpc('helm_debug_prune_observability' as never, {} as never)) as {
      data: PruneResult | null;
      error: MaybePostgrestError;
    };

    if (error) {
      if (isMigrationNotAppliedError(error)) {
        return NextResponse.json({
          ok: true,
          skipped: 'migration-not-applied',
          code: error.code ?? 'unknown',
          detail: 'public.helm_debug_prune_observability does not exist yet — see supabase/migrations/HELD.md',
        });
      }
      throw new Error(`helm_debug_prune_observability failed: ${describeError(error)}`);
    }

    return NextResponse.json({ ok: true, ...(data ?? {}) });
  });
}
