/**
 * Controlled-hypothesis pure core (repair-plan addendum §13, work package
 * A5, slice 1 + slice 2). Depends on A1's `ShotFact` (`context/types.ts`)
 * and the shared `MetricResult` contract (`../metrics/types.ts`, #1990,
 * merged).
 *
 * `buildHypotheses(metrics, facts)` proposes a small, NAMED set of
 * candidate explanations for a round's shot data — never a fabricated
 * cause, never a psychological/fatigue/mechanical inference (a test scans
 * the FULL serialized output of every hypothesis this module can produce
 * for banned terms — `pressure`, `confidence`, `swing`, `mechanics`, and
 * similar). Every hypothesis states what it depends on (`prerequisites`),
 * which of those were actually available (the gap is `missingInputs`),
 * which concrete inputs support or contradict it (`supportingClaimIds` /
 * `contradictingClaimIds`, both resolvable back to an element of `metrics`
 * or `facts` — see `metricClaimId`/`shotClaimId`), and a `nextCheck` naming
 * the specific input that would resolve an ambiguity, when one exists.
 *
 * ## Slice 2: dimensioned metrics
 * `MetricResult` carries `dimensions` (e.g. a distance band, or a specific
 * par-5 hole) — a real call can hand back SEVERAL rows sharing one
 * `metricId`, one per dimension value. `prerequisites`/`missingInputs` name
 * a metric FAMILY and stay undimensioned (`metricClaimId(id)`); a claim id
 * that resolves to an actual matched row is dimensioned
 * (`metricClaimId(id, row.dimensions)`), canonically serialized (sorted
 * keys) so the same dimensions always produce the same id regardless of
 * key order. `findMetric` takes an optional dimension filter so a caller
 * reads the ONE row that actually describes its own shot/hole, never an
 * arbitrary first match across every band/hole.
 *
 * `rough_gap` was originally written to match `approach_measured_
 * contribution` (the real producer in `distance-profile.ts`, per-band, via
 * `bandOf` from `../metrics/distance-profile.ts`). That metric turned out
 * to be a plain eligible-attempt COUNT (`unit: 'count'`, always >= 0), not
 * the signed strokes-gained value this family needs — a count can state
 * how much evidence exists, never a direction. Rather than name the real
 * count metric as this family's corroborator (present or missing), the
 * family is keyed to a distinct id, `approach_rough_gap_strokes_
 * contribution` (`ROUGH_GAP_STROKES_METRIC_ID`), naming the honestly
 * not-yet-existing strokes-shaped signal it actually needs — no producer
 * emits it today, so the family always reports the gap.
 *
 * `par5_opportunity_loss` matches every real call: `par-opportunities.ts`
 * dimensions its two metric ids per SPECIFIC par-5 hole
 * (`course_hole_key`/`hole_number`), so a round with several par-5s yields
 * several rows per metric id. This slice emits one `Hypothesis` PER
 * dimensioned opportunity row (mirroring the existing per-shot pattern for
 * `rough_gap`/`recovery`) instead of reading one arbitrary row and
 * silently dropping the rest. Zero opportunity rows still produce the
 * single aggregate `'no_data'` hypothesis slice 1 shipped.
 *
 * ## States
 * `'no_data'` — this hypothesis's ENTIRE content is a gap: no supporting
 * claim, no contradicting claim, only `missingInputs`. Kept distinct from
 * `'candidate'` so a caller can't mistake "we have nothing to go on" for
 * "we have a real, if uncorroborated, pattern match" — the review that
 * added this state flagged exactly that conflation as overclaiming.
 * `'candidate'` — at least one real supporting claim exists (a genuine
 * pattern match, e.g. an explicitly tagged shot), but it is not yet
 * corroborated by a metric this module trusts, or it was but a
 * contradiction downgraded it back. `'supported_association'` — a metric
 * with `status === 'supported'` points the same direction as the
 * hypothesis, and nothing contradicts it; this is an ASSOCIATION, not a
 * causal claim.
 *
 * There was briefly a `'coach_annotated'` state in this union (slice 3
 * draft, addendum §8.3) — dropped after review: `mergeCoachAnnotation`
 * attaches a `CoachAnnotation` alongside a hypothesis but deliberately
 * never overwrites `state` (a coach's judgment layers onto the evidence,
 * never replaces it), so nothing in this module could ever produce that
 * value — a state with no producer isn't a state, it's dead code. A
 * "reviewed" read belongs at the call site, derived from
 * `coachAnnotation != null`, not as a fourth member of `HypothesisState`.
 * There is deliberately no `'proven'` state either: this module never
 * claims that.
 *
 * `description` is a function of `state`, not a fixed per-family string —
 * the SAME family reads differently depending on how much has actually
 * been corroborated (hedged for `'no_data'`/`'candidate'`, association
 * wording for `'supported_association'`), so a reader can't see
 * "supported_association"-flavored language on an entry that is really
 * just a named gap.
 *
 * ## Registry
 * Four named families (`short_bias`, `rough_gap`, `recovery`,
 * `par5_opportunity_loss`), plus a fifth non-family entry
 * (`family: 'insufficient'`) that names two competing families instead of
 * picking one when the discriminating fact (recorded shot intent) isn't
 * there.
 *
 * `ShotFact` has neither `par` nor a miss-direction field (A1's own scope,
 * `context/types.ts`) — so `short_bias` (needs a short/long miss split) and
 * `par5_opportunity_loss` (needs to know which holes were par 5s) cannot be
 * derived from facts at all. Both are gated ENTIRELY on a `metrics` row;
 * `short_bias` additionally requires at least one approach shot in `facts`
 * to be worth mentioning at all (a relevance check, not an inference about
 * that shot), while `par5_opportunity_loss` has no fact-based relevance
 * gate available and is evaluated unconditionally — a caller scopes
 * `metrics` to the round/window it cares about, so an empty result there
 * is itself informative rather than something to hide.
 *
 * `rough_gap` and `recovery` DO come from facts: a `shot_type: 'approach'`
 * shot with `lie_before === 'rough'`. What distinguishes them is the
 * ingest-tagged `intent` — `'go_for_green'` supports `rough_gap`,
 * `'recovery'` supports `recovery`, an explicit `'layup'` is neither (a
 * lay-up isn't attempting to reach the green), and anything else
 * (`'unknown'` — the value nearly every real shot normalizes to today,
 * A1's own `ShotIntent` doc comment) produces the `'insufficient'` entry
 * instead of guessing. Never inferred from distance, outcome, or any other
 * proxy — only the explicit tag.
 *
 * `rough_gap`'s own triggering shot counts as a real supporting claim (the
 * shot itself — "a go-for-green attempt from the rough" — is meaningful
 * context on its own), so `rough_gap` without a usable metric is
 * `'candidate'`, never `'no_data'`. `approach_measured_contribution` (A2)
 * is a per-band eligible-attempt COUNT, not the signed strokes-gained
 * value this family needs — see the slice 2 note above — so it currently
 * never corroborates either. `recovery` deliberately does NOT cite its own
 * triggering shot as support: no metric measures a recovery-specific
 * expected outcome today, and citing the tag that TRIGGERED the hypothesis
 * as evidence FOR it would be circular. `recovery` is therefore always
 * `'no_data'` in this slice (its `id` still carries the triggering shot's
 * coordinates for traceability).
 *
 * ## Slice 3: coach annotation
 * `mergeCoachAnnotation`/`reopenIfContradicted` (addendum §8.3) let a coach
 * layer a judgment onto a hypothesis without touching the evidence: `state`,
 * `description`, `prerequisites`, `supportingClaimIds`,
 * `contradictingClaimIds`, and `missingInputs` are untouched by either
 * function — only the new `coachAnnotation` field is set. On a later call
 * with fresh `metrics`/`facts`, `reopenIfContradicted` flags the annotation
 * `reopened: true` (never silently dropped, never silently kept current)
 * the moment a NEW contradicting claim shows up that wasn't already known
 * at annotation time — including a claim id that flips from supporting to
 * contradicting between calls, which is why the two claim-id snapshots are
 * kept separate rather than merged into one "known" set.
 *
 * `HypothesisState` has no `'coach_annotated'` member — see the "## States"
 * section above for why a state with no producer was dropped rather than
 * kept as dead code. A "reviewed" read belongs at the call site
 * (`coachAnnotation != null`), not as a fourth `state` value.
 */

