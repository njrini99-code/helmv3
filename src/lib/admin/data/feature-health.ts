import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import {
  FEATURE_REGISTRY,
  TIER_THRESHOLDS,
  rpcInput,
  type FeatureApp,
  type FeatureKey,
  type FeatureTier,
} from '@/lib/admin/feature-registry';
import { fetchSentryFeatureCounts } from '@/lib/admin/sentry-api';
import { drainCollapsedCount, shouldEmit } from '@/lib/admin/emit-throttle';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';

/**
 * W16 Task 1 — Feature Health data layer + classifier.
 *
 * `computeFeatureStatus()` is the pure, unit-tested core (FEATURE_COVERAGE.md
 * §3, the Noise-Discipline Charter §0). `fetchFeatureHealth()` is the async
 * fetcher that feeds it: `get_feature_health()` (W15 migration) via the
 * USER-SCOPED client (the RPC's `is_super_admin()` gate reads `auth.uid()`,
 * which is NULL under service_role — same rule as W3's `get_active_sessions`
 * / `revoke_user_sessions`), Sentry per-feature counts (Task 2, fail-soft),
 * mapped through the classifier and sorted red → amber → neutral → green.
 */

export type FeatureStatus = 'green' | 'amber' | 'red' | 'neutral';
export type FeatureTrend = 'improving' | 'flat' | 'worsening';

export interface FeatureHealthEvents24h {
  total: number;
  errors: number;
  criticalUnresolved: number;
  warnings: number;
  fingerprints: number;
  rlsDenials: number;
  rlsDenialFingerprints: number;
  rlsDenialUsers: number;
}

/** One registry feature's raw signals — the classifier's only input. Kept
 *  flat and JSON-serializable so it is trivial to construct in tests. */
export interface FeatureHealthInputs {
  key: FeatureKey;
  tier: FeatureTier;
  seasonalEmpty: boolean;
  neverNeutral: boolean;
  events24h: FeatureHealthEvents24h;
  fingerprintsPrev24h: number;
  errorsPrev24h: number;
  fingerprints7d: number;
  integrityStatus: 'pass' | 'fail' | null;
  /** ISO timestamp of the last row on the feature's heartbeat table, or
   *  null when there is no heartbeat table OR the table has zero rows —
   *  either way, staleness cannot be assessed, so heartbeat-based amber
   *  never fires (a feature with no data to judge by is not "stale"). */
  heartbeatLastActivity: string | null;
  /** null = Sentry unavailable/unconfigured/errored — degrade to DB-only,
   *  never treat "no Sentry data" as evidence of health or of an outage. */
  sentryUnresolved: { total: number; critical: number } | null;
  /** Empirical tier input (trailing-7d primary-table writes). Reserved for
   *  future percentage-based thresholds (§3 "high" row); null = unknown. */
  primaryTableWrites7d: number | null;
  /** Per-feature heartbeat-staleness override in hours (qualifiers' widened
   *  7d window). Null = use the tier default from TIER_THRESHOLDS. */
  heartbeatStaleHoursOverride: number | null;
  now: Date;
}

export interface TopSignature {
  fingerprint: string;
  title: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  severity: 'error' | 'critical';
}

export interface FeatureHealth {
  key: FeatureKey;
  app: FeatureApp;
  label: string;
  status: FeatureStatus;
  trend: FeatureTrend;
  reason: string;
  summary: string;
  topSignatures: TopSignature[];
  drillIn: { warnings24h: number; rlsDenials24h: number; heartbeatAgeHours: number | null };
  healthSignal: string;
  knownGaps: string[];
}

// ---------------------------------------------------------------------------
// computeFeatureStatus — PURE. The TDD core. Priority-ordered rule list per
// FEATURE_COVERAGE.md §3 (first match wins).
// ---------------------------------------------------------------------------

function computeTrend(nowErrors: number, prevErrors: number): FeatureTrend {
  if (prevErrors === 0) return nowErrors === 0 ? 'flat' : 'worsening';
  const delta = (nowErrors - prevErrors) / prevErrors;
  if (delta > 0.2) return 'worsening';
  if (delta < -0.2) return 'improving';
  return 'flat';
}

/** RLS-denial special case (§0): a cluster is same-fingerprint ≥10x/24h OR
 *  ≥3 distinct users. Sustained-pattern escalation to RED needs prev-window
 *  evidence we don't have in this input shape (no rls-prev-24h counter on
 *  the RPC) — so a cluster caps at AMBER here; never an un-evidenced RED. */
