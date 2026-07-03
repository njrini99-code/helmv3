import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchSentryIssues, type SentryIssue } from '@/lib/admin/sentry-api';
import type { AdminFetchResult } from '@/lib/admin/fetch-result';
import {
  buildIncidentReport,
  extractActionName,
  extractCollapsedCount,
  extractRoute,
} from '@/lib/admin/incident-report';

export type TriageSeverity = 'critical' | 'error' | 'warning' | 'info';

export interface AppTriageEventRow {
  id: string;
  title: string;
  message: string | null;
  severity: TriageSeverity;
  sport: string | null;
  fingerprint: string | null;
  user_id: string | null;
  user_email?: string | null;
  url: string | null;
  created_at: string;
  // Optional — Copy-for-Claude incident reports (feed buildIncidentReport).
  // Present when the caller's SELECT includes them; mergeTriage degrades
  // gracefully to a leaner report when a caller (or an older test fixture)
  // omits them.
  source?: string | null;
  feature?: string | null;
  stack_trace?: string | null;
  metadata?: unknown;
}

export interface TriageItem {
  key: string;
  origin: 'sentry' | 'app';
  title: string;
  severity: TriageSeverity;
  sport: 'golf' | 'baseball' | 'shared' | null;
  occurrences: number;
  affectedUsers: number;
  firstSeen: string;
  lastSeen: string;
  permalink: string | null;
  eventIds: string[];
  substatus: string | null;
  source: string | null;
  feature: string | null;
  actionName: string | null;
  route: string | null;
  /** Pre-built Copy-for-Claude markdown — see @/lib/admin/incident-report. */
  report: string;
}

const SENTRY_LEVEL_TO_SEVERITY: Record<string, TriageSeverity> = {
  fatal: 'critical',
  error: 'error',
  warning: 'warning',
  info: 'info',
  debug: 'info',
};

function normalizeSport(raw: string | null): TriageItem['sport'] {
  return raw === 'golf' || raw === 'baseball' || raw === 'shared' ? raw : null;
}

/**
 * Noise Charter — expected auth-state control flow is not an incident.
 * Legacy baseball/lifting emitters (held code, can't fix at the source yet)
 * log "must be signed in" rejections from background polls; a signed-out
 * tab retrying getUnreadNotificationCount is routine, not triage-worthy.
 * Deliberately narrow: access DENIALS for signed-in users stay visible.
 *
 * Known-expected application noise — NOT real incidents. An unauthenticated
 * hit on a server action, or a baseball user without an active team context,
 * are both routine control-flow, not bugs. Raw admin_events counts that feed
 * KPI tiles / the ops digest exclude these so a genuine incident is never
 * buried under expected noise.
 */
export const AUTH_NOISE_MESSAGE_PATTERNS: readonly RegExp[] = [
  /you must be signed in/i,
  /no active baseball team/i,
];

/** ILIKE patterns mirroring AUTH_NOISE_MESSAGE_PATTERNS, for PostgREST queries. */
export const AUTH_NOISE_ILIKE_PATTERNS: readonly string[] = [
  '%you must be signed in%',
  '%no active baseball team%',
];

/**
 * Accepts either a raw message string (PostgREST/digest call sites) or an
 * app-event row (mergeTriage, which checks title + message together since
 * some emitters only set the title). Deliberately narrow: access DENIALS
 * for signed-in users stay visible.
 */
