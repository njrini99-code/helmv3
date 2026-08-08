import 'server-only';
import { cache } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { fetchSentryIssues, type SentryIssue } from '@/lib/admin/sentry-api';
import { getProductionDeployAt, RELEASE_GRACE_MS } from '@/lib/admin/auto-resolve';
import type { AdminFetchResult } from '@/lib/admin/fetch-result';
import type { FeatureKey } from '@/lib/admin/feature-registry';
import { INCIDENT_SEVERITIES } from '@/lib/admin/severity';
import {
  mergeTriage,
  type AppTriageEventRow,
  type TriageItem,
  type TriageSeverity,
} from '@/lib/admin/data/triage';

/** Default window shared by Overview KPIs, triage queue, and Errors tab. */
export const DEFAULT_INCIDENT_WINDOW_HOURS = 24;

export interface IncidentFeedFilters {
  windowHours: number;
  sport?: 'golf' | 'baseball' | 'shared';
  severity?: TriageSeverity;
  source?: string;
  feature?: FeatureKey;
}

export interface IncidentFeedCounts {
  totalGroups: number;
  appGroups: number;
  sentryGroups: number;
  highSeverityGroups: number;
  /**
   * Groups the kind classifier calls actionable — i.e. exactly what the Errors
   * tab lists by default. THE number Bridge should lead with: the bottom-nav
   * badge, Overview's KPI strip and the Errors tab header all read this one
   * field, so they cannot drift apart again.
   *
   * They did drift. Reported 2026-07-29 as "the errors don't match from the
   * page that loads in, to the errors tab", and measured against production the
   * same hour: 4 on the badge (raw ROWS, critical+error), 3 on Overview
   * (fingerprint GROUPS, critical+error), and up to 9 in the tab (GROUPS,
   * everything but info, then kind-filtered). Three surfaces, three units,
   * three severity sets, one dataset.
   */
  actionableGroups: number;
  affectedUsers: number;
}

const APP_EVENT_SELECT =
  'id, title, message, severity, sport, fingerprint, user_id, user_email, url, created_at, source, feature, stack_trace, metadata';

/** Sentry unresolved issues that actually fired inside the feed window. */
export function filterSentryIssuesByWindow(
  issues: readonly SentryIssue[],
  windowHours: number,
): SentryIssue[] {
  const since = Date.now() - windowHours * 3600_000;
  return issues.filter((issue) => Date.parse(issue.lastSeen) >= since);
}

/**
 * Release-aware read-time filter — the incident-list mirror of
 * auto-resolve.ts's Rule A for admin_events. Once the newest READY
 * production deploy is >= 24h old, a Sentry issue that hasn't fired since
 * BEFORE that deploy is treated as fixed and dropped from the merged
 * incident feed; an issue with a lastSeen at/after deployAt (a regression,
 * or one that never stopped) still shows. Pure and fail-open: `deployAt:
 * null` (deploy data unavailable) or a deploy under 24h old both pass every
 * issue through unfiltered — never a false "it's fixed" claim without
 * evidence.
 */
export function filterSentryIssuesByDeploy(
  issues: readonly SentryIssue[],
  deployAt: number | null,
  now: number = Date.now(),
): SentryIssue[] {
  if (deployAt === null || now - deployAt < RELEASE_GRACE_MS) return [...issues];
  return issues.filter((issue) => Date.parse(issue.lastSeen) >= deployAt);
}

const SEVERITY_TO_SENTRY_LEVEL: Record<TriageSeverity, string> = {
  critical: 'fatal',
  error: 'error',
  warning: 'warning',
  info: 'info',
};

/**
 * Translate the Errors-tab / triage filter set into Sentry's search-query
 * syntax so severity/sport/source/feature narrow Sentry-origin incidents
 * exactly like queryAppErrorEvents already narrows admin_events. Sentry
 * events carry these as SDK tags — scope.setTag('sport', ...), ('feature',
 * ...), ('error_source', ...) (server-error-logger.ts, with-baseball-
 * action.ts, with-lifting-action.ts) — so `tag:value` search tokens work
 * even though the LIST endpoint never returns per-issue tags (see
 * fetchSentryFeatureCounts's spike note in sentry-api.ts — this reuses that
 * same documented workaround, extended to 4 filter dimensions instead of 1).
 *
 * `source: 'sentry'` is a synthetic UI-only value (the "this row came from
 * Sentry" chip — see errors.ts SOURCES), not a real error_source tag — it
 * already narrows admin_events to zero rows (queryAppErrorEvents's
 * `.eq('source', filters.source)`), so it's deliberately NOT translated into
 * an error_source token here, leaving the Sentry side unfiltered by source.
 *
 * No explicit severity filter → the same noise floor queryAppErrorEvents
 * applies by default (excludes severity=info) so a default-view info/debug
 * Sentry issue doesn't outlive an equivalent app-origin info event.
 */
