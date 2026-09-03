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
