import 'server-only';
import { cache } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertQueryOk } from '@/lib/admin/data/assert-query-ok';
import { describeError } from '@/lib/utils/describe-error';
import { FAILURE_SEVERITIES, NOTICE_SEVERITIES, isFailureSeverity, isNoticeSeverity } from '@/lib/admin/severity';
import { FEATURE_REGISTRY, type FeatureApp, type FeatureTier } from '@/lib/admin/feature-registry';
import {
  fetchFeatureHealth,
  type FeatureHealth,
  type FeatureStatus,
  type FeatureTrend,
} from '@/lib/admin/data/feature-health';

/**
 * Feature Health — DETAIL layer (Bridge tracer task, 2026-08-26).
 *
 * `feature-health.ts` (NOT modified here — other code imports it directly)
 * answers "is this registry feature red/amber/neutral/green right now",
 * computed with 2-window hysteresis over `get_feature_health()`. This module
 * composes on top of that, adding three things the board did not have:
 *
 *   1. Real trailing-7d error/warning/total counts and a true last-event
 *      timestamp per feature, sourced directly from `admin_events` — the
 *      RPC's own `events_24h`/`fingerprints_7d` are windowed for the
 *      CLASSIFIER's hysteresis math, not for "how loud was this in the last
 *      week and when did it last make noise", which is what a detail view
 *      needs to show honestly.
 *   2. A recency-aware RANKING that keeps a loud-but-stopped burst from
 *      permanently parking itself above a smaller but currently-firing
 *      feature — see `rankFeatureDetailRows` below. `computeFeatureStatus`'s
 *      own hysteresis already discounts a stopped burst for REGISTERED
 *      features (2 clean 24h windows and a red feature returns to green on
 *      its own), but an UNREGISTERED tag (see next point) has no tier, no
 *      hysteresis, and no threshold to fall out of — without an explicit
 *      recency read, a raw-count sort would leave it stuck at the top
 *      forever.
 *   3. Attribution coverage: `admin_events.feature` is a free-text column,
 *      not an enum, so it can be NULL (never tagged) or a string that does
 *      not match any current `FEATURE_REGISTRY` key (an occupied tag whose
 *      owning feature was renamed, split, or never registered — the same
 *      class of drift `docs:schema-drift` catches for tables). Both are
 *      real coverage gaps, surfaced explicitly rather than silently folded
 *      into "zero events" for the registry features that DO exist.
 *
 * Every query here runs on the ADMIN client directly against `admin_events`
 * (unlike `feature-health.ts`'s user-scoped `get_feature_health()` RPC — see
 * that file's own doc comment on why IT must stay user-scoped). That is a
 * deliberate, separate failure domain: a `get_feature_health()` outage does
 * NOT take this module's raw counts down with it, and vice versa. Each half
 * degrades independently and says so.
 */

// ---------------------------------------------------------------------------
// Recency — the "loud but stale" vs "actively failing" distinction.
// ---------------------------------------------------------------------------

export type RecencyClass = 'active' | 'recent' | 'stale' | 'no_activity';

const RECENCY_ACTIVE_HOURS = 24;
const RECENCY_RECENT_HOURS = 24 * 3; // 3 days — matches the "burst that stopped" example verbatim.

/** Pure. `lastEventAt === null` means "no event for this tag in the window
 *  this caller queried" — never conflated with "stale" (which means an event
 *  exists but is old): a genuinely unattributed/unseen tag and an old burst
 *  are different facts and must rank/read differently. */
export function classifyRecency(lastEventAt: string | null, now: Date): RecencyClass {
  if (!lastEventAt) return 'no_activity';
  const t = Date.parse(lastEventAt);
  if (!Number.isFinite(t)) return 'no_activity';
  const hoursAgo = (now.getTime() - t) / 3_600_000;
  // A "future" timestamp (clock skew, test fixture) reads as active rather
  // than stale — the honest-failure direction is to over-alert, never to
  // quietly file a currently-happening thing as old news.
  if (hoursAgo <= RECENCY_ACTIVE_HOURS) return 'active';
  if (hoursAgo <= RECENCY_RECENT_HOURS) return 'recent';
  return 'stale';
}

