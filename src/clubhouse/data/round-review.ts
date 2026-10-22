import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { chLogServer } from '../lib/track-server';
import { fullName } from './season';
import { tourForGender } from './stats-common';
import { readRoundTypeOptions } from './rounds-type-options';
import { loadRoundDebrief } from './round-debrief';
import { currentRoundType, toHoles, toReview, type ChHoleRow, type ChReviewRoundRow, type ChReviewTypeEdit, type ChRoundReview, type ChShotRow } from './round-review-shape';

export type * from './round-review-shape';

/**
 * One round's review (Clubhouse P011; design/handoff/rounds-review.jsx), read
 * server-side in one pass for the player who played it or a coach of their
 * team, the same two people the legacy round page lets in.
 *
 * `notFound` covers a round that doesn't exist and one this viewer may not
 * see, so the page never confirms that someone else's round exists.
 * `inProgress`: the round is still being played; the page sends it to be
 * continued, as the legacy page does. `error`: the round itself didn't load.
 * The holes and the shots each carry their own error, so a failed shot read
 * still shows the card; the tee, the coach's read of the player's name and the
 * team (the strokes gained baseline) carry theirs too (`teeError`,
 * `playerError`, `tourError`), so the page says what is missing instead of
 * drawing different content (a coach sees "Player", the yardage is just gone).
 */

/** A player's `teamId` names the strokes gained baseline (a women's team is measured on the women's Tour curve); without it no baseline is claimed. */
export type ChReviewViewer = { role: 'player'; playerId: string; teamId?: string | null } | { role: 'coach'; teamId: string };

/** `typeEdit`: changing the round's type (CH-11522), for the owning player or a coach of the player's team (both are the only viewers who get here). */
export type ChRoundReviewResult = { kind: 'ok'; review: ChRoundReview; typeEdit: ChReviewTypeEdit } | { kind: 'notFound' } | { kind: 'inProgress' } | { kind: 'error' };

const ROUND_COLUMNS =
  'id, player_id, status, course_name, tees_played, tee_id, round_date, round_type, total_score, score_to_par, front_nine, back_nine, holes_played, total_putts, total_fairways_hit, total_fairways, total_gir, total_gir_possible, course_rating, course_slope, ai_recap, notes, is_test, strokes_gained_total, strokes_gained_tee, strokes_gained_approach, strokes_gained_around_green, strokes_gained_putting, team_id, qualifier_id, qualifier_round_number';
const SHOT_COLUMNS =
  'hole_number, shot_number, shot_type, club_type, result, lie_after, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, miss_direction, putt_break, putt_slope, is_penalty';

const log = (what: string, err: unknown) => chLogServer('rounds.review', what, err);

/**
 * `viewerIn` may still be on its way (the route resolves the team while this reads the round): the round is read by its id, so it
 * is read beside the viewer, and judged against them once both are in. A null viewer is "not here", as before; the round read
 * beside it is the viewer's own RLS read and is dropped unlooked-at.
 */
export async function loadRoundReview(roundId: string, viewerIn: ChReviewViewer | null | Promise<ChReviewViewer | null>): Promise<ChRoundReviewResult> {
  const supabase = await createClient();
  const [viewer, roundRes] = await Promise.all([viewerIn, supabase.from('golf_rounds').select(ROUND_COLUMNS).eq('id', roundId).maybeSingle()]);
  if (!viewer) return { kind: 'notFound' };
  const { data: round, error } = roundRes;
  if (error) {
    log('round', error);
    return { kind: 'error' };
  }
  if (!round || round.is_test) return { kind: 'notFound' };

  if (viewer.role === 'player') {
    if (round.player_id !== viewer.playerId) return { kind: 'notFound' };
  } else {
    // A coach sees the rounds of players on their team, and only those.
    const { data: member, error: memberError } = await supabase.from('golf_team_members').select('id').eq('team_id', viewer.teamId).eq('player_id', round.player_id).eq('status', 'active').limit(1);
    if (memberError) {
      // An outage, not a permission answer: say it didn't load rather than "not found".
      log('membership', memberError);
      return { kind: 'error' };
    }
    if (!member?.length) return { kind: 'notFound' };
  }
  if (round.status === 'in_progress') return { kind: 'inProgress' };

  const row = round as ChReviewRoundRow;
  const [holesRes, shotsRes, teeRes, playerRes, teamRes, typeOptions, noteRes] = await Promise.all([
    supabase.from('golf_holes').select('hole_number, par, yardage, score, putts, fairway_hit, gir, penalty_strokes').eq('round_id', roundId).order('hole_number', { ascending: true }),
    fetchAllRowsResult<ChShotRow>(
      (from, to) => supabase.from('golf_shots').select(SHOT_COLUMNS).eq('round_id', roundId).order('hole_number', { ascending: true }).order('shot_number', { ascending: true }).range(from, to),
      undefined,
      { table: 'golf_shots', action: 'clubhouse.rounds.review', feature: 'round_tracking', sport: 'golf' },
    ),
    round.tee_id ? supabase.from('golf_course_tees').select('total_yards').eq('id', round.tee_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    viewer.role === 'coach' ? supabase.from('golf_players').select('first_name, last_name').eq('id', round.player_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    viewer.teamId ? supabase.from('golf_teams').select('gender').eq('id', viewer.teamId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    // The Fairway round page's qualifier reads for its type editor; logs and degrades on its own (never throws).
    readRoundTypeOptions(supabase, { playerId: round.player_id, roundId, roundTeamId: row.team_id ?? null, coach: viewer.role === 'coach' }),
    // The coach's note lives on the round's CoachHelm review row (one per round); a round with no review row has no note.
    supabase.from('golf_round_reviews').select('coach_notes').eq('round_id', roundId).maybeSingle(),
  ]);
  if (holesRes.error) log('holes', holesRes.error);
  if (shotsRes.error) log('shots', shotsRes.error);
  if (teeRes.error) log('tee', teeRes.error);
  if (playerRes.error) log('player', playerRes.error);
  if (teamRes.error) log('team', teamRes.error);
  if (noteRes.error) log('coach-note', noteRes.error);

  const holes = holesRes.error ? [] : toHoles((holesRes.data ?? []) as ChHoleRow[], shotsRes.error ? [] : (shotsRes.data ?? []));
  const review = toReview(row, {
    holes,
    holesError: !!holesRes.error,
    shotsError: !!shotsRes.error,
    // No name is a gap the page says (`playerError`), never an invented "Player": a read that failed, and a coach's read that
    // found no player row, are both that.
    playerName: playerRes.data ? fullName(playerRes.data) : null,
    coachView: viewer.role === 'coach',
    teeYards: teeRes.data?.total_yards ?? null,
    // Without the team's row the tour is unknown and no baseline is claimed (as on Stats, CH-4210); a read that failed says so.
    tour: teamRes.data ? tourForGender(teamRes.data.gender) : null,
    teeError: !!teeRes.error,
    playerError: !!playerRes.error || (viewer.role === 'coach' && !playerRes.data),
    tourError: !!teamRes.error,
    coachNote: noteRes.error ? null : (noteRes.data?.coach_notes ?? null),
    coachNoteError: !!noteRes.error,
  });
  // CoachHelm chs-30: the player's 30-second debrief (flag `coachhelm_reads_v1_copy`; off, nothing is read and the review is as before).
  const debrief = await loadRoundDebrief(supabase, review, viewer);
  return {
    kind: 'ok',
    typeEdit: { viewer: viewer.role, current: currentRoundType(row), options: typeOptions },
    review: debrief ? { ...review, debrief } : review,
  };
}
