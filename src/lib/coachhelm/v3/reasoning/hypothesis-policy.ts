/**
 * Controlled-hypothesis pure core (repair-plan addendum §13, work package
 * A5, slice 1). Depends on A1's `ShotFact` (`context/types.ts`) and a
 * metric-result shape adapted from A2/A3's shared contract.
 *
 * `buildHypotheses(metrics, facts)` proposes a small, NAMED set of
 * candidate explanations for a round's shot data — never a fabricated
 * cause, never a psychological/fatigue/mechanical inference. Every
 * hypothesis states what it depends on (`prerequisites`), which of those
 * were actually available (the gap is `missingInputs`), which concrete
 * inputs support or contradict it (`supportingClaimIds` /
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
 * `'candidate'` — the floor: named, but not yet corroborated by a metric
 * this module trusts, or actively contradicted. `'supported_association'`
 * — a metric with `status === 'supported'` points the same direction as
 * the hypothesis, and nothing contradicts it; this is an ASSOCIATION, not
 * a causal claim. `'coach_annotated'` is reachable only once a coach has
 * reviewed a hypothesis (personal-context.ts, slice 2) — nothing in this
 * module can produce it, and it is kept in the union only so the type is
 * stable across both slices. There is deliberately no `'proven'` state:
 * this module never claims that.
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

export type HypothesisState = 'candidate' | 'supported_association' | 'coach_annotated';

/** What further input would tell `distinguishes` (two or more hypothesis
 *  ids/families that read the same today) apart, and what that input is —
 *  a `metric:<metricId>` claim id or a `fact:<field>` name. */
export interface NextCheck {
  distinguishes: string[];
  requires: string;
}

