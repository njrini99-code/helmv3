/**
 * Root-cause dedupe / fingerprint alias model (brief §8 "Duplicate errors").
 *
 * WHY THIS IS NOT `correlate.ts`. `correlate.ts` already performs the
 * brief's HIGHEST tier at the raw-EVIDENCE grain: `correlationKey` folds an
 * `admin_events` row, a Sentry issue and a reliability `CorrelatedSignal`
 * into one `UnifiedIncident` the moment they share one normalized
 * `errorCode::route::messagePrefix` signature — that is why
 * `UnifiedIncident.appFingerprints` / `.sentryIssueIds` /
 * `.reliabilitySignatures` are already arrays: a single incident already
 * owns multiple source fingerprints. Re-deriving that here would be the
 * second authority `types.ts`'s own header warns against.
 *
 * What is missing is the layer ABOVE that: two records `correlate.ts`
 * legitimately keeps as SEPARATE `UnifiedIncident`s — because their raw
 * signature genuinely differs — can still be the same root cause. A trace
 * id ties a Postgres 42501 to the Sentry issue for the request that hit it
 * even when the two carry different messages and different routes; that is
 * exactly the brief's own worked example (§47: "Sentry and Supabase agree on
 * 42501" via a shared trace, not a shared message). This module is that
 * SECOND pass: given a set of already-built incident-shaped facts, decide
 * whether any of them are the same root cause the first pass could not see,
 * and group them into a root incident with aliases carrying provenance.
 *
 * PURE. No I/O, no clock ambient — `now` is never read; timestamps arrive as
 * ISO strings on the input and are compared to each other, never to
 * wall-clock time.
 *
 * THE NEVER-MERGE RULES ARE ENFORCED BY OMISSION, NOT BY A DENYLIST.
 * `classifyMergeConfidence` never reads `message`, `source` or `userId` as a
 * merge key — only as fixture context in this file's own tests — so "two
 * records share a message", "two records are both from Supabase" or "two
 * records share a user" can never by themselves produce a tier above
 * `'none'`, regardless of how the classifier's internals change later. The
 * property is structural, not a rule someone has to remember to keep
 * checking.
 */

import type { IncidentSourceName } from './types';

// ---------------------------------------------------------------------------
// Input facts
// ---------------------------------------------------------------------------

/**
 * Everything the alias classifier may compare two records on.
 *
 * `message`, `source` and `userId` are carried for TEST FIXTURES ONLY — see
 * the module header. Nothing in `classifyMergeConfidence` reads them.
 */
export interface MergeCandidateFacts {
  id: string;
  helmTraceId: string | null;
  sentryTraceId: string | null;
  flightRecorderRunId: string | null;
  /** The identity `correlate.ts` already resolved this record to — an
   *  `admin_events` fingerprint, `rel:<signature>`, or `sentry:<issueId>`. */
  canonicalFingerprint: string | null;
  rpc: string | null;
  errorCode: string | null;
  featureId: string | null;
  operation: string | null;
  /** A normalized join of the top N stack frames — same shape as `correlate.ts`'s
   *  own normalization, never a raw stack. */
  normalizedTopFrames: string | null;
  /** Deploy SHA / release id active when this record occurred. */
  releaseCohort: string | null;
  occurredAt: string;
  source: IncidentSourceName | null;
  userId: string | null;
  message: string;
}

// ---------------------------------------------------------------------------
// Confidence tiers
// ---------------------------------------------------------------------------

export type MergeConfidenceTier = 'highest' | 'medium' | 'none';

export interface MergeDecision {
  tier: MergeConfidenceTier;
  /** Operator-readable, for the drawer. */
  reason: string;
  /** Which dimensions the decision was based on. Empty for `'none'`. */
  matchedOn: readonly string[];
}

/** Tight enough to rule out coincidence, wide enough for a retry storm to
 *  stay one episode rather than fragmenting into several. Injectable so a
 *  test can pin the boundary exactly. */
export const DEFAULT_TIGHT_WINDOW_MS = 15 * 60 * 1000;

export interface ClassifyOptions {
  tightWindowMs?: number;
}

function sameNonNull(a: string | null, b: string | null): boolean {
  return a !== null && a === b;
}

/**
 * Highest tier: any ONE of five identity-level matches (brief §8, "highest").
 * Medium tier: ALL SIX of feature + operation + frames + code + window +
 * release must align (brief §8, "medium") — a single shared dimension is
 * never enough, which is what keeps this tier from degenerating into the
 * never-merge rules it exists beside.
 */
