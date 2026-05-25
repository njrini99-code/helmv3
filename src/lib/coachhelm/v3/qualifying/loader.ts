/**
 * v3 Qualifying-workspace loader (W29).
 *
 * Single read: fetch the qualifier row + entries + selections, then
 * project into the SelectionCandidate shape the workspace UI renders.
 *
 * Leaderboard ranking is computed in-process by score_to_par ascending
 * then total_score ascending (tiebreak), so the rank survives a
 * mid-tournament re-load even before all rounds are posted.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import {
  type QualifierSelection,
  type QualifierSelectionState,
  type QualifyingWorkspace,
  type SelectionCandidate,
} from './types';
import { canConfirmSelection } from './state-machine';

type Sb = SupabaseClient<Database>;

/**
 * Load the workspace for one qualifier. Returns null when the qualifier
 * doesn't exist OR when the caller lacks RLS access to it.
 */
export async function loadQualifyingWorkspace(
  supabase: Sb,
  qualifier_id: string,
): Promise<QualifyingWorkspace | null> {
  const { data: q, error: qErr } = await supabase
    .from('golf_qualifiers')
    .select(`
      id,
      team_id,
      name,
      start_date,
      end_date,
      selection_state,
      selection_slots_total,
      selection_slots_coach_pick,
      target_tournament_id,
      entries:golf_qualifier_entries(
        player_id,
        total_score,
        total_to_par,
        rounds_completed,
        player:golf_players(id, first_name, last_name)
      )
    `)
    .eq('id', qualifier_id)
    .maybeSingle();

  if (qErr || !q) return null;

  const { data: sels } = await supabase
    .from('golf_qualifier_selections')
    .select('qualifier_id, player_id, selection_type, coach_reasoning, selected_at, selected_by_user_id')
    .eq('qualifier_id', qualifier_id);

  const selByPlayer = new Map<string, QualifierSelection>();
  for (const s of (sels ?? []) as QualifierSelection[]) {
    selByPlayer.set(s.player_id, s);
  }

  // Project entries → candidates (filter out malformed rows defensively)
  const rawCandidates = (q.entries ?? [])
    .filter((e) => e && e.player && typeof e.player === 'object' && 'first_name' in e.player)
    .map((e) => {
      const player = e.player as { id: string; first_name: string; last_name: string };
      return {
        player_id: e.player_id as string,
        player_first_name: player.first_name,
        player_last_name: player.last_name,
        rounds_completed: (e.rounds_completed as number | null) ?? 0,
        total_score: (e.total_score as number | null) ?? null,
        total_to_par: (e.total_to_par as number | null) ?? null,
      };
    });

  // Rank by (to_par asc, total asc). Unposted (no score) → rank null.
  const ranked = rankCandidates(rawCandidates);

  const top_n = Math.max(0, q.selection_slots_total - q.selection_slots_coach_pick);
  const candidates: SelectionCandidate[] = ranked.map((r) => ({
    ...r,
    selection: selByPlayer.get(r.player_id) ?? null,
    is_top_score_slot: r.leaderboard_rank !== null && r.leaderboard_rank <= top_n,
  }));

  const coachPickSelections = Array.from(selByPlayer.values()).filter(
    (s) => s.selection_type === 'coach_pick',
  );

  const coach_picks_complete = canConfirmSelection({
    state: q.selection_state as QualifierSelectionState,
    slots_coach_pick: q.selection_slots_coach_pick,
    coach_pick_selections: coachPickSelections.map((s) => ({
      reasoning: s.coach_reasoning,
    })),
  });

  return {
    qualifier_id: q.id,
    team_id: q.team_id,
    name: q.name,
    start_date: q.start_date,
    end_date: q.end_date,
    selection_state: q.selection_state as QualifierSelectionState,
    selection_slots_total: q.selection_slots_total,
    selection_slots_coach_pick: q.selection_slots_coach_pick,
    target_tournament_id: q.target_tournament_id,
    candidates,
    coach_picks_complete,
  };
}

interface RankInput {
  player_id: string;
  player_first_name: string;
  player_last_name: string;
  rounds_completed: number;
  total_score: number | null;
  total_to_par: number | null;
}

interface RankOutput extends RankInput {
  leaderboard_rank: number | null;
}

/** Exported for tests. */
export function rankCandidates(input: RankInput[]): RankOutput[] {
  const withScore = input.filter((c) => c.total_to_par !== null);
  const noScore = input.filter((c) => c.total_to_par === null);

  withScore.sort((a, b) => {
    const ap = a.total_to_par ?? 0;
    const bp = b.total_to_par ?? 0;
    if (ap !== bp) return ap - bp;
    const as = a.total_score ?? 0;
    const bs = b.total_score ?? 0;
    return as - bs;
  });

  const ranked: RankOutput[] = withScore.map((c, i) => ({
    ...c,
    leaderboard_rank: i + 1,
  }));
  for (const c of noScore) {
    ranked.push({ ...c, leaderboard_rank: null });
  }
  return ranked;
}
