/**
 * Personal context — goal/focus-area hints for hypothesis check-selection
 * and priority (addendum §8.3 follow-on; owner decision 2026-09-23: a
 * code-level mapping table, not a DB table — see
 * `docs/architecture/coachhelm-evidence-contract.md`'s Package 8 /
 * personal-context section).
 *
 * `resolvePersonalContextHints(goals, focusAreas)` is pure: it takes
 * ALREADY-LOADED goals and focus areas (the caller owns fetching, via
 * `goals/loader.ts` and whatever loads `PlayerFocusArea`) and returns, per
 * `HypothesisFamily`, whether a player's own stated goals make that family
 * worth prioritizing. It never receives, reads, or derives a
 * `MetricResult`, and never touches a `Hypothesis`'s `state`, evidence
 * arrays, or `description` — this is a separate, additive overlay a caller
 * may join against `buildHypotheses`' output by family, not a rewrite of
 * the evidence itself.
 *
 * ## What "check-selection and priority" means here
 * This module emits exactly one signal per family: PRESENT in the result
 * means "the player has an active goal or focus area in this family's
 * domain — prioritize resolving it." There is no separate 'default' value
 * and no boolean/enum that can be false — a family with nothing behind it
 * is simply absent from the result (the same "no state without a
 * producer" reasoning `hypothesis-policy.ts` already applies to
 * `'coach_annotated'`). "Check-selection" is not a second field: this
 * module has no visibility into a family's `missingInputs`/`nextCheck`
 * (those live on the `Hypothesis` object, built from `MetricResult`s this
 * module never sees) — a caller joins its own `buildHypotheses` output
 * against this result's keys and reads `missingInputs`/`nextCheck` from
 * there for the specific next check. This module only answers "which
 * families does the player's own goal-setting say to look at first."
 *
 * ## The mapping table
 * `Goal.metric_id` (a registered v3 `MetricId`, `metrics/registry.ts`) and
 * `FocusAreaCategory` (`insight-types.ts`) are a genuinely different
 * vocabulary from this module's own metric ids
 * (`approach_short_miss_rate`, `approach_rough_gap_strokes_contribution`,
 * `approach_recovery_outcome_rate`, `par5_regulation_opportunity_rate`,
 * `par5_green_in_two_rate`) — see the evidence-contract doc's earlier "no
 * shared vocabulary" finding. Every entry below is therefore a judgment
 * call about whether a `MetricId`/`FocusAreaCategory` and a
 * `HypothesisFamily` measure the SAME underlying thing (same holes, same
 * shot situation), not a shared word. Checked against every registered
 * `MetricId` and every `FocusAreaCategory`, exactly one honest entry
 * exists today:
 *
 *  - `scoring_par_5` -> `par5_opportunity_loss`: the same set of holes.
 *    `scoring_par_5` is the coarse scoring average across them;
 *    `par5_regulation_opportunity_rate`/`par5_green_in_two_rate` are the
 *    conversion-rate breakdown of that same outcome. A goal to move the
 *    aggregate is a goal about the exact thing this family investigates.
 *
 * Considered and deliberately excluded — not a silent omission:
 *  - `sg_approach` (MetricId): a real approach-strokes-gained aggregate,
 *    but it cannot distinguish `short_bias` (miss direction) from
 *    `rough_gap` (rough-specific contribution) — either pick would be
 *    arbitrary, not honest.
 *  - `gir_pct` (MetricId): greens in regulation across ALL par types, not
 *    par-5-specific — mapping it to `par5_opportunity_loss` would misstate
 *    a broad metric as a narrow one.
 *  - `scrambling_pct_rough`/`scrambling_pct_sand`/`scrambling_pct_fairway`
 *    (MetricId) and `short_game` (FocusAreaCategory): these are all
 *    `shot_type: 'around_green'` (chipping/pitching/sand — `context/
 *    types.ts`'s `ShotType`). `recovery` fires only on `shot_type:
 *    'approach'` with `intent: 'recovery'` — an approach-shot decision
 *    (punch out vs. go for it), not a short-game shot at all. The shared
 *    word "recovery"/"rough" is not a shared measurement domain.
 *  - `scoring_par_3`/`scoring_par_4` (MetricId), `putts_made_*_pct`/
 *    `putt_miss_bias_*_pct`/`sg_putting` (MetricId), `sg_total`/`sg_ott`/
 *    `sg_around_green` (MetricId), `penalty_rate_per_round`/
 *    `big_number_rate` (MetricId): no family in this module touches
 *    driving, putting, or general round-level risk at all.
 *  - `practice_tournament_delta`/`opening_hole_delta` (MetricId): exactly
 *    the pressure/nerves framing `hypothesis-policy.ts`'s own module doc
 *    already refuses to encode as a hypothesis (its banned-terms test
 *    scans for `pressure`/`confidence`/similar).
 *  - `ball_striking`, `putting`, `course_management`, `mental_game`,
 *    `tournament_performance` (FocusAreaCategory): `ball_striking`
 *    splits the same way `sg_approach` does (plus driving, which no
 *    family covers); the rest have no family in this module's domain.
 *
 * `FOCUS_AREA_TO_FAMILY` is therefore empty today. It stays as an
 * explicit, typed table (not omitted) so the shape is ready for a future
 * honest entry, and `ACTIVE_FOCUS_AREA_STATUSES` filtering is exercised by
 * a test asserting every category still resolves to nothing — an
 * intentional, checked gap, not dead code nobody noticed.
 *
 * Interventions are out of scope: no "Intervention" type or loader exists
 * anywhere in the codebase (checked against `development.ts`, 1968 lines,
 * zero hits for "intervention").
 */