export interface Hypothesis {
  /** Unique per call — includes the triggering shot's coordinates for a
   *  per-shot family, or is a fixed string for a per-round family. */
  id: string;
  /** One of the four named registry families, or `'insufficient'` for an
   *  entry that names competing families instead of picking one. */
  family: 'short_bias' | 'rough_gap' | 'recovery' | 'par5_opportunity_loss' | 'insufficient';
  description: string;
  state: HypothesisState;
  /** Every metric id / fact field this hypothesis's FULL evaluation
   *  depends on, whether or not it was available this call — a static,
   *  per-family list. Contrast with `missingInputs`, the subset actually
   *  absent this call. */
  prerequisites: string[];
  /** Claim ids (see `metricClaimId`/`shotClaimId`) that support this
   *  hypothesis. Always resolvable back to an element of the `metrics` or
   *  `facts` this call was given. */
  supportingClaimIds: string[];
  /** Claim ids that contradict this hypothesis. A non-empty list always
   *  caps `state` at `'candidate'` — contradicted evidence never elevates. */
  contradictingClaimIds: string[];
  /** The subset of `prerequisites` that was not available this call. A
   *  hypothesis with no supporting or contradicting claims and a non-empty
   *  `missingInputs` is this module's way of saying "no hypothesis" while
   *  still stating what's missing, per this slice's assignment — nothing
   *  is silently omitted. */
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

// ---------------------------------------------------------------------------
// Family: short_bias — no metric producer exists today (see PR notes); this
// entry always reports the gap once there's an approach shot to speak of.
// ---------------------------------------------------------------------------

const SHORT_BIAS_METRIC_ID = 'approach_short_miss_rate';
/** Percent of misses long-side, at/above which the pattern flips from
 *  "short-biased" to "not short-biased" — kept as one named constant so a
 *  future metric wiring changes one number, not scattered logic. */
const SHORT_BIAS_MIN_PERCENT = 60;

function buildShortBiasHypothesis(
  metrics: readonly MetricResultInput[],
  facts: readonly ShotFact[],
): Hypothesis | null {
  if (!facts.some((f) => f.shot_type === 'approach')) return null;

  const metric = findMetric(metrics, SHORT_BIAS_METRIC_ID);
  const supportingClaimIds: string[] = [];
  const missingInputs: string[] = [];
  let state: HypothesisState = 'candidate';

  if (!metric) {
    missingInputs.push(metricClaimId(SHORT_BIAS_METRIC_ID));
  } else if (metric.status === 'supported' && metric.value !== null) {
    if (metric.value >= SHORT_BIAS_MIN_PERCENT) {
      supportingClaimIds.push(metricClaimId(SHORT_BIAS_METRIC_ID));
      state = 'supported_association';
    }
  }

  return {
    id: 'short_bias',
    family: 'short_bias',
    description:
      'Approach shots are consistently coming up short of the target, rather than missing long, ' +
      'left, or right without a consistent pattern.',
    state,
    prerequisites: [metricClaimId(SHORT_BIAS_METRIC_ID)],
    supportingClaimIds,
    contradictingClaimIds: [],
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

function isRoughApproach(shot: ShotFact): boolean {
  return shot.shot_type === 'approach' && (shot.lie_before ?? '').toLowerCase() === 'rough';
}

function buildRecoveryHypothesis(shot: ShotFact): Hypothesis {
  const claim = shotClaimId(shot);
  return {
    id: `recovery:${claim}`,
    family: 'recovery',
    description:
      'This approach was an explicitly tagged recovery attempt from the rough, not a full ' +
      'go-for-green attempt — a deliberately different shot, not a missed one.',
    state: 'candidate',
    // No metric today measures a recovery-specific expected outcome, so
    // this can never rise past 'candidate' — see missingInputs.
    prerequisites: ['fact:lie_before', 'fact:intent', metricClaimId('approach_recovery_outcome_rate')],
    supportingClaimIds: [claim],
    contradictingClaimIds: [],
    missingInputs: [metricClaimId('approach_recovery_outcome_rate')],
    nextCheck: null,
  };
}

function buildRoughGapHypothesis(shot: ShotFact, metrics: readonly MetricResultInput[]): Hypothesis {
  const claim = shotClaimId(shot);
  const contribution = findMetric(metrics, ROUGH_GAP_METRIC_ID);

  const supportingClaimIds = [claim];
  const contradictingClaimIds: string[] = [];
  const missingInputs: string[] = [];
  let state: HypothesisState = 'candidate';

  if (!contribution) {
    missingInputs.push(metricClaimId(ROUGH_GAP_METRIC_ID));
  } else if (contribution.status === 'supported' && contribution.value !== null) {
    if (contribution.value < ROUGH_GAP_UNDERPERFORM_THRESHOLD) {
      supportingClaimIds.push(metricClaimId(ROUGH_GAP_METRIC_ID));
      state = 'supported_association';
    } else if (contribution.value > ROUGH_GAP_CONTRADICT_THRESHOLD) {
      contradictingClaimIds.push(metricClaimId(ROUGH_GAP_METRIC_ID));
    }
  }
  // Contradicted evidence always caps state — never elevated past candidate.
  if (contradictingClaimIds.length > 0) state = 'candidate';

  return {
    id: `rough_gap:${claim}`,
    family: 'rough_gap',
    description:
      'A deliberate go-for-green approach from the rough is underperforming the canonical ' +
      'strokes-gained baseline for that lie and distance.',
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
    state: 'candidate',
    prerequisites: ['fact:intent'],
    supportingClaimIds: [],
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

function buildPar5OpportunityHypothesis(metrics: readonly MetricResultInput[]): Hypothesis {
  const opportunity = findMetric(metrics, PAR5_OPPORTUNITY_METRIC_ID);
  const greenInTwo = findMetric(metrics, PAR5_GREEN_IN_TWO_METRIC_ID);

  const supportingClaimIds: string[] = [];
  const contradictingClaimIds: string[] = [];
  const missingInputs: string[] = [];
  let state: HypothesisState = 'candidate';

  if (!opportunity) {
    missingInputs.push(metricClaimId(PAR5_OPPORTUNITY_METRIC_ID));
  } else if (
    opportunity.status === 'supported' &&
    opportunity.value !== null &&
    opportunity.value < PAR5_OPPORTUNITY_LOSS_MAX_PERCENT
  ) {
    supportingClaimIds.push(metricClaimId(PAR5_OPPORTUNITY_METRIC_ID));
    state = 'supported_association';
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
  if (contradictingClaimIds.length > 0) state = 'candidate';

  return {
    id: 'par5_opportunity_loss',
    family: 'par5_opportunity_loss',
    description:
      'The round shows a below-typical par-5 regulation/green-in-two conversion rate — a scoring ' +
      'opportunity this player usually reaches was not converted this time.',
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
