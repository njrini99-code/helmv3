import 'server-only';
import {
  type AdminFetchResult,
  unconfigured,
  failed,
  ok,
} from '@/lib/admin/fetch-result';
import { reportIntegrationFault } from '@/lib/admin/integration-health';

/**
 * Helm Bridge — server-only Sentry REST client (READ side; SDK ingest is a
 * separate, complete system). Uses SENTRY_READ_TOKEN — a NEW token with
 * org:read + project:read + event:read. NEVER reuse the CI SENTRY_AUTH_TOKEN
 * (org token for sourcemaps; scopes immutable, typically lacks event:read).
 *
 * Fail-soft contract: this module NEVER throws. Missing token →
 * 'unconfigured' (panels render a neutral not-configured state); any HTTP /
 * network failure → 'error' (panels render amber STALE with last-known-good).
 * 60s Next revalidate so N page loads = 1 Sentry call per minute.
 */

const API = 'https://sentry.io/api/0';
const REVALIDATE_SECONDS = 60;
// Bounded ceiling, not unbounded — org-wide "unresolved" was silently capped
// at 3 pages (150 issues at the default limit=50) with no signal that more
// existed. Raised 3 → 20 (up to 1,000 issues at limit=50) and now tracked:
// if the loop exhausts the ceiling while a next-page cursor still exists,
// the result comes back `truncated: true` instead of quietly looking complete.
const MAX_PAGES = 20;
// This route is `force-dynamic` (re-run on every request) and each page is a
// sequential, blocking Sentry call — 20 pages is exactly the multi-hundred-
// issue org this change targets, so a wall-clock ceiling (not just a page
// ceiling) keeps one degraded/huge org from stalling every admin's dashboard
// load. Same `truncated: true` contract as the page ceiling: if the deadline
// hits while a next-page cursor still exists, the caller is told honestly.
const MAX_WALL_CLOCK_MS = 8_000;
/** In-flight ceiling for the per-feature count sweep — see
 *  fetchSentryFeatureCounts' doc comment for why this is not unbounded. */
const FEATURE_COUNT_CONCURRENCY = 6;
/** How long to skip the per-feature sweep entirely after one fails. Matches
 *  REVALIDATE_SECONDS: long enough to break the 429 feedback loop, short
 *  enough that a transient blip costs at most one minute of feature counts. */
const FEATURE_COUNT_COOLDOWN_MS = REVALIDATE_SECONDS * 1000;
/** Module-scoped, per-serverless-instance, best-effort — the same contract as
 *  emit-throttle.ts. An instance recycling just means the next sweep tries
 *  again, which is the safe direction to fail. */
let featureCountCooldownUntil = 0;

/** TEST-ONLY. Module state that deliberately outlives a single call needs an
 *  explicit reset, or one test's simulated 429 silently suppresses the next
 *  test's sweep. Not called from application code. */
export function __resetSentryFeatureCountCooldown(): void {
  featureCountCooldownUntil = 0;
}

function isPlaceholderSecret(value: string): boolean {
  return /^(your-|replace-|changeme|todo|example)/i.test(value.trim());
}

function usableSecret(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.length < 10 || isPlaceholderSecret(trimmed)) return null;
  return trimmed;
}

function config(): { token: string; org: string; project: string } | null {
  // Fall back to the CI sourcemap-upload token when the dedicated read token
  // isn't provisioned yet (`||`, not `??` — an unset OR blank-string env var
  // both mean "absent" here, matching the `!token` check below). Still
  // fail-soft: if SENTRY_AUTH_TOKEN lacks event:read the calls below
  // 404/403 and every panel degrades to its existing not-configured/stale
  // state, never a crash.
  const token = usableSecret(process.env.SENTRY_READ_TOKEN) ?? usableSecret(process.env.SENTRY_AUTH_TOKEN);
  const org = process.env.SENTRY_ORG?.trim();
  const project = process.env.SENTRY_PROJECT?.trim();
  if (!token || !org || !project) return null;
  return { token, org, project };
}

export interface SentryIssue {
  id: string;
  shortId: string;
  title: string;
  culprit: string | null;
  level: string;
  status: string;
  substatus: string | null;
  count: number;
  userCount: number;
  firstSeen: string;
  lastSeen: string;
  permalink: string;
  /** [epochSeconds, count] pairs from the issue's baked-in 24h stats. */
  stats24h: Array<[number, number]>;
}

interface RawIssue {
  id: string; shortId: string; title: string; culprit?: string | null;
  level: string; status: string; substatus?: string | null;
  count: string | number; userCount: number;
  firstSeen: string; lastSeen: string; permalink: string;
  stats?: { '24h'?: Array<[number, number]> };
}

