import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { chLogServer } from '../lib/track-server';
import { fullName } from './season';
import { tourForGender } from './stats-common';
import { toHoles, toReview, type ChHoleRow, type ChReviewRoundRow, type ChRoundReview, type ChShotRow } from './round-review-shape';

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
 * still shows the card.
 */

/** A player's `teamId` names the strokes gained baseline (a women's team is measured on the women's Tour curve); without it no baseline is claimed. */
export type ChReviewViewer = { role: 'player'; playerId: string; teamId?: string | null } | { role: 'coach'; teamId: string };

export type ChRoundReviewResult = { kind: 'ok'; review: ChRoundReview } | { kind: 'notFound' } | { kind: 'inProgress' } | { kind: 'error' };

const ROUND_COLUMNS =
  'id, player_id, status, course_name, tees_played, tee_id, round_date, round_type, total_score, score_to_par, front_nine, back_nine, holes_played, total_putts, total_fairways_hit, total_fairways, total_gir, total_gir_possible, course_rating, course_slope, ai_recap, notes, is_test, strokes_gained_total, strokes_gained_tee, strokes_gained_approach, strokes_gained_around_green, strokes_gained_putting';
const SHOT_COLUMNS =
  'hole_number, shot_number, shot_type, club_type, result, lie_after, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, miss_direction, putt_break, putt_slope, is_penalty';

const log = (what: string, err: unknown) => chLogServer('rounds.review', what, err);

export async function loadRoundReview(roundId: string, viewer: ChReviewViewer): Promise<ChRoundReviewResult> {
  const supabase = await createClient();
  const { data: round, error } = await supabase.from('golf_rounds').select(ROUND_COLUMNS).eq('id', roundId).maybeSingle();
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

  const [holesRes, shotsRes, teeRes, playerRes, teamRes] = await Promise.all([
    supabase.from('golf_holes').select('hole_number, par, yardage, score, putts, fairway_hit, gir, penalty_strokes').eq('round_id', roundId).order('hole_number', { ascending: true }),
    fetchAllRowsResult<ChShotRow>(
      (from, to) => supabase.from('golf_shots').select(SHOT_COLUMNS).eq('round_id', roundId).order('hole_number', { ascending: true }).order('shot_number', { ascending: true }).range(from, to),
      undefined,
      { table: 'golf_shots', action: 'clubhouse.rounds.review', feature: 'round_tracking', sport: 'golf' },
    ),
    round.tee_id ? supabase.from('golf_course_tees').select('total_yards').eq('id', round.tee_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    viewer.role === 'coach' ? supabase.from('golf_players').select('first_name, last_name').eq('id', round.player_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    viewer.teamId ? supabase.from('golf_teams').select('gender').eq('id', viewer.teamId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (holesRes.error) log('holes', holesRes.error);
  if (shotsRes.error) log('shots', shotsRes.error);
  if (teeRes.error) log('tee', teeRes.error);
  if (playerRes.error) log('player', playerRes.error);
  if (teamRes.error) log('team', teamRes.error);

  const holes = holesRes.error ? [] : toHoles((holesRes.data ?? []) as ChHoleRow[], shotsRes.error ? [] : (shotsRes.data ?? []));
  return {
    kind: 'ok',
    review: toReview(round as ChReviewRoundRow, {
      holes,
      holesError: !!holesRes.error,
      shotsError: !!shotsRes.error,
      playerName: playerRes.data ? fullName(playerRes.data) : viewer.role === 'coach' ? 'Player' : null,
      teeYards: teeRes.data?.total_yards ?? null,
      // Without the team's row the tour is unknown and no baseline is claimed (as on Stats, CH-4210).
      tour: teamRes.data ? tourForGender(teamRes.data.gender) : null,
    }),
  };
}
