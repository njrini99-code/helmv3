/**
 * Shadow-mode evaluation harness (repair-plan addendum §13, work package
 * A10 slice 1): "run all new families in shadow mode on de-identified
 * fixed snapshots before coach-visible writes."
 *
 * `runShadowEvaluation(snapshot)` is pure, offline, and read-only — it
 * makes no DB call, flips no flag, and writes nothing. It feeds one
 * de-identified `ShadowSnapshot` (facts/holes/scope only — never a live
 * player id) through every v3 pure-core family (A2 distance, A3 par, A4
 * sequence attribution + its #2020 rollup, A5 hypotheses, A6 issue
 * grouping) and returns one structured `ShadowEvalReport`: per-family
 * status counts, the duplicate-issue rate after `groupIssues`, a count of
 * "unsupported-cause" claims (must be 0 on any snapshot for the report to
 * mean anything), and a missing-input distribution.
 *
 * ## Provenance boundary (deliberate, not a gap to "fix" here)
 * `groupIssues` only ever groups packets carrying honest `sourceShotIds`
 * (`ranking/situational-ranking.ts`'s own contract: "an adapter that
 * cannot honestly name its source shots should not produce a packet").
 * A2 (`distance-profile.ts`) and A3 (`par-opportunities.ts`) `MetricResult`
 * rows carry no per-shot provenance today (`metrics/types.ts`'s own doc
 * comment), and A5's `par5_opportunity_loss` hypothesis is round-level, not
 * shot-addressed. This harness does NOT fabricate ids for any of those —
 * it counts them under `grouping.nonGroupablePacketSources` instead. Only
 * A4's sequence events (which carry `round_id`/`hole_number`/
 * `shotNumbers`) and A5's per-shot `rough_gap`/`recovery` hypotheses (whose
 * `id`/`supportingClaimIds` resolve back to one triggering `ShotFact`) are
 * ever turned into an `IssueSourcePacket` here.
 *
 * ## Sequence-packet eligibility (A6 slice 2's rule, reimplemented locally)
 * A packet built from one `SequenceEvent` is `eligible` only when that
 * event KIND's own #2020 rollup row (`computeSequenceAttribution`'s
 * `sequence_event_strokes_gained` row for that `event_kind`) has
 * `status: 'supported'` — never on the single event's own resolution.
 * Slice 2 (#2026) implements the same rule as an exported adapter on
 * `situational-ranking.ts`, but that PR is not on `main` as of this slice;
 * duplicating the ~6-line rule here (rather than importing an unmerged
 * branch) is intentional and should be replaced with that import once
 * #2026 lands.
 *
 * ## A5 reachability (a real shadow-mode finding, not a bug here)
 * `short_bias` cites `approach_short_miss_rate`, which no A2/A3 family
 * emits today — so `short_bias` can never reach `'supported_association'`
 * on ANY real input, only `'no_data'`. `rough_gap` (cites A2's
 * `approach_measured_contribution`) and `par5_opportunity_loss` (cites
 * A3's `par5_regulation_opportunity_rate`/`par5_green_in_two_rate`) CAN
 * reach it — both metric ids are real A2/A3 output. See the harness test
 * suite's "established" snapshot for a real (not hand-waved)
 * `supported_association` case.
 */

import type { AnalysisScope, HoleContext, ShotFact } from '../context/types';
import { computeDistanceProfile } from '../metrics/distance-profile';
import { computeParOpportunities } from '../metrics/par-opportunities';
import {
  attributeSequence,
  computeSequenceAttribution,
  type SequenceAttributionResult,
  type SequenceEvent,
} from '../metrics/sequence-attribution';
import type { MetricResult, MetricStatus } from '../metrics/types';
import {
  buildHypotheses,
  metricClaimId,
  shotClaimId as hypothesisShotClaimId,
  type Hypothesis,
  type HypothesisState,
} from '../reasoning/hypothesis-policy';
import {
  groupIssues,
  shotClaimId,
  type Issue,
  type IssueSourcePacket,
} from '../ranking/situational-ranking';

// ---------------------------------------------------------------------------
// Snapshot input
// ---------------------------------------------------------------------------

/** A de-identified, fixed snapshot — `scope.player_id` must be a synthetic
 *  fixture id (e.g. `'snapshot-established-roster'`), never a real player.
 *  No date/time is read from the wall clock: every row is exactly what the
 *  caller passed in. */
export interface ShadowSnapshot {
  scope: AnalysisScope;
  facts: readonly ShotFact[];
  holes: readonly HoleContext[];
}