function mapIssue(raw: RawIssue): SentryIssue {
  return {
    id: raw.id,
    shortId: raw.shortId,
    title: raw.title,
    culprit: raw.culprit ?? null,
    level: raw.level,
    status: raw.status,
    substatus: raw.substatus ?? null,
    count: Number(raw.count) || 0,
    userCount: raw.userCount ?? 0,
    firstSeen: raw.firstSeen,
    lastSeen: raw.lastSeen,
    permalink: raw.permalink,
    stats24h: raw.stats?.['24h'] ?? [],
  };
}

function nextCursor(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  // Sentry Link header: <url>; rel="next"; results="true"; cursor="0:100:0"
  const next = linkHeader
    .split(',')
    .find((part) => part.includes('rel="next"') && part.includes('results="true"'));
  const m = next?.match(/cursor="([^"]+)"/);
  return m?.[1] ?? null;
}

async function sentryGet(path: string, params: URLSearchParams, token: string): Promise<Response> {
  return fetch(`${API}${path}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: REVALIDATE_SECONDS },
  });
}

export async function fetchSentryIssues(opts?: {
  query?: string;
  limit?: number;
}): Promise<AdminFetchResult<SentryIssue[]>> {
  const cfg = config();
  if (!cfg) return unconfigured('Sentry read API');

  const query = opts?.query ?? 'is:unresolved';
  const limit = String(opts?.limit ?? 50);
  const issues: SentryIssue[] = [];
  let cursor: string | null = null;
  const startedAt = Date.now();

  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      if (Date.now() - startedAt > MAX_WALL_CLOCK_MS) break;
      const params = new URLSearchParams({
        query,
        limit,
        sort: 'freq',
        statsPeriod: '24h',
        project: '-1',
      });
      if (cursor) params.set('cursor', cursor);

      const res = await sentryGet(`/organizations/${cfg.org}/issues/`, params, cfg.token);
      if (!res.ok) {
        const retryAfter = res.headers.get('retry-after');
        return failed(
          reportIntegrationFault(
            'sentry',
            'issues fetch',
            `Sentry issues fetch failed: ${res.status}${retryAfter ? ` (retry-after ${retryAfter}s)` : ''}`,
          ),
        );
      }
      const rows = (await res.json()) as RawIssue[];
      issues.push(...rows.map(mapIssue));

      cursor = nextCursor(res.headers.get('link'));
      if (!cursor) break;
    }
    // If the loop ran out of ceiling (never hit the `if (!cursor) break`)
    // while Sentry's Link header still advertised a next page, `data` is a
    // real but partial slice — flag it so callers can say so honestly
    // instead of presenting it as the complete unresolved list.
    return { ...ok(issues), truncated: cursor !== null };
  } catch (err) {
    return failed(
      reportIntegrationFault(
        'sentry',
        'issues fetch',
        `Sentry issues fetch threw: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  }
}

export interface SentryStatsPoint {
  timestamp: number;
  accepted: number;
  total: number;
}

