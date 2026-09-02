/**
 * Correlation — folding three evidence streams into one incident list.
 *
 * WHY THIS MODULE EXISTS. `./types.ts` names the problem: the Bridge holds
 * three independent groupings of the same production fault (an `admin_events`
 * fingerprint bucket, a Sentry issue, a reliability `CorrelatedSignal`) and
 * historically never reconciled them. This is the reconciliation step — the
 * ONLY place in the Bridge that decides "these three records are one cause."
 * Everything downstream (lifecycle, proof, the detail page) works off the
 * `IncidentDraft[]` this file returns, so a join mistake here is a join
 * mistake everywhere.
 *
 * PURE ON PURPOSE, same discipline as `@/lib/admin/triage-engine.ts` and
 * `@/lib/reliability/normalize.ts`: no I/O, no `server-only`, no clock. Every
 * import below is either a type (erased at compile time, so `TriageItem`'s
 * `server-only` sibling module never executes) or a genuinely pure function.
 * That is what makes this file exhaustively fixture-testable and safe to
 * reuse from a cron, a route handler, or a test — the same property
 * `triage-engine.ts`'s header explains at length.
 *
 * THE JOIN KEY. `correlationKey` is `buildIncidentSignature` with a FIXED
 * severity, exactly as `correlationSignature`
 * (`src/lib/reliability/normalize.ts`) and `triageCauseKey`
 * (`src/lib/admin/triage-engine.ts`) already do, and for the identical
 * reason documented on `CorrelatedSignal.signature`
 * (`src/lib/reliability/types.ts`): Sentry rates as `error` plenty of
 * conditions this app logs at `warning`, so a severity-bearing key would
 * split one root cause into two signatures and the cross-source badge this
 * whole module exists to produce would never fire. This is the THIRD
 * independent site doing this fold — not a coincidence, a convention.
 *
 * WHAT "SAME FAULT" DOES NOT MEAN. Two rows can share a title and still be
 * different incidents — `errorCode` and normalized `route` are load-bearing
 * components of the key specifically so "Client error: Load failed" on two
 * different routes, or with two different Postgres error codes, never
 * collapses into one row. `correlate.test.ts` pins this down with a fixture
 * that must go red if someone "simplifies" the key to title-only.
 */

import type { TriageItem, TriageSeverity } from '@/lib/admin/data/triage';
import { buildIncidentSignature } from '@/lib/admin/incident-grouping';
import type { IncidentClass } from '@/lib/admin/incident-classification';
import type { CorrelatedSignal } from '@/lib/reliability/types';
import { INCIDENT_SOURCES, INCIDENT_SOURCE_LABEL } from './types';
import type {
  IncidentSourceEvidence,
  IncidentSourceName,
  SourceHealth,
  UnifiedIncident,
} from './types';

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

/** Everything about an incident that comes from EVIDENCE, before lifecycle/proof derivation. */
export type IncidentDraft = Omit<
  UnifiedIncident,
  | 'lifecycle'
  | 'proof'
  | 'proofGaps'
  | 'evidenceCoverage'
  | 'analysis'
  | 'repair'
  | 'deployProof'
  | 'resolution'
  | 'computedAt'
> & {
  /** Set when a prior HUMAN resolution exists and this fired again after it.
   *  Carried through from TriageItem.substatus === 'regressed'. */
  regressed: boolean;
  /** True when any source contributing to THIS incident is blind/partial. */
  hasBlindSource: boolean;
  /** Raw stack availability, for evidence coverage downstream. */
  hasStack: boolean;
};

export interface CorrelationSourceHealth {
  source: IncidentSourceName;
  health: SourceHealth;
  reason: string | null;
  /** ISO time this source's data was read. */
  observedAt: string | null;
}

export interface CorrelateInput {
  /** Output of mergeTriage — app-origin and sentry-origin items. */
  triage: readonly TriageItem[];
  /** Correlated signals from the latest reliability snapshot (may be empty). */
  reliabilitySignals: readonly CorrelatedSignal[];
  /** Per-source read health for THIS refresh. Missing entries default to 'unknown'. */
  sourceHealth: readonly CorrelationSourceHealth[];
  /** Fingerprints that carry a stored rca_analysis (bare fingerprints AND rel:<sig> keys, both bare). */
  analyzedKeys?: ReadonlySet<string>;
}

