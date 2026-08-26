/**
 * Helm debug trace-store prune cron — GET /api/cron/helm-debug-prune
 *
 * Calls the SECURITY DEFINER `public.helm_debug_prune(p_retention_days
 * integer)` RPC (service_role-only EXECUTE — supabase/migrations/
 * 20260826010000_helm_debug_retention.sql), which deletes
 * `helm_debug.trace_runs` / `helm_debug.trace_steps` rows older than the
 * retention window and returns a jsonb summary of what it deleted.
 *
 * DEGRADES CLEANLY WHILE THE MIGRATION IS HELD (see supabase/migrations/
 * HELD.md — R3, owner-apply-only, pending `db-migration-reviewer` sign-off as
 * of this writing). Neither `20260826010000` (this function) nor its
 * dependency `20260825200811` (the `helm_debug` schema itself) has been
 * applied to production yet, so calling this RPC today fails one of two ways:
 *   - the function itself is unknown to PostgREST → `PGRST202`
 *     ("Could not find the function … in the schema cache"), or
 *   - the function exists but `helm_debug.trace_runs`/`trace_steps` do not
 *     (only the recorder migration is missing) → a Postgres execution error
 *     (`42883` undefined_function / `42P01` undefined_table / `3F000`
 *     invalid_schema_name, depending on exactly what resolves).
 * Either shape means "the retention path isn't live yet," not "this route is
 * broken" — the same distinction HELD.md draws for every other
 * `helm_debug_*` call site: "fail-open: every call site is expected to no-op
 * or swallow the … failure rather than block the round-submit path it
 * instruments." This route degrades to a 200 no-op with a `skipped` reason
 * (surfaced in `background_job_logs.metadata`, matching the
 * `{ok:true, skipped:'not-armed'}` shape ingest-gmail-replies uses for its own
 * expected-degradation case) instead of throwing, so recordJobRun logs it as
 * `completed`, not `failed` — a routine, expected state must not write an
 * `admin_events` `error` row or page anyone every night until the owner
 * applies the migration. The same classifier idiom (without a shared import —
 * both are small, scoped local copies, not a speculative shared util) appears
 * in `src/lib/auth/supabase-rate-limit.ts` and is documented for exactly this
 * RPC in `src/app/baseball/actions/lift-onboarding.ts`.
 *
 * Any OTHER RPC error still throws, which `recordJobRun` records as a failed
 * run (`background_job_logs` + an `admin_events` `source='cron'` error row) —
 * that path stays a real page.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`, checked by
 * the shared `requireCronAuth` guard — see `src/lib/cron/auth.ts` and
 * `src/test/api/cron/shared-auth.test.ts` / `src/app/api/cron/__tests__/
 * cron-auth-coverage.test.ts` for the contract every `/api/cron` route holds
 * to.
 * Retention: 30 days (`RETENTION_DAYS` below — matches
 * `helm_debug_prune`'s own SQL default).
 * Schedule: `30 4 * * *` (see vercel.json) — daily, off-peak, alongside the
 * repo's other 02:00–04:00 UTC nightly crons; 30 was the option the migration
 * itself sketched for both the pg_cron and Vercel-cron scheduling options.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordJobRun } from '@/lib/admin/job-log';
import { describeError } from '@/lib/utils/describe-error';
import { requireCronAuth } from '@/lib/cron/auth';

export const runtime = 'nodejs';
// 300s, matching log-retention's choice for the same shape of risk: unlike
// this route's steady-state nightly call, `helm_debug_prune`'s DELETE is
// unbatched (see the migration's FK-order note), and the largest run this
// route will ever make is its FIRST one — whenever the owner applies both
// HELD migrations, against however much helm_debug had already accumulated
// before pruning went live.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const RETENTION_DAYS = 30;

/** jsonb shape `public.helm_debug_prune` returns — see the migration header. */
interface HelmDebugPruneResult {
  cutoff: string;
  retention_days: number;
  deleted_trace_steps: number;
  deleted_trace_runs: number;
}

/** Minimal shape of a PostgREST/Postgres error — enough to classify it. */
type MaybePostgrestError = { code?: string | null; message?: string | null } | null;

/**
 * `helm_debug_prune` (and the `helm_debug` schema its body queries) is not
 * live yet — see the file header. Recognize every shape that absence can take
 * so the route degrades instead of throwing, without over-matching an
 * unrelated real defect:
 *   - `PGRST202` — PostgREST cannot resolve the RPC name at all.
 *   - `42883` (undefined_function) — Postgres itself can't resolve the call.
 *   - `42P01` (undefined_table) / `3F000` (invalid_schema_name) — the
 *     function exists but the `helm_debug` schema/tables it queries do not
 *     (the two-migration ordering HELD.md and the migration header describe).
 * Falls back to a message match for any Postgres/PostgREST version that
 * reports one of these without the code surviving the client round-trip.
 */
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
  // Constant-time secret comparison — see src/lib/cron/auth.ts.
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;

  return recordJobRun('helm-debug-prune', async () => {
    const admin = createAdminClient();

    // helm_debug_prune is not in the generated Database types yet — its
    // migration is HELD, not applied (supabase/migrations/HELD.md) — so the
    // call is untyped at this boundary, the same shape
    // src/app/baseball/actions/teams.ts uses for
    // resolve_baseball_team_by_join_code while ITS migration was pending.
    const { data, error } = (await admin.rpc(
      'helm_debug_prune' as never,
      { p_retention_days: RETENTION_DAYS } as never,
    )) as { data: HelmDebugPruneResult | null; error: MaybePostgrestError };

    if (error) {
      if (isMigrationNotAppliedError(error)) {
        // `code` rides along in background_job_logs.metadata (see
        // extractOutcomeMetadata in job-log.ts, which lifts top-level string
        // scalars) so the Jobs board can tell "PGRST202 — nothing applied
        // yet, expected" apart from "42P01/3F000 — the function is live but
        // helm_debug's tables are gone, a real regression" WITHOUT paging
        // anyone tonight. Once the migration lands and stays applied, every
        // future run through this branch reports the same code forever
        // unless something actually changes underneath it — the failure mode
        // this guards is "unknown → healthy" persisting past the day it
        // stopped being true (golfhelm-engineering-os.md, "Self-healing must
        // not hide errors").
        return NextResponse.json({
          ok: true,
          skipped: 'migration-not-applied',
          code: error.code ?? 'unknown',
          detail:
            'public.helm_debug_prune (or the helm_debug schema it prunes) does not exist yet — see supabase/migrations/HELD.md',
        });
      }
      throw new Error(`helm_debug_prune failed: ${describeError(error)}`);
    }

    return NextResponse.json({
      ok: true,
      ...(data ?? {}),
    });
  });
}