export function buildSentrySearchQuery(
  filters: Pick<IncidentFeedFilters, 'severity' | 'sport' | 'source' | 'feature'>,
): string {
  const tokens = ['is:unresolved'];
  if (filters.severity) {
    tokens.push(`level:${SEVERITY_TO_SENTRY_LEVEL[filters.severity]}`);
  } else {
    tokens.push('!level:info', '!level:debug');
  }
  if (filters.sport) tokens.push(`sport:${filters.sport}`);
  if (filters.feature) tokens.push(`feature:${filters.feature}`);
  if (filters.source && filters.source !== 'sentry') tokens.push(`error_source:${filters.source}`);
  return tokens.join(' ');
}

export function summarizeIncidentFeed(incidents: readonly TriageItem[]): IncidentFeedCounts {
  const appGroups = incidents.filter((item) => item.origin === 'app').length;
  const sentryGroups = incidents.filter((item) => item.origin === 'sentry').length;
  const highSeverityGroups = incidents.filter(
    (item) => item.severity === 'critical' || item.severity === 'error',
  ).length;
  const actionableGroups = incidents.filter((item) => item.actionable).length;
  const affectedUsers = incidents.reduce((sum, item) => sum + item.affectedUsers, 0);
  return {
    totalGroups: incidents.length,
    appGroups,
    sentryGroups,
    highSeverityGroups,
    actionableGroups,
    affectedUsers,
  };
}

/**
 * Honest attribution only — set when the caller actually scoped the Sentry
 * fetch by that tag (buildSentrySearchQuery's `sport:`/`feature:` tokens), so
 * this is never a guess presented as certain (the list endpoint itself never
 * returns per-issue tags — see buildSentrySearchQuery's doc comment).
 */
export interface SentryTagHint {
  sport?: TriageItem['sport'] | null;
  feature?: string | null;
}

/** Pure merge — unit-testable; async fetchers feed this. */
export function buildIncidentFeedFromSources(
  appEvents: readonly AppTriageEventRow[],
  sentryIssues: readonly SentryIssue[],
  windowHours: number,
  sentryTagHint?: SentryTagHint,
  priorResolutions?: Map<string, string>,
): { incidents: TriageItem[]; counts: IncidentFeedCounts } {
  const sentryInWindow = filterSentryIssuesByWindow(sentryIssues, windowHours);
  const incidents = mergeTriage({
    sentryIssues: sentryInWindow,
    appEvents: [...appEvents],
    sentryTagHint,
    priorResolutions,
  });
  return { incidents, counts: summarizeIncidentFeed(incidents) };
}

export async function queryAppErrorEvents(
  filters: IncidentFeedFilters,
): Promise<AppTriageEventRow[]> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - filters.windowHours * 3600_000).toISOString();

  // Paginate past the PostgREST 1000-row cap instead of the prior flat
  // `.limit(500)` — that cap fed Overview's KPIs, the triage queue, AND the
  // Errors tab, all three silently under-counting once a window held more
  // than 500 unresolved rows (an error storm — exactly when an honest count
  // matters most). `.order('id')` as a tiebreaker keeps page boundaries
  // stable alongside `created_at desc`, matching the fetchAllRowsResult
  // pattern already used by golf.ts/briefing.ts.
  // THROW, don't swallow. This destructured only `data`, and
  // fetchAllRowsResult returns `{ data: null, error }` when the first page
  // fails — so a PostgREST fault (schema drift on any of the 14 columns in
  // APP_EVENT_SELECT, a 400, a statement timeout) became `[]`, which becomes
  // a confident `0` on the nav badge, the KPI strip, the triage queue AND the
  // Errors tab at once. incident-count-agreement.test.ts then certifies those
  // four agree — and they do, on zero. Every caller already renders inside a
  // PanelBoundary that shows PanelStale on a throw, so failing loudly here is
  // strictly better than a silent all-clear.
  const { data, error } = await fetchAllRowsResult((from, to) => {
    let query = admin
      .from('admin_events')
      .select(APP_EVENT_SELECT)
      .eq('event_type', 'error')
      .eq('resolved', false)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to);

    if (filters.severity !== 'info') query = query.in('severity', INCIDENT_SEVERITIES);
    if (filters.sport) query = query.eq('sport', filters.sport);
    if (filters.severity) query = query.eq('severity', filters.severity);
    if (filters.source) query = query.eq('source', filters.source);
    if (filters.feature) query = query.eq('feature', filters.feature);

    return query;
  });

  if (error) {
    throw new Error(`queryAppErrorEvents: ${error.message}`);
  }

  return (data ?? []) as unknown as AppTriageEventRow[];
}