function isRlsCluster(events: FeatureHealthEvents24h): boolean {
  if (events.rlsDenials <= 0) return false;
  const sameFingerprintFlood = events.rlsDenials >= 10 && events.rlsDenialFingerprints <= 1;
  const manyUsers = events.rlsDenialUsers >= 3;
  return sameFingerprintFlood || manyUsers;
}

export function computeFeatureStatus(
  i: FeatureHealthInputs,
): { status: FeatureStatus; trend: FeatureTrend; reason: string } {
  const trend = computeTrend(i.events24h.errors, i.errorsPrev24h);
  const sentryNote = i.sentryUnresolved === null ? ' Sentry unavailable — status computed from DB signals only.' : '';
  const finish = (status: FeatureStatus, reason: string) => ({ status, trend, reason: `${reason}${sentryNote}` });

  // ── 1. NEUTRAL-FIRST ──────────────────────────────────────────────────
  // No feature-tagged data in ANY measured window (24h totals, prev-24h and
  // 7d fingerprints, no integrity check, no RLS denials, no unresolved
  // critical). Checked before anything else so empty-by-design (seasonal)
  // AND not-yet-instrumented (feature tagging began 2026-07-02 — Appendix B
  // item 3) can never fall through to a fabricated green or a stale-heartbeat
  // amber. `neverNeutral` (admin_dashboard) is the one documented exception —
  // foundational infra reads GREEN on zero-everything, never neutral.
  const hasNoFeatureData =
    i.events24h.total === 0 &&
    i.events24h.criticalUnresolved === 0 &&
    i.events24h.rlsDenials === 0 &&
    i.fingerprintsPrev24h === 0 &&
    i.fingerprints7d === 0 &&
    i.integrityStatus === null;

  if (!i.neverNeutral && hasNoFeatureData) {
    return finish(
      'neutral',
      i.seasonalEmpty
        ? 'Expected-empty / seasonal — no feature-tagged activity in the lookback window.'
        : 'No feature-tagged data yet — instrumentation not yet reporting for this feature.',
    );
  }

  // ── 2. RED ────────────────────────────────────────────────────────────
  // Unresolved critical reds immediately, ANY tier — no 2-window grace even
  // for low-tier features (a single critical on a quiet feature is
  // proportionally loud).
  if (i.events24h.criticalUnresolved > 0) {
    return finish(
      'red',
      `${i.events24h.criticalUnresolved} unresolved critical incident(s) in the last 24h.`,
    );
  }
  if (i.integrityStatus === 'fail') {
    return finish('red', 'Latest integrity check failed for this feature.');
  }

  const thresholds = TIER_THRESHOLDS[i.tier];
  const lowTierSevenDay = i.tier === 'low';
  const fpCurrent = lowTierSevenDay ? i.fingerprints7d : i.events24h.fingerprints;

  if (lowTierSevenDay) {
    // Low tier is judged on the trailing-7d grouped-fingerprint count, not
    // 24h raw counts — the 7d window itself absorbs single-day volatility,
    // so no separate 2-window hysteresis input exists (or is needed) here.
    if (fpCurrent >= thresholds.redFp) {
      return finish(
        'red',
        `${fpCurrent} error fingerprint(s) in the trailing 7 days (low-traffic RED line ${thresholds.redFp}).`,
      );
    }
  } else if (fpCurrent >= thresholds.redFp && i.fingerprintsPrev24h >= thresholds.redFp) {
    // Hysteresis: RED requires BOTH the current AND previous 24h window to
    // independently cross the RED line — a single hot window never reds
    // (N5). Leaving red likewise requires a clean current window; nothing
    // here reads fingerprintsPrev24h once the current window is quiet.
    return finish(
      'red',
      `Error-fingerprint rate at/above ${thresholds.redFp}/24h across 2 consecutive windows (current ${fpCurrent}, previous ${i.fingerprintsPrev24h}).`,
    );
  }

  // ── 3. AMBER ──────────────────────────────────────────────────────────
  if (isRlsCluster(i.events24h)) {
    return finish(
      'amber',
      `RLS-denial cluster: ${i.events24h.rlsDenials} denial(s) across ${i.events24h.rlsDenialUsers} user(s) in 24h — possible missing grant / unapplied migration.`,
    );
  }

  if (fpCurrent >= thresholds.amberFp) {
    return finish(
      'amber',
      lowTierSevenDay
        ? `${fpCurrent} error fingerprint(s) in the trailing 7 days.`
        : `${fpCurrent} error fingerprint(s) in the last 24h.`,
    );
  }

  if (i.sentryUnresolved !== null) {
    const nonCritical = i.sentryUnresolved.total - i.sentryUnresolved.critical;
    if (nonCritical > 0) {
      return finish('amber', `${nonCritical} unresolved non-critical Sentry issue(s) tagged to this feature.`);
    }
  }

  if (i.heartbeatLastActivity !== null && !i.seasonalEmpty) {
    const staleHours = i.heartbeatStaleHoursOverride ?? thresholds.heartbeatStaleHours;
    const ageHours = (i.now.getTime() - new Date(i.heartbeatLastActivity).getTime()) / 3_600_000;
    if (ageHours > staleHours) {
      return finish(
        'amber',
        `Heartbeat stale — last activity ${Math.round(ageHours)}h ago (threshold ${staleHours}h).`,
      );
    }
  }

  // ── 4. GREEN ──────────────────────────────────────────────────────────
  return finish('green', 'Healthy — no error fingerprints, no RLS cluster, heartbeat within threshold.');
}

