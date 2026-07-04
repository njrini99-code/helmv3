import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchVercelDeployments, deployAgeMinutes } from '@/lib/admin/vercel-api';
import type { AppTriageEventRow, TriageItem } from '@/lib/admin/data/triage';
import {
  fetchIncidentFeed,
  DEFAULT_INCIDENT_WINDOW_HOURS,
  buildIncidentFeedFromSources,
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
  /** Coalesced incident groups in the last 24h — same feed as Overview triage + Errors tab default. */
  incidentGroups24h: number;
  authFailures24h: number;
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
export const AUTH_FAILURES_24H_RED_AT = 5;

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
    admin.from('golf_rounds').select('id', { count: 'exact', head: true })
      .gte('created_at', today),
    admin.from('baseball_games').select('id', { count: 'exact', head: true })
      .gte('created_at', today),
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
    incidentGroups24h: incidentFeed24h.counts.totalGroups,
    authFailures24h: security24h.count ?? 0,
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

  const criticalIncidentGroups24h = incidentFeed24h.incidents.filter(
    (item) => item.severity === 'critical',
  ).length;
  const attentionFromDeploy = kpis.lastDeploy?.state === 'ERROR' ? 1 : 0;
  const banner = {
    ...computeBannerState({
      criticalCount: criticalIncidentGroups24h + featureHealthCriticalCount,
      attentionCount: attentionFromDeploy + featureHealthAttentionCount,
      anyFeedStale: incidentFeed24h.sentry.status === 'error' || watcher.some((w) => w.stale) || featureHealth.degraded,
    }),
    checkedAt: now.toISOString(),
    // Single-line banner detail per N6 (never a wall of routine noise) —
    // null when the rollup contributes nothing (0 red, no new fingerprints).
    featureHealthLine: featureHealthBanner.line,
  };

  return { kpis, banner, watcher, featureHealth };
}
