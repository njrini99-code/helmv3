'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

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

export interface SystemTabData {
  apiPerformance: ApiRoutePerf[];
  errorTrend: ErrorRateEntry[];
  authMetrics: AuthMetricsEntry[];
  backgroundJobs: BackgroundJobEntry[];
  systemHealth: SystemHealthCheck[];
}

// ============================================
// HELPERS
// ============================================

function emptySystemTabData(): SystemTabData {
  return {
    apiPerformance: [],
    errorTrend: [],
    authMetrics: [],
    backgroundJobs: [],
    systemHealth: [],
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
    const [
      apiPerfRes,
      systemHealthRes,
      errorTrendRes,
      authMetricsRes,
      backgroundJobsRes,
    ] = await Promise.all([
      // RPC calls
      adminDb.rpc('get_api_performance_summary' as never, { period_days: 7 } as never) as unknown as { data: any[] | null; error: unknown },
      adminDb.rpc('get_enhanced_system_health' as never) as unknown as { data: any[] | null; error: unknown },

      // Direct table queries for hourly data
      (adminDb.from('error_rate_hourly' as never) as any)
        .select('*')
        .gte('hour', ago7d)
        .order('hour', { ascending: true }) as unknown as { data: any[] | null; error: unknown },

      (adminDb.from('auth_metrics_hourly' as never) as any)
        .select('*')
        .gte('hour', ago7d)
        .order('hour', { ascending: true }) as unknown as { data: any[] | null; error: unknown },

      (adminDb.from('background_job_logs' as never) as any)
        .select('*')
        .order('started_at', { ascending: false }) as unknown as { data: any[] | null; error: unknown },
    ]);

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
    };
  } catch (error) {
    console.error(
      '[admin-system-data] Failed to fetch system tab data:',
      error
    );
    return emptySystemTabData();
  }
}