// ---------------------------------------------------------------------------
// fetchFeatureHealth — async data layer. CALLER must have passed
// requireSuperAdmin() first (page-level gate).
// ---------------------------------------------------------------------------

interface RawFeatureHealthRow {
  key: string;
  events_24h?: {
    total?: number;
    errors?: number;
    critical_unresolved?: number;
    warnings?: number;
    fingerprints?: number;
    rls_denials?: number;
    rls_denial_fingerprints?: number;
    rls_denial_users?: number;
  } | null;
  top_signatures?: Array<{
    fingerprint: string;
    title: string;
    count: number;
    first_seen: string;
    last_seen: string;
    severity: 'error' | 'critical';
    resolved: boolean;
  }> | null;
  fingerprints_prev_24h?: number | null;
  errors_prev_24h?: number | null;
  fingerprints_7d?: number | null;
  integrity_status?: 'pass' | 'fail' | null;
  heartbeat_last_activity?: string | null;
}

function relativeFromNow(iso: string, now: Date): string {
  const ageMs = now.getTime() - new Date(iso).getTime();
  const hours = ageMs / 3_600_000;
  if (hours < 1) return `${Math.max(1, Math.round(ageMs / 60_000))}m ago`;
  if (hours < 48) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function buildSummary(input: {
  events24h: FeatureHealthEvents24h;
  trend: FeatureTrend;
  topSignatures: TopSignature[];
  now: Date;
}): string {
  const { events24h, trend, topSignatures, now } = input;
  const severity = events24h.criticalUnresolved > 0 ? 'critical' : 'error';
  const trendWord = trend === 'improving' ? 'improving' : trend === 'worsening' ? 'worsening' : 'flat';
  const base = `${events24h.errors} ${severity} incident(s) across ${events24h.fingerprints} signature(s) in 24h, ${trendWord} vs yesterday.`;
  const top = topSignatures[0];
  if (!top) return base;
  return `${base} Top: "${top.title}" (${top.count}×, last seen ${relativeFromNow(top.lastSeen, now)}).`;
}

function inputsForFeature(
  def: (typeof FEATURE_REGISTRY)[number],
  row: RawFeatureHealthRow | undefined,
  sentryCounts: Record<string, { total: number; critical: number }> | null,
  now: Date,
): FeatureHealthInputs {
  const events = row?.events_24h ?? {};
  return {
    key: def.key,
    tier: def.tier,
    seasonalEmpty: def.seasonalEmpty,
    neverNeutral: def.neverNeutral ?? false,
    events24h: {
      total: events.total ?? 0,
      errors: events.errors ?? 0,
      criticalUnresolved: events.critical_unresolved ?? 0,
      warnings: events.warnings ?? 0,
      fingerprints: events.fingerprints ?? 0,
      rlsDenials: events.rls_denials ?? 0,
      rlsDenialFingerprints: events.rls_denial_fingerprints ?? 0,
      rlsDenialUsers: events.rls_denial_users ?? 0,
    },
    fingerprintsPrev24h: row?.fingerprints_prev_24h ?? 0,
    errorsPrev24h: row?.errors_prev_24h ?? 0,
    fingerprints7d: row?.fingerprints_7d ?? 0,
    integrityStatus: row?.integrity_status ?? null,
    heartbeatLastActivity: row?.heartbeat_last_activity ?? null,
    sentryUnresolved: sentryCounts ? (sentryCounts[def.key] ?? { total: 0, critical: 0 }) : null,
    primaryTableWrites7d: null,
    heartbeatStaleHoursOverride: def.heartbeatStaleHoursOverride ?? null,
    now,
  };
}

const STATUS_RANK: Record<FeatureStatus, number> = { red: 0, amber: 1, neutral: 2, green: 3 };

/**
 * USER-SCOPED client — get_feature_health() gates on auth.uid() via
 * is_super_admin() and Forbids under service_role (by design, same as
 * get_active_sessions / revoke_user_sessions).
 *
 * `cache()`-memoised per request. One render of /admin called this TWICE —
 * once inside `fetchOverviewSnapshot()` for the banner rollup, once again for
 * the "Feature command map" panel — and a single call is the
 * get_feature_health() RPC PLUS `fetchSentryFeatureCounts`, which issues one
 * Sentry search PER registry feature (85 non-excluded features, 6 at a time).
 * Paying that fan-out twice for one screen was the most expensive duplicate on
 * the page.
 *
 * Zero arguments, so it keys cleanly — no reference-identity trap (contrast
 * `cachedIncidentFeed` in data/incident-feed.ts, which exists ONLY because
 * `cache()` cannot key an object literal). Memoisation is scoped to a React
 * request, so route handlers and cron callers still get a fresh pull.
 */
export const fetchFeatureHealth = cache(async (): Promise<{
  features: FeatureHealth[];
  generatedAt: string;
  degraded: boolean;
  /** Why the RPC failed, verbatim, when `degraded` — null otherwise. The
   *  board short-circuits to a single all-neutral panel on degrade, so this
   *  string is the ONLY thing that distinguishes "the DB is down" from "the
   *  payload was rejected" (the shape the 100-descriptor p_features ceiling
   *  took before 20260806030000 raised it to 500). */
  degradedReason: string | null;
}> => {
  const now = new Date();
  const registryFeatures = FEATURE_REGISTRY.filter((def) => !def.excluded);
  const keys = registryFeatures.map((def) => def.key);

  let rows: RawFeatureHealthRow[] | null = null;
  let degraded = false;
  let degradedReason: string | null = null;
  try {
    const supabase = await createClient();
    const rpc = supabase.rpc.bind(supabase) as unknown as (
      fn: 'get_feature_health',
      args: { p_features: Array<{ key: FeatureKey; heartbeat_table: string | null }> },
    ) => Promise<{ data: RawFeatureHealthRow[] | null; error: { message: string } | null }>;
    const { data, error } = await rpc('get_feature_health', { p_features: rpcInput() });
    if (error) throw new Error(error.message);
    rows = data ?? [];
  } catch (rpcError) {
    // Fail-soft (Task 1 step 3): RPC failure → every feature reads neutral
    // with an explicit "pipeline degraded" reason — never fake-green, never
    // fake-red. The rollup (Task 5) surfaces this to the Overview banner.
    //
    // The bare `catch {}` this replaces discarded the message, which made the
    // two failures an operator most needs to tell apart look identical: a
    // dead database and a REJECTED PAYLOAD. FEATURE_REGISTRY is at 86 entries
    // (85 after `excluded`) against get_feature_health()'s old 100-descriptor
    // ceiling — the 101st feature would have turned the whole board, and the
    // /admin rollup with it, neutral behind the word "degraded" with nothing
    // anywhere naming the cap. Keep the reason, and record the failure: a
    // blind health board is itself an incident.
    degraded = true;
    degradedReason = describeError(rpcError);
    // Throttled: /admin, /admin/golf, /admin/baseball and /admin/health all
    // call this on a 30s AutoRefresh, so an outage must collapse to ONE line
    // with a count, not ~8 admin_events rows a minute (Noise Charter N4).
    const throttleKey = 'admin:feature_health:rpc_failed';
    if (shouldEmit(throttleKey)) {
      const collapsed = drainCollapsedCount(throttleKey);
      void logServerError(
        `[Bridge] feature health pipeline degraded: ${degradedReason}`,
        {
          action: 'admin.fetchFeatureHealth',
          feature: 'admin_dashboard',
          sport: 'shared',
          source: 'server_component',
          // Stable across wording so one outage is one incident.
          errorCode: 'feature_health_rpc_failed',
          errorDetails: degradedReason.slice(0, 500),
          handled: true,
          ...(collapsed > 0 ? { metadata: { collapsed_count: collapsed } } : {}),
        },
      ).catch(() => {});
    }
  }

  const rowByKey = new Map((rows ?? []).map((r) => [r.key, r]));

  let sentryCounts: Record<string, { total: number; critical: number }> | null = null;
  if (!degraded) {
    sentryCounts = await fetchSentryFeatureCounts(keys);
  }

  const features: FeatureHealth[] = registryFeatures.map((def) => {
    if (degraded) {
      return {
        key: def.key,
        app: def.app,
        label: def.label,
        status: 'neutral',
        trend: 'flat',
        reason: 'Feature health pipeline degraded — could not reach get_feature_health(). Showing neutral, not a fabricated state.',
        summary: 'Health data unavailable this refresh.',
        topSignatures: [],
        drillIn: { warnings24h: 0, rlsDenials24h: 0, heartbeatAgeHours: null },
        healthSignal: def.healthSignal,
        knownGaps: def.knownGaps ?? [],
      };
    }

    const row = rowByKey.get(def.key);
    const inputs = inputsForFeature(def, row, sentryCounts, now);
    const { status, trend, reason } = computeFeatureStatus(inputs);
    const topSignatures: TopSignature[] = (row?.top_signatures ?? []).slice(0, 3).map((sig) => ({
      fingerprint: sig.fingerprint,
      title: sig.title,
      count: sig.count,
      firstSeen: sig.first_seen,
      lastSeen: sig.last_seen,
      severity: sig.severity,
    }));
    const heartbeatAgeHours = inputs.heartbeatLastActivity
      ? Math.round((now.getTime() - new Date(inputs.heartbeatLastActivity).getTime()) / 3_600_000)
      : null;

    return {
      key: def.key,
      app: def.app,
      label: def.label,
      status,
      trend,
      reason,
      summary: buildSummary({ events24h: inputs.events24h, trend, topSignatures, now }),
      topSignatures,
      drillIn: {
        warnings24h: inputs.events24h.warnings,
        rlsDenials24h: inputs.events24h.rlsDenials,
        heartbeatAgeHours,
      },
      healthSignal: def.healthSignal,
      knownGaps: def.knownGaps ?? [],
    };
  });

  features.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]);

  return { features, generatedAt: now.toISOString(), degraded, degradedReason };
});