import type { ShotFact, ShotIntent } from '../context/types';
import type { MetricResult } from '../metrics/types';
import { bandOf } from '../metrics/distance-profile';

export type { MetricResult, MetricStatus } from '../metrics/types';

// ---------------------------------------------------------------------------
// Hypothesis shape
// ---------------------------------------------------------------------------

export type HypothesisState = 'no_data' | 'candidate' | 'supported_association';

/** One of the four named registry families, or `'insufficient'` for an
 *  entry that names competing families instead of picking one. */
export type HypothesisFamily =
  | 'short_bias'
  | 'rough_gap'
  | 'recovery'
  | 'par5_opportunity_loss'
  | 'insufficient';

/** What further input would tell `distinguishes` (two or more hypothesis
 *  families that read the same today) apart, and what that input is — a
 *  `metric:<metricId>` claim id or a `fact:<field>` name. */
export interface NextCheck {
  distinguishes: HypothesisFamily[];
  requires: string;
}

/**
 * A coach's judgment about a hypothesis, layered alongside the evidence —
 * addendum §8.3: "A coach can annotate a working explanation; retain
 * author, date, and evidence. On future contradictory evidence, reopen the
 * explanation instead of silently preserving certainty." Set by
 * `mergeCoachAnnotation`, updated by `reopenIfContradicted`. Never read by
 * either function as a reason to change `state`/`description`/the claim or
 * `missingInputs` arrays — those stay exactly what the evidence says.
 */
