import 'server-only';
import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchVercelDeployments, deployAgeMinutes } from '@/lib/admin/vercel-api';
import type { AppTriageEventRow, TriageItem } from '@/lib/admin/data/triage';
import { FAILURE_SEVERITIES, type AdminSeverity } from '@/lib/admin/severity';
import {
  fetchIncidentFeed,
  DEFAULT_INCIDENT_WINDOW_HOURS,
  buildIncidentFeedFromSources,
  queryAppErrorEvents,
} from '@/lib/admin/data/incident-feed';
import {
  fetchFeatureHealth,
  summarizeFeatureHealth,
  computeFeatureHealthBanner,
  type FeatureHealthSummary,
} from '@/lib/admin/data/feature-health';

export interface OverviewKpis {
  /** Unresolved Sentry issues (org-wide; not windowed). */
  sentryUnresolved: number | null;
  /** Why `sentryUnresolved` is null when it is — 'unconfigured' (no
   *  SENTRY_READ_TOKEN) vs 'error' (the API call failed) vs 'ok' (it isn't
   *  null). Lets the KPI tile show honest starved copy instead of the
   *  generic "log more data" message (bridge-tab-audit-p0p1 overview
   *  Finding 1) — those are different problems with different fixes. */
  sentryStatus: 'ok' | 'unconfigured' | 'error';
  /** Coalesced incident groups in the last 24h — same feed as Overview triage + Errors tab default. */
  incidentGroups24h: number;
  /** ALL `event_type='security'` rows in 24h — password resets, view-as
   *  enter/exit, and session revocations included, not just failed logins.
   *  Named for what it actually counts (was "Auth failures 24h", which
   *  overclaimed every non-failure security action as a failure). */
  securityEvents24h: number;
  activeUsersToday: number;
  activityToday: { golf: number; baseball: number; lifting: number };
  lastDeploy: { state: string; ageMinutes: number } | null;
}

export interface WatcherSignal {
  label: string;
  lastSeenAt: string | null;
  staleAfterHours: number;
}

export function computeBannerState(input: {
  criticalCount: number;
  attentionCount: number;
  anyFeedStale: boolean;
}): { state: 'nominal' | 'attention' | 'critical' | 'stale'; attentionCount: number } {
  const total = input.criticalCount + input.attentionCount;
  if (input.criticalCount > 0) return { state: 'critical', attentionCount: total };
  if (total > 0) return { state: 'attention', attentionCount: total };
  if (input.anyFeedStale) return { state: 'stale', attentionCount: 0 };
  return { state: 'nominal', attentionCount: 0 };
}

export function isSignalStale(signal: WatcherSignal, now: Date): boolean {
  if (!signal.lastSeenAt) return true;
  const ageMs = now.getTime() - new Date(signal.lastSeenAt).getTime();
  return ageMs > signal.staleAfterHours * 60 * 60 * 1000;
}

export type KpiTone = 'neutral' | 'warning' | 'danger';

/**
 * KPI-tile escalation for raw 24h counts (already noise-filtered). Signal-
 * not-noise: zero is calm (neutral); any occurrence deserves a look (amber);
 * a sustained/high volume in a single day is unambiguously worth a red flag.
 * Mirrors the feature-health classifier's spirit (computeFeatureStatus:
 * escalate hard once a line is crossed) without borrowing its per-feature
 * fingerprint thresholds, which are calibrated to one feature's traffic —
 * not a platform-wide raw event count.
 */
export function classifyKpiTone(count: number, redAt: number): KpiTone {
  if (count <= 0) return 'neutral';
  if (count >= redAt) return 'danger';
  return 'warning';
}

/** "Sustained/high" lines for the Overview KPI tiles (classifyKpiTone). */
export const ERRORS_24H_RED_AT = 10;
export const SECURITY_EVENTS_24H_RED_AT = 5;

function isoHoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3600_000).toISOString();
}
/**
 * UTC-midnight "today" boundary — mirrors `isoStartOfUtcDay` in
 * src/app/admin/activity/_data.ts, which deliberately uses `Date.UTC(...)`
 * instead of the server process's local timezone so "today" is deterministic
 * regardless of runtime (Vercel prod defaults to UTC, but `npm run dev` on a
 * non-UTC laptop does not). Overview's "Activity today" KPI and the Golf
 * tab's "Rounds today" KPI must agree with the Activity tab's "today" stats
 * for the same underlying data — a local-time boundary here would silently
 * disagree with the Activity tab off of UTC.
 */