// ---------------------------------------------------------------------------
// Overview rollup support (W16 Task 5) — pure, unit-tested independently of
// React/Supabase so banner discipline (Charter N6) is verifiable directly.
// ---------------------------------------------------------------------------

export interface FeatureHealthChip {
  key: FeatureKey;
  label: string;
}

export interface FeatureHealthSummary {
  green: number;
  amber: number;
  red: number;
  neutral: number;
  redFeatures: FeatureHealthChip[];
  amberFeatures: FeatureHealthChip[];
  /** Grouped fingerprints first-seen in the last 24h on a feature that is
   *  NOT currently red — a leading indicator worth a banner ping even
   *  before hysteresis confirms a full RED (charter N6). */
  newFingerprints24h: number;
  degraded: boolean;
  generatedAt: string;
}

export function summarizeFeatureHealth(
  input: { features: FeatureHealth[]; generatedAt: string; degraded: boolean },
  now: Date,
): FeatureHealthSummary {
  const summary: FeatureHealthSummary = {
    green: 0,
    amber: 0,
    red: 0,
    neutral: 0,
    redFeatures: [],
    amberFeatures: [],
    newFingerprints24h: 0,
    degraded: input.degraded,
    generatedAt: input.generatedAt,
  };

  for (const f of input.features) {
    summary[f.status] += 1;
    if (f.status === 'red') summary.redFeatures.push({ key: f.key, label: f.label });
    if (f.status === 'amber') summary.amberFeatures.push({ key: f.key, label: f.label });
    if (f.status !== 'red') {
      for (const sig of f.topSignatures) {
        const ageHours = (now.getTime() - new Date(sig.firstSeen).getTime()) / 3_600_000;
        if (ageHours <= 24) summary.newFingerprints24h += 1;
      }
    }
  }

  return summary;
}

/** Banner discipline (N6): the rollup contributes NOTHING for warnings or
 *  amber alone — only a red feature, a new fingerprint on a previously-clean
 *  feature, or a degraded pipeline, and always exactly ONE line. */
export function computeFeatureHealthBanner(
  summary: FeatureHealthSummary,
): { contributes: boolean; line: string | null } {
  if (summary.degraded) {
    return { contributes: true, line: 'Feature health pipeline degraded — showing last-known states.' };
  }
  if (summary.red > 0) {
    const names = summary.redFeatures.map((f) => f.label).join(', ');
    return { contributes: true, line: `${summary.red} feature${summary.red === 1 ? '' : 's'} red: ${names}` };
  }
  if (summary.newFingerprints24h > 0) {
    return {
      contributes: true,
      line: `${summary.newFingerprints24h} new error fingerprint(s) in the last 24h on previously-clean feature(s).`,
    };
  }
  return { contributes: false, line: null };
}
