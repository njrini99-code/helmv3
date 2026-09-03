import 'server-only';
import type { SentryIssue } from '@/lib/admin/sentry-api';
import type { AdminFetchResult } from '@/lib/admin/fetch-result';
import {
  cachedIncidentFeed,
  DEFAULT_INCIDENT_WINDOW_HOURS,
  type IncidentFeedCounts,
} from '@/lib/admin/data/incident-feed';
import {
  buildIncidentReport,
  extractActionName,
  extractCollapsedCount,
  extractRoute,
  extractRoundId,
  extractErrorCode,
} from '@/lib/admin/incident-report';
import { classifyIncident, type IncidentClass } from '@/lib/admin/incident-classification';
import { resolveFeatureId } from '@/lib/reliability/normalize';
import { isQaFixtureRoundId } from '@/lib/admin/qa-fixture-rounds';

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
  /**
   * Derived KIND axis, orthogonal to severity — see
   * @/lib/admin/incident-classification. Computed at read time (no column,
   * no migration), so it applies retroactively to every historical row and a
   * rule change takes effect immediately.
   */
  klass: IncidentClass;
  /** `classification.actionable` — the Errors tab's default filter. */
  actionable: boolean;
  /** Operator-readable explanation of why it landed in `klass`. */
  klassReason: string;
  /** The message lost its content on capture (e.g. "[object Object]"). */
  hasDegradedMessage: boolean;
  /**
   * Postgres / provider / client error code (`metadata.errorCode`), app rows
   * only — Sentry issues carry no app metadata and are explicitly null below.
   *
   * It was already computed here to feed classifyIncident() and then thrown
   * away, so the queue rendered rows titled "Client error: Load failed" with
   * nothing to tell two of them apart. It is the single most identifying
   * field an incident has: 42501 vs 57014 vs 23505 is the whole first triage
   * question, and it is what buildIncidentSignature() groups on.
   */
  errorCode: string | null;
  /**
   * The human-readable sentence the row renders, from buildIncidentDescription.
   * `title` is kept alongside it because the incident REPORT and the detail
   * page still key off the original.
   */
  description: string;
  /**
   * A stored RCA analysis exists for this fingerprint, so the detail page has
   * something to show. False for Sentry rows, which carry no app fingerprint.
   *
   * The analysis itself is NOT inlined: it is up to ~1.3 KB of prose per
   * incident and the queue renders 25 of them. This is the pointer that makes
   * it findable; the detail page renders the content.
   */
  hasRca: boolean;
  /**
   * The grouping fingerprint, plain. It existed only inside the row's href
   * (`/admin/errors/${key.slice(4)}`), so an operator could click it but
   * never copy it — and it is the exact token you need to search logs or
   * hand to someone else. Null for Sentry rows, whose identity is shortId.
   */
  fingerprint: string | null;
  /**
   * This incident's evidence traces back to a QA fixture round —
   * `qa-fixture-rounds.ts`. Never a production defect; the Errors tab shows
   * a FIXTURE badge and `actionable` is forced `false` regardless of what
   * `classifyIncident` said, so it drops out of the actionable count too.
   * Sentry-origin items are always `false` — a Sentry issue carries no
   * round-id metadata to match against.
   */
  isFixture: boolean;
  /** Pre-built Copy-for-Claude markdown — see @/lib/admin/incident-report. */
  report: string;
}

/**
 * Split an action identifier into words, so it can be read in a sentence.
 * `send-message` -> "send message"; `GolfDashboardLayout` -> "Golf Dashboard
 * Layout". Mechanical only — no dictionary, nothing invented.
 */
