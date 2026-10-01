/**
 * v3 Qualifying-workspace loader (W29).
 *
 * Fetch the qualifier row + entries + selections + its completed rounds, then
 * project into the SelectionCandidate shape the workspace UI renders.
 *
 * Leaderboard ranking is computed in-process with the shared standings
 * order (ranking.ts: to par, strokes, more rounds, name), the same order
 * the Clubhouse leaderboard uses, so the rank survives a mid-tournament
 * re-load even before all rounds are posted.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import {
  type QualifierSelection,
  type QualifierSelectionState,
  type QualifyingWorkspace,
  type SelectionCandidate,
} from './types';
import { canConfirmSelection, pickableCount } from './state-machine';
import { compareStandings } from './ranking';
import { readQualifierSelectionReasons } from '@/lib/golf/qualifier-selection-reasons';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';

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
      status,
      selection_state,
      selection_slots_total,
      selection_slots_coach_pick,
      target_tournament_id,
      entries:golf_qualifier_entries(
        player_id,
        player:golf_players(id, first_name, last_name)
      )
    `)
    .eq('id', qualifier_id)
    .maybeSingle();

  if (qErr || !q) return null;

  // The pick reasoning comes through the coach-gated reader (D-35), not the column.
  const [{ data: sels }, { reasons }, roundsRes] = await Promise.all([
    supabase
      .from('golf_qualifier_selections')
      .select('qualifier_id, player_id, selection_type, selected_at, selected_by_user_id')
      .eq('qualifier_id', qualifier_id),
    readQualifierSelectionReasons(supabase, qualifier_id),
    // Ranked from the rounds, as the leaderboard is, not from the entry's stored aggregate: that aggregate is only
    // rewritten by some write paths and was found stale on a live qualifier (3 rounds played, 2 stored; swap audit
    // §11). Same round set as the Clubhouse board: completed, not a test, with a total.
    fetchAllRowsResult<{ player_id: string; total_score: number | null; score_to_par: number | null }>((from, to) =>
      supabase
        .from('golf_rounds')
        .select('player_id, total_score, score_to_par')
        .eq('qualifier_id', qualifier_id)
        .eq('status', 'completed')
        .eq('is_test', false)
        .order('id', { ascending: true })
        .range(from, to),
    ),
  ]);
  // A failed rounds read is a failed load, never a board of unscored players.
  if (roundsRes.error) return null;
  const byPlayer = new Map<string, { n: number; total: number; toPar: number }>();
  for (const r of roundsRes.data ?? []) {
    if (r.total_score == null) continue;
    const agg = byPlayer.get(r.player_id) ?? { n: 0, total: 0, toPar: 0 };
    agg.n += 1;
    agg.total += r.total_score;
    agg.toPar += r.score_to_par ?? 0;
    byPlayer.set(r.player_id, agg);
  }

  const selByPlayer = new Map<string, QualifierSelection>();
  for (const s of (sels ?? []) as Array<Omit<QualifierSelection, 'coach_reasoning'>>) {
    selByPlayer.set(s.player_id, { ...s, coach_reasoning: reasons.get(s.player_id) ?? null });
  }

  // Project entries → candidates (filter out malformed rows defensively)
  const rawCandidates = (q.entries ?? [])
    .filter((e) => e && e.player && typeof e.player === 'object' && 'first_name' in e.player)
    .map((e) => {
      const player = e.player as { id: string; first_name: string; last_name: string };
      const agg = byPlayer.get(e.player_id as string);
      return {
        player_id: e.player_id as string,
        player_first_name: player.first_name,
        player_last_name: player.last_name,
        rounds_completed: agg?.n ?? 0,
        total_score: agg ? agg.total : null,
        total_to_par: agg ? agg.toPar : null,
      };
    });

  // Rank with the shared order. Unposted (no scored round) → rank null.
  const ranked = rankCandidates(rawCandidates);

  const top_n = Math.max(0, q.selection_slots_total - q.selection_slots_coach_pick);
  const candidates = assignScoreSlots(ranked, selByPlayer, top_n);

  const coachPickSelections = Array.from(selByPlayer.values()).filter(
    (s) => s.selection_type === 'coach_pick',
  );

  const coach_picks_complete = canConfirmSelection({
    state: q.selection_state as QualifierSelectionState,
    slots_coach_pick: q.selection_slots_coach_pick,
    coach_pick_selections: coachPickSelections.map((s) => ({
      reasoning: s.coach_reasoning,
    })),
    available_for_pick: pickableCount(candidates),
  });

  return {
    qualifier_id: q.id,
    team_id: q.team_id,
    name: q.name,
    start_date: q.start_date,
    end_date: q.end_date,
    status: q.status ?? 'upcoming',
    selection_state: q.selection_state as QualifierSelectionState,
    selection_slots_total: q.selection_slots_total,
    selection_slots_coach_pick: q.selection_slots_coach_pick,
    target_tournament_id: q.target_tournament_id,
    candidates,
    coach_picks_complete,
  };
}

/**
 * The places on score are the first top_n ranked players who are not a
 * coach's pick: a pick who climbs into the top places keeps the pick
 * (confirm never overwrites it), and the next ranked player takes the
 * place on score, so the squad stays slots_total.
 */
export function assignScoreSlots(
  ranked: RankOutput[],
  selByPlayer: Map<string, QualifierSelection>,
  top_n: number,
): SelectionCandidate[] {
  let onScore = 0;
  return ranked.map((r) => {
    const selection = selByPlayer.get(r.player_id) ?? null;
    const is_top_score_slot =
      r.leaderboard_rank !== null && selection?.selection_type !== 'coach_pick' && onScore < top_n;
    if (is_top_score_slot) onScore++;
    return { ...r, selection, is_top_score_slot };
  });
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

/**
 * Exported for tests. A player is ranked only with a scored round: a
 * stored aggregate of 0 rounds (written as 0/0/0 by older code) is no
 * score, not an even-par round.
 */
export function rankCandidates(input: RankInput[]): RankOutput[] {
  const scored = (c: RankInput) => c.rounds_completed > 0 && c.total_to_par !== null && c.total_score !== null;
  const withScore = input.filter(scored);
  const noScore = input.filter((c) => !scored(c));
  const key = (c: RankInput) => ({
    toPar: c.total_to_par as number,
    total: c.total_score as number,
    played: c.rounds_completed,
    name: `${c.player_first_name ?? ''} ${c.player_last_name ?? ''}`.trim(),
  });
  withScore.sort((a, b) => compareStandings(key(a), key(b)));

  const ranked: RankOutput[] = withScore.map((c, i) => ({
    ...c,
    leaderboard_rank: i + 1,
  }));
  for (const c of noScore) {
    ranked.push({ ...c, leaderboard_rank: null });
  }
  return ranked;
}
