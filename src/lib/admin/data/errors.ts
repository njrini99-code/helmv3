import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  fetchSentryHourlyStats,
  type SentryIssue,
  type SentryStatsPoint,
} from '@/lib/admin/sentry-api';
import { fetchVercelDeployments, type VercelDeployment } from '@/lib/admin/vercel-api';
import type { AdminFetchResult } from '@/lib/admin/fetch-result';
import {
  fetchIncidentFeed,
  DEFAULT_INCIDENT_WINDOW_HOURS,
  type IncidentFeedFilters,
  type IncidentFeedCounts,
} from '@/lib/admin/data/incident-feed';
import type { TriageItem, TriageSeverity } from '@/lib/admin/data/triage';
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
// 'sentry' is a synthetic, UI-only source (the "this row came from Sentry"
// breakdown chip — see incident-feed.ts's buildSentrySearchQuery doc
// comment) rather than a real admin_events.source value. It's honored here
// so the chip actually filters: queryAppErrorEvents's `.eq('source', 'sentry')`
// naturally returns zero app rows (no admin_events row is ever tagged
// 'sentry'), and buildSentrySearchQuery deliberately skips the error_source
// token for it — net effect, selecting it narrows the merged list to
// Sentry-origin incidents only.
const SOURCES = new Set([
  'server_action', 'route_handler', 'server_component', 'background_job', 'request_hook',
  'rls_denial', 'auth', 'cron', 'integrity', 'client', 'system', 'sentry',
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
  const filters: ErrorsTabFilters = { windowHours: DEFAULT_INCIDENT_WINDOW_HOURS };
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
  deployments: AdminFetchResult<VercelDeployment[]>;
  deployMarkers: number[];
  incidents: TriageItem[];
  counts: IncidentFeedCounts;
  rlsDenials24h: number;
  widerWindowUnresolved: number | null;
  widerWindowUntagged: number | null;
}> {
  const admin = createAdminClient();
  const ago24h = new Date(Date.now() - 24 * 3600_000).toISOString();
  const feedFilters: IncidentFeedFilters = {
    windowHours: filters.windowHours,
    sport: filters.sport,
    severity: filters.severity,
    source: filters.source,
    feature: filters.feature,
  };

  let rlsQuery = admin.from('admin_events').select('id', { count: 'exact', head: true })
    .eq('source', 'rls_denial').gte('created_at', ago24h);
  if (filters.sport) rlsQuery = rlsQuery.eq('sport', filters.sport);

  const widerSince =
    filters.windowHours < 168
      ? new Date(Date.now() - 168 * 3600_000).toISOString()
      : null;
  let widerQuery = widerSince
    ? admin
        .from('admin_events')
        .select('id', { count: 'exact', head: true })
        .eq('event_type', 'error')
        .eq('resolved', false)
        .neq('severity', 'info')
        .gte('created_at', widerSince)
    : null;
  if (widerQuery && filters.sport) widerQuery = widerQuery.eq('sport', filters.sport);

  const widerUntaggedQuery =
    widerSince && filters.sport
      ? admin
          .from('admin_events')
          .select('id', { count: 'exact', head: true })
          .eq('event_type', 'error')
          .eq('resolved', false)
          .neq('severity', 'info')
          .gte('created_at', widerSince)
          .is('sport', null)
      : null;

  const [hourly, deploys, rlsRes, widerRes, widerUntaggedRes, feed] = await Promise.all([
    fetchSentryHourlyStats(),
    fetchVercelDeployments(20),
    rlsQuery,
    widerQuery,
    widerUntaggedQuery,
    fetchIncidentFeed(feedFilters),
  ]);

  const windowStart = Date.now() - filters.windowHours * 3600_000;
  const deployMarkers = (deploys.data ?? [])
    .filter((d) => d.target === 'production' && d.createdAt >= windowStart)
    .map((d) => d.createdAt);

  return {
    sentry: feed.sentry,
    hourly,
    deployments: deploys,
    deployMarkers,
    incidents: feed.incidents,
    counts: feed.counts,
    rlsDenials24h: rlsRes.count ?? 0,
    widerWindowUnresolved: widerRes ? widerRes.count ?? 0 : null,
    widerWindowUntagged: widerUntaggedRes ? widerUntaggedRes.count ?? 0 : null,
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
