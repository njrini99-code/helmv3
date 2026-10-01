/**
 * v3 Qualifying-workspace types (W29).
 *
 * Mirrors the W29-pt1 schema: extends `golf_qualifiers` with selection
 * lifecycle columns + adds `golf_qualifier_selections` as the per-player
 * picks ledger.
 *
 * State lifecycle: open → scoring → closed → selected (no skipping, no
 * reverse — enforced in state-machine.ts).
 */

export const QUALIFIER_SELECTION_STATES = [
  'open',
  'scoring',
  'closed',
  'selected',
] as const;
export type QualifierSelectionState = (typeof QUALIFIER_SELECTION_STATES)[number];

export type QualifierSelectionType = 'top_score' | 'coach_pick';

export interface QualifierSelection {
  qualifier_id: string;
  player_id: string;
  selection_type: QualifierSelectionType;
  coach_reasoning: string | null;
  selected_at: string;
  selected_by_user_id: string;
}

/**
 * One row in the workspace candidate table — combines the qualifier
 * entry, the player, the player's total score, and any existing selection.
 *
 * leaderboard_rank is 1-based; null when no scoring rounds yet.
 */
export interface SelectionCandidate {
  player_id: string;
  player_first_name: string;
  player_last_name: string;
  rounds_completed: number;
  total_score: number | null;
  total_to_par: number | null;
  leaderboard_rank: number | null;
  /** Pre-existing selection if any. null = unselected. */
  selection: QualifierSelection | null;
  /** True when the candidate would be auto-locked under the current
   *  top-N slots count (rank <= slots_total - slots_coach_pick). */
  is_top_score_slot: boolean;
  /** Level (to par and strokes) with the last place on score and the player after it (Q-114): the coach chooses who of
   *  these takes the places left at the cut; a chosen one has is_top_score_slot. */
  tied_at_cut?: boolean;
}

/** A tie at the last place on score (Q-114): `places` to give among the level players, `chosen` given so far. */
export interface TieAtCut {
  places: number;
  chosen: number;
}

export interface QualifyingWorkspace {
  qualifier_id: string;
  team_id: string;
  name: string;
  start_date: string;
  end_date: string | null;
  /** golf_qualifiers.status — the play lifecycle (upcoming/in_progress/
   *  completed), a SEPARATE state machine from selection_state below. The
   *  workspace surfaces it so a coach can conclude the qualifier once the
   *  roster is committed, without leaving this screen. */
  status: string;
  selection_state: QualifierSelectionState;
  selection_slots_total: number;
  selection_slots_coach_pick: number;
  target_tournament_id: string | null;
  candidates: SelectionCandidate[];
  /** True when every coach-pick slot has a chosen player. UI uses this
   *  to enable the "Confirm Selection" action. */
  coach_picks_complete: boolean;
  /** Null when the cut falls cleanly; otherwise confirm waits until chosen === places (Q-114). */
  tie_at_cut: TieAtCut | null;
}