export interface CoachAnnotation {
  /** Coach id (or equivalent identifier) who made the annotation. */
  author: string;
  /** ISO timestamp supplied by the caller — this module has no clock. */
  date: string;
  /** The coach's own note. Free text; never fed back into `description` or
   *  any other field the banned-terms scan covers. */
  note: string;
  /** `supportingClaimIds` at the moment of annotation — the evidentiary
   *  snapshot the coach's judgment was made against. */
  supportingClaimIdsAtAnnotation: readonly string[];
  /** `contradictingClaimIds` at the moment of annotation. */
  contradictingClaimIdsAtAnnotation: readonly string[];
  /** True once `reopenIfContradicted` has found a fresh contradicting
   *  claim that was not in `contradictingClaimIdsAtAnnotation` — the
   *  annotation is retained for the record but no longer treated as
   *  current. */
  reopened: boolean;
}

export interface Hypothesis {
  /** Unique per call — includes the triggering shot's coordinates for a
   *  per-shot family, the dimensioned row's serialized dimensions for a
   *  per-dimension family (`par5_opportunity_loss` with real rows), or is
   *  a fixed string for a family with no per-shot/per-dimension identity
   *  (`short_bias`, or `par5_opportunity_loss` with zero rows). */
  id: string;
  family: HypothesisFamily;
  /** A function of `state` — see the module doc comment. Never implies
   *  causation and never says "proven." */
  description: string;
  state: HypothesisState;
  /** Every metric id / fact field this hypothesis's FULL evaluation
   *  depends on, whether or not it was available this call — a static,
   *  per-family list. Contrast with `missingInputs`, the subset actually
   *  absent this call. */
  prerequisites: string[];
  /** Claim ids (see `metricClaimId`/`shotClaimId`) that support this
   *  hypothesis. Always resolvable back to an element of the `metrics` or
   *  `facts` this call was given. Empty exactly when `state` is
   *  `'no_data'` (see the module doc comment on `recovery`). */
  supportingClaimIds: string[];
  /** Claim ids that contradict this hypothesis. A non-empty list always
   *  caps `state` at `'candidate'` — contradicted evidence never elevates. */
  contradictingClaimIds: string[];
  /** The subset of `prerequisites` that was not available this call. */
  missingInputs: string[];
  /** Non-null only when this hypothesis (or a sibling it competes with)
   *  can't yet be distinguished from another. */
  nextCheck: NextCheck | null;
  /** A coach's layered judgment — see {@link CoachAnnotation}. Absent
   *  unless `mergeCoachAnnotation` has been applied. */
  coachAnnotation?: CoachAnnotation;
}

// ---------------------------------------------------------------------------
// Claim ids — always resolvable back to an input element (tested).
// ---------------------------------------------------------------------------

/** Sort-stable serialization of a dimensions map — same content always
 *  produces the same string regardless of key insertion order. Empty (or
 *  omitted) dimensions serialize to `''`. */
function serializeDimensions(dimensions: Record<string, string | number> | undefined): string {
  if (!dimensions) return '';
  const keys = Object.keys(dimensions).sort();
  if (keys.length === 0) return '';
  return keys.map((k) => `${k}=${dimensions[k]}`).join(',');
}

/** `metricClaimId(id)` (no dimensions) names a metric FAMILY — used in
 *  `prerequisites`/`missingInputs`, which describe what a hypothesis
 *  depends on in general, not a specific row. `metricClaimId(id,
 *  row.dimensions)` names the SPECIFIC row a claim actually resolved
 *  against — used in `supportingClaimIds`/`contradictingClaimIds`. A row
 *  with empty dimensions produces the same bare id as the no-dimensions
 *  form, so an undimensioned metric (no real producer yet, or a
 *  single-row-per-call family) is unaffected. */
export function metricClaimId(metricId: string, dimensions?: Record<string, string | number>): string {
  const suffix = serializeDimensions(dimensions);
  return suffix ? `metric:${metricId}:${suffix}` : `metric:${metricId}`;
}

