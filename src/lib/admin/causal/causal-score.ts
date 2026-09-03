/**
 * Causal confidence — explainable components, computed, never self-reported.
 *
 * `docs/ai-system/CONTROL_PLANE_IMPLEMENTATION_PLAN_2026-09-03.md` §6 J.4.3.
 * `src/lib/admin/rca.ts`'s `confidence` field today is the MODEL'S OWN
 * self-report ("how sure am I"), not a computed fact. This module is the
 * computed alternative for a narrower, sharper question than RCA's
 * "what's the root cause": "how much evidence connects THIS incident to
 * THIS specific candidate cause" — scored from independent components, each
 * either evidenced (a number in [0, 1]) or `null` ("no evidence for this
 * component" — never coerced to 0, which would silently claim "checked,
 * found none").
 *
 * PURE. No I/O, no clock, no model call — every component score arrives
 * pre-computed from a caller that owns the actual evidence gathering.
 *
 * WHY THIS NEVER DUPLICATES `release-context.ts`. That module's
 * `classifyReleaseRelationship` already answers ONE of these four
 * components — "did this incident begin because of a specific release" —
 * with its own capped-at-0.95, "never 1.0 from any combination" discipline.
 * `deriveTemporalComponent` below WRAPS its output rather than re-deriving
 * release-timing logic here.
 *
 * WHY CONFIDENCE IS DIVIDED BY THE TOTAL COMPONENT COUNT, NOT JUST THE
 * EVIDENCED ONES. Risk scoring (`release-intel/risk-score.ts`) biases an
 * unknown input UPWARD, because under-scoring a real R3 change is the
 * dangerous direction there. Causal confidence is the OPPOSITE risk: an
 * over-confident "LIKELY CAUSE" from one strong signal and three unchecked
 * components is the dangerous direction here, per §J.4.3's own instruction
 * to never cross into causal language on thin evidence. Averaging over the
 * total (not the evidenced subset) means a single maxed-out component can
 * never alone produce a high score — the same "never 1.0 from one signal"
 * discipline `classifyReleaseRelationship` already applies, generalized to
 * four components instead of one.
 */

import type {
  ReleaseRelationship,
  ReleaseRelationshipVerdict,
} from '@/lib/admin/incidents/release-context';

export type CausalComponentName =
  | 'temporal'
  | 'stack_overlap'
  | 'changed_feature_overlap'
  | 'historical_mechanism_match';

export interface CausalComponentScore {
  name: CausalComponentName;
  /** `[0, 1]`, or `null` when this component has no evidence to offer —
   *  never `0` for "unknown", which this module's callers must not confuse
   *  with "checked, found nothing" (a real `0`, e.g. zero stack-frame
   *  overlap actually measured). */
  score: number | null;
  detail: string;
}

export type CausalLabel = 'likely-cause' | 'unknown';

export interface CausalScoreResult {
  label: CausalLabel;
  /** Present only when `label === 'likely-cause'`. Capped below 1 — this
   *  module never asserts a confirmed cause; §J.4.3: "never 'CAUSE' until a
   *  replay (Phase G) actually reproduces it." */
  confidence: number | null;
  components: readonly CausalComponentScore[];
}

const MAX_CONFIDENCE = 0.95;
/** Only a genuinely near-zero average reads as "no real signal" rather than
 *  "a weak positive" — this keeps a single component scoring exactly 0 (a
 *  real, measured absence, e.g. zero stack overlap) from moving the label to
 *  `'likely-cause'` at a confidence of literally 0. */
const MIN_LABELED_CONFIDENCE = 0.01;

/** The RELATIONSHIP KINDS this module treats as evidence FOR a specific
 *  release causing an incident. `existed-before-release` and
 *  `improved-after-release` are evidence AGAINST it; `no-causal-signal` and
 *  `unknown` are simply no evidence — none of the four contribute a
 *  positive temporal score. */
const CAUSAL_RELATIONSHIPS: ReadonlySet<ReleaseRelationship> = new Set([
  'new-after-release',
  'regressed-after-release',
]);

/**
 * Wraps `classifyReleaseRelationship`'s verdict as this module's `temporal`
 * component, instead of re-deriving release-timing logic. `null` when the
 * relationship itself carries no evidence FOR this specific release being
 * the cause (including when it is evidence AGAINST it, or genuinely
 * unknown) — this module has no "negative evidence" component type, so a
 * disconfirming relationship is honestly represented as "nothing to add
 * here" rather than as a fabricated negative score.
 */
export function deriveTemporalComponent(verdict: ReleaseRelationshipVerdict): CausalComponentScore {
  if (!CAUSAL_RELATIONSHIPS.has(verdict.relationship)) {
    return {
      name: 'temporal',
      score: null,
      detail: `Release-relationship classifier returned '${verdict.relationship}' — no temporal evidence for this specific release causing the incident.`,
    };
  }
  return {
    name: 'temporal',
    score: verdict.confidence,
    detail: `Release-relationship classifier: '${verdict.relationship}' at confidence ${verdict.confidence.toFixed(2)}.`,
  };
}

/**
 * `computeCausalScore` composes independently-scored components (each
 * caller-supplied — see `deriveTemporalComponent` for the one this module
 * derives itself) into one confidence figure. `components` must always be
 * called with the SAME four-component list, in a consistent order, across
 * every call site — this function has no way to detect a caller silently
 * omitting a component (which would look identical to "this component was
 * checked and found no evidence"), so that discipline is the caller's, not
 * this pure function's.
 */
export function computeCausalScore(components: readonly CausalComponentScore[]): CausalScoreResult {
  if (components.length === 0) {
    return { label: 'unknown', confidence: null, components };
  }

  const evidenced = components.filter(
    (c): c is CausalComponentScore & { score: number } => c.score !== null,
  );

  if (evidenced.length === 0) {
    return { label: 'unknown', confidence: null, components };
  }

  const sum = evidenced.reduce((acc, c) => acc + c.score, 0);
  const raw = sum / components.length;
  const confidence = Math.min(raw, MAX_CONFIDENCE);

  if (confidence < MIN_LABELED_CONFIDENCE) {
    return { label: 'unknown', confidence: null, components };
  }

  return { label: 'likely-cause', confidence, components };
}
