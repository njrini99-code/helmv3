'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';

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

export interface ErrorRateEntry {
  hour: string;
  totalErrors: number;
  criticalErrors: number;
  userFacingErrors: number;
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

// ============================================
// MAIN FETCH
// ============================================

export async function getSystemTabData(): Promise<SystemTabData> {
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
      errorTrendSettled,
      authMetricsSettled,
      backgroundJobsSettled,
      dbTelemetrySettled,
    ] = await Promise.allSettled([
      // RPC calls
      (adminDb.rpc('get_api_performance_summary' as never, { period_days: 7 } as never) as unknown) as Promise<{ data: any[] | null; error: unknown }>,
      (adminDb.rpc('get_enhanced_system_health' as never) as unknown) as Promise<{ data: any[] | null; error: unknown }>,

      // Direct table queries for hourly data
      ((adminDb.from('error_rate_hourly' as never) as any)
        .select('*')
        .gte('hour', ago7d)
        .order('hour', { ascending: true }) as unknown) as Promise<{ data: any[] | null; error: unknown }>,

      ((adminDb.from('auth_metrics_hourly' as never) as any)
        .select('*')
        .gte('hour', ago7d)
        .order('hour', { ascending: true }) as unknown) as Promise<{ data: any[] | null; error: unknown }>,

      ((adminDb.from('background_job_logs' as never) as any)
        .select('*')
        .order('started_at', { ascending: false }) as unknown) as Promise<{ data: any[] | null; error: unknown }>,

      // get_db_telemetry returns a single jsonb payload (not a rowset).
      (adminDb.rpc('get_db_telemetry' as never) as unknown) as Promise<{ data: unknown; error: unknown }>,
    ]);

    function unwrapList(
      label: string,
      settled: PromiseSettledResult<{ data: any[] | null; error: unknown }>,
    ): any[] {
      if (settled.status === 'rejected') {
        void logServerError(
          `[admin-system-data] ${label} rejected: ${settled.reason instanceof Error ? settled.reason.message : String(settled.reason)}`,
          { action: 'admin_system_data.getSystemTabData' },
        );
        return [];
      }
      const { data, error } = settled.value;
      if (error) {
        void logServerError(
          `[admin-system-data] ${label} errored: ${error instanceof Error ? error.message : String(error)}`,
          { action: 'admin_system_data.getSystemTabData' },
        );
        return [];
      }
      return data ?? [];
    }

    const apiPerfRes = { data: unwrapList('get_api_performance_summary', apiPerfSettled) };
    const systemHealthRes = { data: unwrapList('get_enhanced_system_health', systemHealthSettled) };
    const errorTrendRes = { data: unwrapList('error_rate_hourly', errorTrendSettled) };
    const authMetricsRes = { data: unwrapList('auth_metrics_hourly', authMetricsSettled) };
    const backgroundJobsRes = { data: unwrapList('background_job_logs', backgroundJobsSettled) };

    // DB telemetry — single jsonb row. Falls back to empty shape on failure
    // so the System tab still renders the rest of the panel.
    let dbTelemetry: DbTelemetry = emptyDbTelemetry();
    if (dbTelemetrySettled.status === 'fulfilled') {
      const { data, error } = dbTelemetrySettled.value;
      if (error) {
        void logServerError(
          `[admin-system-data] get_db_telemetry errored: ${error instanceof Error ? error.message : String(error)}`,
          { action: 'admin_system_data.getSystemTabData' },
        );
      } else {
        dbTelemetry = parseDbTelemetry(data);
      }
    } else {
      void logServerError(
        `[admin-system-data] get_db_telemetry rejected: ${dbTelemetrySettled.reason instanceof Error ? dbTelemetrySettled.reason.message : String(dbTelemetrySettled.reason)}`,
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

    // Parse error trend (hourly)
    const errorTrend: ErrorRateEntry[] = ((errorTrendRes.data ?? []) as any[]).map(
      (row: Record<string, unknown>) => ({
        hour: String(row.hour ?? ''),
        totalErrors: Number(row.total_errors ?? 0),
        criticalErrors: Number(row.critical_errors ?? 0),
        userFacingErrors: Number(row.user_facing_errors ?? 0),
        affectedUsers: Number(row.affected_users ?? 0),
      })
    );

    // Parse auth metrics (hourly)
    const authMetrics: AuthMetricsEntry[] = ((authMetricsRes.data ?? []) as any[]).map(
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
      authMetrics,
      backgroundJobs,
      systemHealth,
      dbTelemetry,
    };
  } catch (error) {
    await logServerError(`[admin-system-data] Failed to fetch system tab data: ${error instanceof Error ? error.message : String(error)}`, { action: 'admin_system_data.getSystemTabData' });
    return emptySystemTabData();
  }
}
