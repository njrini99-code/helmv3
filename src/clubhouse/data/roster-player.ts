import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { readGolfPlayerProfiles } from '@/lib/golf/player-profiles';
import { chLogServer } from '../lib/track-server';
import { classYearLabel, fullName } from './season';

/**
 * The player's Roster (Clubhouse): their own team, read-only. It is a separate loader from the coach's on purpose
 * (data/roster.ts reads the join code, the join requests, the coach's private notes, every player's rounds, focus
 * areas and goals, and judges who "needs a look"; none of that is a teammate's to read).
 *
 * What a player sees of a teammate is what Fairway's player roster showed: name, class year and handicap. Scores
 * stay out, as everywhere a player is concerned (a player is set against the Tour, never against teammates).
 * Both reads are RLS-scoped to the player's own team; only active members are listed, so a pending invite or a
 * removed player is never a teammate here. Nothing is selected that isn't shown: no email, phone, avatar or
 * hometown.
 */

export interface ChTeammate {
  id: string;
  name: string;
  classYear: string | null;
  /** For ordering by class only: it is not drawn. */
  gradYear: number | null;
  handicap: number | null;
  /** The signed-in player's own row: it reads "You", and is on the list like everyone else. */
  isYou: boolean;
}

export interface ChPlayerRoster {
  teamName: string;
  season: string | null;
  /** The team row didn't load: the name falls back, nothing else depends on it. */
  teamError: boolean;
  players: ChTeammate[];
  playersError: boolean;
}

export async function loadPlayerRoster(input: { teamId: string; playerId: string }): Promise<ChPlayerRoster> {
  const supabase = await createClient();
  const now = new Date();

  const [teamRes, membersRes] = await Promise.all([
    supabase.from('golf_teams').select('name, season').eq('id', input.teamId).maybeSingle(),
    // Teammates' display columns through golf_player_profiles: a player may no longer read a teammate's golf_players
    // row (security review S4).
    (async () => {
      const [members, profiles] = await Promise.all([
        supabase.from('golf_team_members').select('player_id').eq('team_id', input.teamId).eq('status', 'active'),
        readGolfPlayerProfiles(supabase, { teamIds: [input.teamId] }),
      ]);
      if (members.error) return { data: null, error: members.error };
      if (profiles.error) return { data: null, error: profiles.error };
      const active = new Set((members.data ?? []).map((m) => m.player_id));
      return { data: profiles.data.filter((p) => active.has(p.id)), error: null };
    })(),
  ]);

  if (teamRes.error) chLogServer('roster', 'playerTeam', teamRes.error, 'teams');
  if (membersRes.error) chLogServer('roster', 'playerMembers', membersRes.error, 'teams');

  const players: ChTeammate[] = (membersRes.error ? [] : (membersRes.data ?? []))
    .map((p) => ({
      id: p.id,
      name: fullName(p),
      classYear: classYearLabel(p.graduation_year, now),
      gradYear: p.graduation_year,
      handicap: p.handicap_index ?? p.handicap,
      isYou: p.id === input.playerId,
    }));

  return {
    teamName: teamRes.data?.name ?? 'Your team',
    season: teamRes.data?.season ?? null,
    teamError: !!teamRes.error,
    players,
    playersError: !!membersRes.error,
  };
}