// ---------------------------------------------------------------------------
// Per-tag aggregation — the coverage math. Pure: takes a flat page of raw
// admin_events rows (already windowed + rca_analysis-excluded by the caller)
// and groups them by the RAW `feature` string, including the `null` bucket.
// ---------------------------------------------------------------------------

export interface FeatureDetailCounts {
  errors: number;
  warnings: number;
  total: number;
}

export const EMPTY_FEATURE_DETAIL_COUNTS: Readonly<FeatureDetailCounts> = Object.freeze({
  errors: 0,
  warnings: 0,
  total: 0,
});

export interface FeatureDetailSignature {
  fingerprint: string;
  title: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  /** Widened to `string` (not the narrower Sentry-style 'error'|'critical'
   *  union `feature-health.ts`'s `TopSignature` uses) because this list also
   *  carries 'warning' rows — a raw admin_events severity, not a Sentry one. */
  severity: string;
}

export interface FeatureEventAggregate {
  counts: FeatureDetailCounts;
  /** Most recent `created_at` seen for this tag WITHIN the queried window —
   *  null means no row for this tag fell inside that window, not "never". */
  lastEventAt: string | null;
  /** Up to 3, ranked by count desc — mirrors the "one line per fingerprint,
   *  never N rows" discipline `feature-health.ts`'s topSignatures already
   *  follows (Noise-Discipline Charter N4). Restricted to warning/error/
   *  critical rows: 'info' is routine narration (severity.ts) and still
   *  counts toward `counts.total`, but is never worth a signature slot. */
  topSignatures: FeatureDetailSignature[];
}

export interface RawFeatureEventRow {
  id: string;
  feature: string | null;
  severity: string;
  title: string;
  created_at: string | null;
  fingerprint: string | null;
}

/**
 * Pure. Groups a flat page of raw events by `feature` (string key, or the
 * literal `null` map key for untagged rows). No Supabase types cross this
 * boundary — every field is a plain primitive, so any test can construct
 * rows by hand without a database.
 */
