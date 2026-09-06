'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { describeError } from '@/lib/utils/describe-error';

// ============================================
// TYPES
// ============================================

export interface ApiRoutePerf {
  route: string;
  totalRequests: number;
  totalErrors: number;
  errorRate: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

// `userFacingErrors` (present until 2026-08-26) was dropped, not renamed —
// see `deriveErrorTrend`'s doc comment for why.
export interface ErrorRateEntry {
  hour: string;
  totalErrors: number;
  criticalErrors: number;
  /** Distinct users with an attributable `user_id` — a lower bound, not a
   *  full count. See `deriveErrorTrend`'s doc comment. */
  affectedUsers: number;
}

export interface AuthMetricsEntry {
  hour: string;
  successfulLogins: number;
  failedLogins: number;
  activeSessions: number;
}

export interface BackgroundJobEntry {
  jobType: string;
  lastStatus: string;
  lastRunAt: string | null;
  failures7d: number;
  avgDurationMs: number | null;
}

export interface SystemHealthCheck {
  metricName: string;
  metricValue: string;
  status: string;
  detail: string;
}

export interface DbTopTable {
  schema: string;
  table: string;
  sizeBytes: number;
  rowEstimate: number;
}

export interface DbTelemetry {
  connectionPoolActive: number;
  connectionPoolIdle: number;
  dbSizeBytes: number;
  topTables: DbTopTable[];
}

export interface SystemTabData {
  apiPerformance: ApiRoutePerf[];
  errorTrend: ErrorRateEntry[];
  /**
   * True when `errorTrend`'s source query hit `ERROR_TREND_ROW_CAP` and was
   * truncated to the most recent rows — the trailing (oldest-in-window)
   * hours of `errorTrend` are then a LOWER bound, not a real zero, for as
   * many hours as the cap displaced. False for every normal-volume fetch.
   * Mirrors the `{ truncated, unavailable }` idiom in
   * `src/lib/admin/data/errors.ts` rather than letting a capped fetch look
   * identical to a genuinely quiet window.
   */
  errorTrendTruncated: boolean;
  authMetrics: AuthMetricsEntry[];
  backgroundJobs: BackgroundJobEntry[];
  systemHealth: SystemHealthCheck[];
  dbTelemetry: DbTelemetry;
}

// ============================================
// HELPERS
// ============================================

function emptyDbTelemetry(): DbTelemetry {
  return {
    connectionPoolActive: 0,
    connectionPoolIdle: 0,
    dbSizeBytes: 0,
    topTables: [],
  };
}

function emptySystemTabData(): SystemTabData {
  return {
    apiPerformance: [],
    errorTrend: [],
    errorTrendTruncated: false,
    authMetrics: [],
    backgroundJobs: [],
    systemHealth: [],
    dbTelemetry: emptyDbTelemetry(),
  };
}

interface RawDbTopTable {
  schema?: unknown;
  table?: unknown;
  size_bytes?: unknown;
  row_estimate?: unknown;
}

interface RawDbTelemetry {
  connection_pool_active?: unknown;
  connection_pool_idle?: unknown;
  db_size_bytes?: unknown;
  top_tables?: unknown;
}

function parseDbTelemetry(raw: unknown): DbTelemetry {
  if (!raw || typeof raw !== 'object') return emptyDbTelemetry();
  const r = raw as RawDbTelemetry;
  const topRaw = Array.isArray(r.top_tables) ? (r.top_tables as RawDbTopTable[]) : [];
  return {
    connectionPoolActive: Number(r.connection_pool_active ?? 0) || 0,
    connectionPoolIdle: Number(r.connection_pool_idle ?? 0) || 0,
    dbSizeBytes: Number(r.db_size_bytes ?? 0) || 0,
    topTables: topRaw.map((t) => ({
      schema: String(t.schema ?? ''),
      table: String(t.table ?? ''),
      sizeBytes: Number(t.size_bytes ?? 0) || 0,
      rowEstimate: Number(t.row_estimate ?? 0) || 0,
    })),
  };
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

// The tables/RPCs queried below (auth_metrics_hourly, background_job_logs,
// get_api_performance_summary, get_enhanced_system_health) are telemetry
// objects that intentionally aren't part of the generated `Database` types,
// so the Supabase client's `.from()`/`.rpc()` overloads can't infer a row
// shape. These narrow helper types describe just the chain shape we
// actually use, without falling back to `any`.
//
// `error_rate_hourly` used to be queried the same way here. It isn't
// anymore: the table has a schema, RLS policies and a service-role write
// grant (supabase/migrations/20260527000000_prod_public_baseline.sql), but
// nothing in this repo ever writes to it — no INSERT, no trigger, no
// pg_cron job, no Edge Function — and a direct production query on
// 2026-08-26 confirmed 0 rows. Reading it rendered a permanently-empty
// rollup indistinguishably from a real "0 errors this hour". See
// `deriveErrorTrend` below, which computes the same shape from
// `admin_events` — a table app code actually writes — and
// `memory/incidents/admin_platform/INC-2026-08-26-error-rate-hourly-never-written.md`.
type UntypedRow = Record<string, unknown>;
type UntypedResult = { data: UntypedRow[] | null; error: unknown };
interface UntypedQueryBuilder extends PromiseLike<UntypedResult> {
  select: (columns: string) => UntypedQueryBuilder;
  eq: (column: string, value: unknown) => UntypedQueryBuilder;
  gte: (column: string, value: string) => UntypedQueryBuilder;
  order: (column: string, opts: { ascending: boolean }) => UntypedQueryBuilder;
  limit: (n: number) => UntypedQueryBuilder;
  range: (from: number, to: number) => UntypedQueryBuilder;
}

// Bound on how many `admin_events` error rows `deriveErrorTrend` reads for
// the trailing 7-day window. Normal 7-day volume today is well under this;
// the cap exists so a future error spike can't turn this into an unbounded
// fetch, mirroring the `background_job_logs` 500-row cap above.
const ERROR_TREND_ROW_CAP = 20000;
// PostgREST caps any single response at 1000 rows, so the paged reader above
// walks the window a page at a time and ERROR_TREND_ROW_CAP is the ceiling on
// the ACCUMULATED total, not a value LIMIT could ever be given directly.
const ERROR_TREND_PAGE_SIZE = 1000;

/**
 * Paged, and BOUNDED at ERROR_TREND_ROW_CAP accumulated rows.
 *
 * Not `fetchAllRowsResult`: that helper drains until the source is exhausted,
 * which would make ERROR_TREND_ROW_CAP decorative — a future error storm
 * would pull every row in the window into memory for a dashboard tab. Not
 * `.limit(ERROR_TREND_ROW_CAP)` either: PostgREST truncates any single
 * response at 1000 rows, so a larger LIMIT silently returns 1000 and the
 * `rows.length >= cap` truncation check could never fire (CI's
 * audit:paginated-reads gate catches exactly this).
 *
 * So: walk the window a PostgREST-sized page at a time, stop at the cap, and
 * let the caller see `rows.length >= cap` to know it was cut short.
 */
async function fetchErrorTrendRows(
  adminDb: ReturnType<typeof createAdminClient>,
  since: string,
): Promise<{ data: AdminErrorEventRow[] | null; error: { message: string } | null }> {
  const all: AdminErrorEventRow[] = [];

  while (all.length < ERROR_TREND_ROW_CAP) {
    const remaining = ERROR_TREND_ROW_CAP - all.length;
    const pageSize = Math.min(ERROR_TREND_PAGE_SIZE, remaining);
    const from = all.length;

    const { data, error } = (await (adminDb as unknown as {
      from: (t: string) => UntypedQueryBuilder;
    })
      .from('admin_events')
      .select('created_at, severity, user_id')
      .eq('event_type', 'error')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1)) as unknown as {
      data: AdminErrorEventRow[] | null;
      error: { message: string } | null;
    };

    if (error) return { data: null, error };
    const page = data ?? [];
    all.push(...page);
    // A short page means the source is drained. Without this the loop would
    // spin forever on an empty final page.
    if (page.length < pageSize) break;
  }

  return { data: all, error: null };
}

interface AdminErrorEventRow {
  created_at: string | null;
  severity: string | null;
  user_id: string | null;
}

/**
 * Hourly error trend, derived from `admin_events` rows already scoped to
 * `event_type = 'error'` and the trailing-7-day window by the caller's
 * query. Produces one entry per hour across the full window — including
 * hours with zero matching rows — so a genuinely quiet hour and an
 * unmeasured one are both representable, but neither looks like the other:
 * every entry here reflects a real query result, unlike the old
 * `error_rate_hourly` read this replaced (see the comment above the
 * `UntypedRow`/`UntypedQueryBuilder` types).
 *
 * `userFacingErrors` — a field the old (always-empty) `error_rate_hourly`
 * row shape carried — has no counterpart here on purpose. Nothing in this
 * codebase classifies an `admin_events` row as "user-facing" vs. not: 91%
 * of `event_type = 'error'` rows in production carry `source: null`
 * (verified 2026-08-26), so any split would be invented, not derived.
 * Dropping the field is honest; inventing a rule to fill it would repeat
 * the exact failure this fix removes.
 *
 * `affectedUsers` is real but partial: it counts DISTINCT non-null
 * `user_id` values per hour, and roughly 54% of `event_type = 'error'` rows
 * in the trailing 7-day window carry a null `user_id` (verified 2026-08-26)
 * — server-side/unauthenticated failures the row can't attribute to a
 * signed-in user. Read this as "identified affected users", a lower bound,
 * not a full affected-user count.
 */
function deriveErrorTrend(
  rows: readonly AdminErrorEventRow[],
  sinceIso: string,
  nowMs: number,
): ErrorRateEntry[] {
  const HOUR_MS = 3_600_000;
  const startMs = Math.floor(Date.parse(sinceIso) / HOUR_MS) * HOUR_MS;
  const endMs = Math.floor(nowMs / HOUR_MS) * HOUR_MS;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return [];
  }
  const hourCount = Math.round((endMs - startMs) / HOUR_MS) + 1;

