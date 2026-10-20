/**
 * v3 Qualifying selection state machine (W29).
 *
 * Pure functions. open → scoring → closed → selected is the only
 * forward direction. No reverse, no skipping. The state column has a
 * CHECK constraint on the same enum at the DB level (Migration A).
 */

import {
  QUALIFIER_SELECTION_STATES,
  type QualifierSelectionState,
  type SelectionCandidate,
} from './types';

const ORDER: Record<QualifierSelectionState, number> = {
  open: 0,
  scoring: 1,
  closed: 2,
  selected: 3,
};

/**
 * True if the transition is allowed. Only consecutive forward steps
 * (delta = +1) pass. Same-state and reverse return false — call sites
 * should treat these as no-ops or refuse.
 */
export function canTransition(
  from: QualifierSelectionState,
  to: QualifierSelectionState,
): boolean {
  return ORDER[to] - ORDER[from] === 1;
}

/**
 * Next legal forward state, or null if already at the terminal state.
 * UI uses this to label the "Advance" button.
 */
export function nextState(
  from: QualifierSelectionState,
): QualifierSelectionState | null {
  const i = QUALIFIER_SELECTION_STATES.indexOf(from);
  const next = QUALIFIER_SELECTION_STATES[i + 1];
  return next ?? null;
}

/**
 * Classify candidates into top-score (auto-locked) vs coach-pick
 * (discretionary) slots based on the qualifier's slot counts.
 *
 * Top-score slots = slots_total - slots_coach_pick. Candidates ranked
 * 1..top_n (inclusive) are top-score; the rest are coach-pick eligible.
 *
 * Players without a leaderboard_rank (no scoring rounds yet) are never
 * top-score and never coach-pick eligible — UI shows them under
 * "needs to play" until they post a round.
 */
export function classifySlots(
  candidates: SelectionCandidate[],
  slots_total: number,
  slots_coach_pick: number,
): {
  top_score_locked: SelectionCandidate[];
  coach_pick_eligible: SelectionCandidate[];
  unranked: SelectionCandidate[];
} {
  const top_n = Math.max(0, slots_total - slots_coach_pick);
  const top_score_locked: SelectionCandidate[] = [];
  const coach_pick_eligible: SelectionCandidate[] = [];
  const unranked: SelectionCandidate[] = [];

  for (const c of candidates) {
    if (c.leaderboard_rank === null) {
      unranked.push(c);
    } else if (c.leaderboard_rank <= top_n) {
      top_score_locked.push(c);
    } else {
      coach_pick_eligible.push(c);
    }
  }
  return { top_score_locked, coach_pick_eligible, unranked };
}

/**
 * Returns true if the workspace is ready to advance to 'selected':
 *   - Current state is 'closed'
 *   - Number of coach-pick selections equals the picks that can be made:
 *     slots_coach_pick, or fewer when the field is smaller than the squad
 *     (`available_for_pick`, loader.ts pickableCount), so a small field can
 *     still be confirmed
 *   - Every coach-pick selection has non-empty reasoning
 */
export function requiredCoachPicks(slots_coach_pick: number, available_for_pick?: number): number {
  return available_for_pick === undefined ? slots_coach_pick : Math.max(0, Math.min(slots_coach_pick, available_for_pick));
}

export function canConfirmSelection(args: {
  state: QualifierSelectionState;
  slots_coach_pick: number;
  coach_pick_selections: { reasoning: string | null }[];
  available_for_pick?: number;
}): boolean {
  if (args.state !== 'closed') return false;
  if (args.coach_pick_selections.length !== requiredCoachPicks(args.slots_coach_pick, args.available_for_pick)) return false;
  return args.coach_pick_selections.every(
    (s) => typeof s.reasoning === 'string' && s.reasoning.trim().length > 0,
  );
}

/**
 * Players a coach's pick can go to: ranked players off the places on score
 * (what the pick sheet offers), plus picks already made. A field smaller
 * than the squad needs fewer picks (canConfirmSelection), not a deadlock.
 */
export function pickableCount(candidates: SelectionCandidate[]): number {
  return candidates.filter(
    (c) => c.selection?.selection_type === 'coach_pick' || (!c.is_top_score_slot && c.leaderboard_rank !== null),
  ).length;
}