/**
 * How far back to look for a prior resolution when deciding "did this come
 * back?". Bounded so an incident resolved a year ago and legitimately
 * reoccurring today reads as new rather than as a regression of ancient
 * history — 90 days is well past any realistic fix-verification window.
 */
const REGRESSION_LOOKBACK_DAYS = 90;

/**
 * Latest `resolved_at` per fingerprint, for fingerprints that currently have
 * UNRESOLVED rows in the feed.
 *
 * This is the missing half of "did my fix actually hold?". Sentry-origin rows
 * get `substatus: 'regressed'` natively from Sentry's own API, and
 * TriageQueue has rendered a REGRESSED tag for it all along — but the
 * app-origin branch of mergeTriage hardcoded `substatus: null`, so the tag
 * could never fire for the majority-volume half of the feed. An operator who
 * resolved an incident last week had no way to see it return: the new row is
 * inserted with `resolved` defaulting to false and carries NO link back to
 * the fact this exact fingerprint was previously closed.
 *
 * Deliberately a SECOND query rather than a join: it needs the fingerprints
 * of the current unresolved buckets, which are only known after the feed
 * query has run. Cheap — bounded by `IN (…)` on an indexed column, and
 * chunked to stay under PostgREST's URL limit (see trap: database.md).
 */
export async function queryPriorResolutions(
  fingerprints: readonly string[],
): Promise<Map<string, string>> {
  const latest = new Map<string, string>();
  if (fingerprints.length === 0) return latest;

  const admin = createAdminClient();
  const since = new Date(Date.now() - REGRESSION_LOOKBACK_DAYS * 24 * 3600_000).toISOString();

  // Chunk fingerprints at 200 per batch to stay well under PostgREST's
  // ~22.8 KB URL limit (~585 UUIDs max). During error storms with many
  // unresolved fingerprints, an unchunked .in() hits 400 Bad Request and
  // the swallowed error causes regression tags to silently disappear —
  // exactly when operators most need them.
  const CHUNK_SIZE = 200;
  for (let i = 0; i < fingerprints.length; i += CHUNK_SIZE) {
    const chunk = fingerprints.slice(i, i + CHUNK_SIZE);
    const { data } = await admin
      .from('admin_events')
      .select('fingerprint, resolved_at')
      .eq('resolved', true)
      // A HUMAN must have resolved it for a later event to count as a
      // regression. auto-resolve.ts:76 deliberately leaves resolved_by NULL on
      // the nightly cron sweep, so without this every swept fingerprint that
      // fired again looked like "a fix failed" — on 2026-08-05 all seven
      // resolutions behind the badged rows were cron sweeps, i.e. 100% false.
      .not('resolved_by', 'is', null)
      .in('fingerprint', Array.from(chunk))
      .gte('resolved_at', since)
      .order('resolved_at', { ascending: false });

    for (const row of data ?? []) {
      const fp = row.fingerprint;
      const at = row.resolved_at;
      if (!fp || !at) continue;
      // Rows arrive newest-first, so the FIRST sighting of a fingerprint is its
      // most recent resolution — later ones are older and must not overwrite it.
      if (!latest.has(fp)) latest.set(fp, at);
    }
  }
  return latest;
}

/**
 * Canonical Helm Bridge incident feed — one definition for Overview KPIs,
 * Overview triage queue, and the Errors tab (default window, no extra filters).
 */