/**
 * Exported for tests + for reuse: the join key two records share iff they are
 * the same fault.
 *
 * `error` below is an arbitrary constant, not a claim about anything's real
 * severity — see the module header. Route and message-prefix normalisation
 * both happen INSIDE `buildIncidentSignature`, so callers never need to
 * pre-normalise either.
 */
export function correlationKey(input: {
  errorCode: string | null;
  route: string | null;
  message: string;
}): string {
  return buildIncidentSignature({
    severity: 'error',
    errorCode: input.errorCode,
    route: input.route,
    message: input.message,
  });
}

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

const SEVERITY_RANK: Record<TriageSeverity, number> = {
  critical: 0,
  error: 1,
  warning: 2,
  info: 3,
};

/** Worst (lowest-ranked) severity wins — the ratchet every grouping helper in
 *  this codebase uses (`groupIncidents`, `correlateSignals`, `triage-engine`). */
function worstSeverity(severities: readonly TriageSeverity[]): TriageSeverity {
  return severities.reduce((worst, s) => (SEVERITY_RANK[s] < SEVERITY_RANK[worst] ? s : worst), 'info');
}

/** ISO timestamps in this codebase are stored in a single consistent format,
 *  so lexical comparison IS chronological comparison — the same assumption
 *  `mergeTriage`'s own sort already relies on. */
function earliest(a: string | null, b: string): string {
  if (a === null) return b;
  return a.localeCompare(b) <= 0 ? a : b;
}
function latest(a: string | null, b: string): string {
  if (a === null) return b;
  return a.localeCompare(b) >= 0 ? a : b;
}

function firstNonNull<T>(values: ReadonlyArray<T | null | undefined>): T | null {
  for (const v of values) {
    if (v !== null && v !== undefined) return v;
  }
  return null;
}

function dedupe<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

const SENTRY_KEY_PREFIX = 'sentry:';
function sentryIssueIdOf(item: TriageItem): string {
  return item.key.startsWith(SENTRY_KEY_PREFIX) ? item.key.slice(SENTRY_KEY_PREFIX.length) : item.key;
}

/**
 * `buildIncidentReport` (`@/lib/admin/incident-report.ts`) always emits a
 * `## Stack trace` section — either the fenced trace or this exact
 * placeholder when none was captured. `TriageItem` does not carry the raw
 * `stack_trace` column forward on its own (it is folded into the report and
 * discarded, same as `feature`/`action` are folded into `description`), so
 * the rendered report is the only signal this module has for "was a stack
 * actually captured" — detecting the literal placeholder is more reliable
 * than a heuristic over the trace text itself.
 */
const NO_STACK_PLACEHOLDER = '_no stack trace captured_';
function reportHasStackTrace(report: string): boolean {
  const idx = report.indexOf('## Stack trace');
  if (idx === -1) return false;
  return !report.slice(idx).includes(NO_STACK_PLACEHOLDER);
}

function defaultReason(source: IncidentSourceName, health: SourceHealth): string {
  switch (health) {
    case 'blind':
      return `${INCIDENT_SOURCE_LABEL[source]} could not be read this refresh.`;
    case 'partial':
      return `${INCIDENT_SOURCE_LABEL[source]} read was truncated this refresh.`;
    case 'unknown':
      return `${INCIDENT_SOURCE_LABEL[source]} was not queried for this incident this refresh.`;
    case 'reading':
      return '';
  }
}

// ---------------------------------------------------------------------------
// Buckets
// ---------------------------------------------------------------------------

interface Bucket {
  key: string;
  appItems: TriageItem[];
  sentryItems: TriageItem[];
  reliabilitySignals: CorrelatedSignal[];
}

function newBucket(key: string): Bucket {
  return { key, appItems: [], sentryItems: [], reliabilitySignals: [] };
}

// ---------------------------------------------------------------------------
// Per-source evidence aggregation
// ---------------------------------------------------------------------------

interface SourceAgg {
  refs: string[];
  firstSeen: string | null;
  lastSeen: string | null;
  occurrences: number | null;
  occurrencesKnown: boolean;
  permalink: string | null;
  summaryParts: string[];
}

