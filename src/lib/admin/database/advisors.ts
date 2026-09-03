import 'server-only';

/**
 * Helm Bridge — Advisor findings reader (brief §30).
 *
 * Thin `AdminFetchResult` wrapper around
 * `fetchSupabaseAdvisors` (`src/lib/observability/supabase/advisors.ts`).
 * `unconfigured` means no `SUPABASE_ACCESS_TOKEN` — legitimate for a
 * $0-recurring-cost program, never a fabricated "no findings".
 */
import { fetchSupabaseAdvisors, type AdvisorFinding } from '@/lib/observability/supabase/advisors';
import { failed, ok, unconfigured, type AdminFetchResult } from '@/lib/admin/fetch-result';

export type { AdvisorFinding };

export interface DatabaseAdvisorsSnapshot {
  findings: AdvisorFinding[];
  errorCount: number;
}

export async function fetchDatabaseAdvisors(): Promise<AdminFetchResult<DatabaseAdvisorsSnapshot>> {
  const { findings, sourceStatus } = await fetchSupabaseAdvisors();

  if (sourceStatus === 'unconfigured') {
    return unconfigured('Supabase Advisors API (SUPABASE_ACCESS_TOKEN)');
  }
  if (sourceStatus === 'unreachable') {
    return failed('Supabase Advisors API unreachable', { degraded: true });
  }

  return ok({
    findings,
    errorCount: findings.filter((f) => f.level === 'ERROR').length,
  });
}