function humanizeAction(action: string): string {
  return action
    .replace(/[-_.]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
}

/**
 * The sentence the queue actually shows.
 *
 * The card used to render `title`, which is `[action]` plus a message clipped
 * to fit — so a row read "[getNextQualifierRoundNumber] This qualifier is
 * still o…" while the full, genuinely good sentence sat unused in `message`:
 * "This qualifier is still open, but your coach configured 3 rounds. You have
 * submitted 3 of 3. Ask a coach to raise the limit."
 *
 * Three tiers, best available wins:
 *   1. A server `message` is written by us and usually explains itself. Use it.
 *   2. A CLIENT message is whatever the browser said, and it is often two words
 *      ("Load failed") with errorCode, error.name and error.message all null —
 *      verified against production. That is everything the browser gave us, so
 *      nothing better can be extracted; but we do know which action was running,
 *      so the row can say WHAT WAS HAPPENING without inventing a cause.
 *   3. Nothing usable -> fall back to the title unchanged.
 *
 * Deliberately does NOT dress up a thin capture into friendly copy. A row that
 * still reads generically is telling you the CALL SITE is under-instrumented,
 * and hiding that in the UI would remove the only signal that says so.
 */
const GENERIC_MESSAGE_MAX = 28;

export function buildIncidentDescription(
  message: string | null,
  title: string,
  actionName: string | null,
): string {
  const msg = message?.trim();
  if (!msg) return title;

  // Short, contextless messages get the action appended as context — never as
  // an explanation. "Load failed" -> "Load failed — while send message".
  if (msg.length <= GENERIC_MESSAGE_MAX && actionName) {
    return `${msg} — while ${humanizeAction(actionName)}`;
  }
  return msg;
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
  // Trailing punctuation is tolerated: `insight-delivery.ts` returns
  // "Not authenticated." with a period, which the bare `$` anchor missed, so
  // one emitter's wording decided whether its event reached the incident feed.
  /^\s*(?:unauthorized|not authenticated)[.!]?\s*$/i,
];

/** ILIKE patterns mirroring AUTH_NOISE_MESSAGE_PATTERNS, for PostgREST queries. */
export const AUTH_NOISE_ILIKE_PATTERNS: readonly string[] = [
  '%you must be signed in%',
  '%no active baseball team%',
  'Unauthorized',
  'Unauthorized.',
  'Not authenticated',
  'Not authenticated.',
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
 * auth noise from a count/select. The admin digest still uses this for raw
 * 24h row counts; overview.ts now uses mergeTriage() directly so it matches
 * the grouped /admin/errors incident count.
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
  /** Honest per-batch attribution — see SentryTagHint in incident-feed.ts.
   *  Only set when the caller actually scoped its Sentry fetch by that tag;
   *  omitted/undefined fields render as unknown, never a guess. */
  sentryTagHint?: { sport?: TriageItem['sport'] | null; feature?: string | null };
  /**
   * fingerprint → most recent `resolved_at`, from queryPriorResolutions().
   * Optional so every existing caller and test keeps working unchanged; when
   * absent, regression detection simply does not fire (the prior behaviour).
   */
  priorResolutions?: Map<string, string>;
  /** Fingerprints with a stored rca_analysis row — see
   *  queryAnalyzedFingerprints in ./incident-feed. */
  analyzedFingerprints?: ReadonlySet<string>;
}): TriageItem[] {
  const hintSport = input.sentryTagHint?.sport ?? null;
  const hintFeature = input.sentryTagHint?.feature ?? null;
  const items: TriageItem[] = input.sentryIssues.map((issue) => {
    // The batch-level hint (an actually Sentry-tag-scoped fetch) is honest,
    // certain attribution and always wins. When it is absent, fall back to
    // the collector's advisory route/feature map applied to THIS issue's own
    // `culprit` — the only per-issue location signal the Sentry issue-list
    // endpoint returns (see `resolveFeatureId`'s doc comment in
    // `@/lib/reliability/normalize`). This is a per-issue GUESS, not a tag —
    // still explicitly weaker than `hintFeature`, and `null` when the culprit
    // doesn't map to anything, same as before.
    const feature = hintFeature ?? resolveFeatureId(issue.culprit);
    const severity = SENTRY_LEVEL_TO_SEVERITY[issue.level] ?? 'error';
    const classification = classifyIncident({
      title: issue.title,
      message: issue.culprit,
      severity,
      source: 'sentry',
      // Sentry issues carry no app metadata — explicit so the omission reads
      // as deliberate rather than forgotten.
      errorCode: null,
    });
    return {
    key: `sentry:${issue.id}`,
    origin: 'sentry' as const,
    title: issue.title,
    // Sentry's title IS its summary line; there is no separate message to
    // prefer, and its culprit is already rendered as the path.
    description: issue.title,
    severity,
    sport: hintSport,
    occurrences: issue.count,
    affectedUsers: issue.userCount,
    firstSeen: issue.firstSeen,
    lastSeen: issue.lastSeen,
    permalink: issue.permalink,
    eventIds: [],
    substatus: issue.substatus,
    source: 'sentry',
    feature,
    actionName: null,
    route: issue.culprit,
    klass: classification.klass,
    actionable: classification.actionable,
    klassReason: classification.reason,
    hasDegradedMessage: classification.hasDegradedMessage,
    // Sentry issues carry no app metadata — same deliberate omission the
    // classifyIncident call above documents. Its identity is shortId.
    errorCode: null,
    fingerprint: null,
    hasRca: false,
    // Sentry issues carry no round-id metadata — never a fixture match.
    isFixture: false,
    report: buildIncidentReport({
      title: issue.title,
      message: issue.culprit ?? issue.title,
      fingerprint: issue.shortId,
      source: 'sentry',
      severity: SENTRY_LEVEL_TO_SEVERITY[issue.level] ?? 'error',
      sport: hintSport,
      featureKey: feature,
      eventCount: issue.count,
      affectedUserCount: issue.userCount,
      firstSeen: issue.firstSeen,
      lastSeen: issue.lastSeen,
      sentryUrl: issue.permalink,
      incidentClass: classification.klass,
      incidentClassReason: classification.reason,
      hasDegradedMessage: classification.hasDegradedMessage,
    }),
    };
  });

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

    const errorCode =
      mostRecentFirst.map((r) => extractErrorCode(r.metadata)).find((c) => c !== null) ?? null;

    // Catalogued defect (h): any row in the bucket naming a QA fixture round
    // makes the whole grouped incident a fixture — same "any occurrence
    // counts" reasoning `regressed` below already uses.
    const isFixture = bucket.rows.some((r) => isQaFixtureRoundId(extractRoundId(r.metadata)));

    const classification = classifyIncident({
      title: last.title,
      message: last.message,
      severity: worst,
      source: last.source,
      errorCode,
    });

    // REGRESSION: this fingerprint was resolved, and has fired again SINCE
    // that resolution. Compared against the bucket's firstSeen (its earliest
    // unresolved occurrence) rather than lastSeen — using lastSeen would flag
    // an incident that has simply been open and ongoing across a stale
    // resolution timestamp, which is not a regression at all.
    const priorResolvedAt = input.priorResolutions?.get(fp);
    const regressed =
      priorResolvedAt !== undefined &&
      first.created_at > priorResolvedAt;

    items.push({
      key: `app:${fp}`,
      origin: 'app',
      title: last.title,
      description: buildIncidentDescription(last.message, last.title, actionName),
      severity: worst,
      sport: normalizeSport(last.sport),
      occurrences: bucket.rows.length,
      affectedUsers: bucket.users.size,
      firstSeen: first.created_at,
      lastSeen: last.created_at,
      permalink: null,
      eventIds: sorted.map((r) => r.id),
      substatus: regressed ? 'regressed' : null,
      source: last.source ?? null,
      feature: last.feature ?? null,
      actionName,
      route,
      klass: classification.klass,
      // A QA fixture round is never actionable, regardless of what the
      // message/severity classifier decided — the whole point is that this
      // is known seeded data, not a production defect. Overrides the
      // classifier's verdict rather than feeding isFixture into it, so
      // klassReason stays an honest account of what the TEXT said.
      actionable: isFixture ? false : classification.actionable,
      klassReason: classification.reason,
      hasDegradedMessage: classification.hasDegradedMessage,
      errorCode,
      fingerprint: fp,
      hasRca: input.analyzedFingerprints?.has(fp) ?? false,
      isFixture,
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
        incidentClass: classification.klass,
        incidentClassReason: classification.reason,
        hasDegradedMessage: classification.hasDegradedMessage,
      }),
    });
  }

  // Rank by LIVENESS BAND first, then distinct affected users, then recency —
  // and NEVER by raw volume (one retry-looping job must not bury a low-volume
  // auth bug; that property is preserved, affectedUsers is still the tiebreak).
  //
  // Why the band had to come first: affectedUsers is very nearly binary in
  // production — on 2026-08-05 seven groups had exactly 1 user and ten had 0 —
  // so it decided almost nothing and `lastSeen` was doing the real ordering
  // from second place, where it could not outrank a stale 1-user row. The
  // queue's top item was 8.1 hours silent while two incidents from the last
  // 18 minutes sat at #8 and #9. Over the window the feed actually spans
  // (168h), "how many people" is a far weaker signal than "is this happening
  // right now", so freshness leads and headcount breaks ties within a band.
  // ONE instant for the whole sort. Calling Date.now() inside the comparator
  // would let a row change band mid-sort, which is a non-transitive comparator
  // and an unstable (implementation-defined) result.
  const nowMs = Date.now();
  return items.sort((a, b) => {
    const bandDiff = livenessBand(a.lastSeen, nowMs) - livenessBand(b.lastSeen, nowMs);
    if (bandDiff !== 0) return bandDiff;
    if (b.affectedUsers !== a.affectedUsers) return b.affectedUsers - a.affectedUsers;
    return b.lastSeen.localeCompare(a.lastSeen);
  });
}