export function classifyMergeConfidence(
  a: MergeCandidateFacts,
  b: MergeCandidateFacts,
  options: ClassifyOptions = {},
): MergeDecision {
  if (sameNonNull(a.helmTraceId, b.helmTraceId)) {
    return { tier: 'highest', reason: 'Same Helm trace id.', matchedOn: ['helmTraceId'] };
  }
  if (sameNonNull(a.sentryTraceId, b.sentryTraceId)) {
    return { tier: 'highest', reason: 'Same Sentry trace id.', matchedOn: ['sentryTraceId'] };
  }
  if (sameNonNull(a.flightRecorderRunId, b.flightRecorderRunId)) {
    return { tier: 'highest', reason: 'Same Flight Recorder run.', matchedOn: ['flightRecorderRunId'] };
  }
  if (sameNonNull(a.canonicalFingerprint, b.canonicalFingerprint)) {
    return { tier: 'highest', reason: 'Same canonical fingerprint.', matchedOn: ['canonicalFingerprint'] };
  }
  if (sameNonNull(a.rpc, b.rpc) && sameNonNull(a.errorCode, b.errorCode) && sameNonNull(a.featureId, b.featureId)) {
    return {
      tier: 'highest',
      reason: 'Same RPC, error code and feature.',
      matchedOn: ['rpc', 'errorCode', 'featureId'],
    };
  }

  const tightWindowMs = options.tightWindowMs ?? DEFAULT_TIGHT_WINDOW_MS;
  const sameFeature = sameNonNull(a.featureId, b.featureId);
  const sameOperation = sameNonNull(a.operation, b.operation);
  const sameFrames = sameNonNull(a.normalizedTopFrames, b.normalizedTopFrames);
  const sameCode = sameNonNull(a.errorCode, b.errorCode);
  const sameRelease = sameNonNull(a.releaseCohort, b.releaseCohort);
  const aMs = Date.parse(a.occurredAt);
  const bMs = Date.parse(b.occurredAt);
  const withinWindow = Number.isFinite(aMs) && Number.isFinite(bMs) && Math.abs(aMs - bMs) <= tightWindowMs;

  if (sameFeature && sameOperation && sameFrames && sameCode && sameRelease && withinWindow) {
    return {
      tier: 'medium',
      reason:
        'Same feature and operation, matching normalized top frames and error code, ' +
        'within a tight window on the same release.',
      matchedOn: ['featureId', 'operation', 'normalizedTopFrames', 'errorCode', 'releaseCohort', 'window'],
    };
  }

  return {
    tier: 'none',
    reason:
      'No identity-level match, and the medium tier requires feature, operation, frames, ' +
      'code, release and a tight time window to ALL align — at most a coincidental resemblance was found.',
    matchedOn: [],
  };
}

// ---------------------------------------------------------------------------
// Grouping — union-find over the classifier, so ties are transitive
// ---------------------------------------------------------------------------

export interface AliasProvenance {
  id: string;
  tier: Exclude<MergeConfidenceTier, 'none'>;
  matchedOn: readonly string[];
  reason: string;
}

export interface RootIncidentAliasGroup {
  /** The earliest-occurring member — the root incident's identity. */
  rootId: string;
  /** Every OTHER member, with the evidence that joined it to the group. */
  aliases: readonly AliasProvenance[];
  /** rootId followed by every alias id, in that order. */
  memberIds: readonly string[];
}

function find(parent: Map<string, string>, x: string): string {
  let root = x;
  while (parent.get(root) !== root) root = parent.get(root) as string;
  let cur = x;
  while (parent.get(cur) !== root) {
    const next = parent.get(cur) as string;
    parent.set(cur, root);
    cur = next;
  }
  return root;
}

/**
 * Group candidates into root incidents. A merge decision above `'none'`
 * unions two candidates' groups; grouping is TRANSITIVE (a~b, b~c implies
 * a,b,c are one root), which matches "a root incident owns multiple source
 * fingerprints" rather than requiring every pair in a group to directly
 * match each other.
 *
 * Deterministic: candidate order never changes the resulting partition
 * (union-find is order-independent), and within a group the root is always
 * the earliest `occurredAt` — ties broken by input order.
 */
export function groupIntoRootIncidents(
  candidates: readonly MergeCandidateFacts[],
  options: ClassifyOptions = {},
): RootIncidentAliasGroup[] {
  const parent = new Map<string, string>();
  for (const c of candidates) parent.set(c.id, c.id);

  /** The decision that most recently joined a given id into its current group. */
  const joinedBy = new Map<string, MergeDecision & { via: string }>();

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i]!;
      const b = candidates[j]!;
      const rootA = find(parent, a.id);
      const rootB = find(parent, b.id);
      if (rootA === rootB) continue;
      const decision = classifyMergeConfidence(a, b, options);
      if (decision.tier === 'none') continue;
      parent.set(rootA, rootB);
      if (!joinedBy.has(a.id)) joinedBy.set(a.id, { ...decision, via: b.id });
      if (!joinedBy.has(b.id)) joinedBy.set(b.id, { ...decision, via: a.id });
    }
  }

  const byRoot = new Map<string, MergeCandidateFacts[]>();
  for (const c of candidates) {
    const root = find(parent, c.id);
    const bucket = byRoot.get(root);
    if (bucket) bucket.push(c);
    else byRoot.set(root, [c]);
  }

  const groups: RootIncidentAliasGroup[] = [];
  for (const members of byRoot.values()) {
    const sorted = [...members].sort((x, y) => Date.parse(x.occurredAt) - Date.parse(y.occurredAt));
    const root = sorted[0]!;
    const aliases: AliasProvenance[] = sorted.slice(1).map((m) => {
      const decision = joinedBy.get(m.id);
      return {
        id: m.id,
        tier: (decision?.tier ?? 'medium') as Exclude<MergeConfidenceTier, 'none'>,
        matchedOn: decision?.matchedOn ?? [],
        reason: decision?.reason ?? 'Joined this root transitively through a shared alias.',
      };
    });
    groups.push({ rootId: root.id, aliases, memberIds: sorted.map((m) => m.id) });
  }

  groups.sort((x, y) => {
    const rx = candidates.find((c) => c.id === x.rootId)!;
    const ry = candidates.find((c) => c.id === y.rootId)!;
    return Date.parse(rx.occurredAt) - Date.parse(ry.occurredAt);
  });

  return groups;
}