function newAgg(): SourceAgg {
  return {
    refs: [],
    firstSeen: null,
    lastSeen: null,
    occurrences: null,
    occurrencesKnown: false,
    permalink: null,
    summaryParts: [],
  };
}

function touch(map: Map<IncidentSourceName, SourceAgg>, source: IncidentSourceName): SourceAgg {
  let agg = map.get(source);
  if (!agg) {
    agg = newAgg();
    map.set(source, agg);
  }
  return agg;
}

function addOccurrences(agg: SourceAgg, n: number): void {
  agg.occurrences = (agg.occurrencesKnown ? (agg.occurrences ?? 0) : 0) + n;
  agg.occurrencesKnown = true;
}

/**
 * Build the `IncidentSourceEvidence[]` for one bucket.
 *
 * Rule 8 ("blind sources never vanish") falls out of this construction for
 * free: an entry only ever exists for a source that actually contributed a
 * ref (an app fingerprint, a Sentry issue id, or a reliability
 * `EvidenceRef`) — never for every member of `INCIDENT_SOURCES` regardless of
 * relevance. So a source reported `blind` in `sourceHealth` only shows up
 * here, with `health: 'blind'`, when this incident's OWN evidence already
 * ties it in — which is exactly "a source that would otherwise have
 * contributed" and never "a source with nothing to do with this incident."
 */
