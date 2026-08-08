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
  isIncidentClass,
  INCIDENT_CLASS_ORDER,
  INCIDENT_CLASS_LABEL,
  type IncidentClass,
} from '@/lib/admin/incident-classification';
import { INCIDENT_SEVERITIES } from '@/lib/admin/severity';
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
  /**
   * Kind filter, layered on top of the existing severity/source/sport chips.
   * - undefined (DEFAULT) → actionable only. The July feed was ~60% routine
   *   telemetry, empty states and expected access denials; showing all of it
   *   by default put `gateMetrics` (575 unresolved, not a bug) at the top of
   *   triage while real defects ranked below it.
   * - 'all' → nothing filtered (the escape hatch — noise is never DELETED,
   *   only defaulted out of view).
   * - a specific IncidentClass → just that kind.
   */
  kind?: IncidentClass | 'all';
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
  const kind = first(searchParams.kind);
  if (kind === 'all' || (kind && isIncidentClass(kind))) filters.kind = kind;
  return filters;
}

/**
 * Apply the kind filter. Split out (and exported) so it is unit-testable
 * without a database, and so the "how many did we hide" count below is
 * provably computed from the same predicate that does the hiding.
 */
export function applyKindFilter(
  incidents: readonly TriageItem[],
  kind: ErrorsTabFilters['kind'],
): TriageItem[] {
  if (kind === 'all') return [...incidents];
  if (kind) return incidents.filter((i) => i.klass === kind);
  return incidents.filter((i) => i.actionable);
}

/** Per-class tallies for the chip row, computed BEFORE the kind filter runs
 *  so each chip can show what it would reveal. */
export function countByKind(incidents: readonly TriageItem[]): {
  byClass: Record<IncidentClass, number>;
  actionable: number;
  suppressed: number;
} {
  const byClass = Object.fromEntries(
    INCIDENT_CLASS_ORDER.map((k) => [k, 0]),
  ) as Record<IncidentClass, number>;
  let actionable = 0;
  for (const i of incidents) {
    byClass[i.klass] = (byClass[i.klass] ?? 0) + 1;
    if (i.actionable) actionable += 1;
  }
  return { byClass, actionable, suppressed: incidents.length - actionable };
}

/** Human-readable active-filter summary for the "Copy all (filtered)" doc
 *  header — so a pasted export is self-describing about what it covers. */
export function describeErrorsFilters(filters: ErrorsTabFilters): string {
  const parts = [`window=${filters.windowHours}h`];
  parts.push(
    `kind=${
      filters.kind === 'all'
        ? 'all (including non-actionable)'
        : filters.kind
          ? INCIDENT_CLASS_LABEL[filters.kind]
          : 'actionable only'
    }`,
  );
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
  /** Per-class tallies across the UNFILTERED feed — drives the chip row. */
  kindCounts: ReturnType<typeof countByKind>;
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
        .in('severity', INCIDENT_SEVERITIES)
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
          .in('severity', INCIDENT_SEVERITIES)
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
    incidents: applyKindFilter(feed.incidents, filters.kind),
    counts: feed.counts,
    kindCounts: countByKind(feed.incidents),
    rlsDenials24h: rlsRes.count ?? 0,
    widerWindowUnresolved: widerRes ? widerRes.count ?? 0 : null,
    widerWindowUntagged: widerUntaggedRes ? widerUntaggedRes.count ?? 0 : null,
  };
}

const SEVERITY_RANK: Record<string, number> = { critical: 0, error: 1, warning: 2, info: 3 };

/** Per-fingerprint rollup rendered above the event list. Every field is
 *  labelled at the call site with whether it is exact or window-limited —
 *  see `truncated`. */
export interface FingerprintSummary {
  /** TRUE total occurrences for this fingerprint (exact count query), which
   *  may exceed the `EVENT_PAGE_SIZE` rows actually fetched. */
  totalCount: number;
  /** True when totalCount > the fetched page — the UI must say so rather
   *  than presenting `events.length` as the occurrence count. */
  truncated: boolean;
  /** TRUE earliest occurrence, from its own ascending query — NOT the oldest
   *  of the fetched page. Previously this was `first.created_at` off a
   *  DESC-ordered 100-row page, so for any incident with >100 occurrences it
   *  reported a recent timestamp as "first seen" — and, worse, fed that wrong
   *  start time into selectNearbyDeploys(), mis-attributing which deploy
   *  introduced exactly the high-volume errors you most want to attribute. */
  firstSeen: string | null;
  lastSeen: string | null;
  /** Distinct user_ids WITHIN the fetched page — a lower bound when
   *  `truncated` is true. Labelled as such in the UI. */
  affectedUserCount: number;
  nearbyDeploys: ReturnType<typeof selectNearbyDeploys>;
}