import type { HypothesisFamily } from './hypothesis-policy';
import type { Goal, GoalState } from '../goals/types';
import type { MetricId } from '../metrics/registry';
import type { FocusAreaCategory, FocusAreaStatus, PlayerFocusArea } from '../../insight-types';

/** Every family this module can ever name — `'insufficient'` names
 *  competing hypotheses, not a player-goal target, so it is excluded at
 *  the type level, not by convention. */
type MappableFamily = Exclude<HypothesisFamily, 'insufficient'>;

interface FamilyMapping {
  family: MappableFamily;
  /** Why this MetricId/FocusAreaCategory and this family measure the same
   *  underlying thing — required so a future entry can't be added without
   *  stating its reasoning, the same discipline the module doc above
   *  applies to every entry and every exclusion. */
  rationale: string;
}

const GOAL_METRIC_TO_FAMILY: Partial<Record<MetricId, FamilyMapping>> = {
  scoring_par_5: {
    family: 'par5_opportunity_loss',
    rationale:
      'Same set of holes: scoring_par_5 is the coarse scoring average across them; ' +
      "par5_opportunity_loss's own metrics are the conversion-rate breakdown of that same outcome.",
  },
};

// Empty by design — see module doc's exclusion list. Kept typed (not
// omitted) so the shape is ready for the next honest entry; it's still
// read on every call below, exercised by a test asserting every category
// resolves to nothing.
const FOCUS_AREA_TO_FAMILY: Partial<Record<FocusAreaCategory, FamilyMapping>> = {};

/** Only an actively-pursued goal should raise a family's priority.
 *  `pending_baseline` deliberately does NOT count — there is no baseline
 *  yet to check against. `paused`/`achieved`/`missed`/`partial`/
 *  `abandoned` are all non-current for the same reason: none describe a
 *  goal the player is live on right now. */
const ACTIVE_GOAL_STATES: readonly GoalState[] = ['active'];

/** `active`/`in_progress` are both a live, current focus area;
 *  `improved`/`archived` are resolved or inactive. */
const ACTIVE_FOCUS_AREA_STATUSES: readonly FocusAreaStatus[] = ['active', 'in_progress'];

export interface FamilyHint {
  family: MappableFamily;
  /** `goal:<id>` / `focus_area:<id>` attribution for why this family's
   *  priority was raised — never a MetricResult or claim id; this is not
   *  evidence, it is provenance for a priority decision. Multiple sources
   *  for the same family accumulate here rather than overwriting one
   *  another. */
  reasons: readonly string[];
}

/** Keyed by family; presence is the only signal (see module doc). */
export type PersonalContextHints = Partial<Record<MappableFamily, FamilyHint>>;

function addHint(hints: Map<MappableFamily, FamilyHint>, family: MappableFamily, reason: string): void {
  const existing = hints.get(family);
  if (existing) {
    hints.set(family, { family, reasons: [...existing.reasons, reason] });
    return;
  }
  hints.set(family, { family, reasons: [reason] });
}

/**
 * Resolve check-selection/priority hints from a player's already-loaded
 * goals and focus areas. Fetches nothing, reads no `MetricResult`, and
 * never mutates its inputs.
 */
export function resolvePersonalContextHints(
  goals: readonly Goal[],
  focusAreas: readonly PlayerFocusArea[],
): PersonalContextHints {
  const hints = new Map<MappableFamily, FamilyHint>();

  for (const goal of goals) {
    if (!ACTIVE_GOAL_STATES.includes(goal.state)) continue;
    const mapping = GOAL_METRIC_TO_FAMILY[goal.metric_id];
    if (!mapping) continue;
    addHint(hints, mapping.family, `goal:${goal.id}`);
  }

  for (const area of focusAreas) {
    if (!ACTIVE_FOCUS_AREA_STATUSES.includes(area.status)) continue;
    const mapping = FOCUS_AREA_TO_FAMILY[area.category];
    if (!mapping) continue;
    addHint(hints, mapping.family, `focus_area:${area.id}`);
  }

  return Object.fromEntries(hints) as PersonalContextHints;
}