export async function fetchSentryHourlyStats(): Promise<AdminFetchResult<SentryStatsPoint[]>> {
  const cfg = config();
  if (!cfg) return unconfigured('Sentry read API');
  try {
    const params = new URLSearchParams({
      field: 'sum(quantity)',
      groupBy: 'outcome',
      interval: '1h',
      statsPeriod: '24h',
      category: 'error',
    });
    const res = await sentryGet(`/organizations/${cfg.org}/stats_v2/`, params, cfg.token);
    if (!res.ok) {
      return failed(reportIntegrationFault('sentry', 'stats fetch', `Sentry stats fetch failed: ${res.status}`));
    }
    const body = (await res.json()) as {
      intervals: string[];
      groups: Array<{ by: { outcome: string }; series: { 'sum(quantity)': number[] } }>;
    };
    const accepted = body.groups.find((g) => g.by.outcome === 'accepted')?.series['sum(quantity)'] ?? [];
    const points: SentryStatsPoint[] = body.intervals.map((iso, i) => {
      const total = body.groups.reduce((sum, g) => sum + (g.series['sum(quantity)'][i] ?? 0), 0);
      return { timestamp: Date.parse(iso), accepted: accepted[i] ?? 0, total };
    });
    return ok(points);
  } catch (err) {
    return failed(
      reportIntegrationFault(
        'sentry',
        'stats fetch',
        `Sentry stats fetch threw: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  }
}

/**
 * W16 Task 2 — per-feature unresolved-issue counts for the Feature Health
 * board.
 *
 * SPIKE (time-boxed, 2026-07-02): does the org issues list endpoint return
 * per-issue `tags` at LIST scope, so we could pull once and bucket
 * client-side by the `feature` tag (server-error-logger.ts:209, set since
 * W15 Task 2)? No — confirmed by inspection of `RawIssue`/`mapIssue()` above:
 * the list endpoint's default response shape has no `tags` field (Appendix B
 * item 1 of FEATURE_COVERAGE.md already flagged this as open). Sentry's
 * `/issues/` list endpoint does not expose per-issue tags without an
 * additional per-issue detail call, which would cost MORE round trips than
 * the documented fallback for the same 60s revalidate window. We take the
 * documented fallback: N batched, parallel `is:unresolved feature:<key>`
 * queries reusing the existing `fetchSentryIssues({query})` plumbing (same
 * 60s Next revalidate, same fail-soft contract).
 *
 * CONCURRENCY IS BOUNDED, and that is the whole point. The original version
 * fired one `Promise.all` over every key at once on the belief that there
 * were 37 of them; the registry has since grown to 86 with none excluded, and
 * each key's query can itself walk up to MAX_PAGES. An 86-wide burst on every
 * single /admin page load is what put Sentry into sustained 429s (127
 * rate-limit faults in one 6-hour window on 2026-07-31). Six at a time keeps
 * the same data with a request rate Sentry tolerates.
 *
 * All-or-nothing degrade: if ANY per-feature query fails, the whole result
 * is `null` (never a partially-populated, misleading map) — every feature's
 * `sentryUnresolved` then reads null in computeFeatureStatus, which degrades
 * gracefully to DB-only signals (never fake-green, never fake-red). Because
 * one failure already discards every other result, the remaining queries are
 * ABANDONED as soon as the first one fails rather than run to completion for
 * output nobody will read.
 *
 * COOLDOWN. The all-or-nothing rule used to be self-amplifying: a single 429
 * threw away 85 good responses, and the next page load re-issued all 86,
 * which earned another 429. After a failed sweep the fan-out is skipped
 * entirely for FEATURE_COUNT_COOLDOWN_MS so a rate-limited Bridge stops
 * pushing on the door. Callers see the same `null` they already handle.
 */
export async function fetchSentryFeatureCounts(
  keys: readonly string[],
): Promise<Record<string, { total: number; critical: number }> | null> {
  const cfg = config();
  if (!cfg) return null;
  if (keys.length === 0) return {};
  if (Date.now() < featureCountCooldownUntil) return null;

  const counts: Record<string, { total: number; critical: number }> = {};
  let sweepFailed = false;
  let nextIndex = 0;

  // Hand-rolled worker pool rather than a new dependency: each worker pulls
  // the next key until the list is exhausted, or until a sibling has already
  // failed and made the rest of the sweep worthless.
  async function worker(): Promise<void> {
    for (;;) {
      if (sweepFailed) return;
      const key = keys[nextIndex++];
      if (key === undefined) return;

      const res = await fetchSentryIssues({ query: `is:unresolved feature:${key}`, limit: 100 });
      if (res.status !== 'ok' || !res.data) {
        sweepFailed = true;
        return;
      }
      counts[key] = {
        total: res.data.length,
        critical: res.data.filter((issue) => issue.level === 'fatal').length,
      };
    }
  }

  try {
    const workers = Math.min(FEATURE_COUNT_CONCURRENCY, keys.length);
    await Promise.all(Array.from({ length: workers }, () => worker()));
  } catch {
    sweepFailed = true;
  }

  if (sweepFailed) {
    featureCountCooldownUntil = Date.now() + FEATURE_COUNT_COOLDOWN_MS;
    return null;
  }
  return counts;
}

export interface SentryReleaseHealth {
  crashFreeSessions: number | null;
  crashFreeUsers: number | null;
}

/** CONDITIONAL widget (OQ3): renders 'not configured' until session
 *  tracking is confirmed sending sessions for helm-xs. */
export async function fetchSentryReleaseHealth(): Promise<AdminFetchResult<SentryReleaseHealth>> {
  const cfg = config();
  if (!cfg) return unconfigured('Sentry read API');
  try {
    const params = new URLSearchParams({
      field: 'crash_free_rate(session)',
      statsPeriod: '24h',
      project: '-1',
    });
    params.append('field', 'crash_free_rate(user)');
    const res = await sentryGet(`/organizations/${cfg.org}/sessions/`, params, cfg.token);
    if (!res.ok) return failed(`Sentry sessions fetch failed: ${res.status}`);
    const body = (await res.json()) as {
      groups: Array<{ totals: Record<string, number | null> }>;
    };
    const totals = body.groups[0]?.totals ?? {};
    return ok({
      crashFreeSessions: totals['crash_free_rate(session)'] ?? null,
      crashFreeUsers: totals['crash_free_rate(user)'] ?? null,
    });
  } catch (err) {
    return failed(`Sentry sessions fetch threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}
