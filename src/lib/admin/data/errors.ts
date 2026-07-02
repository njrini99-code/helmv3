import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  fetchSentryIssues,
  fetchSentryHourlyStats,
  type SentryIssue,
  type SentryStatsPoint,
} from '@/lib/admin/sentry-api';
import { fetchVercelDeployments } from '@/lib/admin/vercel-api';
import type { AdminFetchResult } from '@/lib/admin/fetch-result';
import {
  mergeTriage,
  type TriageItem,
  type TriageSeverity,
  type AppTriageEventRow,
} from '@/lib/admin/data/triage';

export interface ErrorsTabFilters {
  sport?: 'golf' | 'baseball' | 'shared';
  severity?: TriageSeverity;
  source?: string;
  windowHours: number;
}

const SPORTS = new Set(['golf', 'baseball', 'shared']);
const SEVERITIES = new Set(['critical', 'error', 'warning', 'info']);
const SOURCES = new Set([
  'server_action', 'route_handler', 'server_component', 'background_job', 'request_hook',
  'rls_denial', 'auth', 'cron', 'integrity', 'client', 'system',
]);

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** URL-persisted filter chips — deep-linkable drill-downs. Invalid URL
 *  values are DROPPED, never trusted. */
export function parseErrorsFilters(
  searchParams: Record<string, string | string[] | undefined>,
): ErrorsTabFilters {
  const filters: ErrorsTabFilters = { windowHours: 24 };
  const sport = first(searchParams.sport);
  if (sport && SPORTS.has(sport)) filters.sport = sport as ErrorsTabFilters['sport'];
  const severity = first(searchParams.severity);
  if (severity && SEVERITIES.has(severity)) filters.severity = severity as TriageSeverity;
  const source = first(searchParams.source);
  if (source && SOURCES.has(source)) filters.source = source;
  const window = Number(first(searchParams.window));
  if (Number.isFinite(window) && window > 0 && window <= 720) filters.windowHours = window;
  return filters;
}

export async function fetchErrorsTab(filters: ErrorsTabFilters): Promise<{
  sentry: AdminFetchResult<SentryIssue[]>;
  hourly: AdminFetchResult<SentryStatsPoint[]>;
  deployMarkers: number[];
  incidents: TriageItem[];
  rlsDenials24h: number;
}> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - filters.windowHours * 3600_000).toISOString();
  const ago24h = new Date(Date.now() - 24 * 3600_000).toISOString();

  let query = admin
    .from('admin_events')
    .select('id, title, message, severity, sport, fingerprint, user_id, url, created_at')
    .eq('event_type', 'error')
    .eq('resolved', false)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(500);
  if (filters.sport) query = query.eq('sport', filters.sport);
  if (filters.severity) query = query.eq('severity', filters.severity);
  if (filters.source) query = query.eq('source', filters.source);

  const [sentry, hourly, deploys, appRes, rlsRes] = await Promise.all([
    fetchSentryIssues({ limit: 50 }),
    fetchSentryHourlyStats(),
    fetchVercelDeployments(20),
    query,
    admin.from('admin_events').select('id', { count: 'exact', head: true })
      .eq('source', 'rls_denial').gte('created_at', ago24h),
  ]);

  const windowStart = Date.now() - filters.windowHours * 3600_000;
  const deployMarkers = (deploys.data ?? [])
    .filter((d) => d.target === 'production' && d.createdAt >= windowStart)
    .map((d) => d.createdAt);

  const appEvents = (appRes.data ?? []) as unknown as AppTriageEventRow[];
  return {
    sentry,
    hourly,
    deployMarkers,
    incidents: mergeTriage({ sentryIssues: [], appEvents }),
    rlsDenials24h: rlsRes.count ?? 0,
  };
}

export async function fetchFingerprintDetail(fingerprint: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from('admin_events')
    .select('id, title, message, severity, created_at, user_email, user_id, team_id, url, stack_trace')
    .eq('fingerprint', fingerprint)
    .order('created_at', { ascending: false })
    .limit(100);
  return { events: data ?? [] };
}
