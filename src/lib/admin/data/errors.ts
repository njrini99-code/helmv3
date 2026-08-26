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
import type { TriageItem, TriageSeverity, AppTriageEventRow } from '@/lib/admin/data/triage';
import { FEATURE_REGISTRY, type FeatureKey } from '@/lib/admin/feature-registry';
import {
  isIncidentClass,
  INCIDENT_CLASS_ORDER,
  INCIDENT_CLASS_LABEL,
  classifyIncident,
  type IncidentClass,
  type IncidentClassification,
} from '@/lib/admin/incident-classification';
import { INCIDENT_SEVERITIES } from '@/lib/admin/severity';
import {
  buildIncidentReport,
  buildCombinedIncidentReport,
  resolveActionFilePath,
  extractActionName,
  extractCollapsedCount,
  extractRoute,
  extractErrorCode,
  extractErrorHint,
  extractRequestId,
  extractHelmTraceId,
  extractRuntime,
  extractHandled,
  hasUnknownAffectedUsers,
  selectNearbyDeploys,
  selectSuspectDeploy,
  type IncidentReportDeploy,
} from '@/lib/admin/incident-report';
import { rcaAnalysisSchema, type RcaAnalysis } from '@/lib/admin/rca';

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

/**
 * TriageQueue's per-row 24h sparkline, app-origin half. Sentry-origin rows
 * get theirs straight from `SentryIssue.stats24h` (a real Sentry-computed
 * series, independent of this feed's own window) at the errors/page.tsx call
 * site — no query needed there either.
 *
 * This is a rolling-hour histogram grouped by the SAME fingerprint key
 * mergeTriage uses (`row.fingerprint ?? \`row:${row.id}\``), built entirely
 * from `appEvents` — rows `fetchIncidentFeed` already fetched for the merge,
 * so this costs nothing beyond one JS pass. Two honesty guards:
 *
 *  - Only computed when `windowHours >= 24`. A narrower fetch window would
 *    otherwise leave hours before the fetch start looking like a real zero
 *    instead of "not fetched" — every reachable value today (the Errors tab's
 *    chips only offer 24 or 168) clears this, but a hand-edited `?window=`
 *    must not silently render a false-flat sparkline.
 *  - The buckets reflect `appEvents`, which `queryAppErrorEvents` has ALREADY
 *    narrowed by this request's sport/severity/source/feature filters — this
 *    is "this fingerprint's rate under the current filters", not "this
 *    fingerprint's total rate across the whole app".
 */
