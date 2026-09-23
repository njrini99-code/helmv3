/**
 * Controlled-hypothesis pure core (repair-plan addendum §13, work package
 * A5, slice 1). Depends on A1's `ShotFact` (`context/types.ts`) and a
 * metric-result shape adapted from A2/A3's shared contract.
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
 * `MetricResultInput` below is a structural subset of the shared
 * `MetricResult` landing in `../metrics/types.ts` via #1990 (not merged to
 * `main` as of this slice) — same field names (`metricId`, `value`,
 * `status`), so swapping the import is a one-line change, not a refactor.
 * TODO(#1990): `import type { MetricResult } from '../metrics/types'` and
 * drop this local type once that lands.
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
 * causal claim. `'coach_annotated'` is reachable only once a coach has
 * reviewed a hypothesis (personal-context.ts, slice 2) — nothing in this
 * module can produce it, and it is kept in the union only so the type is
 * stable across both slices. There is deliberately no `'proven'` state:
 * this module never claims that.
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
 * context on its own, and a real corroborating metric, `approach_
 * measured_contribution` from A2, exists and could land in a future
 * call), so `rough_gap` without its metric is `'candidate'`, never
 * `'no_data'`. `recovery` deliberately does NOT cite its own triggering
 * shot as support: no metric measures a recovery-specific expected
 * outcome today, and citing the tag that TRIGGERED the hypothesis as
 * evidence FOR it would be circular. `recovery` is therefore always
 * `'no_data'` in this slice (its `id` still carries the triggering shot's
 * coordinates for traceability).
 */

import type { ShotFact, ShotIntent } from '../context/types';

// ---------------------------------------------------------------------------
// Metric input (structural MetricResult subset — see module doc comment)
// ---------------------------------------------------------------------------

export type MetricStatusInput = 'supported' | 'descriptive_only' | 'insufficient' | 'invalid';

export interface MetricResultInput {
  metricId: string;
  value: number | null;
  status: MetricStatusInput;
}

// ---------------------------------------------------------------------------
// Hypothesis shape
// ---------------------------------------------------------------------------

export type HypothesisState = 'no_data' | 'candidate' | 'supported_association' | 'coach_annotated';

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

export interface Hypothesis {
  /** Unique per call — includes the triggering shot's coordinates for a
   *  per-shot family, or is a fixed string for a per-round family. */
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
}

// ---------------------------------------------------------------------------
// Claim ids — always resolvable back to an input element (tested).
// ---------------------------------------------------------------------------

export function metricClaimId(metricId: string): string {
  return `metric:${metricId}`;
}

export function shotClaimId(shot: Pick<ShotFact, 'round_id' | 'hole_number' | 'shot_number'>): string {
  return `shot:${shot.round_id}:${shot.hole_number ?? 'null'}:${shot.shot_number ?? 'null'}`;
}

function findMetric(
  metrics: readonly MetricResultInput[],
  metricId: string,
): MetricResultInput | undefined {
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
    case 'coach_annotated':
      return 'A coach has reviewed the short-bias pattern for this player.';
  }
}

function buildShortBiasHypothesis(
  metrics: readonly MetricResultInput[],
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

const ROUGH_GAP_METRIC_ID = 'approach_measured_contribution';
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
    case 'coach_annotated':
      return 'A coach has reviewed this recovery attempt.';
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
    case 'coach_annotated':
      return 'A coach has reviewed this rough-approach pattern.';
  }
}

function buildRoughGapHypothesis(shot: ShotFact, metrics: readonly MetricResultInput[]): Hypothesis {
  const claim = shotClaimId(shot);
  const contribution = findMetric(metrics, ROUGH_GAP_METRIC_ID);

  const supportingClaimIds = [claim];
  const contradictingClaimIds: string[] = [];
  const missingInputs: string[] = [];
  let elevates = false;

  if (!contribution) {
    missingInputs.push(metricClaimId(ROUGH_GAP_METRIC_ID));
  } else if (contribution.status === 'supported' && contribution.value !== null) {
    if (contribution.value < ROUGH_GAP_UNDERPERFORM_THRESHOLD) {
      supportingClaimIds.push(metricClaimId(ROUGH_GAP_METRIC_ID));
      elevates = true;
    } else if (contribution.value > ROUGH_GAP_CONTRADICT_THRESHOLD) {
      contradictingClaimIds.push(metricClaimId(ROUGH_GAP_METRIC_ID));
    }
  }

  const state = finalizeState(supportingClaimIds, contradictingClaimIds, elevates);
  return {
    id: `rough_gap:${claim}`,
    family: 'rough_gap',
    description: describeRoughGap(state),
    state,
    prerequisites: ['fact:lie_before', 'fact:intent', metricClaimId(ROUGH_GAP_METRIC_ID)],
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
  metrics: readonly MetricResultInput[],
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
    case 'coach_annotated':
      return 'A coach has reviewed this par-5 opportunity pattern.';
  }
}

function buildPar5OpportunityHypothesis(metrics: readonly MetricResultInput[]): Hypothesis {
  const opportunity = findMetric(metrics, PAR5_OPPORTUNITY_METRIC_ID);
  const greenInTwo = findMetric(metrics, PAR5_GREEN_IN_TWO_METRIC_ID);

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
    supportingClaimIds.push(metricClaimId(PAR5_OPPORTUNITY_METRIC_ID));
    elevates = true;
  }

  if (!greenInTwo) {
    if (opportunity) missingInputs.push(metricClaimId(PAR5_GREEN_IN_TWO_METRIC_ID));
  } else if (
    greenInTwo.status === 'supported' &&
    greenInTwo.value !== null &&
    greenInTwo.value >= PAR5_GREEN_IN_TWO_CONTRADICT_MIN_PERCENT
  ) {
    contradictingClaimIds.push(metricClaimId(PAR5_GREEN_IN_TWO_METRIC_ID));
  }

  const state = finalizeState(supportingClaimIds, contradictingClaimIds, elevates);
  return {
    id: 'par5_opportunity_loss',
    family: 'par5_opportunity_loss',
    description: describePar5OpportunityLoss(state),
    state,
    prerequisites: [metricClaimId(PAR5_OPPORTUNITY_METRIC_ID), metricClaimId(PAR5_GREEN_IN_TWO_METRIC_ID)],
    supportingClaimIds,
    contradictingClaimIds,
    missingInputs,
    nextCheck: null,
  };
}

// ---------------------------------------------------------------------------

export function buildHypotheses(
  metrics: readonly MetricResultInput[],
  facts: readonly ShotFact[],
): Hypothesis[] {
  const hypotheses: Hypothesis[] = [];

  const shortBias = buildShortBiasHypothesis(metrics, facts);
  if (shortBias) hypotheses.push(shortBias);

  hypotheses.push(...buildRoughLieHypotheses(metrics, facts));

  hypotheses.push(buildPar5OpportunityHypothesis(metrics));

  return hypotheses;
}
