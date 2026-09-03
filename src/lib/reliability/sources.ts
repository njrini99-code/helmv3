import 'server-only';

/**
 * Reliability collector — the three source arms.
 *
 * Each arm wraps a client that already exists and is already proven in the
 * Bridge (`sentry-api.ts`, `vercel-api.ts`, the admin Supabase client) and
 * translates its result into the collector's `SourceResult` envelope. Writing
 * new API clients here would have created a second copy of the auth, paging and
 * timeout handling — the same "two copies, one drifts silently" trap the
 * redaction helper's comment warns about.
 *
 * `AdminFetchResult.status` maps onto `SourceStatus` deliberately:
 *   ok           → 'ok'      (or 'partial' when the client set `truncated`)
 *   unconfigured → 'blind'   — no token. NOT zero problems.
 *   error        → 'blind'   — could not read. NOT zero problems.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { fetchSentryIssues } from '@/lib/admin/sentry-api';
import { fetchVercelDeployments } from '@/lib/admin/vercel-api';
import type { AdminFetchResult } from '@/lib/admin/fetch-result';
import { RELIABILITY_JOB_TYPE } from './normalize';
import type {
  RawSignal,
  ReliabilitySeverity,
  SourceResult,
  SourceStatus,
} from './types';

/** Per-arm caps. The Vercel function ceiling is 300s; three unbounded arms find it. */
const SENTRY_ISSUE_LIMIT = 50;
const SUPABASE_ROW_LIMIT = 1000;
const VERCEL_DEPLOY_LIMIT = 20;

function statusFromFetch<T>(res: AdminFetchResult<T>): { status: SourceStatus; reason: string | null } {
  if (res.status === 'unconfigured') {
    return { status: 'blind', reason: res.error ?? 'not configured' };
  }
  if (res.status === 'error') {
    // A rate limit that survived one honoured Retry-After retry (see
    // `fetchSentryIssues`) is transient and usually clears on its own —
    // worth telling apart from a dead token or an unreachable provider.
    if (res.degraded) {
      return { status: 'degraded', reason: 'rate limited' };
    }
    return { status: 'blind', reason: res.error ?? 'fetch failed' };
  }
  if (res.truncated) {
    return { status: 'partial', reason: 'bounded page ceiling reached' };
  }
  return { status: 'ok', reason: null };
}

/** Sentry `level` → the Bridge's shared severity vocabulary. */
function severityFromSentryLevel(level: string): ReliabilitySeverity {
  switch (level.toLowerCase()) {
    case 'fatal':
      return 'critical';
    case 'error':
      return 'error';
    case 'warning':
      return 'warning';
    default:
      return 'info';
  }
}

// ---------------------------------------------------------------------------
// Sentry
// ---------------------------------------------------------------------------

/**
 * Unresolved Sentry issues.
 *
 * This is also where Vercel RUNTIME errors reach the collector: the app ships a
 * Sentry DSN, so uncaught server and client exceptions on Vercel are captured
 * by Sentry rather than needing a separate log tail. The Vercel arm below is
 * therefore about deploy/build health, not runtime exceptions — see its note.
 */
/**
 * Occurrences inside the window, from the issue's own 24h buckets — or `null`
 * when that cannot be established.
 *
 * No extra request: the issue-list call already sends `statsPeriod=24h` and
 * the response already carries `stats['24h']` as `[epochSeconds, count]`
 * pairs. The collection window is four hours, comfortably inside that range.
 *
 * `null` means UNKNOWN, and the caller must not substitute either the lifetime
 * count (the bug this closes) or zero (a different lie: the issue is only in
 * this collection because `lastSeen` proves it fired inside the window).
 */
function windowOccurrences(
  buckets: ReadonlyArray<readonly [number, number]> | undefined,
  windowStartIso: string,
): number | null {
  if (!buckets || buckets.length === 0) return null;
  const startMs = Date.parse(windowStartIso);
  if (!Number.isFinite(startMs)) return null;
  const startSec = startMs / 1000;
  let total = 0;
  let sawBucket = false;
  for (const bucket of buckets) {
    const [ts, n] = bucket;
    if (!Number.isFinite(ts) || !Number.isFinite(n)) continue;
    sawBucket = true;
    if (ts >= startSec) total += n;
  }
  return sawBucket ? total : null;
}

/**
 * Is `whenIso` at or after the window start?
 *
 * Unparseable or missing timestamps return TRUE — inside. This is a collection
 * filter, and dropping a signal whose time we cannot establish would silently
 * shrink the board, which is the direction this whole subsystem refuses to
 * fail in. An unplaceable signal is kept and stays visible.
 */
function windowInclusive(whenIso: string | null | undefined, windowStartIso: string): boolean {
  if (!whenIso) return true;
  const when = Date.parse(whenIso);
  const start = Date.parse(windowStartIso);
  if (!Number.isFinite(when) || !Number.isFinite(start)) return true;
  return when >= start;
}