export function isoStartOfToday(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

export function activeAppErrorGroups(rows: AppTriageEventRow[]): TriageItem[] {
  return buildIncidentFeedFromSources(rows, [], DEFAULT_INCIDENT_WINDOW_HOURS).incidents;
}

/** Cache tag busted by the resolve action, so the badge drops the moment an
 *  incident is actually resolved rather than up to a minute later. */
export const BRIDGE_INCIDENT_CACHE_TAG = 'bridge-incidents';

/**
 * Bridge chrome badge — the count of ACTIONABLE incident groups, which is the
 * exact set the Errors tab lists by default and the exact number Overview's
 * KPI strip shows. One predicate, three surfaces.
 *
 * It used to be a `head: true` COUNT of raw high-severity ROWS, chosen so the
 * root layout — which re-runs on EVERY navigation across a dozen tabs — never
 * paid for the incident feed. That kept it cheap and made it wrong: measured
 * against production on 2026-07-29 the badge said 4 while the tab listed up to
 * 9, because rows are not groups and `critical+error` is not `everything but
 * info`, and neither had heard of the kind classifier. A number in permanent
 * chrome that disagrees with the screen it links to is worse than no number.
 *
 * The perf concern behind the original design is real and is answered rather
 * than ignored:
 *   - `queryAppErrorEvents` only — NO Sentry round-trip (an external network
 *     hop on every route change is not "cheap chrome"), so this stays a single
 *     paginated Supabase read plus in-memory grouping.
 *   - wrapped in `unstable_cache` with a 60s TTL, so a dozen navigations in a
 *     minute cost ONE query instead of twelve — strictly fewer round-trips
 *     than the old uncached per-navigation COUNT.
 *   - tagged, so `resolveTriageEvents` can bust it immediately. Without that
 *     the badge would sit on a stale count for up to a minute right after you
 *     resolved something, which is precisely the "it doesn't go away" the
 *     resolve fix exists to end.
 *
 * Honest-only: a query failure degrades to 0 (no badge) rather than guessing.
 */
export const fetchBridgeErrorBadge = unstable_cache(
  async (): Promise<number> => {
    try {
      const rows = await queryAppErrorEvents({ windowHours: DEFAULT_INCIDENT_WINDOW_HOURS });
      const { counts } = buildIncidentFeedFromSources(rows, [], DEFAULT_INCIDENT_WINDOW_HOURS);
      return counts.actionableGroups;
    } catch {
      return 0;
    }
  },
  ['bridge-error-badge'],
  { revalidate: 60, tags: [BRIDGE_INCIDENT_CACHE_TAG] },
);

/** CALLER must have passed requireSuperAdmin() (service-role reads). */
export async function fetchOverviewSnapshot() {
  const admin = createAdminClient();
  const ago24h = isoHoursAgo(24);
  const today = isoStartOfToday();

  const [
    deploys,
    incidentFeed24h,
    security24h,
    activeToday,
    golfToday,
    baseballToday,
    liftsToday,
    lastLogin,
    lastError,
    lastCron,
    featureHealthRaw,
  ] = await Promise.all([
    fetchVercelDeployments(5),
    fetchIncidentFeed({ windowHours: DEFAULT_INCIDENT_WINDOW_HOURS }),
    admin.from('admin_events').select('id', { count: 'exact', head: true })
      .eq('event_type', 'security').gte('created_at', ago24h),
    admin.from('users').select('id', { count: 'exact', head: true })
      .gte('last_seen', today),
    // .eq('status','completed') mirrors the Activity tab's identical query
    // (src/app/admin/activity/_data.ts fetchActivityTodayStats) — without it
    // this silently counted in-progress/abandoned rounds too, so "Activity
    // today" here and "today" on the Activity tab disagreed on the same
    // underlying metric.
    admin.from('golf_rounds').select('id', { count: 'exact', head: true })
      .eq('status', 'completed').gte('created_at', today),
    admin.from('baseball_games').select('id', { count: 'exact', head: true })
      .eq('status', 'completed').gte('created_at', today),
    admin.from('helm_lifting_sessions').select('id', { count: 'exact', head: true })
      .gte('created_at', today),
    admin.from('admin_events').select('created_at')
      .eq('event_type', 'login').order('created_at', { ascending: false }).limit(1),
    admin.from('admin_events').select('created_at')
      .eq('event_type', 'error').order('created_at', { ascending: false }).limit(1),
    admin.from('background_job_logs').select('started_at')
      .order('started_at', { ascending: false }).limit(1),
    // Additive (W16 Task 5): fetchFeatureHealth manages its OWN user-scoped
    // client internally (the RPC gates on auth.uid()) and never throws —
    // RPC failure degrades to an all-neutral, all-degraded snapshot rather
    // than blocking the rest of Overview.
    fetchFeatureHealth(),
  ]);

  const lastDeployRow = deploys.data?.[0] ?? null;
  const kpis: OverviewKpis = {
    sentryUnresolved:
      incidentFeed24h.sentry.status === 'ok' ? (incidentFeed24h.sentry.data?.length ?? 0) : null,
    sentryStatus: incidentFeed24h.sentry.status,
    incidentGroups24h: incidentFeed24h.counts.totalGroups,
    securityEvents24h: security24h.count ?? 0,
    activeUsersToday: activeToday.count ?? 0,
    activityToday: {
      golf: golfToday.count ?? 0,
      baseball: baseballToday.count ?? 0,
      lifting: liftsToday.count ?? 0,
    },
    lastDeploy: lastDeployRow
      ? {
          state: lastDeployRow.state,
          ageMinutes: deployAgeMinutes(lastDeployRow.createdAt),
        }
      : null,
  };

  const now = new Date();
  const watcherBase: WatcherSignal[] = [
    // Sign-ins definitely happen daily — 24h of silence means LOGGING broke.
    { label: 'Login events', lastSeenAt: lastLogin.data?.[0]?.created_at ?? null, staleAfterHours: 24 },
    { label: 'Error pipeline', lastSeenAt: lastError.data?.[0]?.created_at ?? null, staleAfterHours: 48 },
    // Crons run at least daily once W11 lands; until then this reads
    // "stale" honestly — background_job_logs has zero writers today.
    { label: 'Cron outcomes', lastSeenAt: lastCron.data?.[0]?.started_at ?? null, staleAfterHours: 26 },
  ];
  const watcher = watcherBase.map((s) => ({ ...s, stale: isSignalStale(s, now) }));

  // Additive (W16 Task 5) — compact Feature Health rollup + banner
  // discipline (Noise Charter N6): only a RED feature escalates the banner
  // to 'critical'; a fresh fingerprint on an otherwise-clean feature is a
  // softer 'attention' signal; amber/warnings alone contribute NOTHING.
  const featureHealth: FeatureHealthSummary = summarizeFeatureHealth(featureHealthRaw, now);
  const featureHealthBanner = computeFeatureHealthBanner(featureHealth);
  const featureHealthCriticalCount = featureHealth.red;
  const featureHealthAttentionCount = featureHealth.red === 0 && featureHealth.newFingerprints24h > 0 ? 1 : 0;

  // FAILURE_SEVERITIES, not `=== 'critical'`. providerFaultSeverity assigns
  // 'error' — not 'critical' — to every operator-blocking fault (a spent
  // balance, a rejected key). Counting only 'critical' meant the headline
  // could read "All systems nominal" while the KPI tile inches below was amber
  // and the triage row sat right there. Production distribution makes this
  // decisive: 82,965 'error' vs 166 'critical' — the banner was reading the
  // 0.2% tier. See lib/admin/severity.ts for why the two tiers exist.
  const criticalIncidentGroups24h = incidentFeed24h.incidents.filter(
    (item) => FAILURE_SEVERITIES.includes(item.severity as AdminSeverity),
  ).length;
  const attentionFromDeploy = kpis.lastDeploy?.state === 'ERROR' ? 1 : 0;
  const banner = {
    ...computeBannerState({
      criticalCount: criticalIncidentGroups24h + featureHealthCriticalCount,
      attentionCount: attentionFromDeploy + featureHealthAttentionCount,
      // `!== 'ok'` (not `=== 'error'`) — AdminFetchStatus is a TRI-state
      // ('ok' | 'unconfigured' | 'error', fetch-result.ts:6). Testing only the
      // 'error' branch let an UNCONFIGURED Sentry (missing SENTRY_READ_TOKEN /
      // SENTRY_ORG / SENTRY_PROJECT — a state check-helm-bridge-env.mjs:35
      // already treats as real) render "All systems nominal" while the Bridge
      // was completely blind to Sentry-origin incidents.
      anyFeedStale: incidentFeed24h.sentry.status !== 'ok' || watcher.some((w) => w.stale) || featureHealth.degraded,
    }),
    checkedAt: now.toISOString(),
    // Single-line banner detail per N6 (never a wall of routine noise) —
    // null when the rollup contributes nothing (0 red, no new fingerprints).
    featureHealthLine: featureHealthBanner.line,
  };

  return { kpis, banner, watcher, featureHealth };
}