export function computeAppHourlyBuckets(
  appEvents: readonly Pick<AppTriageEventRow, 'id' | 'fingerprint' | 'created_at'>[],
  windowHours: number,
  nowMs: number = Date.now(),
): Record<string, number[]> {
  if (windowHours < 24) return {};
  const HOUR_MS = 3600_000;
  const windowStart = nowMs - 24 * HOUR_MS;
  const buckets: Record<string, number[]> = {};
  for (const row of appEvents) {
    const t = Date.parse(row.created_at);
    if (!Number.isFinite(t) || t < windowStart || t > nowMs) continue;
    const fp = row.fingerprint ?? `row:${row.id}`;
    const idx = Math.min(23, Math.floor((t - windowStart) / HOUR_MS));
    const arr = buckets[fp] ?? new Array(24).fill(0);
    arr[idx] = (arr[idx] ?? 0) + 1;
    buckets[fp] = arr;
  }
  return buckets;
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
  /** fingerprint (or `row:<id>`) → rolling 24h hourly histogram. See
   *  computeAppHourlyBuckets's doc comment for what it does and doesn't cover. */
  appHourlyBuckets: Record<string, number[]>;
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
    appHourlyBuckets: computeAppHourlyBuckets(feed.appEvents, filters.windowHours),
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

/**
 * Forensics header fields — every field the raw admin_events rows/metadata
 * already carry but this page never surfaced before now. Derived once from
 * `events` (already fetched, already RCA-row-filtered) using the SAME
 * last-event-title/message + worst-severity convention @/lib/admin/data/
 * triage's mergeTriage uses for its own classification, so the fingerprint
 * header and the row this fingerprint produces in TriageQueue read as the
 * same incident. `null` only when there are zero events (nothing to derive
 * from) — the page's own empty state handles that.
 */
export interface FingerprintForensics {
  severity: string;
  classification: IncidentClassification;
  errorCode: string | null;
  errorHint: string | null;
  requestId: string | null;
  helmTraceId: string | null;
  runtime: string | null;
  handled: boolean | null;
  source: string | null;
  feature: string | null;
  sport: string | null;
  actionName: string | null;
  /** resolveActionFilePath(feature, actionName) — the feature-registry hint. */
  sourceFilePath: string | null;
  /** Last production deploy at/before first-seen — see selectSuspectDeploy. */
  suspectDeploy: IncidentReportDeploy | null;
  hasUnknownAffectedUsers: boolean;
  /** Previously-run analysis, if any (@/lib/admin/rca). Read directly here
   *  (not via getStoredRcaAnalysis) so the page and its "Copy full report"
   *  button share one fetch instead of two, and so this module never imports
   *  the 'use server' actions file that itself imports fetchFingerprintDetail
   *  (analyze-error.ts) — that would be a circular import. */
  storedRca: RcaAnalysis | null;
}

/** 7-day trend for one fingerprint — a rolling-day histogram, oldest first.
 *  `truncated` means the underlying row fetch hit TREND_ROW_LIMIT, so the
 *  buckets are a LOWER bound for that window — a distinct cap from
 *  `FingerprintSummary.truncated` (the 100-row event PAGE), so the two are
 *  never conflated in the UI. */
export interface FingerprintTrend {
  /** Daily counts, oldest → newest, length `TREND_DAYS`. */
  buckets: number[];
  truncated: boolean;
  /** The trend query itself failed. Distinct from a genuine week of zeros:
   *  an unbound `error` here would have rendered an outage as "no activity",
   *  which is the exact confusion this page exists to remove. */
  unavailable: boolean;
}

const EVENT_PAGE_SIZE = 100;
const TREND_DAYS = 7;
// PostgREST's own default page ceiling — made explicit so a fingerprint with
// more rows in the trend window than this is honestly labelled a lower bound
// (`FingerprintTrend.truncated`) rather than silently clipped.
const TREND_ROW_LIMIT = 1000;

/** Rolling-day histogram for the last `days` days, oldest first, ending at
 *  `nowMs`. Pure aggregation over already-fetched timestamps — same shape as
 *  computeAppHourlyBuckets, one level up (days instead of hours). */
export function computeDailyTrend(
  timestamps: readonly (string | null | undefined)[],
  days: number = TREND_DAYS,
  nowMs: number = Date.now(),
): number[] {
  const DAY_MS = 24 * 3600_000;
  const buckets = new Array(days).fill(0) as number[];
  const windowStart = nowMs - days * DAY_MS;
  for (const ts of timestamps) {
    if (!ts) continue;
    const t = Date.parse(ts);
    if (!Number.isFinite(t) || t < windowStart || t > nowMs) continue;
    const idx = Math.min(days - 1, Math.floor((t - windowStart) / DAY_MS));
    buckets[idx] = (buckets[idx] ?? 0) + 1;
  }
  return buckets;
}

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

  // event_type='rca_analysis' is excluded on every query below: a prior
  // in-app analysis is persisted under this SAME fingerprint (see
  // @/app/admin/actions/analyze-error.ts's persistRcaAnalysis), so without
  // this it can become `events[0]` (the "most recent" row) on the very next
  // load — self-referentially reporting its own severity:'info',
  // source:'system', feature:'admin_dashboard' as if that were the incident,
  // and inflating totalCount/lastSeen with a row that isn't a real
  // occurrence. Filtered at the source rather than post-hoc in JS, unlike
  // analyze-error.ts's isOwnRcaAnalysisRow defensive title-match (that one
  // predates this fix and stays as a backstop for anything still fetching
  // unfiltered).
  const base = admin
    .from('admin_events')
    .select(
      'id, title, message, severity, created_at, user_email, user_id, team_id, url, stack_trace, source, feature, sport, metadata',
    )
    .neq('event_type', 'rca_analysis');
  const sevenDaysAgoIso = new Date(Date.now() - TREND_DAYS * 24 * 3600_000).toISOString();
  const [{ data, error }, deploys, totalRes, earliestRes, trendRes, rcaRes] = await Promise.all([
    scoped(base).order('created_at', { ascending: false }).limit(EVENT_PAGE_SIZE),
    fetchVercelDeployments(20),
    // Exact occurrence count — head:true so no rows travel, only the count.
    scoped(
      admin.from('admin_events').select('id', { count: 'exact', head: true }).neq('event_type', 'rca_analysis'),
    ),
    // TRUE first-seen, independent of the DESC page above.
    scoped(admin.from('admin_events').select('created_at').neq('event_type', 'rca_analysis'))
      .order('created_at', { ascending: true })
      .limit(1),
    // 7-day trend — a single lean (one-column) query, capped explicitly so a
    // fingerprint with more rows than TREND_ROW_LIMIT in this window is
    // labelled a lower bound rather than silently clipped.
    scoped(
      admin
        .from('admin_events')
        .select('created_at')
        .neq('event_type', 'rca_analysis')
        .gte('created_at', sevenDaysAgoIso),
    )
      .order('created_at', { ascending: true })
      .limit(TREND_ROW_LIMIT),
    // Stored RCA (if any) — keyed on the raw fingerprint string exactly like
    // getStoredRcaAnalysis, NOT run through `scoped()`: an RCA analysis is
    // always persisted under a real `fingerprint` value (never routed
    // through the row-key branch), matching analyzeErrorFingerprint's own
    // write path.
    admin
      .from('admin_events')
      .select('metadata')
      .eq('event_type', 'rca_analysis')
      .eq('fingerprint', fingerprint)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
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
  const nearbyDeploys = selectNearbyDeploys(
    (deploys.data ?? []).map((d) => ({ sha: d.commitSha, time: d.createdAt })),
    trueFirstSeen,
    lastSeen,
  );
  const affectedUserCount = new Set(events.filter((e) => e.user_id).map((e) => e.user_id)).size;

  const summary: FingerprintSummary = {
    totalCount,
    truncated: totalCount > events.length,
    firstSeen: trueFirstSeen,
    lastSeen,
    affectedUserCount,
    nearbyDeploys,
  };

  const last = events[0] ?? null;
  let forensics: FingerprintForensics | null = null;
  if (last) {
    const worst = events.reduce(
      (acc, e) => ((SEVERITY_RANK[e.severity] ?? 3) < (SEVERITY_RANK[acc] ?? 3) ? e.severity : acc),
      'info',
    );
    const actionName = events.map((e) => extractActionName(e.metadata)).find((a) => a !== null) ?? null;
    const errorCode = events.map((e) => extractErrorCode(e.metadata)).find((c) => c !== null) ?? null;
    // `rcaRes.error` bound deliberately: a failed lookup must not present as
    // "no analysis has been run", which would invite a duplicate run.
    const storedRcaParsed =
      !rcaRes.error && rcaRes.data?.metadata ? rcaAnalysisSchema.safeParse(rcaRes.data.metadata) : null;

    forensics = {
      severity: worst,
      classification: classifyIncident({
        title: last.title,
        message: last.message,
        severity: worst,
        source: last.source ?? null,
        errorCode,
      }),
      errorCode,
      errorHint: events.map((e) => extractErrorHint(e.metadata)).find((v) => v !== null) ?? null,
      requestId: events.map((e) => extractRequestId(e.metadata)).find((v) => v !== null) ?? null,
      helmTraceId: events.map((e) => extractHelmTraceId(e.metadata)).find((v) => v !== null) ?? null,
      runtime: events.map((e) => extractRuntime(e.metadata)).find((v) => v !== null) ?? null,
      handled: events.map((e) => extractHandled(e.metadata)).find((v) => v !== null) ?? null,
      source: last.source ?? null,
      feature: last.feature ?? null,
      sport: last.sport ?? null,
      actionName,
      sourceFilePath: resolveActionFilePath(last.feature ?? null, actionName),
      suspectDeploy: selectSuspectDeploy(nearbyDeploys, trueFirstSeen),
      hasUnknownAffectedUsers: hasUnknownAffectedUsers(false, affectedUserCount, totalCount),
      storedRca: storedRcaParsed?.success ? storedRcaParsed.data : null,
    };
  }

  // Bind both `error`s explicitly. supabase-js resolves a failed query as
  // { data: null, error }, so reading only `.data` would turn an outage into
  // a flat week and a missing analysis — the page would look calm and be
  // wrong. Neither failure is worth throwing the whole detail page for: the
  // events, summary and forensics above are already good.
  const trend: FingerprintTrend = trendRes.error
    ? { buckets: [], truncated: false, unavailable: true }
    : {
        buckets: computeDailyTrend((trendRes.data ?? []).map((r) => r.created_at), TREND_DAYS),
        truncated: (trendRes.data?.length ?? 0) >= TREND_ROW_LIMIT,
        unavailable: false,
      };

  const report = buildFingerprintIncidentReport(fingerprint, events, summary, forensics);
  return { events, report, summary, forensics, trend };
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
  forensics: FingerprintForensics | null,
): string {
  if (events.length === 0 || !forensics) {
    return buildIncidentReport({
      title: `Fingerprint ${fingerprint}`,
      severity: 'info',
      fingerprint,
      message: 'No events found for this fingerprint — either every event has been resolved, or this fingerprint no longer matches any admin_events row.',
    });
  }

  // events arrives most-recent-first (query orders created_at desc).
  const last = events[0]!;
  const stackTrace = events.map((e) => e.stack_trace).find((s) => !!s) ?? null;
  const collapsedCount = events.reduce((sum, e) => sum + extractCollapsedCount(e.metadata), 0);

  return buildIncidentReport({
    title: last.title,
    message: last.message,
    fingerprint,
    source: forensics.source,
    severity: forensics.severity,
    sport: forensics.sport,
    featureKey: forensics.feature,
    actionName: forensics.actionName,
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
    incidentClass: forensics.classification.klass,
    incidentClassReason: forensics.classification.reason,
    hasDegradedMessage: forensics.classification.hasDegradedMessage,
    errorCode: forensics.errorCode,
    errorHint: forensics.errorHint,
    requestId: forensics.requestId,
    helmTraceId: forensics.helmTraceId,
    runtime: forensics.runtime,
    handled: forensics.handled,
    rca: forensics.storedRca
      ? {
          probableCause: forensics.storedRca.probableCause,
          confidence: forensics.storedRca.confidence,
          suggestedFix: forensics.storedRca.suggestedFix,
          model: forensics.storedRca.model,
          generatedAt: forensics.storedRca.generatedAt,
        }
      : null,
  });
}
