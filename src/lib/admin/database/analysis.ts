import 'server-only';

/**
 * Helm Bridge — Index suggestions, Unused indexes, Bloat, Coverage strip
 * inputs (D5 task 4). Reads `helm_debug.db_analysis_samples` through
 * `helm_debug_read_db_analysis_samples`: the latest window's rows grouped
 * by category, plus the window closest to 24h before that for the
 * "changed since yesterday" strip.
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { failed, ok, unconfigured, type AdminFetchResult } from '@/lib/admin/fetch-result';
import { summarizeChangeSince, type AnalysisCategory, type AnalysisChangeSummary } from '@/lib/observability/supabase/db-analysis';

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

export interface AnalysisSampleRow {
  id: number;
  sampledAt: string;
  category: AnalysisCategory;
  subject: string | null;
  payload: Record<string, unknown>;
}

interface RawAnalysisRow {
  id: number;
  sampled_at: string;
  category: AnalysisCategory;
  subject: string | null;
  payload: Record<string, unknown>;
}

function mapRow(raw: RawAnalysisRow): AnalysisSampleRow {
  return {
    id: raw.id,
    sampledAt: raw.sampled_at,
    category: raw.category,
    subject: raw.subject,
    payload: raw.payload ?? {},
  };
}

export interface DatabaseAnalysisSnapshot {
  latestSampledAt: string | null;
  priorSampledAt: string | null;
  byCategory: Record<AnalysisCategory, AnalysisSampleRow[]>;
  changeSince: AnalysisChangeSummary[];
}

const EMPTY_BY_CATEGORY: Record<AnalysisCategory, AnalysisSampleRow[]> = {
  index_suggestion: [],
  unused_index: [],
  bloat: [],
  seq_scan_ratio: [],
  connections: [],
  locks: [],
  rls_coverage: [],
};

function groupByCategory(rows: AnalysisSampleRow[]): Record<AnalysisCategory, AnalysisSampleRow[]> {
  const grouped: Record<AnalysisCategory, AnalysisSampleRow[]> = {
    index_suggestion: [],
    unused_index: [],
    bloat: [],
    seq_scan_ratio: [],
    connections: [],
    locks: [],
    rls_coverage: [],
  };
  for (const row of rows) {
    grouped[row.category]?.push(row);
  }
  return grouped;
}

export async function fetchDatabaseAnalysis(): Promise<AdminFetchResult<DatabaseAnalysisSnapshot>> {
  const admin = createAdminClient();

  const { data, error } = (await admin.rpc('helm_debug_read_db_analysis_samples' as never, {} as never)) as {
    data: {
      latest_sampled_at: string | null;
      prior_sampled_at: string | null;
      latest: RawAnalysisRow[];
      prior: RawAnalysisRow[];
    } | null;
    error: MaybePostgrestError;
  };

  if (error) {
    if (isMigrationNotAppliedError(error)) {
      return unconfigured('db_analysis_samples (migration HELD — see supabase/migrations/HELD.md)');
    }
    return failed(error.message ?? 'helm_debug_read_db_analysis_samples failed');
  }

  const latest = (data?.latest ?? []).map(mapRow);
  const prior = data?.prior_sampled_at ? (data?.prior ?? []).map(mapRow) : null;

  return ok({
    latestSampledAt: data?.latest_sampled_at ?? null,
    priorSampledAt: data?.prior_sampled_at ?? null,
    byCategory: latest.length > 0 ? groupByCategory(latest) : EMPTY_BY_CATEGORY,
    changeSince: summarizeChangeSince(latest, prior),
  });
}