export async function collectSentry(windowStartIso: string): Promise<SourceResult> {
  const startedAt = Date.now();
  const res = await fetchSentryIssues({ query: 'is:unresolved', limit: SENTRY_ISSUE_LIMIT });
  const { status, reason } = statusFromFetch(res);

  // `is:unresolved` is a LIFETIME query — an issue stays unresolved for months.
  // Without this filter every long-standing issue was collected into a snapshot
  // that declares a four-hour window, and a 2026-08-28 run labelled 17:01-21:01
  // carried issues last seen at 14:50, 11:04 and 02:23. The window has to
  // describe the data or it is not a window.
  //
  // Filtered on lastSeen, not firstSeen: an old fault that fired again inside
  // the window IS a current occurrence. `windowInclusive` treats an
  // unparseable timestamp as INSIDE, because dropping a signal we cannot place
  // would quietly shrink the board.
  const inWindow = (res.data ?? []).filter((issue) => windowInclusive(issue.lastSeen, windowStartIso));

  const signals: RawSignal[] = inWindow.map((issue) => {
    const windowed = windowOccurrences(issue.stats24h, windowStartIso);
    return {
    source: 'sentry' as const,
    severity: severityFromSentryLevel(issue.level),
    title: issue.title,
    message: issue.culprit ? `${issue.title} — ${issue.culprit}` : issue.title,
    route: issue.culprit,
    errorCode: null,
    // NEVER issue.count — that is the issue's LIFETIME total, and this row is
    // filed under a four-hour window. See `windowOccurrences`.
    count: windowed ?? 1,
    countBasis: windowed === null ? ('unknown' as const) : ('window' as const),
    firstSeen: issue.firstSeen,
    lastSeen: issue.lastSeen,
    // The permalink IS the evidence reference — an operator pivots to Sentry
    // for the payload, so no raw event body needs copying into our row.
    evidenceRef: issue.permalink,
    };
  });

  return {
    source: 'sentry',
    status,
    reason,
    signals,
    bounded: res.truncated === true,
    durationMs: Date.now() - startedAt,
  };
}

// ---------------------------------------------------------------------------
// Supabase (admin_events)
// ---------------------------------------------------------------------------

/**
 * Application error events, grouped by the write-time `fingerprint` column.
 *
 * THE SELF-FEEDING READ, AND WHY THESE FILTERS ARE LOAD-BEARING
 * -------------------------------------------------------------
 * A failing cron writes an `admin_events` row. This collector IS a cron and it
 * READS `admin_events`. Without exclusions, one failed run becomes a signal,
 * which becomes a triage item, which produces another error row next pass —
 * a feedback loop that manufactures work out of its own failure.
 *
 * The repo has already been bitten by this exact shape once: an in-app RCA
 * analysis was stored as an `admin_events` row under the fingerprint it
 * analyzed, so analysing an incident counted as another occurrence of it. The
 * fix — `.neq('event_type', 'rca_analysis')` — is repeated here, and the
 * collector's own emissions are excluded on the same principle.
 */