/** The fixed marker `shotClaimId` renders for an unknown hole/shot number
 *  — matches `ranking/situational-ranking.ts`'s own `UNKNOWN_SHOT_MARKER`
 *  (that module's doc comment names this exact fix as owed here; see
 *  repair-plan addendum §13 review notes, 2026-09-23). */
const UNKNOWN_SHOT_MARKER = 'unknown';

/** `hole_number`/`shot_number` are nullable only for non-DB inputs (a
 *  fixture, a future adapter) — real `golf_shots` rows always have both.
 *  Slice 1 rendered a missing field as the literal string `'null'`, which
 *  is silently wrong in two ways: it can't be told apart from `'unknown'`,
 *  and — the real bug — two DIFFERENT shots both missing a field would
 *  render identically. The fix here matches `situational-ranking.ts`'s
 *  own resolution of the exact same problem: any missing field renders to
 *  ONE fixed, shared marker (`shot:<round_id>:unknown:unknown`) rather
 *  than a per-shot-varying one. This is deliberate, not merely tolerated:
 *  a fixed marker is deterministic and pure (same input -> same id,
 *  always), and the id format then interoperates with
 *  `situational-ranking.ts`'s `IssueSourcePacket.sourceShotIds` without
 *  translation. It does mean two DIFFERENT unknown-numbered shots in the
 *  same round are indistinguishable by this id alone — a caller that
 *  needs to tell them apart (like `situational-ranking.ts`'s union-find)
 *  must special-case the marker itself, the same way that module already
 *  does, rather than expect this id to disambiguate for it. */
export function shotClaimId(shot: Pick<ShotFact, 'round_id' | 'hole_number' | 'shot_number'>): string {
  if (shot.hole_number === null || shot.shot_number === null) {
    return `shot:${shot.round_id}:${UNKNOWN_SHOT_MARKER}:${UNKNOWN_SHOT_MARKER}`;
  }
  return `shot:${shot.round_id}:${shot.hole_number}:${shot.shot_number}`;
}

/** Finds the metric row matching `metricId` and, when given, every key in
 *  `dimensions` (a partial match — the row may carry additional dimension
 *  keys beyond the ones named here). Omitting `dimensions` matches on
 *  `metricId` alone, for a family with no established per-call dimension
 *  concept yet (no real producer today). */
function findMetric(
  metrics: readonly MetricResult[],
  metricId: string,
  dimensions?: Record<string, string | number>,
): MetricResult | undefined {
  if (dimensions) {
    return metrics.find(
      (m) => m.metricId === metricId && Object.entries(dimensions).every(([k, v]) => m.dimensions[k] === v),
    );
  }
  return metrics.find((m) => m.metricId === metricId);
}

/**
 * The shared state rule every builder below applies to its own
 * (supportingClaimIds, contradictingClaimIds, elevates) result:
 *
 *   - a contradiction always wins over elevation, but a contradiction is
 *     itself real data, so it never reads as `'no_data'`;
 *   - `elevates` (this hypothesis's own corroboration condition was met,
 *     uncontradicted) reads `'supported_association'`;
 *   - no supporting claim at all (regardless of why) reads `'no_data'` —
 *     there is nothing here beyond a stated gap;
 *   - otherwise, a real supporting claim exists but isn't corroborated:
 *     `'candidate'`.
 */
function finalizeState(
  supportingClaimIds: readonly string[],
  contradictingClaimIds: readonly string[],
  elevates: boolean,
): HypothesisState {
  if (contradictingClaimIds.length > 0) return 'candidate';
  if (elevates) return 'supported_association';
  if (supportingClaimIds.length === 0) return 'no_data';
  return 'candidate';
}

// ---------------------------------------------------------------------------
// Family: short_bias — no metric producer exists today (see PR notes); this
// entry always reports the gap once there's an approach shot to speak of.
// ---------------------------------------------------------------------------

const SHORT_BIAS_METRIC_ID = 'approach_short_miss_rate';
/** Percent of misses long-side, at/above which the pattern supports a
 *  short bias — kept as one named constant so a future metric wiring
 *  changes one number, not scattered logic. */
const SHORT_BIAS_SUPPORT_MIN_PERCENT = 60;
/** Percent of misses long-side, at/below which the metric actively
 *  REFUTES a short bias (most misses are long-side, the opposite
 *  pattern) — a documented floor, not an inferred one. */
const SHORT_BIAS_REFUTE_MAX_PERCENT = 40;

function describeShortBias(state: HypothesisState): string {
  switch (state) {
    case 'no_data':
      return 'No data available on whether approach shots are biased short of the target — no ' +
        'metric measures a short/long miss split today.';
    case 'candidate':
      return 'A short/long miss-split metric is measured but does not clearly point either way, ' +
        'so a short-bias pattern is neither supported nor ruled out.';
    case 'supported_association':
      return 'Approach shots are associated with coming up short of the target more often than ' +
        'missing long, left, or right — a supported metric agrees with this pattern, though this ' +
        'is an association, not a causal claim.';
  }
}

