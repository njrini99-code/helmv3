/**
 * Retention cron for the Phase 1 observability tables — GET
 * /api/cron/db-observability-prune (brief §27, §40-48)
 *
 * Calls `public.helm_debug_prune_observability(...)`
 * (20260903180300_helm_debug_observability_retention.sql, HELD, service_role
 * EXECUTE only), which prunes `helm_debug.db_error_events` (30d),
 * `db_health_samples` (30d), `db_stat_deltas` (14d), and
 * `db_stat_prior_state` (14d since last seen). Same degrade-cleanly pattern
 * as this repo's other `helm_debug_*` cron routes while the migration is
 * HELD — see `src/app/api/cron/helm-debug-prune/route.ts`'s header for the
 * full reasoning.
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