// ---------------------------------------------------------------------------
// Report shape
// ---------------------------------------------------------------------------

const METRIC_STATUSES: readonly MetricStatus[] = ['supported', 'descriptive_only', 'insufficient', 'invalid'];

export interface MetricFamilyReport {
  totalRows: number;
  byStatus: Record<MetricStatus, number>;
  /** Sum of every row's own `eligibleCount` — the raw candidate population
   *  backing every row's `status`, independent of which status it landed
   *  on. */
  eligibleTotal: number;
  /** Every row's own `exclusions` record, summed key-by-key. */
  exclusionsHistogram: Record<string, number>;
}

export interface SequencePerHoleReport {
  totalHoles: number;
  attributed: number;
  suppressed: number;
  suppressionReasonHistogram: Record<string, number>;
  baselineGapHistogram: Record<string, number>;
}

const HYPOTHESIS_STATES: readonly HypothesisState[] = [
  'no_data',
  'candidate',
  'supported_association',
  'coach_annotated',
];

export interface HypothesisReport {
  total: number;
  byState: Record<HypothesisState, number>;
  missingInputDistribution: Record<string, number>;
}

export interface GroupingReport {
  /** Packets this harness could honestly build (A4 rollup-gated sequence
   *  events + A5 per-shot rough_gap/recovery hypotheses with a resolvable
   *  supporting shot). */
  packetCount: number;
  /** Rows/hypotheses this harness deliberately did NOT turn into a packet
   *  because they carry no per-shot provenance — see the module doc
   *  comment's "Provenance boundary" section. Never inferred to close this
   *  gap. */
  nonGroupablePacketSources: number;
  issueCount: number;
  /** `(packetCount - issueCount) / packetCount`, `0` when `packetCount` is
   *  `0` — the fraction of packets that turned out to be a duplicate
   *  perspective on an issue some other packet already founded. */
  duplicateIssueRate: number;
  /** See `countUnsupportedCauseClaims`. Must be `0` for this report to be
   *  trustworthy at all. */
  unsupportedCauseClaims: number;
  /** See `countDuplicateLeadingPriority`. Must be `0` — "one underlying
   *  issue yields one leading priority" (A6's own acceptance criterion). */
  duplicateLeadingPriority: number;
}

export interface ShadowEvalReport {
  distance: MetricFamilyReport;
  par: MetricFamilyReport;
  sequencePerHole: SequencePerHoleReport;
  sequenceRollup: MetricFamilyReport;
  hypotheses: HypothesisReport;
  grouping: GroupingReport;
}

// ---------------------------------------------------------------------------
// Per-family summarizers
// ---------------------------------------------------------------------------

function emptyStatusRecord(): Record<MetricStatus, number> {
  const record = {} as Record<MetricStatus, number>;
  for (const status of METRIC_STATUSES) record[status] = 0;
  return record;
}

function summarizeMetricRows(rows: readonly MetricResult[]): MetricFamilyReport {
  const byStatus = emptyStatusRecord();
  const exclusionsHistogram: Record<string, number> = {};
  let eligibleTotal = 0;
  for (const row of rows) {
    byStatus[row.status] += 1;
    eligibleTotal += row.eligibleCount;
    for (const [reason, count] of Object.entries(row.exclusions)) {
      exclusionsHistogram[reason] = (exclusionsHistogram[reason] ?? 0) + count;
    }
  }
  return { totalRows: rows.length, byStatus, eligibleTotal, exclusionsHistogram };
}

function summarizeSequencePerHole(
  facts: readonly ShotFact[],
  holes: readonly HoleContext[],
  scope: AnalysisScope,
): SequencePerHoleReport {
  const suppressionReasonHistogram: Record<string, number> = {};
  const baselineGapHistogram: Record<string, number> = {};
  let attributed = 0;
  let suppressed = 0;

  for (const hole of holes) {
    const result = attributeSequence(facts, hole, scope);
    if (result.status === 'suppressed') {
      suppressed += 1;
      for (const reason of result.reasons) {
        suppressionReasonHistogram[reason] = (suppressionReasonHistogram[reason] ?? 0) + 1;
      }
    } else {
      attributed += 1;
      for (const [reason, count] of Object.entries(result.exclusions)) {
        baselineGapHistogram[reason] = (baselineGapHistogram[reason] ?? 0) + count;
      }
    }
  }

  return { totalHoles: holes.length, attributed, suppressed, suppressionReasonHistogram, baselineGapHistogram };
}