const EVENT_PAGE_SIZE = 100;

export async function fetchFingerprintDetail(rawFingerprint: string) {
  const admin = createAdminClient();
  // Route params arrive URL-encoded (`row%3A<id>`); events without a stored
  // fingerprint carry a synthetic `row:<id>` key from the triage merge —
  // those resolve by primary key, not by the fingerprint column.
  const fingerprint = decodeURIComponent(rawFingerprint);
  const isRowKey = fingerprint.startsWith('row:');
  const rowId = isRowKey ? fingerprint.slice('row:'.length) : null;

  const scoped = <T>(q: { eq: (col: string, val: string) => T }): T =>
    isRowKey ? q.eq('id', rowId!) : q.eq('fingerprint', fingerprint);

  const base = admin
    .from('admin_events')
    .select(
      'id, title, message, severity, created_at, user_email, user_id, team_id, url, stack_trace, source, feature, sport, metadata',
    );
  const [{ data, error }, deploys, totalRes, earliestRes] = await Promise.all([
    scoped(base).order('created_at', { ascending: false }).limit(EVENT_PAGE_SIZE),
    fetchVercelDeployments(20),
    // Exact occurrence count — head:true so no rows travel, only the count.
    scoped(admin.from('admin_events').select('id', { count: 'exact', head: true })),
    // TRUE first-seen, independent of the DESC page above.
    scoped(admin.from('admin_events').select('created_at'))
      .order('created_at', { ascending: true })
      .limit(1),
  ]);
  // Throw (rather than silently degrading to []) so PanelBoundary's error
  // boundary catches a real query failure and renders PanelStale — a
  // genuinely-empty fingerprint (zero rows, no error) is a distinct state
  // the page itself renders via PanelNoData.
  if (error) {
    throw new Error(`fetchFingerprintDetail(${fingerprint}): ${error.message}`);
  }
  const events = data ?? [];

  const totalCount = totalRes.count ?? events.length;
  const trueFirstSeen =
    (earliestRes.data?.[0]?.created_at as string | null | undefined) ??
    events[events.length - 1]?.created_at ??
    null;
  const lastSeen = events[0]?.created_at ?? null;

  const summary: FingerprintSummary = {
    totalCount,
    truncated: totalCount > events.length,
    firstSeen: trueFirstSeen,
    lastSeen,
    affectedUserCount: new Set(events.filter((e) => e.user_id).map((e) => e.user_id)).size,
    nearbyDeploys: selectNearbyDeploys(
      (deploys.data ?? []).map((d) => ({ sha: d.commitSha, time: d.createdAt })),
      trueFirstSeen,
      lastSeen,
    ),
  };

  const report = buildFingerprintIncidentReport(fingerprint, events, summary);
  return { events, report, summary };
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
  summary: FingerprintSummary,
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
  const worst = events.reduce(
    (acc, e) => ((SEVERITY_RANK[e.severity] ?? 3) < (SEVERITY_RANK[acc] ?? 3) ? e.severity : acc),
    'info',
  );
  const actionName = events.map((e) => extractActionName(e.metadata)).find((a) => a !== null) ?? null;
  const stackTrace = events.map((e) => e.stack_trace).find((s) => !!s) ?? null;
  const collapsedCount = events.reduce((sum, e) => sum + extractCollapsedCount(e.metadata), 0);

  return buildIncidentReport({
    title: last.title,
    message: last.message,
    fingerprint,
    source: last.source ?? null,
    severity: worst,
    sport: last.sport ?? null,
    featureKey: last.feature ?? null,
    actionName,
    // Exact total, not the fetched-page length — a copied report that says
    // "47 events" when the true count is 312 sends the reader (often Claude)
    // down a wrong severity assessment.
    eventCount: summary.totalCount,
    collapsedCount,
    affectedUserCount: summary.affectedUserCount,
    firstSeen: summary.firstSeen,
    lastSeen: summary.lastSeen,
    windowLabel: summary.truncated
      ? `${summary.totalCount} total occurrences; deepest ${events.length} inspected (affected-user count is a lower bound)`
      : `all ${summary.totalCount} occurrence${summary.totalCount === 1 ? '' : 's'} inspected`,
    stackTrace,
    occurrences: events.slice(0, 20).map((e) => ({
      timestamp: e.created_at ?? 'unknown',
      route: e.url ?? extractRoute(e.metadata),
      userId: e.user_id,
    })),
    deployMarkers: summary.nearbyDeploys,
  });
}