/** 0 = live (<1h), 1 = recent (<6h), 2 = stale. Lower sorts first. */
export function livenessBand(lastSeen: string, nowMs: number = Date.now()): 0 | 1 | 2 {
  const seen = Date.parse(lastSeen);
  if (Number.isNaN(seen)) return 2;
  const ageMs = nowMs - seen;
  if (ageMs < 60 * 60 * 1000) return 0;
  if (ageMs < 6 * 60 * 60 * 1000) return 1;
  return 2;
}

export function groupAppErrorEvents(rows: AppTriageEventRow[]): TriageItem[] {
  return mergeTriage({ sentryIssues: [], appEvents: rows });
}

/**
 * Server fetcher. CALLER must have passed requireSuperAdmin() first —
 * this reads admin_events with the service-role client.
 */
export async function fetchTriageQueue(
  windowHours: number = DEFAULT_INCIDENT_WINDOW_HOURS,
): Promise<{
  items: TriageItem[];
  sentry: AdminFetchResult<SentryIssue[]>;
  counts: IncidentFeedCounts;
}> {
  // Memoised per request: Overview's fetchOverviewSnapshot() asks for this
  // exact same default-window feed on the same render. `windowHours` is
  // always a number here (default parameter), so it keys against overview's
  // `cachedIncidentFeed(DEFAULT_INCIDENT_WINDOW_HOURS)` — see the wrapper's
  // doc comment for why the argument must stay primitive.
  const feed = await cachedIncidentFeed(windowHours);
  return { items: feed.incidents, sentry: feed.sentry, counts: feed.counts };
}