export function isExpectedAuthNoise(
  input: Pick<AppTriageEventRow, 'title' | 'message'> | string | null | undefined,
): boolean {
  if (input == null) return false;
  const text = typeof input === 'string' ? input : `${input.title} ${input.message ?? ''}`;
  return AUTH_NOISE_MESSAGE_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Chain onto any admin_events PostgREST query (builder) to exclude expected
 * auth noise from a count/select. Keeps overview.ts + admin-digest's
 * route.ts "Errors 24h" counts in sync with the same noise semantics.
 */
export function excludeAuthNoise<T extends { not(column: string, operator: string, value: unknown): T }>(
  query: T,
): T {
  return AUTH_NOISE_ILIKE_PATTERNS.reduce((q, pattern) => q.not('message', 'ilike', pattern), query);
}

/** Pure merge — unit-tested; the async fetcher below just feeds it. */
export function mergeTriage(input: {
  sentryIssues: SentryIssue[];
  appEvents: AppTriageEventRow[];
}): TriageItem[] {
  const items: TriageItem[] = input.sentryIssues.map((issue) => ({
    key: `sentry:${issue.id}`,
    origin: 'sentry' as const,
    title: issue.title,
    severity: SENTRY_LEVEL_TO_SEVERITY[issue.level] ?? 'error',
    sport: null,
    occurrences: issue.count,
    affectedUsers: issue.userCount,
    firstSeen: issue.firstSeen,
    lastSeen: issue.lastSeen,
    permalink: issue.permalink,
    eventIds: [],
    substatus: issue.substatus,
    source: 'sentry',
    feature: null,
    actionName: null,
    route: issue.culprit,
    report: buildIncidentReport({
      title: issue.title,
      message: issue.culprit ?? issue.title,
      fingerprint: issue.shortId,
      source: 'sentry',
      severity: SENTRY_LEVEL_TO_SEVERITY[issue.level] ?? 'error',
      eventCount: issue.count,
      affectedUserCount: issue.userCount,
      firstSeen: issue.firstSeen,
      lastSeen: issue.lastSeen,
      sentryUrl: issue.permalink,
    }),
  }));

  const buckets = new Map<string, { rows: AppTriageEventRow[]; users: Set<string> }>();
  for (const row of input.appEvents) {
    if (isExpectedAuthNoise(row)) continue;
    const fp = row.fingerprint ?? `row:${row.id}`;
    const bucket = buckets.get(fp) ?? { rows: [], users: new Set<string>() };
    bucket.rows.push(row);
    const userKey = row.user_id ?? row.user_email ?? null;
    if (userKey) bucket.users.add(userKey);
    buckets.set(fp, bucket);
  }

  for (const [fp, bucket] of buckets) {
    const sorted = [...bucket.rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    const worst = sorted.reduce<TriageSeverity>((acc, r) => {
      const rank: Record<TriageSeverity, number> = { critical: 0, error: 1, warning: 2, info: 3 };
      return rank[r.severity] < rank[acc] ? r.severity : acc;
    }, 'info');
    // Most-recent-first, for both the eventIds ordering readers expect and
    // buildIncidentReport's "recent occurrences" section.
    const mostRecentFirst = [...sorted].reverse();
    const actionName =
      mostRecentFirst.map((r) => extractActionName(r.metadata)).find((a) => a !== null) ?? null;
    const route =
      mostRecentFirst.map((r) => r.url ?? extractRoute(r.metadata)).find((r) => r !== null) ?? null;
    const stackTrace = mostRecentFirst.map((r) => r.stack_trace).find((s) => !!s) ?? null;
    const collapsedCount = bucket.rows.reduce((sum, r) => sum + extractCollapsedCount(r.metadata), 0);

    items.push({
      key: `app:${fp}`,
      origin: 'app',
      title: last.title,
      severity: worst,
      sport: normalizeSport(last.sport),
      occurrences: bucket.rows.length,
      affectedUsers: bucket.users.size,
      firstSeen: first.created_at,
      lastSeen: last.created_at,
      permalink: null,
      eventIds: sorted.map((r) => r.id),
      substatus: null,
      source: last.source ?? null,
      feature: last.feature ?? null,
      actionName,
      route,
      report: buildIncidentReport({
        title: last.title,
        message: last.message,
        fingerprint: fp,
        source: last.source ?? null,
        severity: worst,
        sport: normalizeSport(last.sport),
        featureKey: last.feature ?? null,
        actionName,
        eventCount: bucket.rows.length,
        collapsedCount,
        affectedUserCount: bucket.users.size,
        firstSeen: first.created_at,
        lastSeen: last.created_at,
        stackTrace,
        occurrences: mostRecentFirst.slice(0, 20).map((r) => ({
          timestamp: r.created_at,
          route: r.url ?? extractRoute(r.metadata),
          userId: r.user_id,
        })),
      }),
    });
  }

  // Rank by distinct affected users, then recency — NEVER raw volume
  // (one retry-looping job must not bury a low-volume auth bug).
  return items.sort((a, b) => {
    if (b.affectedUsers !== a.affectedUsers) return b.affectedUsers - a.affectedUsers;
    return b.lastSeen.localeCompare(a.lastSeen);
  });
}

/**
 * Server fetcher. CALLER must have passed requireSuperAdmin() first —
 * this reads admin_events with the service-role client.
 */
export async function fetchTriageQueue(): Promise<{
  items: TriageItem[];
  sentry: AdminFetchResult<SentryIssue[]>;
}> {
  const admin = createAdminClient();
  const [sentry, appRes] = await Promise.all([
    fetchSentryIssues(),
    admin
      .from('admin_events')
      .select(
        'id, title, message, severity, sport, fingerprint, user_id, user_email, url, created_at, source, feature, stack_trace, metadata',
      )
      .eq('event_type', 'error')
      .eq('resolved', false)
      // `info` rows (integrity-check PASS sweeps, pattern-miner starvation,
      // philosophy-gate filter counts, etc.) are routine telemetry, not
      // incidents — excluded from this feed (Needs Attention + the ops
      // digest) the same way as the /admin/errors tab (errors.ts). They are
      // still captured in admin_events and still feed Feature Health's
      // green-dot classifier via a separate query (get_feature_health()).
      .neq('severity', 'info')
      .order('created_at', { ascending: false })
      .limit(500),
  ]);

  const appEvents = (appRes.data ?? []) as unknown as AppTriageEventRow[];
  return {
    items: mergeTriage({ sentryIssues: sentry.data ?? [], appEvents }),
    sentry,
  };
}