export async function collectSupabase(windowStartIso: string): Promise<SourceResult> {
  const startedAt = Date.now();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('admin_events')
    .select('id, title, message, severity, url, created_at, fingerprint, metadata')
    // ALLOWLIST, not denylist. This arm is documented as "Application error
    // events", but it selected by exclusion — so login, security,
    // round_submitted and every other event type was eligible, because a
    // denylist admits whatever nobody thought to exclude.
    .eq('event_type', 'error')
    // Kept even though event_type='error' already excludes it: the
    // self-feeding-read guard below is load-bearing enough to state twice.
    .neq('event_type', 'rca_analysis')
    // ...and neither is this collector's own failure.
    .not('title', 'ilike', `%${RELIABILITY_JOB_TYPE}%`)
    .not('message', 'ilike', `%${RELIABILITY_JOB_TYPE}%`)
    .gte('created_at', windowStartIso)
    .order('created_at', { ascending: false })
    .limit(SUPABASE_ROW_LIMIT);

  if (error) {
    // Blind, not empty. An unreadable table is not a healthy table.
    return {
      source: 'supabase',
      status: 'blind',
      reason: error.message,
      signals: [],
      bounded: false,
      durationMs: Date.now() - startedAt,
    };
  }

  const rows = data ?? [];

  // Pre-group on the stored fingerprint so one root cause arrives as one raw
  // signal with a true occurrence count, rather than N rows the correlator
  // would have to re-derive a key for.
  const byFingerprint = new Map<string, RawSignal>();
  for (const row of rows) {
    const severity = normalizeSeverity(row.severity);
    // `fingerprint` is NULL on rows written before that column existed; the
    // `row:<id>` fallback mirrors `mergeTriage` and `tracerIncidentGroupKey`
    // string-for-string, which the admin-platform feature doc requires so the
    // three views cannot disagree about what one incident is.
    const key = row.fingerprint ?? `row:${row.id}`;
    // created_at is nullable in the schema. A row with no timestamp still
    // happened, so it is counted — dated to the window edge rather than
    // dropped, because discarding it would quietly undercount the signal.
    const occurredAt = row.created_at ?? windowStartIso;
    const existing = byFingerprint.get(key);
    if (!existing) {
      byFingerprint.set(key, {
        source: 'supabase',
        severity,
        title: row.title ?? row.message ?? 'Untitled event',
        message: row.message ?? row.title ?? '',
        route: row.url ?? null,
        errorCode: readErrorCode(row.metadata),
        count: 1,
        countBasis: 'window' as const,
        firstSeen: occurredAt,
        lastSeen: occurredAt,
        evidenceRef: row.fingerprint ?? row.id,
      });
      continue;
    }
    existing.count += 1;
    if (occurredAt < existing.firstSeen) existing.firstSeen = occurredAt;
    if (occurredAt > existing.lastSeen) existing.lastSeen = occurredAt;
  }

  // The row cap is a real bound on coverage; say so rather than implying the
  // window was fully read (quality-gates §1 — no silent truncation).
  const truncated = rows.length >= SUPABASE_ROW_LIMIT;

  return {
    source: 'supabase',
    status: truncated ? 'partial' : 'ok',
    reason: truncated ? `row cap ${SUPABASE_ROW_LIMIT} reached for this window` : null,
    signals: Array.from(byFingerprint.values()),
    bounded: truncated,
    durationMs: Date.now() - startedAt,
  };
}

function normalizeSeverity(value: unknown): ReliabilitySeverity {
  const s = typeof value === 'string' ? value.toLowerCase() : '';
  if (s === 'critical' || s === 'fatal') return 'critical';
  if (s === 'error') return 'error';
  if (s === 'warning' || s === 'warn') return 'warning';
  return 'info';
}

/** Postgres error codes ride in metadata; absent is normal, not an error. */
function readErrorCode(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const record = metadata as Record<string, unknown>;
  const code = record.code ?? record.errorCode ?? record.error_code;
  return typeof code === 'string' && code.length > 0 ? code : null;
}

// ---------------------------------------------------------------------------
// Vercel
// ---------------------------------------------------------------------------

/**
 * Deploy/build health.
 *
 * SCOPE NOTE, so this arm is not mistaken for a log tail: runtime exceptions on
 * Vercel are captured by Sentry (the app ships a DSN) and arrive through the
 * Sentry arm above. What Vercel uniquely knows, and Sentry does not, is whether
 * a BUILD failed — a deployment stuck in ERROR is invisible to an exception
 * tracker because the code never ran. That is what this arm contributes.
 */
/**
 * A CANCELED preview deployment is routine — a push superseded by a later
 * push, or a manual cancel — not a build problem. It is only worth treating
 * as one on `production`, where a canceled deploy means the intended release
 * never shipped.
 */
function vercelDeploySeverity(state: string, target: string | null): ReliabilitySeverity {
  if (state === 'ERROR') return 'error';
  if (state === 'CANCELED' && target !== 'production') return 'info';
  return 'warning';
}

export async function collectVercel(windowStartIso: string): Promise<SourceResult> {
  const startedAt = Date.now();
  const res = await fetchVercelDeployments(VERCEL_DEPLOY_LIMIT);
  const { status, reason } = statusFromFetch(res);

  // Same window discipline as the Sentry arm: the deployment list is not
  // window-scoped, so a snapshot could carry a failure group spanning
  // 02:18 -> 20:50 while declaring a four-hour window.
  const failed = (res.data ?? []).filter(
    (d) =>
      (d.state === 'ERROR' || d.state === 'CANCELED') &&
      windowInclusive(new Date(d.createdAt).toISOString(), windowStartIso),
  );

  const signals: RawSignal[] = failed.map((deploy) => {
    const when = new Date(deploy.createdAt).toISOString();
    return {
      source: 'vercel' as const,
      severity: vercelDeploySeverity(deploy.state, deploy.target),
      title: `Deployment ${deploy.state.toLowerCase()}`,
      message: `Deployment ${deploy.uid} on ${deploy.target ?? 'preview'} finished ${deploy.state}`,
      route: null,
      errorCode: `vercel_${deploy.state.toLowerCase()}`,
      count: 1,
      countBasis: 'window' as const,
      firstSeen: when,
      lastSeen: when,
      evidenceRef: deploy.uid,
    };
  });

  return {
    source: 'vercel',
    status,
    reason,
    signals,
    bounded: false,
    durationMs: Date.now() - startedAt,
  };
}