function summarizeHypotheses(hypotheses: readonly Hypothesis[]): HypothesisReport {
  const byState = {} as Record<HypothesisState, number>;
  for (const state of HYPOTHESIS_STATES) byState[state] = 0;
  const missingInputDistribution: Record<string, number> = {};

  for (const h of hypotheses) {
    byState[h.state] += 1;
    for (const input of h.missingInputs) {
      missingInputDistribution[input] = (missingInputDistribution[input] ?? 0) + 1;
    }
  }

  return { total: hypotheses.length, byState, missingInputDistribution };
}

// ---------------------------------------------------------------------------
// Packet adapters — the honest subset only (see module doc comment)
// ---------------------------------------------------------------------------

function sequenceEventPacket(
  result: SequenceAttributionResult,
  event: SequenceEvent,
  rollupRows: readonly MetricResult[],
): IssueSourcePacket {
  const kindRow = rollupRows.find(
    (r) => r.metricId === 'sequence_event_strokes_gained' && r.dimensions.event_kind === event.kind,
  );
  const sourceShotIds = event.shotNumbers.map((n) =>
    shotClaimId({ round_id: result.round_id, hole_number: result.hole_number, shot_number: n }),
  );
  return {
    claimId: `sequence:${event.kind}:${result.round_id}:${result.hole_number}:${event.shotNumbers.join('-')}`,
    origin: 'sequence',
    label: event.kind,
    sourceShotIds,
    // Rollup-gated eligibility (A6 slice 2's rule) — never the single
    // event's own resolution. See module doc comment.
    eligible: kindRow?.status === 'supported',
    strokesImpact: event.measuredContribution,
    confidence: null,
  };
}

/** Only `rough_gap` ever cites its own triggering shot as a real
 *  supporting claim (module doc comment on `hypothesis-policy.ts`);
 *  `recovery` deliberately never does, so it has no supporting shot claim
 *  to resolve and is correctly left out of `nonGroupable` accounting as a
 *  hypothesis-shaped row rather than silently miscounted as groupable. */
function hypothesisPacket(
  h: Hypothesis,
  factByHypothesisShotClaim: ReadonlyMap<string, ShotFact>,
): IssueSourcePacket | null {
  if (h.family !== 'rough_gap') return null;
  const claim = h.supportingClaimIds.find((id) => id.startsWith('shot:'));
  if (!claim) return null;
  const fact = factByHypothesisShotClaim.get(claim);
  if (!fact) return null;
  return {
    claimId: h.id,
    origin: 'hypothesis',
    label: h.family,
    sourceShotIds: [shotClaimId({ round_id: fact.round_id, hole_number: fact.hole_number, shot_number: fact.shot_number })],
    eligible: h.state === 'supported_association',
    // hypothesis-policy.ts computes no strokes-impact number of its own.
    strokesImpact: null,
    confidence: null,
  };
}

// ---------------------------------------------------------------------------
// Grouping invariants — pure functions over `Issue[]`, independently unit-
// testable against a hand-built violating input (see the harness test
// suite; "a gate that cannot fail is not a gate").
// ---------------------------------------------------------------------------

/**
 * A hypothesis counts as an "unsupported-cause claim" when either:
 *   (a) any of its claim ids does not resolve to an input element this
 *       call was actually given (a metric row or a fact), or
 *   (b) it reads `'supported_association'` without at least one
 *       supporting `metric:` claim that resolves to a row this call was
 *       given with `status === 'supported'`.
 * Reading straight off `finalizeState`'s own contract (only `elevates`
 * reaches `'supported_association'`, and every family's `elevates` is
 * gated on a real `status === 'supported'` row) this should never fire —
 * the point of counting it here, rather than trusting that by
 * construction, is to prove it on every shadow snapshot rather than only
 * in `hypothesis-policy.test.ts`'s own unit tests.
 */