function buildShortBiasHypothesis(
  metrics: readonly MetricResult[],
  facts: readonly ShotFact[],
): Hypothesis | null {
  if (!facts.some((f) => f.shot_type === 'approach')) return null;

  const metric = findMetric(metrics, SHORT_BIAS_METRIC_ID);
  const supportingClaimIds: string[] = [];
  const contradictingClaimIds: string[] = [];
  const missingInputs: string[] = [];
  let elevates = false;

  if (!metric) {
    missingInputs.push(metricClaimId(SHORT_BIAS_METRIC_ID));
  } else if (metric.status === 'supported' && metric.value !== null) {
    if (metric.value >= SHORT_BIAS_SUPPORT_MIN_PERCENT) {
      supportingClaimIds.push(metricClaimId(SHORT_BIAS_METRIC_ID));
      elevates = true;
    } else if (metric.value <= SHORT_BIAS_REFUTE_MAX_PERCENT) {
      contradictingClaimIds.push(metricClaimId(SHORT_BIAS_METRIC_ID));
    }
  }

  const state = finalizeState(supportingClaimIds, contradictingClaimIds, elevates);
  return {
    id: 'short_bias',
    family: 'short_bias',
    description: describeShortBias(state),
    state,
    prerequisites: [metricClaimId(SHORT_BIAS_METRIC_ID)],
    supportingClaimIds,
    contradictingClaimIds,
    missingInputs,
    nextCheck: null,
  };
}

// ---------------------------------------------------------------------------
// Families: rough_gap / recovery / insufficient — one entry per qualifying
// shot (shot_type 'approach', lie_before 'rough'), keyed off recorded
// intent.
// ---------------------------------------------------------------------------

/** Not a real producer today — names the GAP honestly, the same pattern
 *  short_bias/recovery already use for a real-but-absent signal, rather
 *  than naming the real `approach_measured_contribution` metric (an
 *  eligible-attempt COUNT, `distance-profile.ts`) as this family's
 *  corroborator: a count states evidence volume, never a signed direction,
 *  so citing it as "the rough-gap signal" — missing OR present — would be
 *  the same count-vs-signed-value conflation review flagged once already.
 *  A single metricId also cannot mean two different things (a count today,
 *  a signed strokes value if some future producer reused it) without
 *  corrupting every OTHER reader of `approach_measured_contribution`, so
 *  this is a genuinely distinct id, not an alias. Likely future producer:
 *  A4's `sequence-attribution.ts` `SequenceEvent.measuredContribution` (a
 *  genuinely signed, canonical-baseline strokes value), adapted to a
 *  `MetricResult` row under THIS id — that adapter is deliberately not
 *  built in this slice. */
const ROUGH_GAP_STROKES_METRIC_ID = 'approach_rough_gap_strokes_contribution';
/** A negative measured contribution means the shot cost more strokes than
 *  the canonical baseline expected — the direction `rough_gap` claims.
 *  Positive means the opposite — the direction that contradicts it. Zero
 *  is neither and elevates nothing. */
const ROUGH_GAP_UNDERPERFORM_THRESHOLD = 0;
const ROUGH_GAP_CONTRADICT_THRESHOLD = 0;
const RECOVERY_OUTCOME_METRIC_ID = 'approach_recovery_outcome_rate';

function isRoughApproach(shot: ShotFact): boolean {
  return shot.shot_type === 'approach' && (shot.lie_before ?? '').toLowerCase() === 'rough';
}

function describeRecovery(state: HypothesisState): string {
  switch (state) {
    case 'no_data':
      return 'This approach was an explicitly tagged recovery attempt from the rough. No metric ' +
        'measures a recovery-specific expected outcome today, so there is no data on whether this ' +
        'pattern is typical or unusual for this player.';
    case 'candidate':
      return 'This approach may be part of a recovery pattern from the rough, not yet corroborated.';
    case 'supported_association':
      return 'This approach is associated with a recovery pattern from the rough that a supported ' +
        'metric agrees with — an association, not a causal claim.';
  }
}

