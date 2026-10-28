/**
 * v3 Qualifying-workspace loader (W29).
 *
 * Fetch the qualifier row + entries + selections + its completed rounds, then
 * project into the SelectionCandidate shape the workspace UI renders.
 *
 * Leaderboard ranking is computed in-process with the shared standings
 * order (ranking.ts: to par, strokes, more rounds, name), so the rank
 * survives a mid-tournament re-load even before all rounds are posted.
 *
 * Two orders (types.ts QualifyingOrder). The default, 'score', is the plain
 * order Fairway's leaderboard shows; Fairway's workspace and its confirm use
 * it. 'board' is the Clubhouse board's order (ranking.ts boardOrder: a card a
 * round short below every full card, ties only inside a group); Clubhouse's
 * Manage selections, its tie choice and its Confirm squad pass it, so the
 * squad confirmed is the one the board showed above the line (owner
 * decision A: "Match the board").
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import {
  type QualifierSelection,
  type QualifierSelectionState,
  type QualifyingOrder,
  type QualifyingWorkspace,
  type SelectionCandidate,
  type TieAtCut,
} from './types';
import { canConfirmSelection, pickableCount } from './state-machine';
import { boardOrder, compareStandings, sameStanding } from './ranking';
import { readQualifierSelectionReasons } from '@/lib/golf/qualifier-selection-reasons';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';

type Sb = SupabaseClient<Database>;

/**
 * Load the workspace for one qualifier. Returns null when the qualifier
 * doesn't exist, when the caller lacks RLS access to it, OR when any of its
 * reads failed (the qualifier, the picks, their reasons, the rounds): callers
 * treat null as "not loadable", never as an empty workspace.
 */
export async function loadQualifyingWorkspace(
  supabase: Sb,
  qualifier_id: string,
  opts: { order?: QualifyingOrder } = {},
): Promise<QualifyingWorkspace | null> {
  const order = opts.order ?? 'score';
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
  const [selsRes, reasonsRes, roundsRes] = await Promise.all([
    supabase
      .from('golf_qualifier_selections')
      .select('qualifier_id, player_id, selection_type, selected_at, selected_by_user_id')
      .eq('qualifier_id', qualifier_id),
    readQualifierSelectionReasons(supabase, qualifier_id),
    // Ranked from the rounds, as the leaderboard is, not from the entry's stored aggregate: that aggregate is only
    // rewritten by some write paths and was found stale on a live qualifier (3 rounds played, 2 stored; swap audit
    // §11). Same round set as the Clubhouse board: completed, not a test, with a total.
    fetchAllRowsResult<{ player_id: string; qualifier_round_number: number | null; total_score: number | null; score_to_par: number | null }>((from, to) =>
      supabase
        .from('golf_rounds')
        .select('player_id, qualifier_round_number, total_score, score_to_par')
        .eq('qualifier_id', qualifier_id)
        .eq('status', 'completed')
        .eq('is_test', false)
        .order('id', { ascending: true })
        .range(from, to),
    ),
  ]);
  // A failed read is a failed load, never a workspace that looks decided on less than it knows. This loader feeds the writes
  // (chooseTiePlace counts `tie.chosen` from it; confirm builds the squad and the picks from it), so a failed selections read
  // that came back as "nobody is selected" would pass the "never more than the places" guard and let a place be given twice,
  // or confirm would rewrite a coach's pick as a top-score place. A failed reasons read would show picks without their notes
  // and refuse a confirm that is allowed. A failed rounds read would be a board of unscored players.
  if (selsRes.error || reasonsRes.error || roundsRes.error) return null;
  const sels = selsRes.data;
  const reasons = reasonsRes.reasons;
  // The board's rules (screens/qualifiers/model.ts buildBoard): a round needs a total and a to-par, and a second
  // round in the same qualifier round counts once.
  const byPlayer = new Map<string, { n: number; total: number; toPar: number; slots: Set<number> }>();
  for (const r of roundsRes.data ?? []) {
    if (r.total_score == null || r.score_to_par == null) continue;
    const agg = byPlayer.get(r.player_id) ?? { n: 0, total: 0, toPar: 0, slots: new Set<number>() };
    if (r.qualifier_round_number != null) {
      if (agg.slots.has(r.qualifier_round_number)) continue;
      agg.slots.add(r.qualifier_round_number);
    }
    agg.n += 1;
    agg.total += r.total_score;
    agg.toPar += r.score_to_par;
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

  // Rank with the shared order (or the board's, for Clubhouse). Unposted (no scored round) → rank null.
  const ranked = rankCandidates(rawCandidates, order);

  const top_n = Math.max(0, q.selection_slots_total - q.selection_slots_coach_pick);
  const candidates = assignScoreSlots(ranked, selByPlayer, top_n, order);
  const tie_at_cut = tieAtCut(candidates, top_n);

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
    tie_at_cut,
  };
}

