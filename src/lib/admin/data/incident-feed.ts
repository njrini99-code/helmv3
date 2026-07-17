import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { fetchSentryIssues, type SentryIssue } from '@/lib/admin/sentry-api';
import { getProductionDeployAt, RELEASE_GRACE_MS } from '@/lib/admin/auto-resolve';
import type { AdminFetchResult } from '@/lib/admin/fetch-result';
import type { FeatureKey } from '@/lib/admin/feature-registry';
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

export function summarizeIncidentFeed(incidents: readonly TriageItem[]): IncidentFeedCounts {
  const appGroups = incidents.filter((item) => item.origin === 'app').length;
  const sentryGroups = incidents.filter((item) => item.origin === 'sentry').length;
  const highSeverityGroups = incidents.filter(
    (item) => item.severity === 'critical' || item.severity === 'error',
  ).length;
  const affectedUsers = incidents.reduce((sum, item) => sum + item.affectedUsers, 0);
  return {
    totalGroups: incidents.length,
    appGroups,
    sentryGroups,
    highSeverityGroups,
    affectedUsers,
  };
}

/** Pure merge — unit-testable; async fetchers feed this. */
export function buildIncidentFeedFromSources(
  appEvents: readonly AppTriageEventRow[],
  sentryIssues: readonly SentryIssue[],
  windowHours: number,
): { incidents: TriageItem[]; counts: IncidentFeedCounts } {
  const sentryInWindow = filterSentryIssuesByWindow(sentryIssues, windowHours);
  const incidents = mergeTriage({ sentryIssues: sentryInWindow, appEvents: [...appEvents] });
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
  const { data } = await fetchAllRowsResult((from, to) => {
    let query = admin
      .from('admin_events')
      .select(APP_EVENT_SELECT)
      .eq('event_type', 'error')
      .eq('resolved', false)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to);

    if (filters.severity !== 'info') query = query.neq('severity', 'info');
    if (filters.sport) query = query.eq('sport', filters.sport);
    if (filters.severity) query = query.eq('severity', filters.severity);
    if (filters.source) query = query.eq('source', filters.source);
    if (filters.feature) query = query.eq('feature', filters.feature);

    return query;
  });

  return (data ?? []) as unknown as AppTriageEventRow[];
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
  const [sentry, appEvents, deploy] = await Promise.all([
    prefetched?.sentry ?? fetchSentryIssues({ limit: 50 }),
    queryAppErrorEvents(filters),
    getProductionDeployAt(),
  ]);

  // Deploy-based hiding applies only to the MERGED incident feed (the
  // triage queue / "Active groups" surfaces) — never to the raw `sentry`
  // AdminFetchResult returned below, which backs the Errors tab's
  // deliberately un-windowed "Sentry unresolved (org-wide)" panel.
  const releaseFilteredSentry = filterSentryIssuesByDeploy(sentry.data ?? [], deploy.deployAt);

  const { incidents, counts } = buildIncidentFeedFromSources(
    appEvents,
    releaseFilteredSentry,
    filters.windowHours,
  );

  return { incidents, appEvents, sentry, counts };
}
