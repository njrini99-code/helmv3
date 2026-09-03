import 'server-only';

/**
 * Helm Bridge — platform metrics reader (brief §20, §35A's "CPU, memory, DB
 * size, Realtime pressure" cards).
 *
 * Thin `AdminFetchResult` wrapper around
 * `fetchSupabasePlatformMetrics` (`src/lib/observability/supabase/metrics-api.ts`)
 * — same `ok`/`unconfigured`/`error` envelope every other file in
 * `src/lib/admin/database/*` uses. `unconfigured` here means "no
 * `SUPABASE_SERVICE_ROLE_KEY`/`NEXT_PUBLIC_SUPABASE_URL` credential", which
 * is a LEGITIMATE, expected state for a $0-recurring-cost program — never
 * treated as a fabricated healthy, and never treated as a hard failure
 * either (see that file's own `PlatformSourceStatus` doc).
 */
import {
  fetchSupabasePlatformMetrics,
  type PlatformHealthModel,
  type PlatformSourceStatus,
} from '@/lib/observability/supabase/metrics-api';
import { failed, ok, unconfigured, type AdminFetchResult } from '@/lib/admin/fetch-result';
import { createAdminClient } from '@/lib/supabase/admin';
import type { PlatformSample } from '@/lib/observability/supabase/platform-rules';

export type { PlatformHealthModel, PlatformSourceStatus };

export async function fetchPlatformHealth(): Promise<AdminFetchResult<PlatformHealthModel>> {
  const model = await fetchSupabasePlatformMetrics();

  if (model.sourceStatus === 'unconfigured') {
    return unconfigured('Supabase Metrics API (SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL)');
  }
  if (model.sourceStatus === 'unreachable') {
    return failed('Supabase Metrics API endpoint unreachable', { degraded: true });
  }
  if (model.sourceStatus === 'unparseable') {
    return failed('Supabase Metrics API returned a body that could not be parsed as Prometheus text', { degraded: true });
  }

  return ok(model);
}

/** Raw row shape `helm_debug_read_db_platform_history` returns. */
interface RawPlatformHistoryRow {
  sampled_at: string;
  db_up: number | null;
  cpu_pct: number | null;
  memory_pct: number | null;
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

const HISTORY_LIMIT = 12; // ~1 hour at the sampler's 5-minute cadence

/**
 * Reads the stored platform-sample ring.
 *
 * WHY THIS EXISTS. `evaluatePlatformRules` decides "sustained" from
 * CONSECUTIVE samples, so handing it a single live reading makes every
 * sustained rule structurally unable to fire and report `clear` forever —
 * a green over a rule that was never evaluated. The
 * `helm_debug_read_db_platform_history` facade shipped in
 * 20260903191400 exists for exactly this and had no caller until now.
 *
 * While that migration is HELD the read degrades to `unconfigured`, and the
 * caller must render the sustained rules as blind rather than clear.
 */
export async function fetchPlatformHistory(): Promise<AdminFetchResult<PlatformSample[]>> {
  const admin = createAdminClient();

  const { data, error } = (await admin.rpc('helm_debug_read_db_platform_history' as never, {
    p_limit: HISTORY_LIMIT,
  } as never)) as { data: RawPlatformHistoryRow[] | null; error: MaybePostgrestError };

  if (error) {
    if (isMigrationNotAppliedError(error)) {
      return unconfigured('db_platform_samples (migration HELD — see supabase/migrations/HELD.md)');
    }
    return failed(error.message ?? 'helm_debug_read_db_platform_history failed');
  }

  // `dbUp` is deliberately `0 | 1 | null` rather than `number`, so absence
  // cannot collapse into "down". A stored value that is neither 0 nor 1 is
  // not a third state — it is an unreadable one, and maps to null.
  const narrowDbUp = (v: number | null): 0 | 1 | null => (v === 0 ? 0 : v === 1 ? 1 : null);

  const samples: PlatformSample[] = (data ?? []).map((raw) => ({
    sampledAt: raw.sampled_at,
    dbUp: narrowDbUp(raw.db_up),
    cpuPct: raw.cpu_pct,
    memoryPct: raw.memory_pct,
  }));

  return ok(samples);
}