function buildRecoveryHypothesis(shot: ShotFact): Hypothesis {
  const claim = shotClaimId(shot);
  // Deliberately empty — see the module doc comment on why the triggering
  // shot's own tag is not cited as support for this family. No metric
  // exists today that could add to it either, so this is always 'no_data'.
  const supportingClaimIds: string[] = [];
  const contradictingClaimIds: string[] = [];
  const missingInputs = [metricClaimId(RECOVERY_OUTCOME_METRIC_ID)];
  const state = finalizeState(supportingClaimIds, contradictingClaimIds, false);
  return {
    id: `recovery:${claim}`,
    family: 'recovery',
    description: describeRecovery(state),
    state,
    prerequisites: ['fact:lie_before', 'fact:intent', metricClaimId(RECOVERY_OUTCOME_METRIC_ID)],
    supportingClaimIds,
    contradictingClaimIds,
    missingInputs,
    nextCheck: null,
  };
}

function describeRoughGap(state: HypothesisState): string {
  switch (state) {
    case 'no_data':
      // Unreachable today (the triggering shot is always a supporting
      // claim — see module doc comment) but kept exhaustive for the type.
      return 'No data available on whether go-for-green approaches from the rough underperform.';
    case 'candidate':
      return 'A deliberate go-for-green approach from the rough may be underperforming the ' +
        'canonical strokes-gained baseline for that lie and distance — not yet corroborated by a ' +
        'supported metric.';
    case 'supported_association':
      return 'A deliberate go-for-green approach from the rough is associated with underperforming ' +
        'the canonical strokes-gained baseline for that lie and distance — an association, not a ' +
        'causal claim.';
  }
}

function buildRoughGapHypothesis(shot: ShotFact, metrics: readonly MetricResult[]): Hypothesis {
  const claim = shotClaimId(shot);
  // Match the corroborating row to THIS shot's own distance band — the
  // real producer (distance-profile.ts) reports one row per band, not one
  // round-wide value, so an unfiltered lookup could silently corroborate
  // off a different band's evidence than the one this shot belongs to.
  //
  // Looked up under ROUGH_GAP_STROKES_METRIC_ID, not the real
  // `approach_measured_contribution` count metric — see that constant's
  // own doc comment for why a single id can't serve both meanings. Until a
  // future producer emits a row under this id, the lookup simply finds
  // nothing here, which is honestly "missing," not "present but
  // wrong-shaped."
  const band = bandOf(shot);
  const contribution = band ? findMetric(metrics, ROUGH_GAP_STROKES_METRIC_ID, { band }) : undefined;

  const supportingClaimIds = [claim];
  const contradictingClaimIds: string[] = [];
  const missingInputs: string[] = [];
  let elevates = false;

  // A row under ROUGH_GAP_STROKES_METRIC_ID would be a genuinely signed
  // strokes value by construction; the unit guard is a defensive honesty
  // check, not the load-bearing part — today no producer emits this id at
  // all, so `contribution` is always undefined and this always reports the
  // gap.
  if (!contribution || contribution.unit !== 'strokes') {
    missingInputs.push(metricClaimId(ROUGH_GAP_STROKES_METRIC_ID));
  } else if (contribution.status === 'supported' && contribution.value !== null) {
    if (contribution.value < ROUGH_GAP_UNDERPERFORM_THRESHOLD) {
      supportingClaimIds.push(metricClaimId(ROUGH_GAP_STROKES_METRIC_ID, contribution.dimensions));
      elevates = true;
    } else if (contribution.value > ROUGH_GAP_CONTRADICT_THRESHOLD) {
      contradictingClaimIds.push(metricClaimId(ROUGH_GAP_STROKES_METRIC_ID, contribution.dimensions));
    }
  }

  const state = finalizeState(supportingClaimIds, contradictingClaimIds, elevates);
  return {
    id: `rough_gap:${claim}`,
    family: 'rough_gap',
    description: describeRoughGap(state),
    state,
    prerequisites: ['fact:lie_before', 'fact:intent', metricClaimId(ROUGH_GAP_STROKES_METRIC_ID)],
    supportingClaimIds,
    contradictingClaimIds,
    missingInputs,
    nextCheck: null,
  };
}

function buildInsufficientIntentHypothesis(shot: ShotFact): Hypothesis {
  const claim = shotClaimId(shot);
  return {
    id: `insufficient_rough_lie_intent:${claim}`,
    family: 'insufficient',
    description:
      'An approach from the rough with no recorded shot intent — cannot distinguish a deliberate ' +
      "go-for-green attempt ('rough_gap') from an explicit recovery attempt ('recovery') without " +
      'it, so neither is named.',
    // The rough-lie approach itself is real, relevant data (something
    // worth flagging happened here) — just ambiguous which named family
    // it belongs to, which is why this stays 'candidate', not 'no_data'.
    state: 'candidate',
    prerequisites: ['fact:intent'],
    supportingClaimIds: [claim],
    contradictingClaimIds: [],
    missingInputs: ['fact:intent'],
    nextCheck: { distinguishes: ['rough_gap', 'recovery'], requires: 'fact:intent' },
  };
}

