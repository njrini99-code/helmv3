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
import { FEATURE_REGISTRY, type FeatureKey } from '@/lib/admin/feature-registry';
import {
  buildIncidentReport,
  buildCombinedIncidentReport,
  extractActionName,
  extractCollapsedCount,
  extractRoute,
  selectNearbyDeploys,
} from '@/lib/admin/incident-report';

export interface ErrorsTabFilters {
  sport?: 'golf' | 'baseball' | 'shared';
  severity?: TriageSeverity;
  source?: string;
  /** W16 Task 4 — drill-in from the Feature Health board:
   *  /admin/errors?feature=<key> narrows the in-app incident feed to
   *  admin_events.feature = <key>. */
  feature?: FeatureKey;
  windowHours: number;
}

const SPORTS = new Set(['golf', 'baseball', 'shared']);
const SEVERITIES = new Set(['critical', 'error', 'warning', 'info']);
const SOURCES = new Set([
  'server_action', 'route_handler', 'server_component', 'background_job', 'request_hook',
  'rls_denial', 'auth', 'cron', 'integrity', 'client', 'system',
]);
// Valid drill-in targets: every non-excluded registry key. The CRM row is
// deliberately never a valid filter value — CRM is never touched, never
// tagged, so it would only ever return zero rows (owner directive).
const FEATURE_KEYS = new Set(FEATURE_REGISTRY.filter((f) => !f.excluded).map((f) => f.key));

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
  const feature = first(searchParams.feature);
  if (feature && FEATURE_KEYS.has(feature as FeatureKey)) filters.feature = feature as FeatureKey;
  const window = Number(first(searchParams.window));
  if (Number.isFinite(window) && window > 0 && window <= 720) filters.windowHours = window;
  return filters;
}

/** Human-readable active-filter summary for the "Copy all (filtered)" doc
 *  header — so a pasted export is self-describing about what it covers. */
export function describeErrorsFilters(filters: ErrorsTabFilters): string {
  const parts = [`window=${filters.windowHours}h`];
  if (filters.sport) parts.push(`sport=${filters.sport}`);
  if (filters.severity) parts.push(`severity=${filters.severity}`);
  if (filters.source) parts.push(`source=${filters.source}`);
  if (filters.feature) {
    const label = FEATURE_REGISTRY.find((f) => f.key === filters.feature)?.label ?? filters.feature;
    parts.push(`feature=${label} (${filters.feature})`);
  }
  return parts.join('; ');
}

/** "Copy all (filtered)" toolbar action — concatenates every currently
 *  filtered incident's own pre-built report (the same string its per-row
 *  copy button would copy) behind one filter-described header. */
export function buildFilteredIncidentsReport(incidents: readonly TriageItem[], filters: ErrorsTabFilters): string {
  return buildCombinedIncidentReport(
    incidents.map((i) => i.report),
    { filterDescription: describeErrorsFilters(filters) },
  );
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
    .select(
      'id, title, message, severity, sport, fingerprint, user_id, url, created_at, source, feature, stack_trace, metadata',
    )
    .eq('event_type', 'error')
    .eq('resolved', false)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(500);
  if (filters.sport) query = query.eq('sport', filters.sport);
  if (filters.severity) query = query.eq('severity', filters.severity);
  if (filters.source) query = query.eq('source', filters.source);
  if (filters.feature) query = query.eq('feature', filters.feature);

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

const SEVERITY_RANK: Record<string, number> = { critical: 0, error: 1, warning: 2, info: 3 };

export async function fetchFingerprintDetail(rawFingerprint: string) {
  const admin = createAdminClient();
  // Route params arrive URL-encoded (`row%3A<id>`); events without a stored
  // fingerprint carry a synthetic `row:<id>` key from the triage merge —
  // those resolve by primary key, not by the fingerprint column.
  const fingerprint = decodeURIComponent(rawFingerprint);
  const base = admin
    .from('admin_events')
    .select(
      'id, title, message, severity, created_at, user_email, user_id, team_id, url, stack_trace, source, feature, sport, metadata',
    );
  const [{ data, error }, deploys] = await Promise.all([
    (fingerprint.startsWith('row:')
      ? base.eq('id', fingerprint.slice('row:'.length))
      : base.eq('fingerprint', fingerprint))
      .order('created_at', { ascending: false })
      .limit(100),
    fetchVercelDeployments(20),
  ]);
  // Throw (rather than silently degrading to []) so PanelBoundary's error
  // boundary catches a real query failure and renders PanelStale — a
  // genuinely-empty fingerprint (zero rows, no error) is a distinct state
  // the page itself renders via PanelNoData.
  if (error) {
    throw new Error(`fetchFingerprintDetail(${fingerprint}): ${error.message}`);
  }
  const events = data ?? [];
  const report = buildFingerprintIncidentReport(fingerprint, events, deploys.data ?? []);
  return { events, report };
}

/** Copy-for-Claude report for the fingerprint detail page — aggregates every
 *  fetched event (most-recent-first, per the query's `order`) into one
 *  incident report, "where it was" resolved via the feature registry. */
function buildFingerprintIncidentReport(
  fingerprint: string,
  events: readonly {
    id: string;
    title: string;
    message: string | null;
    severity: string;
    created_at: string | null;
    user_id: string | null;
    url: string | null;
    stack_trace: string | null;
    source?: string | null;
    feature?: string | null;
    sport?: string | null;
    metadata?: unknown;
  }[],
  deploysRaw: readonly { commitSha: string | null; createdAt: number }[],
): string {
  if (events.length === 0) {
    return buildIncidentReport({
      title: `Fingerprint ${fingerprint}`,
      severity: 'info',
      fingerprint,
      message: 'No events found for this fingerprint — either every event has been resolved, or this fingerprint no longer matches any admin_events row.',
    });
  }

  // events arrives most-recent-first (query orders created_at desc).
  const last = events[0]!;
  const first = events[events.length - 1]!;
  const worst = events.reduce(
    (acc, e) => ((SEVERITY_RANK[e.severity] ?? 3) < (SEVERITY_RANK[acc] ?? 3) ? e.severity : acc),
    'info',
  );
  const actionName = events.map((e) => extractActionName(e.metadata)).find((a) => a !== null) ?? null;
  const stackTrace = events.map((e) => e.stack_trace).find((s) => !!s) ?? null;
  const collapsedCount = events.reduce((sum, e) => sum + extractCollapsedCount(e.metadata), 0);
  const affectedUserCount = new Set(events.filter((e) => e.user_id).map((e) => e.user_id)).size;
  const nearbyDeploys = selectNearbyDeploys(
    deploysRaw.map((d) => ({ sha: d.commitSha, time: d.createdAt })),
    first.created_at,
    last.created_at,
  );

  return buildIncidentReport({
    title: last.title,
    message: last.message,
    fingerprint,
    source: last.source ?? null,
    severity: worst,
    sport: last.sport ?? null,
    featureKey: last.feature ?? null,
    actionName,
    eventCount: events.length,
    collapsedCount,
    affectedUserCount,
    firstSeen: first.created_at,
    lastSeen: last.created_at,
    windowLabel: `most recent ${events.length} event${events.length === 1 ? '' : 's'} captured (unbounded lookback, 100-row cap)`,
    stackTrace,
    occurrences: events.slice(0, 20).map((e) => ({
      timestamp: e.created_at ?? 'unknown',
      route: e.url ?? extractRoute(e.metadata),
      userId: e.user_id,
    })),
    deployMarkers: nearbyDeploys,
  });
}
