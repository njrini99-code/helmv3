import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { chLogServer } from '../lib/track-server';
import { fullName, seasonStartDate } from './season';
import { teamSeasonFrom, toTeamRounds, type ChTeamRoundRow, type ChTeamRounds } from './team-rounds-shape';

export type * from './team-rounds-shape';

/**
 * Team rounds (Clubhouse P011; the coach's side of the Rounds page): every completed round the active players on the
 * coach's team have posted, newest first, in one server read. The Fairway page lists the same rounds
 * (`/dashboard/rounds`, coach); Clubhouse had aliased it to Team stats until now.
 *
 * Every posted round is listed, the same as the player's own library. Only countable 18-hole rounds since 1 August set the
 * season figures (`teamSeasonFrom`), so the numbers agree with Rounds, Home and Stats; a round that doesn't count still
 * shows, marked as not counted. A failed read is flagged, never shown as an empty team (`rounds.error`, `rosterError`).
 */

const LIST_COLUMNS =
  'id, player_id, course_name, tees_played, round_date, round_type, total_score, score_to_par, front_nine, back_nine, holes_played, total_putts, total_gir, total_gir_possible, total_fairways_hit, total_fairways';

const log = (what: string, err: unknown) => chLogServer('rounds.team', what, err, 'teams');

export async function loadTeamRounds(input: { teamId: string }): Promise<ChTeamRounds> {
  const supabase = await createClient();
  const now = new Date();
  const seasonStart = seasonStartDate(now);

  const [teamRes, membersRes] = await Promise.all([
    supabase.from('golf_teams').select('name').eq('id', input.teamId).maybeSingle(),
    supabase.from('golf_team_members').select('player:golf_players(id, first_name, last_name)').eq('team_id', input.teamId).eq('status', 'active'),
  ]);
  if (teamRes.error) log('team', teamRes.error);
  if (membersRes.error) log('members', membersRes.error);

  type P = { id: string; first_name: string | null; last_name: string | null };
  const roster = ((membersRes.data ?? []) as Array<{ player: P | null }>)
    .map((m) => m.player)
    .filter((p): p is P => !!p)
    .map((p) => ({ id: p.id, name: fullName(p) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const names = new Map(roster.map((p) => [p.id, p.name]));

  const rows: ChTeamRoundRow[] = [];
  let failed = false;
  // Chunked and paged: a team's history is past PostgREST's 1,000-row cap in a few seasons, and a long id list overruns the URL.
  for (const ids of chunkIds(roster.map((p) => p.id))) {
    const res = await fetchAllRowsResult<ChTeamRoundRow>(
      (from, to) =>
        supabase
          .from('golf_rounds')
          .select(LIST_COLUMNS)
          .in('player_id', ids)
          .eq('is_test', false)
          .eq('status', 'completed')
          .order('round_date', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to),
      undefined,
      { table: 'golf_rounds', action: 'clubhouse.rounds.team', feature: 'coach_dashboard', sport: 'golf' },
    );
    if (res.error) {
      log('list', res.error);
      failed = true;
      break;
    }
    rows.push(...(res.data ?? []));
  }

  const { list, unscored } = failed ? { list: [], unscored: 0 } : toTeamRounds(rows, names);
  return {
    teamName: teamRes.error ? null : (teamRes.data?.name ?? null),
    seasonStart,
    rounds: { list, error: failed, ...(unscored > 0 ? { unscored } : {}) },
    rosterError: !!membersRes.error,
    players: roster,
    season: teamSeasonFrom(list, seasonStart),
  };
}