function isDistinguishingIntent(intent: ShotIntent): intent is 'go_for_green' | 'recovery' | 'layup' {
  return intent === 'go_for_green' || intent === 'recovery' || intent === 'layup';
}

function buildRoughLieHypotheses(
  metrics: readonly MetricResult[],
  facts: readonly ShotFact[],
): Hypothesis[] {
  const hypotheses: Hypothesis[] = [];
  for (const shot of facts) {
    if (!isRoughApproach(shot)) continue;
    if (!isDistinguishingIntent(shot.intent)) {
      hypotheses.push(buildInsufficientIntentHypothesis(shot));
      continue;
    }
    if (shot.intent === 'layup') continue; // neither family — a deliberate lay-up
    if (shot.intent === 'recovery') {
      hypotheses.push(buildRecoveryHypothesis(shot));
      continue;
    }
    hypotheses.push(buildRoughGapHypothesis(shot, metrics));
  }
  return hypotheses;
}

// ---------------------------------------------------------------------------
// Family: par5_opportunity_loss — metric-only (ShotFact carries no `par`,
// so this can never be derived from facts). Evaluated unconditionally: the
// caller already scopes `metrics` to the round/window in question, so an
// empty result there is itself informative.
// ---------------------------------------------------------------------------

const PAR5_OPPORTUNITY_METRIC_ID = 'par5_regulation_opportunity_rate';
const PAR5_GREEN_IN_TWO_METRIC_ID = 'par5_green_in_two_rate';
/** Percent; below this, the opportunity metric itself supports "a
 *  reachable scoring opportunity was not converted." */
const PAR5_OPPORTUNITY_LOSS_MAX_PERCENT = 50;
/** Percent; at/above this, green-in-two says the opportunity mostly WAS
 *  converted — the direction that contradicts "opportunity loss." */
const PAR5_GREEN_IN_TWO_CONTRADICT_MIN_PERCENT = 70;

function describePar5OpportunityLoss(state: HypothesisState): string {
  switch (state) {
    case 'no_data':
      return 'No data available on par-5 scoring-opportunity conversion for this round or window — ' +
        'the underlying metric was not provided.';
    case 'candidate':
      return 'This round may show a below-typical par-5 regulation/green-in-two conversion rate, ' +
        'not yet corroborated by a supported metric.';
    case 'supported_association':
      return 'This round is associated with a below-typical par-5 regulation/green-in-two ' +
        'conversion rate — a scoring opportunity this player usually reaches was not converted ' +
        'this time. An association, not a causal claim.';
  }
}

const PAR5_PREREQUISITES = [metricClaimId(PAR5_OPPORTUNITY_METRIC_ID), metricClaimId(PAR5_GREEN_IN_TWO_METRIC_ID)];

/** One hypothesis for a single dimensioned opportunity row (real call:
 *  one specific par-5 hole) — `greenInTwo`, when present, is the row
 *  sharing that SAME hole's dimensions, never an arbitrary other hole's. */
function par5HypothesisFor(opportunity: MetricResult | undefined, greenInTwo: MetricResult | undefined): Hypothesis {
  const supportingClaimIds: string[] = [];
  const contradictingClaimIds: string[] = [];
  const missingInputs: string[] = [];
  let elevates = false;

  if (!opportunity) {
    missingInputs.push(metricClaimId(PAR5_OPPORTUNITY_METRIC_ID));
  } else if (
    opportunity.status === 'supported' &&
    opportunity.value !== null &&
    opportunity.value < PAR5_OPPORTUNITY_LOSS_MAX_PERCENT
  ) {
    supportingClaimIds.push(metricClaimId(PAR5_OPPORTUNITY_METRIC_ID, opportunity.dimensions));
    elevates = true;
  }

  if (!greenInTwo) {
    if (opportunity) missingInputs.push(metricClaimId(PAR5_GREEN_IN_TWO_METRIC_ID));
  } else if (
    greenInTwo.status === 'supported' &&
    greenInTwo.value !== null &&
    greenInTwo.value >= PAR5_GREEN_IN_TWO_CONTRADICT_MIN_PERCENT
  ) {
    contradictingClaimIds.push(metricClaimId(PAR5_GREEN_IN_TWO_METRIC_ID, greenInTwo.dimensions));
  }

  const state = finalizeState(supportingClaimIds, contradictingClaimIds, elevates);
  const dimSuffix = serializeDimensions(opportunity?.dimensions);
  return {
    id: dimSuffix ? `par5_opportunity_loss:${dimSuffix}` : 'par5_opportunity_loss',
    family: 'par5_opportunity_loss',
    description: describePar5OpportunityLoss(state),
    state,
    prerequisites: PAR5_PREREQUISITES,
    supportingClaimIds,
    contradictingClaimIds,
    missingInputs,
    nextCheck: null,
  };
}