/**
 * The places on score are the first top_n ranked players who are not a
 * coach's pick: a pick who climbs into the top places keeps the pick
 * (confirm never overwrites it), and the next ranked player takes the
 * place on score, so the squad stays slots_total.
 *
 * Q-114 (owner, 2026-10-01): when the last place on score and the next player
 * are level (to par and strokes), name order no longer decides. Everyone level
 * with them is `tied_at_cut`; the players clearly above keep their places, and
 * the places left go only to tied players the coach has chosen (a top_score
 * selection written before confirm, see service.ts chooseTiePlace).
 *
 * `ranked` must be in `order` (rankCandidates with the same order). With
 * 'board', players are level only inside one group (full cards, or short
 * ones), as the board's tie at the cut is.
 */
export function assignScoreSlots(
  ranked: RankOutput[],
  selByPlayer: Map<string, QualifierSelection>,
  top_n: number,
  order: QualifyingOrder = 'score',
): SelectionCandidate[] {
  const keyOf = (r: RankOutput) => ({ toPar: r.total_to_par as number, total: r.total_score as number, played: r.rounds_completed });
  const scored = ranked.filter((r) => r.leaderboard_rank !== null);
  const board = order === 'board' ? boardOrder(scored.map(keyOf)) : null;
  const level = (a: RankOutput, b: RankOutput) => (board ? board.level(keyOf(a), keyOf(b)) : sameStanding(keyOf(a), keyOf(b)));
  const eligible = scored.filter((r) => selByPlayer.get(r.player_id)?.selection_type !== 'coach_pick');
  const tied = new Set<string>();
  let tiePlaces = 0;
  if (top_n > 0 && eligible.length > top_n && level(eligible[top_n - 1]!, eligible[top_n]!)) {
    const cut = eligible[top_n - 1]!;
    for (const r of eligible) if (level(r, cut)) tied.add(r.player_id);
    tiePlaces = top_n - eligible.slice(0, top_n).filter((r) => !tied.has(r.player_id)).length;
  }
  let onScore = 0;
  let chosen = 0;
  return ranked.map((r) => {
    const selection = selByPlayer.get(r.player_id) ?? null;
    if (tied.has(r.player_id)) {
      const given = selection?.selection_type === 'top_score' && chosen < tiePlaces;
      if (given) chosen++;
      return { ...r, selection, is_top_score_slot: given, tied_at_cut: true };
    }
    const is_top_score_slot =
      r.leaderboard_rank !== null && selection?.selection_type !== 'coach_pick' && onScore < top_n - tiePlaces;
    if (is_top_score_slot) onScore++;
    return { ...r, selection, is_top_score_slot };
  });
}

/** The tie at the cut, if any: the places the tied players share and how many the coach has given. */
export function tieAtCut(candidates: SelectionCandidate[], top_n: number): TieAtCut | null {
  const tied = candidates.filter((c) => c.tied_at_cut);
  if (!tied.length) return null;
  const clear = candidates.filter((c) => c.is_top_score_slot && !c.tied_at_cut).length;
  return { places: Math.max(0, top_n - clear), chosen: tied.filter((c) => c.is_top_score_slot).length };
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
 * score, not an even-par round. With 'board', the Clubhouse board's order:
 * a card with fewer rounds than the most any ranked player has goes below
 * every full card (ranking.ts boardOrder, the function the board sorts with).
 */
export function rankCandidates(input: RankInput[], order: QualifyingOrder = 'score'): RankOutput[] {
  const scored = (c: RankInput) => c.rounds_completed > 0 && c.total_to_par !== null && c.total_score !== null;
  const withScore = input.filter(scored);
  const noScore = input.filter((c) => !scored(c));
  const key = (c: RankInput) => ({
    toPar: c.total_to_par as number,
    total: c.total_score as number,
    played: c.rounds_completed,
    name: `${c.player_first_name ?? ''} ${c.player_last_name ?? ''}`.trim(),
  });
  const compare = order === 'board' ? boardOrder(withScore.map(key)).compare : compareStandings;
  withScore.sort((a, b) => compare(key(a), key(b)));

  const ranked: RankOutput[] = withScore.map((c, i) => ({
    ...c,
    leaderboard_rank: i + 1,
  }));
  for (const c of noScore) {
    ranked.push({ ...c, leaderboard_rank: null });
  }
  return ranked;
}
