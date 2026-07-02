import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchSentryIssues, type SentryIssue } from '@/lib/admin/sentry-api';
import type { AdminFetchResult } from '@/lib/admin/fetch-result';

export type TriageSeverity = 'critical' | 'error' | 'warning' | 'info';

export interface AppTriageEventRow {
  id: string;
  title: string;
  message: string | null;
  severity: TriageSeverity;
  sport: string | null;
  fingerprint: string | null;
  user_id: string | null;
  url: string | null;
  created_at: string;
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
  }));

  const buckets = new Map<string, { rows: AppTriageEventRow[]; users: Set<string> }>();
  for (const row of input.appEvents) {
    const fp = row.fingerprint ?? `row:${row.id}`;
    const bucket = buckets.get(fp) ?? { rows: [], users: new Set<string>() };
    bucket.rows.push(row);
    if (row.user_id) bucket.users.add(row.user_id);
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
      .select('id, title, message, severity, sport, fingerprint, user_id, url, created_at')
      .eq('event_type', 'error')
      .eq('resolved', false)
      .order('created_at', { ascending: false })
      .limit(500),
  ]);

  const appEvents = (appRes.data ?? []) as unknown as AppTriageEventRow[];
  return {
    items: mergeTriage({ sentryIssues: sentry.data ?? [], appEvents }),
    sentry,
  };
}