function buildSourceEvidence(
  bucket: Bucket,
  healthFor: (source: IncidentSourceName) => CorrelationSourceHealth,
): IncidentSourceEvidence[] {
  const bySource = new Map<IncidentSourceName, SourceAgg>();

  if (bucket.appItems.length > 0) {
    const agg = touch(bySource, 'app');
    for (const item of bucket.appItems) {
      if (item.fingerprint && !agg.refs.includes(item.fingerprint)) agg.refs.push(item.fingerprint);
      agg.firstSeen = earliest(agg.firstSeen, item.firstSeen);
      agg.lastSeen = latest(agg.lastSeen, item.lastSeen);
      addOccurrences(agg, item.occurrences);
    }
    const total = agg.occurrences ?? 0;
    agg.summaryParts.push(
      `${bucket.appItems.length} admin_events fingerprint${bucket.appItems.length === 1 ? '' : 's'} — ${total} occurrence${total === 1 ? '' : 's'}`,
    );
  }

  if (bucket.sentryItems.length > 0) {
    const agg = touch(bySource, 'sentry');
    for (const item of bucket.sentryItems) {
      const issueId = sentryIssueIdOf(item);
      if (!agg.refs.includes(issueId)) agg.refs.push(issueId);
      agg.firstSeen = earliest(agg.firstSeen, item.firstSeen);
      agg.lastSeen = latest(agg.lastSeen, item.lastSeen);
      addOccurrences(agg, item.occurrences);
      if (!agg.permalink && item.permalink) agg.permalink = item.permalink;
    }
    const total = agg.occurrences ?? 0;
    agg.summaryParts.push(
      `${bucket.sentryItems.length} Sentry issue${bucket.sentryItems.length === 1 ? '' : 's'} — ${total} occurrence${total === 1 ? '' : 's'}`,
    );
  }

  // Reliability signals contribute `supabase`/`vercel`/`sentry` entries from
  // their OWN evidence array, pairing source with ref FROM THE OBJECT — never
  // by array index. `CorrelatedSignal.evidence`'s own doc comment
  // (`src/lib/reliability/types.ts`) records why index-pairing silently
  // mis-attributed a Supabase fingerprint to `sentry` in an earlier version
  // of this exact idea; `evidence: EvidenceRef[]` exists so that failure mode
  // is structurally impossible.
  for (const signal of bucket.reliabilitySignals) {
    for (const ref of signal.evidence) {
      const agg = touch(bySource, ref.source);
      if (!agg.refs.includes(ref.ref)) agg.refs.push(ref.ref);
      agg.firstSeen = earliest(agg.firstSeen, signal.firstSeen);
      agg.lastSeen = latest(agg.lastSeen, signal.lastSeen);
      // `CorrelatedSignal.count` is folded ACROSS every arm that saw the
      // signal, not split per source — so a reliability-derived entry can
      // never honestly claim a per-source occurrence count. Leaving it
      // unknown (never defaulting to 0) is the same "unknown is a state, not
      // zero" rule `./types.ts`'s header states for the whole file.
      if (
        agg.summaryParts.every(
          (p) => !p.startsWith('Reliability collector correlated this'),
        )
      ) {
        agg.summaryParts.push(
          `Reliability collector correlated this from ${signal.sources.join('+')} — ${signal.count} total occurrence(s) across every arm that saw it`,
        );
      }
    }
  }

  return INCIDENT_SOURCES.filter((source) => bySource.has(source)).map((source) => {
    const agg = bySource.get(source)!;
    const h = healthFor(source);
    return {
      source,
      health: h.health,
      reason: h.health === 'reading' ? null : (h.reason ?? defaultReason(source, h.health)),
      occurrences: agg.occurrencesKnown ? agg.occurrences : null,
      firstSeen: agg.firstSeen,
      lastSeen: agg.lastSeen,
      ref: agg.refs[0] ?? null,
      permalink: agg.permalink,
      summary: agg.summaryParts.length > 0 ? agg.summaryParts.join('; ') : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Fallback report — only built when neither an app nor a Sentry contributor
// exists to carry its own `report` through (rule 10).
// ---------------------------------------------------------------------------

function buildReliabilityOnlyReport(input: {
  id: string;
  title: string;
  description: string;
  severity: TriageSeverity;
  route: string | null;
  errorCode: string | null;
  firstSeen: string;
  lastSeen: string;
  signals: readonly CorrelatedSignal[];
  hasStoredAnalysis: boolean;
}): string {
  const totalCount = input.signals.reduce((sum, s) => sum + s.count, 0);
  const seenBy = dedupe(input.signals.flatMap((s) => s.sources));
  const lines = [
    `# ${input.title}`,
    '',
    '_Correlated from the reliability collector only — no admin_events or Sentry record exists for this fault this window._',
    '',
    '## Identity',
    `- Signature: \`${input.id}\``,
    `- Severity: ${input.severity}`,
    `- Route: ${input.route ?? '—'}`,
    `- Error code: ${input.errorCode ?? '—'}`,
    '',
    '## Volume',
    `- Occurrences (reliability-reported, folded across every arm — never add this to a per-source count): ${totalCount}`,
    `- First seen: ${input.firstSeen}`,
    `- Last seen: ${input.lastSeen}`,
    `- Seen by: ${seenBy.map((s) => INCIDENT_SOURCE_LABEL[s]).join(', ') || '—'}`,
    '',
    '## Summary',
    '',
    input.description,
    '',
  ];
  if (input.hasStoredAnalysis) {
    lines.push(
      `> A stored root-cause analysis already exists for \`${input.id}\` — see /admin/errors/${encodeURIComponent(input.id)}#rca.`,
      '',
    );
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Draft assembly
// ---------------------------------------------------------------------------

function buildDraft(
  bucket: Bucket,
  healthFor: (source: IncidentSourceName) => CorrelationSourceHealth,
  analyzedKeys: ReadonlySet<string> | undefined,
): IncidentDraft {
  const appFp = bucket.appItems.find((i) => i.fingerprint !== null)?.fingerprint ?? null;

  let id: string;
  let linkTarget: string | null;
  if (appFp) {
    id = appFp;
    linkTarget = `/admin/errors/${encodeURIComponent(id)}`;
  } else if (bucket.reliabilitySignals.length > 0) {
    // `bucket.key` IS the signal's signature — buckets are keyed by it — so
    // this is never a recomputation, just the identity rule from the module
    // header applied to the string already on hand.
    id = `rel:${bucket.key}`;
    linkTarget = `/admin/errors/${encodeURIComponent(id)}`;
  } else {
    // Every bucket has at least one contributor (see correlateIncidents),
    // and the two branches above cover every app- and reliability-backed
    // bucket, so reaching here means this bucket is sentry-only.
    const sentryItem = bucket.sentryItems[0]!;
    id = sentryItem.key;
    linkTarget = null;
  }

  const firstSeen = [
    ...bucket.appItems.map((i) => i.firstSeen),
    ...bucket.sentryItems.map((i) => i.firstSeen),
    ...bucket.reliabilitySignals.map((s) => s.firstSeen),
  ].reduce(earliest, null as string | null)!;
  const lastSeen = [
    ...bucket.appItems.map((i) => i.lastSeen),
    ...bucket.sentryItems.map((i) => i.lastSeen),
    ...bucket.reliabilitySignals.map((s) => s.lastSeen),
  ].reduce(latest, null as string | null)!;

  const severity = worstSeverity([
    ...bucket.appItems.map((i) => i.severity),
    ...bucket.sentryItems.map((i) => i.severity),
    ...bucket.reliabilitySignals.map((s) => s.severity),
  ]);

  // Occurrences: app + sentry contributors ONLY. A reliability signal is
  // itself folded FROM Sentry/Supabase raw signals (see `correlateSignals`
  // in `@/lib/reliability/normalize.ts`), so adding its `count` here would
  // double-count the same underlying events a second time through a third
  // grouping. `corroboration` below is where a reliability-only observation
  // gets to count for something; `occurrences` stays an honest event tally.
  const occurrences =
    bucket.appItems.reduce((sum, i) => sum + i.occurrences, 0) +
    bucket.sentryItems.reduce((sum, i) => sum + i.occurrences, 0);

  // Affected users: MAX across app + sentry contributors, never summed — they
  // count different, overlapping populations (an app-origin identity vs.
  // Sentry's own userCount), and summing would invent users nobody observed.
  // Reliability signals carry no user-identity concept at all.
  const identityCandidates = [...bucket.appItems, ...bucket.sentryItems].map((i) => i.affectedUsers);
  const affectedUsers = identityCandidates.length > 0 ? Math.max(...identityCandidates) : 0;
  const allAppOrigin = bucket.sentryItems.length === 0 && bucket.appItems.length > 0;
  const allZeroKnownIdentity = bucket.appItems.every((i) => i.affectedUsers === 0);
  // False only when EVERY contributor is app-origin AND every one of them
  // reports 0 known identities — app-origin 0 means "no known identity
  // captured", not "zero people affected" (see `hasUnknownAffectedUsers` in
  // `@/lib/admin/incident-report.ts`, which this mirrors at the incident
  // level rather than the single-item level). Any Sentry contributor makes
  // the count known outright, because Sentry's userCount is zero-means-zero.
  const affectedUsersKnown = !(allAppOrigin && allZeroKnownIdentity);

  const sources = buildSourceEvidence(bucket, healthFor);
  const corroboration = sources.filter((s) => s.health !== 'blind').length;
  const hasBlindSource = sources.some((s) => s.health === 'blind');

  const title =
    firstNonNull([
      ...bucket.appItems.map((i) => i.title),
      ...bucket.sentryItems.map((i) => i.title),
      ...bucket.reliabilitySignals.map((s) => s.title),
    ]) ?? 'Untitled incident';
  const description =
    firstNonNull([
      ...bucket.appItems.map((i) => i.description),
      ...bucket.sentryItems.map((i) => i.description),
      ...bucket.reliabilitySignals.map((s) => s.summary || s.title),
    ]) ?? title;

  const route = firstNonNull([
    ...bucket.appItems.map((i) => i.route),
    ...bucket.sentryItems.map((i) => i.route),
    ...bucket.reliabilitySignals.map((s) => s.route),
  ]);
  const featureId = firstNonNull([
    ...bucket.appItems.map((i) => i.feature),
    ...bucket.sentryItems.map((i) => i.feature),
    ...bucket.reliabilitySignals.map((s) => s.featureId),
  ]);
  const actionName = firstNonNull([
    ...bucket.appItems.map((i) => i.actionName),
    ...bucket.sentryItems.map((i) => i.actionName),
  ]);
  const errorCode = firstNonNull([
    ...bucket.appItems.map((i) => i.errorCode),
    ...bucket.sentryItems.map((i) => i.errorCode),
    ...bucket.reliabilitySignals.map((s) => s.errorCode),
  ]);
  const sport = firstNonNull([
    ...bucket.appItems.map((i) => i.sport),
    ...bucket.sentryItems.map((i) => i.sport),
  ]);

  let klass: IncidentClass;
  let actionable: boolean;
  let klassReason: string;
  if (bucket.appItems.length > 0) {
    ({ klass, actionable, klassReason } = bucket.appItems[0]!);
  } else if (bucket.sentryItems.length > 0) {
    ({ klass, actionable, klassReason } = bucket.sentryItems[0]!);
  } else {
    // Reliability-only: no app or Sentry classifier has ever looked at this
    // fault. Rule 6 requires the safe direction — visible and actionable —
    // rather than silently filtering an unrecognised signal out of triage,
    // the same "unmatched defaults to defect" ladder
    // `classifyIncident` itself falls back to.
    klass = 'defect';
    actionable = true;
    klassReason =
      'Reliability-only signal — no admin_events or Sentry record exists for it yet, so it defaults to an actionable defect.';
  }

  const regressed =
    bucket.appItems.some((i) => i.substatus === 'regressed') ||
    bucket.sentryItems.some((i) => i.substatus === 'regressed');

  const hasStack = bucket.appItems.some((i) => reportHasStackTrace(i.report));

  const report =
    bucket.appItems[0]?.report ??
    bucket.sentryItems[0]?.report ??
    buildReliabilityOnlyReport({
      id,
      title,
      description,
      severity,
      route,
      errorCode,
      firstSeen,
      lastSeen,
      signals: bucket.reliabilitySignals,
      hasStoredAnalysis: analyzedKeys?.has(id) ?? false,
    });

  return {
    id,
    linkTarget,
    title,
    description,
    severity,
    firstSeen,
    lastSeen,
    occurrences,
    affectedUsers,
    affectedUsersKnown,
    sources,
    corroboration,
    appFingerprints: dedupe(
      bucket.appItems.map((i) => i.fingerprint).filter((f): f is string => f !== null),
    ),
    sentryIssueIds: dedupe(bucket.sentryItems.map(sentryIssueIdOf)),
    reliabilitySignatures: dedupe(bucket.reliabilitySignals.map((s) => s.signature)),
    route,
    featureId,
    actionName,
    errorCode,
    sport,
    klass,
    actionable,
    klassReason,
    report,
    regressed,
    hasBlindSource,
    hasStack,
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function correlateIncidents(input: CorrelateInput): IncidentDraft[] {
  const healthBySource = new Map<IncidentSourceName, CorrelationSourceHealth>();
  for (const h of input.sourceHealth) healthBySource.set(h.source, h);
  const healthFor = (source: IncidentSourceName): CorrelationSourceHealth =>
    healthBySource.get(source) ?? { source, health: 'unknown', reason: null, observedAt: null };

  const buckets = new Map<string, Bucket>();
  const bucketFor = (key: string): Bucket => {
    let b = buckets.get(key);
    if (!b) {
      b = newBucket(key);
      buckets.set(key, b);
    }
    return b;
  };

  for (const item of input.triage) {
    // TriageItem carries no raw `message` distinct from `title`/`description`
    // (`description` already has contextual suffix text appended for short
    // messages — see `buildIncidentDescription` — which would pollute the
    // grouping key). `title` is the one field both origins set from the same
    // kind of source text (the row's own title / the Sentry issue's title),
    // mirroring `triageCauseKey`'s `message ?? title` fallback one level up.
    const key = correlationKey({ errorCode: item.errorCode, route: item.route, message: item.title });
    const bucket = bucketFor(key);
    if (item.origin === 'app') bucket.appItems.push(item);
    else bucket.sentryItems.push(item);
  }

  for (const signal of input.reliabilitySignals) {
    // Bucket on the signal's OWN signature rather than recomputing via
    // `correlationKey` — `signal.signature` was built from the raw,
    // pre-redaction message (`correlationSignature` in
    // `@/lib/reliability/normalize.ts`), while `signal.summary` is redacted
    // and length-capped for storage. Recomputing from the stored summary
    // could diverge from the original signature if redaction touched the
    // first 80 characters, silently breaking the exact join this module
    // exists to make. The stored signature is the source of truth for "what
    // bucket does this signal belong to."
    bucketFor(signal.signature).reliabilitySignals.push(signal);
  }

  const drafts = Array.from(buckets.values()).map((b) => buildDraft(b, healthFor, input.analyzedKeys));

  // Newest lastSeen first; tie-break by occurrences descending, then id
  // ascending so the order is fully deterministic regardless of Map
  // iteration order or sort stability.
  drafts.sort((a, b) => {
    const t = Date.parse(b.lastSeen) - Date.parse(a.lastSeen);
    if (t !== 0) return t;
    if (b.occurrences !== a.occurrences) return b.occurrences - a.occurrences;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return drafts;
}