export async function fetchIncidentFeed(
  filters: IncidentFeedFilters,
  prefetched?: { sentry?: AdminFetchResult<SentryIssue[]> },
): Promise<{
  incidents: TriageItem[];
  appEvents: AppTriageEventRow[];
  sentry: AdminFetchResult<SentryIssue[]>;
  counts: IncidentFeedCounts;
}> {
  // `sentry` stays the fully unfiltered org-wide unresolved pull — it backs
  // the Errors tab's deliberately un-windowed "Sentry unresolved (org-wide)"
  // panel and must never reflect severity/sport/source/feature narrowing.
  // The MERGE population is a separate, filter-scoped query (`filteredSentry`)
  // so severity/sport/source/feature actually narrow Sentry-origin incidents
  // in the triage queue / "Active groups" the same way they narrow app-origin
  // ones — this is the P0 fix (filter chips silently doing nothing to Sentry
  // rows). `prefetched.sentry` (no live caller today) opts out of the extra
  // round trip and reuses the raw pull for both.
  const [sentry, filteredSentry, appEvents, deploy] = await Promise.all([
    prefetched?.sentry ?? fetchSentryIssues({ limit: 50 }),
    prefetched?.sentry ? null : fetchSentryIssues({ query: buildSentrySearchQuery(filters), limit: 50 }),
    queryAppErrorEvents(filters),
    getProductionDeployAt(),
  ]);

  // If the filtered Sentry call itself failed (rate limit, network, etc) it
  // still resolves to a truthy `{ status: 'error', data: null }` envelope —
  // `filteredSentry ?? sentry` would treat that as "no fallback needed" and
  // silently drop every Sentry-origin incident even though the raw `sentry`
  // pull above succeeded. Only trust the filtered result when it actually
  // succeeded; otherwise fall back to the raw org-wide pull (unfiltered by
  // severity/sport/source/feature, but real data beats a false empty state).
  const mergeSentrySource = filteredSentry && filteredSentry.status === 'ok' ? filteredSentry : sentry;

  // Deploy-based hiding applies only to the MERGED incident feed (the
  // triage queue / "Active groups" surfaces) — never to the raw `sentry`
  // AdminFetchResult returned below, which backs the Errors tab's
  // deliberately un-windowed "Sentry unresolved (org-wide)" panel.
  const releaseFilteredSentry = filterSentryIssuesByDeploy(mergeSentrySource.data ?? [], deploy.deployAt);

  // Runs AFTER queryAppErrorEvents because it is scoped to the fingerprints
  // that actually appear in this feed — a bounded IN(…) on an indexed column
  // rather than a table scan.
  const priorResolutions = await queryPriorResolutions(
    Array.from(
      new Set(
        appEvents
          .map((row) => row.fingerprint)
          .filter((fp): fp is string => typeof fp === 'string' && fp.length > 0),
      ),
    ),
  );

  const { incidents, counts } = buildIncidentFeedFromSources(
    appEvents,
    releaseFilteredSentry,
    filters.windowHours,
    // Honest attribution: only set when the merge query was actually scoped
    // by that tag — an unfiltered view still can't know per-issue sport/
    // feature (the list endpoint doesn't return tags), so it stays null.
    { sport: filters.sport ?? null, feature: filters.feature ?? null },
    priorResolutions,
  );

  return { incidents, appEvents, sentry, counts };
}

/**
 * Per-request memoised DEFAULT-WINDOW feed — the one every unfiltered Bridge
 * surface wants.
 *
 * One render of /admin asked for the identical 24h feed TWICE:
 * `fetchOverviewSnapshot()` for the KPI strip and `fetchTriageQueue()` for the
 * triage panel. Each ask is two Sentry round-trips (raw + filtered) plus a
 * paginated `admin_events` scan plus a chunked `queryPriorResolutions()` —
 * all of it duplicated for one screen.
 *
 * The wrapper takes a PRIMITIVE, and that is the entire point. React's
 * `cache()` keys on argument REFERENCE identity, so two call sites each
 * passing their own `{ windowHours: 24 }` object literal are two distinct keys
 * and would miss the cache every single time — a memoisation that looks
 * applied and does nothing. A number compares equal.
 *
 * Filtered callers (the Errors tab, `data/errors.ts`) deliberately keep
 * calling `fetchIncidentFeed` directly: their filter object is exactly the
 * shape that cannot be keyed this way, and their windows/filters vary per
 * request anyway.
 *
 * Memoisation is per React request scope only — a route handler (the
 * admin-digest cron calls `fetchTriageQueue`) gets a fresh fetch per call,
 * which is what it wants.
 */
export const cachedIncidentFeed = cache((windowHours: number) =>
  fetchIncidentFeed({ windowHours }),
);