export function aggregateFeatureEvents(
  rows: readonly RawFeatureEventRow[],
): Map<string | null, FeatureEventAggregate> {
  interface Bucket {
    counts: FeatureDetailCounts;
    lastEventAt: string | null;
    signatures: Map<string, { title: string; severity: string; count: number; firstSeen: string; lastSeen: string }>;
  }
  const byKey = new Map<string | null, Bucket>();

  for (const row of rows) {
    // A null created_at cannot be ordered against the window or against
    // other rows — excluded rather than guessed into "now" or "never".
    if (!row.created_at) continue;

    const key = row.feature;
    let bucket = byKey.get(key);
    if (!bucket) {
      bucket = { counts: { errors: 0, warnings: 0, total: 0 }, lastEventAt: null, signatures: new Map() };
      byKey.set(key, bucket);
    }

    bucket.counts.total += 1;
    if (isFailureSeverity(row.severity)) bucket.counts.errors += 1;
    else if (isNoticeSeverity(row.severity)) bucket.counts.warnings += 1;

    if (!bucket.lastEventAt || row.created_at > bucket.lastEventAt) bucket.lastEventAt = row.created_at;

    // isIncidentSeverity would say this in one call, but spelling out
    // notice-or-failure keeps it obvious that `info` is the only tier excluded
    // — and both halves now come from @/lib/admin/severity rather than a
    // literal, so a new severity cannot silently fall out of the signature list.
    if (isNoticeSeverity(row.severity) || isFailureSeverity(row.severity)) {
      const sigKey = row.fingerprint ?? `row:${row.id}`;
      const existing = bucket.signatures.get(sigKey);
      if (existing) {
        existing.count += 1;
        if (row.created_at < existing.firstSeen) existing.firstSeen = row.created_at;
        if (row.created_at > existing.lastSeen) existing.lastSeen = row.created_at;
      } else {
        bucket.signatures.set(sigKey, {
          title: row.title,
          severity: row.severity,
          count: 1,
          firstSeen: row.created_at,
          lastSeen: row.created_at,
        });
      }
    }
  }

  const result = new Map<string | null, FeatureEventAggregate>();
  for (const [key, bucket] of byKey) {
    const topSignatures = [...bucket.signatures.entries()]
      .map(([fingerprint, v]) => ({ fingerprint, ...v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
    result.set(key, { counts: bucket.counts, lastEventAt: bucket.lastEventAt, topSignatures });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Attribution coverage — "how many events mapped to a feature vs not, and
// what that does to confidence in the rest of the page."
// ---------------------------------------------------------------------------

export interface AttributionCoverage {
  windowDays: number;
  totalEvents: number;
  attributedEvents: number;
  unattributedEvents: number;
  unattributedErrors: number;
  unattributedWarnings: number;
  /** null only when `totalEvents === 0` — a percentage of zero is not a
   *  meaningful "100% covered", it is "nothing to cover", a different fact. */
  coveragePct: number | null;
  confidence: 'high' | 'medium' | 'low' | 'unknown';
  /** One ready-to-render sentence — every per-feature count on the page is
   *  computed only over the attributed slice, and this says so. */
  headline: string;
}

/** Pure. The exact boundaries a reader needs to trust (or not trust) every
 *  other number on this page. */
export function computeAttributionCoverage(input: {
  totalEvents: number;
  unattributedEvents: number;
  unattributedErrors: number;
  unattributedWarnings: number;
  windowDays: number;
}): AttributionCoverage {
  const { totalEvents, unattributedEvents, unattributedErrors, unattributedWarnings, windowDays } = input;
  const attributedEvents = Math.max(0, totalEvents - unattributedEvents);
  const coveragePct = totalEvents > 0 ? Math.round((attributedEvents / totalEvents) * 1000) / 10 : null;

  const confidence: AttributionCoverage['confidence'] =
    coveragePct === null ? 'unknown' : coveragePct >= 90 ? 'high' : coveragePct >= 70 ? 'medium' : 'low';

  const headline =
    totalEvents === 0
      ? `No events in the trailing ${windowDays}d — coverage cannot be assessed.`
      : `${attributedEvents.toLocaleString()} of ${totalEvents.toLocaleString()} events (${coveragePct}%) carried a ` +
        `feature tag in the last ${windowDays}d; ${unattributedEvents.toLocaleString()} did not ` +
        `(${unattributedErrors} error${unattributedErrors === 1 ? '' : 's'}, ` +
        `${unattributedWarnings} warning${unattributedWarnings === 1 ? '' : 's'}). Every per-feature count on this ` +
        `page is computed only over the ${coveragePct}% that could be attributed.`;

  return {
    windowDays,
    totalEvents,
    attributedEvents,
    unattributedEvents,
    unattributedErrors,
    unattributedWarnings,
    coveragePct,
    confidence,
    headline,
  };
}

// ---------------------------------------------------------------------------
// Unregistered-tag classification — never 'green'. A tag with no registry
// entry has no tier, no owner, and nothing this system can vouch for; "all
// clear" is a claim this code is not entitled to make on its behalf, no
// matter how quiet it looks this week.
// ---------------------------------------------------------------------------

export function classifyUnregisteredStatus(
  counts: FeatureDetailCounts,
  recency: RecencyClass,
): Extract<FeatureStatus, 'red' | 'amber' | 'neutral'> {
  if (counts.errors > 0 && (recency === 'active' || recency === 'recent')) return 'red';
  if (counts.errors > 0 || counts.warnings > 0) return 'amber';
  return 'neutral';
}

// ---------------------------------------------------------------------------
// Ranking — status first (unchanged Bridge doctrine: red, amber, neutral,
// green), then recency WITHIN a status tier, then raw volume as the final
// tiebreak. This is what stops a stopped 317-error burst from parking itself
// above a smaller feature that is firing right now.
// ---------------------------------------------------------------------------

const STATUS_RANK: Record<FeatureStatus, number> = { red: 0, amber: 1, neutral: 2, green: 3 };
const RECENCY_RANK: Record<RecencyClass, number> = { active: 0, recent: 1, stale: 2, no_activity: 3 };

export interface FeatureDetailRankable {
  status: FeatureStatus;
  recency: RecencyClass;
  counts: FeatureDetailCounts;
}

/** Pure comparator — ascending sort puts the row that most needs eyes first. */
export function compareFeatureDetailRows(a: FeatureDetailRankable, b: FeatureDetailRankable): number {
  const statusDiff = STATUS_RANK[a.status] - STATUS_RANK[b.status];
  if (statusDiff !== 0) return statusDiff;
  const recencyDiff = RECENCY_RANK[a.recency] - RECENCY_RANK[b.recency];
  if (recencyDiff !== 0) return recencyDiff;
  // Tiebreak only once status AND recency already agree — volume never
  // overrides either of them, which is the whole point of this function.
  return b.counts.errors + b.counts.warnings - (a.counts.errors + a.counts.warnings);
}

export function rankFeatureDetailRows<T extends FeatureDetailRankable>(rows: readonly T[]): T[] {
  return [...rows].sort(compareFeatureDetailRows);
}

// ---------------------------------------------------------------------------
// fetchFeatureHealthDetail — async data layer. CALLER must have passed
// requireSuperAdmin() first (page-level gate, same as feature-health.ts).
// ---------------------------------------------------------------------------

export const DETAIL_WINDOW_DAYS = 7;
// Real 7d production volume at design time was ~2,100 admin_events rows
// total (317 + 94 + 8 + 462 + 615 + 50 + 25 attributed + 539 unattributed —
// 2026-08-27 snapshot). 8,000 leaves ample headroom for a bad week without
// ever silently discarding today's numbers; `rowsTruncated` below tells the
// UI (and the UI tells the reader) on the rare week this still isn't enough.
// Exported (not just a local const) so the page can name the exact bound in
// its own truncation notice rather than restating a magic number by hand.
export const DETAIL_ROW_LIMIT = 8000;
const RAW_EVENT_ROW_LIMIT = DETAIL_ROW_LIMIT;

export type FeatureDetailKind = 'registered' | 'unregistered';

export interface FeatureDetailRow extends FeatureDetailRankable {
  kind: FeatureDetailKind;
  /** FeatureKey for a registered row; the raw `admin_events.feature` string
   *  for an unregistered one. */
  key: string;
  label: string;
  app: FeatureApp | null;
  tier: FeatureTier | null;
  /** null for an unregistered tag — there is no prior-window baseline to
   *  compare against outside the registry's own hysteresis machinery. */
  trend: FeatureTrend | null;
  reason: string;
  summary: string;
  healthSignal: string | null;
  knownGaps: string[];
  topSignatures: FeatureDetailSignature[];
  lastEventAt: string | null;
  drillIn: FeatureHealth['drillIn'] | null;
}

export interface FeatureHealthDetailResult {
  generatedAt: string;
  windowDays: number;
  /** From `fetchFeatureHealth()` — true when `get_feature_health()` itself
   *  could not be reached. Registered rows still render (status forced
   *  neutral, per that module's own fail-soft contract) and this module's
   *  OWN 7d counts/recency still come through independently below, since
   *  they are sourced from a completely different query. */
  degraded: boolean;
  degradedReason: string | null;
  /** Ranked, registered + unregistered rows together — see
   *  `rankFeatureDetailRows`. */
  rows: FeatureDetailRow[];
  /** null only when the coverage queries themselves failed — never a
   *  fabricated 100%/0%. */
  coverage: AttributionCoverage | null;
  coverageError: string | null;
  /**
   * FALSE when the raw admin_events read failed. This is the guard against
   * the exact failure this repo's Noise-Discipline Charter names by name
   * ("error → []", never "unknown → healthy"): a failed raw-event query
   * would otherwise leave `coverageAndRaw.perFeature` empty, and every
   * registered row's `counts`/`lastEventAt` would silently read as a quiet,
   * healthy 0/0/0 — indistinguishable from an actually-quiet week. Every
   * `FeatureDetailRow.counts`/`lastEventAt`/`recency` is a real,
   * independently-sourced reading ONLY when this is true; the renderer MUST
   * show "counts unavailable" rather than those fields when it is false
   * (`f.status`/`f.trend`/`f.reason` on a registered row are unaffected —
   * those still come from `fetchFeatureHealth()`, a separate query that can
   * succeed even when this one fails).
   */
  countsAvailable: boolean;
  /** True when the raw-event page hit `RAW_EVENT_ROW_LIMIT` — per-feature
   *  counts/recency above are then a LOWER bound, not a miscount. The exact
   *  `coverage` totals are unaffected (those come from separate exact
   *  head-count queries, not this bounded page). Always false when
   *  `countsAvailable` is false — there is no page to have been truncated. */
  rowsTruncated: boolean;
}

interface CoverageAndRawEvents {
  perFeature: Map<string | null, FeatureEventAggregate>;
  coverage: AttributionCoverage | null;
  error: string | null;
  truncated: boolean;
}

async function loadCoverageAndRawEvents(windowStartIso: string): Promise<CoverageAndRawEvents> {
  try {
    const admin = createAdminClient();

    // Five independent reads against admin_events, all windowed to the same
    // trailing DETAIL_WINDOW_DAYS and all excluding event_type='rca_analysis'
    // (an analysis of an incident is not an occurrence of one — same rule
    // errors.ts's fetchFingerprintDetail follows). The four count() queries
    // are `head:true` (exact, no rows travel) so the coverage totals below
    // are NEVER derived from the bounded row page — only the per-feature
    // breakdown is, and that page's own truncation is tracked separately.
    const [rowsRes, totalRes, unattrRes, unattrErrRes, unattrWarnRes] = await Promise.all([
      admin
        .from('admin_events')
        .select('id, feature, severity, title, created_at, fingerprint')
        .neq('event_type', 'rca_analysis')
        .gte('created_at', windowStartIso)
        .order('created_at', { ascending: false })
        .limit(RAW_EVENT_ROW_LIMIT),
      admin
        .from('admin_events')
        .select('id', { count: 'exact', head: true })
        .neq('event_type', 'rca_analysis')
        .gte('created_at', windowStartIso),
      admin
        .from('admin_events')
        .select('id', { count: 'exact', head: true })
        .neq('event_type', 'rca_analysis')
        .gte('created_at', windowStartIso)
        .is('feature', null),
      admin
        .from('admin_events')
        .select('id', { count: 'exact', head: true })
        .neq('event_type', 'rca_analysis')
        .gte('created_at', windowStartIso)
        .is('feature', null)
        .in('severity', FAILURE_SEVERITIES),
      admin
        .from('admin_events')
        .select('id', { count: 'exact', head: true })
        .neq('event_type', 'rca_analysis')
        .gte('created_at', windowStartIso)
        .is('feature', null)
        .in('severity', NOTICE_SEVERITIES),
    ]);

    assertQueryOk(rowsRes, 'feature-health-detail raw events');
    assertQueryOk(totalRes, 'feature-health-detail total count');
    assertQueryOk(unattrRes, 'feature-health-detail unattributed count');
    assertQueryOk(unattrErrRes, 'feature-health-detail unattributed errors');
    assertQueryOk(unattrWarnRes, 'feature-health-detail unattributed warnings');

    const rows = rowsRes.data ?? [];
    const perFeature = aggregateFeatureEvents(rows);

    const totalEvents = totalRes.count ?? 0;
    const unattributedEvents = unattrRes.count ?? 0;
    const coverage = computeAttributionCoverage({
      totalEvents,
      unattributedEvents,
      unattributedErrors: unattrErrRes.count ?? 0,
      unattributedWarnings: unattrWarnRes.count ?? 0,
      windowDays: DETAIL_WINDOW_DAYS,
    });

    return { perFeature, coverage, error: null, truncated: rows.length >= RAW_EVENT_ROW_LIMIT };
  } catch (err) {
    // Fail-soft: an unreachable admin_events means "coverage unknown", never
    // a fabricated percentage. Registered rows still render below with
    // whatever fetchFeatureHealth() could get from get_feature_health() —
    // this failure only blanks the parts THIS query owns.
    return { perFeature: new Map(), coverage: null, error: describeError(err), truncated: false };
  }
}

/**
 * `cache()`-memoised per request (mirrors `fetchFeatureHealth`/
 * `fetchFeatureHealthRows` in feature-health.ts) — zero-arg key, so a route
 * handler or cron caller still gets a fresh pull.
 */
export const fetchFeatureHealthDetail = cache(async (): Promise<FeatureHealthDetailResult> => {
  const now = new Date();
  const windowStartIso = new Date(now.getTime() - DETAIL_WINDOW_DAYS * 24 * 3_600_000).toISOString();

  const [health, coverageAndRaw] = await Promise.all([
    fetchFeatureHealth(),
    loadCoverageAndRawEvents(windowStartIso),
  ]);

  const registryByKey = new Map(FEATURE_REGISTRY.map((def) => [def.key, def] as const));
  const registeredKeys = new Set<string>(FEATURE_REGISTRY.map((def) => def.key));

  const rows: FeatureDetailRow[] = [];

  // ── Registered rows — one per non-excluded FEATURE_REGISTRY entry, which
  // is exactly what fetchFeatureHealth().features already enumerates.
  for (const f of health.features) {
    const agg = coverageAndRaw.perFeature.get(f.key);
    const counts = agg?.counts ?? EMPTY_FEATURE_DETAIL_COUNTS;
    const lastEventAt = agg?.lastEventAt ?? null;
    rows.push({
      kind: 'registered',
      key: f.key,
      label: f.label,
      app: f.app,
      tier: registryByKey.get(f.key)?.tier ?? null,
      status: f.status,
      trend: f.trend,
      reason: f.reason,
      summary: f.summary,
      healthSignal: f.healthSignal,
      knownGaps: f.knownGaps,
      topSignatures: agg?.topSignatures ?? [],
      counts,
      lastEventAt,
      recency: classifyRecency(lastEventAt, now),
      drillIn: f.drillIn,
    });
  }

  // ── Unregistered rows — any non-null `feature` tag this window actually
  // saw that is NOT a current FEATURE_REGISTRY key. A real registry gap
  // (point (b) in the brief is the null bucket; this is its sibling: a
  // tag that exists but that nothing in the registry claims).
  for (const [key, agg] of coverageAndRaw.perFeature) {
    if (key === null) continue;
    if (registeredKeys.has(key)) continue;
    const recency = classifyRecency(agg.lastEventAt, now);
    rows.push({
      kind: 'unregistered',
      key,
      label: key,
      app: null,
      tier: null,
      status: classifyUnregisteredStatus(agg.counts, recency),
      trend: null,
      reason:
        `"${key}" is tagged on live admin_events rows but is not a key in FEATURE_REGISTRY ` +
        `(src/lib/admin/feature-registry.ts) — it has no tier, no hysteresis, and no registered owner.`,
      summary:
        `${agg.counts.errors} error(s), ${agg.counts.warnings} warning(s), ${agg.counts.total} event(s) ` +
        `tagged "${key}" in the trailing ${DETAIL_WINDOW_DAYS}d.`,
      healthSignal: null,
      knownGaps: [],
      topSignatures: agg.topSignatures,
      counts: agg.counts,
      lastEventAt: agg.lastEventAt,
      recency,
      drillIn: null,
    });
  }

  return {
    generatedAt: now.toISOString(),
    windowDays: DETAIL_WINDOW_DAYS,
    degraded: health.degraded,
    degradedReason: health.degradedReason,
    rows: rankFeatureDetailRows(rows),
    coverage: coverageAndRaw.coverage,
    coverageError: coverageAndRaw.error,
    countsAvailable: coverageAndRaw.error === null,
    rowsTruncated: coverageAndRaw.truncated,
  };
});