export function countUnsupportedCauseClaims(
  hypotheses: readonly Hypothesis[],
  metrics: readonly MetricResult[],
  facts: readonly ShotFact[],
): number {
  // Keyed by each row's own RESOLVED claim id (`metricClaimId(id,
  // dimensions)`, hypothesis-policy.ts's own contract) — not the bare
  // `metric:${metricId}` family id. A dimensioned row (e.g. a per-hole
  // par5_regulation_opportunity_rate) only ever appears in
  // supportingClaimIds/contradictingClaimIds under its dimensioned id;
  // indexing by the bare id alone would make every dimensioned claim look
  // unresolvable regardless of whether it actually traces back to a real
  // row this call was given.
  const metricByClaim = new Map(metrics.map((m) => [metricClaimId(m.metricId, m.dimensions), m]));
  const shotClaims = new Set(facts.map((f) => hypothesisShotClaimId(f)));

  let count = 0;
  for (const h of hypotheses) {
    const allClaims = [...h.supportingClaimIds, ...h.contradictingClaimIds];
    const unresolvable = allClaims.some((id) => {
      if (id.startsWith('metric:')) return !metricByClaim.has(id);
      if (id.startsWith('shot:')) return !shotClaims.has(id);
      return true;
    });
    if (unresolvable) {
      count += 1;
      continue;
    }
    if (h.state === 'supported_association') {
      const hasRealSupportingMetric = h.supportingClaimIds.some((id) => {
        const metric = metricByClaim.get(id);
        return metric !== undefined && metric.status === 'supported';
      });
      if (!hasRealSupportingMetric) count += 1;
    }
  }
  return count;
}

/**
 * Two ways "one underlying issue" could wrongly surface as more than one
 * leading priority: the same source shot named by two different issues, or
 * the same owning claim credited to two different issues. `groupIssues`
 * itself should make both impossible by construction (union-find merges
 * any shared shot into one issue; a `claimId` can own at most the one
 * issue its packet ended up in) — this function proves it holds on the
 * OUTPUT, independent of how that output was produced.
 */
export function countDuplicateLeadingPriority(issues: readonly Issue[]): number {
  const shotIssueCounts = new Map<string, number>();
  const ownerIssueCounts = new Map<string, number>();

  for (const issue of issues) {
    for (const shotId of issue.sourceShotIds) {
      shotIssueCounts.set(shotId, (shotIssueCounts.get(shotId) ?? 0) + 1);
    }
    const owner = issue.impactOwnership.ownerClaimId;
    if (owner !== null) {
      ownerIssueCounts.set(owner, (ownerIssueCounts.get(owner) ?? 0) + 1);
    }
  }

  let violations = 0;
  for (const count of shotIssueCounts.values()) if (count > 1) violations += 1;
  for (const count of ownerIssueCounts.values()) if (count > 1) violations += 1;
  return violations;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export function runShadowEvaluation(snapshot: ShadowSnapshot): ShadowEvalReport {
  const { scope, facts, holes } = snapshot;

  const distanceRows = computeDistanceProfile(facts, scope, holes);
  const parRows = computeParOpportunities([...facts], [...holes], scope);
  const sequenceRollupRows = computeSequenceAttribution(facts, holes, scope);

  const allMetricsForHypotheses: MetricResult[] = [...distanceRows, ...parRows, ...sequenceRollupRows];
  const hypotheses = buildHypotheses(allMetricsForHypotheses, facts);

  const factByHypothesisShotClaim = new Map(facts.map((f) => [hypothesisShotClaimId(f), f]));

  const packets: IssueSourcePacket[] = [];
  let nonGroupablePacketSources = 0;

  // A2/A3 rows carry no per-shot provenance — never turned into a packet.
  nonGroupablePacketSources += distanceRows.length + parRows.length;

  for (const hole of holes) {
    const result = attributeSequence(facts, hole, scope);
    if (result.status !== 'attributed') continue;
    for (const event of result.events) {
      packets.push(sequenceEventPacket(result, event, sequenceRollupRows));
    }
  }

  for (const h of hypotheses) {
    const packet = hypothesisPacket(h, factByHypothesisShotClaim);
    if (packet) {
      packets.push(packet);
    } else {
      // par5_opportunity_loss (round-level, no shot address) and recovery
      // (no supporting shot claim by design) — both honestly non-groupable.
      nonGroupablePacketSources += 1;
    }
  }

  const issues = groupIssues(packets);

  const grouping: GroupingReport = {
    packetCount: packets.length,
    nonGroupablePacketSources,
    issueCount: issues.length,
    duplicateIssueRate: packets.length > 0 ? (packets.length - issues.length) / packets.length : 0,
    unsupportedCauseClaims: countUnsupportedCauseClaims(hypotheses, allMetricsForHypotheses, facts),
    duplicateLeadingPriority: countDuplicateLeadingPriority(issues),
  };

  return {
    distance: summarizeMetricRows(distanceRows),
    par: summarizeMetricRows(parRows),
    sequencePerHole: summarizeSequencePerHole(facts, holes, scope),
    sequenceRollup: summarizeMetricRows(sequenceRollupRows),
    hypotheses: summarizeHypotheses(hypotheses),
    grouping,
  };
}