/** One `Hypothesis` PER dimensioned opportunity row — a real call can hand
 *  back several (one per par-5 hole played). Zero rows still produce the
 *  single aggregate `'no_data'` hypothesis (nothing to enumerate, but the
 *  gap itself is still worth stating). */
function buildPar5OpportunityHypotheses(metrics: readonly MetricResult[]): Hypothesis[] {
  const opportunityRows = metrics.filter((m) => m.metricId === PAR5_OPPORTUNITY_METRIC_ID);
  if (opportunityRows.length === 0) {
    return [par5HypothesisFor(undefined, findMetric(metrics, PAR5_GREEN_IN_TWO_METRIC_ID))];
  }
  return opportunityRows.map((opportunity) =>
    par5HypothesisFor(opportunity, findMetric(metrics, PAR5_GREEN_IN_TWO_METRIC_ID, opportunity.dimensions)),
  );
}

// ---------------------------------------------------------------------------

export function buildHypotheses(
  metrics: readonly MetricResult[],
  facts: readonly ShotFact[],
): Hypothesis[] {
  const hypotheses: Hypothesis[] = [];

  const shortBias = buildShortBiasHypothesis(metrics, facts);
  if (shortBias) hypotheses.push(shortBias);

  hypotheses.push(...buildRoughLieHypotheses(metrics, facts));

  hypotheses.push(...buildPar5OpportunityHypotheses(metrics));

  return hypotheses;
}

// ---------------------------------------------------------------------------
// Coach annotation (addendum §8.3) — pure, additive layering. Neither
// function reads or changes `state`/`description`/`prerequisites`/
// `supportingClaimIds`/`contradictingClaimIds`/`missingInputs`/`nextCheck`;
// a coach's judgment never overwrites the evidence, and there is no
// `'causal'` state for an annotation to upgrade a hypothesis to.
// ---------------------------------------------------------------------------

/**
 * Attach a coach's annotation to a hypothesis. Pure: no clock, no IO — the
 * caller supplies `date`. Snapshots `supportingClaimIds`/
 * `contradictingClaimIds` at the moment of annotation (for
 * `reopenIfContradicted` to later compare against); does not touch any
 * other field on `hypothesis`.
 */
export function mergeCoachAnnotation(
  hypothesis: Hypothesis,
  annotation: { author: string; date: string; note: string },
): Hypothesis {
  return {
    ...hypothesis,
    coachAnnotation: {
      author: annotation.author,
      date: annotation.date,
      note: annotation.note,
      supportingClaimIdsAtAnnotation: [...hypothesis.supportingClaimIds],
      contradictingClaimIdsAtAnnotation: [...hypothesis.contradictingClaimIds],
      reopened: false,
    },
  };
}

/**
 * Per addendum §8.3: "On future contradictory evidence, reopen the
 * explanation instead of silently preserving certainty." Compares a
 * freshly rebuilt hypothesis (same id, latest `metrics`/`facts`) against
 * the CONTRADICTING claim ids the coach's annotation was made against.
 *
 * Claim ids name a row, not a direction — the same undimensioned id can
 * appear in `supportingClaimIds` for one call and `contradictingClaimIds`
 * for another (e.g. `short_bias`'s single metric flipping sides), so a
 * flip must be detected against the CONTRADICTING snapshot specifically,
 * never a union of both — a claim that was supporting at annotation time
 * and is contradicting now must count as new contradicting evidence.
 *
 * No new contradicting claim: the annotation carries forward onto `fresh`
 * unchanged (still `reopened: false`) — every other field comes from
 * `fresh`, so `missingInputs`/etc. stay current even while the annotation
 * holds. A new contradicting claim: `reopened` flips to `true` on the
 * SAME annotation object (author/date/note/snapshot retained for the
 * record, per §8.3) — `fresh`'s own `state`/`description` pass through
 * untouched; this function never re-derives or downgrades them itself.
 */
export function reopenIfContradicted(annotated: Hypothesis, fresh: Hypothesis): Hypothesis {
  if (!annotated.coachAnnotation) return fresh;
  const knownContradicting = new Set(annotated.coachAnnotation.contradictingClaimIdsAtAnnotation);
  const hasNewContradiction = fresh.contradictingClaimIds.some((c) => !knownContradicting.has(c));
  if (!hasNewContradiction) {
    return { ...fresh, coachAnnotation: annotated.coachAnnotation };
  }
  return {
    ...fresh,
    coachAnnotation: { ...annotated.coachAnnotation, reopened: true },
  };
}