  const buckets = new Map<number, { total: number; critical: number; users: Set<string> }>();
  for (const row of rows) {
    const t = row.created_at ? Date.parse(row.created_at) : NaN;
    if (!Number.isFinite(t)) continue;
    const bucketMs = Math.floor(t / HOUR_MS) * HOUR_MS;
    let bucket = buckets.get(bucketMs);
    if (!bucket) {
      bucket = { total: 0, critical: 0, users: new Set<string>() };
      buckets.set(bucketMs, bucket);
    }
    bucket.total += 1;
    if (row.severity === 'critical') bucket.critical += 1;
    if (row.user_id) bucket.users.add(row.user_id);
  }

  const entries: ErrorRateEntry[] = [];
  for (let i = 0; i < hourCount; i++) {
    const bucketMs = startMs + i * HOUR_MS;
    const bucket = buckets.get(bucketMs);
    entries.push({
      hour: new Date(bucketMs).toISOString(),
      totalErrors: bucket?.total ?? 0,
      criticalErrors: bucket?.critical ?? 0,
      affectedUsers: bucket?.users.size ?? 0,
    });
  }
  return entries;
}

// ============================================
// MAIN FETCH
// ============================================

async function getSystemTabDataImpl(): Promise<SystemTabData> {
  const supabase = await createClient();

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if ((userData?.role as string) !== 'admin') throw new Error('Forbidden');

  // Use admin client (service role) for all data queries — bypasses RLS
  const adminDb = createAdminClient();
  const ago7d = daysAgo(7);

  try {
    // Each call wrapped in allSettled so a single RPC failure (e.g. timeout
    // on hourly aggregates) degrades just that subtree instead of zeroing
    // the whole tab. Pattern mirrors src/app/golf/actions/admin/rollup-b.ts
    // L569-650.
    const [
      apiPerfSettled,
      systemHealthSettled,
      errorEventsSettled,
      authMetricsSettled,
      backgroundJobsSettled,
      dbTelemetrySettled,
    ] = await Promise.allSettled([
      // RPC calls
      (adminDb.rpc('get_api_performance_summary' as never, { period_days: 7 } as never) as unknown) as Promise<UntypedResult>,
      (adminDb.rpc('get_enhanced_system_health' as never) as unknown) as Promise<UntypedResult>,

      // Error trend source rows — real `admin_events`, typed via the
      // generated `Database` schema (no `as never` needed, unlike the
      // telemetry-only tables below). Bucketed into hours by
      // `deriveErrorTrend` after this settles (bucketing is order-
      // independent — a Map keyed by hour). See the comment above the
      // `UntypedRow`/`UntypedQueryBuilder` types for why this isn't
      // `error_rate_hourly`.
      //
      // PAGED, not `.limit(ERROR_TREND_ROW_CAP)`. PostgREST truncates every
      // response at 1000 rows regardless of what LIMIT asks for, so a bare
      // `.limit(20000)` returns 1000 and the `rows.length >= 20000`
      // truncation check could never fire — the trend would silently show
      // the most recent 1000 errors as if it were the whole week, with the
      // honesty flag stuck at false. Production carries ~2.4k error rows in
      // a 7-day window (measured 2026-08-26), so that is not a hypothetical
      // ceiling: it would truncate most of the window, every time.
      //
      // `ascending: false` stays load-bearing for the same reason it always
      // was: if the window ever exceeds ERROR_TREND_ROW_CAP, the rows kept
      // are the MOST RECENT ones. Truncating the newest hours instead would
      // turn a live spike into a fabricated "0 errors" exactly when someone
      // opened this tab to look at it. `errorTrendTruncated` signals it.
      fetchErrorTrendRows(adminDb, ago7d),

      (adminDb.from('auth_metrics_hourly' as never) as unknown as UntypedQueryBuilder)
        .select('*')
        .gte('hour', ago7d)
        .order('hour', { ascending: true }),

      // Bounded: last 7 days only + hard 500-row ceiling. Downstream
      // aggregator only counts last-7-days rows for `failures_7d`, so the
      // `.gte` is consistent with existing semantics. The 500 cap protects
      // against unbounded growth on jobs that fire frequently.
      (adminDb.from('background_job_logs' as never) as unknown as UntypedQueryBuilder)
        .select('*')
        .gte('started_at', ago7d)
        .order('started_at', { ascending: false })
        .limit(500),

      // get_db_telemetry returns a single jsonb payload (not a rowset).
      (adminDb.rpc('get_db_telemetry' as never) as unknown) as Promise<{ data: unknown; error: unknown }>,
    ]);

    function unwrapList(
      label: string,
      settled: PromiseSettledResult<UntypedResult>,
    ): UntypedRow[] {
      if (settled.status === 'rejected') {
        void logServerError(
          `[admin-system-data] ${label} rejected: ${describeError(settled.reason)}`,
          { action: 'admin_system_data.getSystemTabData' },
        );
        return [];
      }
      const { data, error } = settled.value;
      if (error) {
        void logServerError(
          `[admin-system-data] ${label} errored: ${describeError(error)}`,
          { action: 'admin_system_data.getSystemTabData' },
        );
        // Deliberate, not a swallow — this whole function fans out via
        // Promise.allSettled specifically so one telemetry source failing
        // does not blank the rest of the admin System tab. Failure is
        // logged above, same as the sibling `rejected` branch right above.
        return [];
      }
      return data ?? [];
    }

    const apiPerfRes = { data: unwrapList('get_api_performance_summary', apiPerfSettled) };
    const systemHealthRes = { data: unwrapList('get_enhanced_system_health', systemHealthSettled) };
    const authMetricsRes = { data: unwrapList('auth_metrics_hourly', authMetricsSettled) };
    const backgroundJobsRes = { data: unwrapList('background_job_logs', backgroundJobsSettled) };

    // Error trend — handled separately from unwrapList because the source
    // rows are real admin_events (typed, not UntypedRow) and get bucketed
    // by hour via deriveErrorTrend rather than mapped 1:1.
    let errorTrend: ErrorRateEntry[] = [];
    let errorTrendTruncated = false;
    if (errorEventsSettled.status === 'fulfilled') {
      const { data, error } = errorEventsSettled.value;
      if (error) {
        void logServerError(
          `[admin-system-data] admin_events (error trend) errored: ${describeError(error)}`,
          { action: 'admin_system_data.getSystemTabData' },
        );
      } else {
        const rows = (data ?? []) as AdminErrorEventRow[];
        errorTrendTruncated = rows.length >= ERROR_TREND_ROW_CAP;
        if (errorTrendTruncated) {
          void logServerError(
            `[admin-system-data] admin_events (error trend) truncated at ERROR_TREND_ROW_CAP=${ERROR_TREND_ROW_CAP}`,
            { action: 'admin_system_data.getSystemTabData' },
          );
        }
        errorTrend = deriveErrorTrend(rows, ago7d, Date.now());
      }
    } else {
      void logServerError(
        `[admin-system-data] admin_events (error trend) rejected: ${describeError(errorEventsSettled.reason)}`,
        { action: 'admin_system_data.getSystemTabData' },
      );
    }

    // DB telemetry — single jsonb row. Falls back to empty shape on failure
    // so the System tab still renders the rest of the panel.
    let dbTelemetry: DbTelemetry = emptyDbTelemetry();
    if (dbTelemetrySettled.status === 'fulfilled') {
      const { data, error } = dbTelemetrySettled.value;
      if (error) {
        void logServerError(
          `[admin-system-data] get_db_telemetry errored: ${describeError(error)}`,
          { action: 'admin_system_data.getSystemTabData' },
        );
      } else {
        dbTelemetry = parseDbTelemetry(data);
      }
    } else {
      void logServerError(
        `[admin-system-data] get_db_telemetry rejected: ${describeError(dbTelemetrySettled.reason)}`,
        { action: 'admin_system_data.getSystemTabData' },
      );
    }

    // Parse API performance
    const apiPerformance: ApiRoutePerf[] = (apiPerfRes.data ?? []).map(
      (row: Record<string, unknown>) => ({
        route: String(row.route ?? ''),
        totalRequests: Number(row.total_requests ?? 0),
        totalErrors: Number(row.total_errors ?? 0),
        errorRate: Number(row.error_rate ?? 0),
        avgMs: Number(row.avg_ms ?? 0),
        p50Ms: Number(row.p50_ms ?? 0),
        p95Ms: Number(row.p95_ms ?? 0),
        p99Ms: Number(row.p99_ms ?? 0),
      })
    );

    // Parse auth metrics (hourly)
    const authMetrics: AuthMetricsEntry[] = (authMetricsRes.data ?? []).map(
      (row: Record<string, unknown>) => ({
        hour: String(row.hour ?? ''),
        successfulLogins: Number(row.successful_logins ?? 0),
        failedLogins: Number(row.failed_logins ?? 0),
        activeSessions: Number(row.active_sessions ?? 0),
      })
    );

    // Aggregate background jobs by job_type
    const jobMap = new Map<string, BackgroundJobEntry>();
    const sevenDaysAgo = new Date(ago7d);

    for (const row of backgroundJobsRes.data ?? []) {
      const jobType = String((row as Record<string, unknown>).job_type ?? 'unknown');
      const status = String((row as Record<string, unknown>).status ?? 'unknown');
      const startedAt = (row as Record<string, unknown>).started_at
        ? String((row as Record<string, unknown>).started_at)
        : null;
      const durationMs = (row as Record<string, unknown>).duration_ms != null
        ? Number((row as Record<string, unknown>).duration_ms)
        : null;

      const existing = jobMap.get(jobType);
      if (!existing) {
        const isFailed =
          status === 'failed' &&
          startedAt &&
          new Date(startedAt) >= sevenDaysAgo;
        jobMap.set(jobType, {
          jobType,
          lastStatus: status,
          lastRunAt: startedAt,
          failures7d: isFailed ? 1 : 0,
          avgDurationMs: durationMs,
        });
      } else {
        // Count failures in last 7 days
        if (
          status === 'failed' &&
          startedAt &&
          new Date(startedAt) >= sevenDaysAgo
        ) {
          existing.failures7d += 1;
        }
        // Rolling average of duration
        if (durationMs != null) {
          existing.avgDurationMs =
            existing.avgDurationMs != null
              ? (existing.avgDurationMs + durationMs) / 2
              : durationMs;
        }
      }
    }
    const backgroundJobs = Array.from(jobMap.values());

    // Parse system health checks
    const systemHealth: SystemHealthCheck[] = (systemHealthRes.data ?? []).map(
      (row: Record<string, unknown>) => ({
        metricName: String(row.metric_name ?? ''),
        metricValue: String(row.metric_value ?? ''),
        status: String(row.status ?? 'unknown'),
        detail: String(row.detail ?? ''),
      })
    );

    return {
      apiPerformance,
      errorTrend,
      errorTrendTruncated,
      authMetrics,
      backgroundJobs,
      systemHealth,
      dbTelemetry,
    };
  } catch (error) {
    await logServerError(`[admin-system-data] Failed to fetch system tab data: ${describeError(error)}`, { action: 'admin_system_data.getSystemTabData' });
    return emptySystemTabData();
  }
}

/**
 * Observed wrapper — logging never alters behavior (see observed-action
 * tests). `'use server'` requires exported server actions to be async
 * function declarations (const-export form breaks Next's build), so the
 * wrapped closure is built once at module scope and the export just
 * delegates to it.
 */
const observedGetSystemTabData = withAdminObserved(
  'getSystemTabData',
  { sport: 'shared', feature: 'admin_dashboard' },
  getSystemTabDataImpl,
);

export async function getSystemTabData(): Promise<SystemTabData> {
  return observedGetSystemTabData();
}
